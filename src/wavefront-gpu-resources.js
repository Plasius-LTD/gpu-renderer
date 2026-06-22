import {
  BRDF_LUT_UPLOAD_CACHE,
  DEFAULT_BRDF_LUT_SAMPLE_COUNT,
  DEFAULT_BRDF_LUT_SIZE,
  HIT_RECORD_BYTES,
  MEDIUM_TABLE_ROWS,
  RAY_RECORD_BYTES,
} from "./wavefront-core.js";
import {
  add,
  clamp,
  dot,
  normalize,
  scale,
  subtract,
} from "./wavefront-core.js";
import {
  hammersley,
  importanceSampleGgx,
  integrateBrdfSample,
} from "./wavefront-sampling.js";

export function clampTileSizeForDevice(config, device) {
  const limit = Number(device?.limits?.maxStorageBufferBindingSize);
  if (!Number.isFinite(limit) || limit <= 0) {
    return config.tileSize;
  }

  const maxPixelsByRay = Math.floor(limit / RAY_RECORD_BYTES);
  const maxPixelsByHit = Math.floor(limit / HIT_RECORD_BYTES);
  const maxPixels = Math.max(256, Math.min(maxPixelsByRay, maxPixelsByHit));
  if (config.tilePixelCapacity <= maxPixels) {
    return config.tileSize;
  }

  return Math.max(16, Math.floor(Math.sqrt(maxPixels)));
}

export function createBuffer(device, usage, size, label) {
  return device.createBuffer({
    label,
    size: Math.max(4, size),
    usage,
  });
}

export function alignTo(value, alignment) {
  const resolvedAlignment = Math.max(1, alignment);
  return Math.ceil(value / resolvedAlignment) * resolvedAlignment;
}

function float32ToFloat16Bits(value) {
  const floatView = new Float32Array(1);
  const intView = new Uint32Array(floatView.buffer);
  floatView[0] = Number.isFinite(value) ? value : 0;
  const x = intView[0];
  const sign = (x >> 16) & 0x8000;
  let mantissa = x & 0x7fffff;
  let exponent = (x >> 23) & 0xff;

  if (exponent === 0xff) {
    return sign | (mantissa ? 0x7e00 : 0x7c00);
  }

  exponent = exponent - 127 + 15;
  if (exponent >= 0x1f) {
    return sign | 0x7c00;
  }
  if (exponent <= 0) {
    if (exponent < -10) {
      return sign;
    }
    mantissa = (mantissa | 0x800000) >> (1 - exponent);
    return sign | ((mantissa + 0x1000) >> 13);
  }
  return sign | (exponent << 10) | ((mantissa + 0x1000) >> 13);
}

function environmentMapIntegerScale(data) {
  if (data instanceof Uint8Array) {
    return 1 / 255;
  }
  if (data instanceof Uint16Array) {
    return 1 / 65535;
  }
  return 1;
}

function environmentMapHasSamplingData(environmentMap) {
  if (!environmentMap || !environmentMap.data) {
    return false;
  }
  const width = Math.max(1, environmentMap.width ?? 1);
  const height = Math.max(1, environmentMap.height ?? 1);
  return environmentMap.data.length >= width * height * 4;
}

function createRgba8TextureUpload(source) {
  const width = Math.max(1, Math.trunc(source.width));
  const height = Math.max(1, Math.trunc(source.height));
  const bytesPerRow = alignTo(width * 4, 256);
  const bytes = new Uint8Array(bytesPerRow * height);
  const data = source.data instanceof Uint8Array ? source.data : new Uint8Array(source.data);
  for (let y = 0; y < height; y += 1) {
    const sourceOffset = y * width * 4;
    const targetOffset = y * bytesPerRow;
    bytes.set(data.subarray(sourceOffset, sourceOffset + width * 4), targetOffset);
  }
  return Object.freeze({
    bytes,
    bytesPerRow,
    width,
    height,
  });
}

function readEnvironmentMapComponent(data, index, fallback, integerScale = 1) {
  if (!data || index >= data.length) {
    return fallback;
  }
  const value = Number(data[index]);
  return Number.isFinite(value) ? Math.max(0, value) * integerScale : fallback;
}

function createBrdfLutUploadBytes(
  size = DEFAULT_BRDF_LUT_SIZE,
  sampleCount = DEFAULT_BRDF_LUT_SAMPLE_COUNT
) {
  const cacheKey = `${Math.max(1, Math.trunc(size))}:${Math.max(1, Math.trunc(sampleCount))}`;
  const cached = BRDF_LUT_UPLOAD_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }
  const width = Math.max(1, Math.trunc(size));
  const height = Math.max(1, Math.trunc(size));
  const rowBytes = width * 8;
  const bytesPerRow = alignTo(rowBytes, 256);
  const bytes = new Uint8Array(bytesPerRow * height);
  const view = new DataView(bytes.buffer);
  for (let y = 0; y < height; y += 1) {
    const roughness = (y + 0.5) / height;
    for (let x = 0; x < width; x += 1) {
      const nDotV = Math.max((x + 0.5) / width, 0.0001);
      const [scaleTerm, biasTerm] = integrateBrdfSample(nDotV, roughness, sampleCount);
      const offset = y * bytesPerRow + x * 8;
      view.setUint16(offset, float32ToFloat16Bits(scaleTerm), true);
      view.setUint16(offset + 2, float32ToFloat16Bits(biasTerm), true);
      view.setUint16(offset + 4, float32ToFloat16Bits(0), true);
      view.setUint16(offset + 6, float32ToFloat16Bits(1), true);
    }
  }
  const upload = Object.freeze({ bytes, bytesPerRow, width, height });
  BRDF_LUT_UPLOAD_CACHE.set(cacheKey, upload);
  return upload;
}

function createLinearEnvironmentPixels(environmentMap, fallbackColor) {
  const width = Math.max(1, environmentMap.width);
  const height = Math.max(1, environmentMap.height);
  const pixels = new Float32Array(width * height * 4);
  const data = environmentMap.data;
  const integerScale = environmentMapIntegerScale(data);
  for (let index = 0; index < width * height; index += 1) {
    const sourceOffset = index * 4;
    const targetOffset = index * 4;
    pixels[targetOffset] = readEnvironmentMapComponent(data, sourceOffset, fallbackColor[0], integerScale);
    pixels[targetOffset + 1] = readEnvironmentMapComponent(data, sourceOffset + 1, fallbackColor[1], integerScale);
    pixels[targetOffset + 2] = readEnvironmentMapComponent(data, sourceOffset + 2, fallbackColor[2], integerScale);
    pixels[targetOffset + 3] = readEnvironmentMapComponent(data, sourceOffset + 3, fallbackColor[3] ?? 1, integerScale);
  }
  return pixels;
}

function environmentUvToDirection(u, v, rotationRadians = 0) {
  const angle = (u - rotationRadians / (2 * Math.PI) - 0.5) * 2 * Math.PI;
  const theta = v * Math.PI;
  const sinTheta = Math.sin(theta);
  return [
    Math.cos(angle) * sinTheta,
    Math.cos(theta),
    Math.sin(angle) * sinTheta,
  ];
}

function sampleEnvironmentPixelsBilinear(pixels, width, height, u, v) {
  const wrappedU = ((u % 1) + 1) % 1;
  const clampedV = clamp(v, 0, 1);
  const x = wrappedU * width - 0.5;
  const y = clampedV * height - 0.5;
  const x0 = ((Math.floor(x) % width) + width) % width;
  const y0 = clamp(Math.floor(y), 0, height - 1);
  const x1 = (x0 + 1) % width;
  const y1 = clamp(y0 + 1, 0, height - 1);
  const tx = x - Math.floor(x);
  const ty = y - Math.floor(y);
  const read = (px, py) => {
    const offset = (py * width + px) * 4;
    return [pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3]];
  };
  const a = read(x0, y0);
  const b = read(x1, y0);
  const c = read(x0, y1);
  const d = read(x1, y1);
  const mixPair = (first, second, factor) => first * (1 - factor) + second * factor;
  return [
    mixPair(mixPair(a[0], b[0], tx), mixPair(c[0], d[0], tx), ty),
    mixPair(mixPair(a[1], b[1], tx), mixPair(c[1], d[1], tx), ty),
    mixPair(mixPair(a[2], b[2], tx), mixPair(c[2], d[2], tx), ty),
    mixPair(mixPair(a[3], b[3], tx), mixPair(c[3], d[3], tx), ty),
  ];
}

function directionToEnvironmentUv(direction, rotationRadians = 0) {
  const unitDirection = normalize(direction, [0, 1, 0]);
  const rotationTurns = rotationRadians / (2 * Math.PI);
  const u = ((((Math.atan2(unitDirection[2], unitDirection[0]) / (2 * Math.PI)) + 0.5 + rotationTurns) % 1) + 1) % 1;
  const v = Math.acos(clamp(unitDirection[1], -1, 1)) / Math.PI;
  return [u, clamp(v, 0, 1)];
}

function sampleEnvironmentRadiance(pixels, width, height, direction, rotationRadians = 0) {
  const [u, v] = directionToEnvironmentUv(direction, rotationRadians);
  return sampleEnvironmentPixelsBilinear(pixels, width, height, u, v);
}

function createFloat16RgbaUploadFromLevels(levels) {
  return levels.map((level) => {
    const rowBytes = level.width * 8;
    const bytesPerRow = alignTo(rowBytes, 256);
    const bytes = new Uint8Array(bytesPerRow * level.height);
    const view = new DataView(bytes.buffer);
    for (let y = 0; y < level.height; y += 1) {
      for (let x = 0; x < level.width; x += 1) {
        const sourceOffset = (y * level.width + x) * 4;
        const targetOffset = y * bytesPerRow + x * 8;
        view.setUint16(targetOffset, float32ToFloat16Bits(level.data[sourceOffset]), true);
        view.setUint16(targetOffset + 2, float32ToFloat16Bits(level.data[sourceOffset + 1]), true);
        view.setUint16(targetOffset + 4, float32ToFloat16Bits(level.data[sourceOffset + 2]), true);
        view.setUint16(targetOffset + 6, float32ToFloat16Bits(level.data[sourceOffset + 3]), true);
      }
    }
    return Object.freeze({ bytes, bytesPerRow, width: level.width, height: level.height });
  });
}

function createPrefilteredEnvironmentLevels(environmentMap, fallbackColor) {
  const sourcePixels = createLinearEnvironmentPixels(environmentMap, fallbackColor);
  const sourceWidth = Math.max(1, environmentMap.width);
  const sourceHeight = Math.max(1, environmentMap.height);
  const mipLevelCount = Math.max(1, Math.floor(Math.log2(Math.max(sourceWidth, sourceHeight))) + 1);
  const levels = [
    Object.freeze({
      width: sourceWidth,
      height: sourceHeight,
      data: sourcePixels,
    }),
  ];
  for (let mipLevel = 1; mipLevel < mipLevelCount; mipLevel += 1) {
    const width = Math.max(1, sourceWidth >> mipLevel);
    const height = Math.max(1, sourceHeight >> mipLevel);
    const roughness = mipLevelCount <= 1 ? 0 : mipLevel / (mipLevelCount - 1);
    const data = new Float32Array(width * height * 4);
    const sampleCount = roughness < 0.25 ? 64 : roughness < 0.6 ? 96 : 128;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const direction = environmentUvToDirection((x + 0.5) / width, (y + 0.5) / height, environmentMap.rotationRadians);
        const normal = normalize(direction, [0, 1, 0]);
        const viewDirection = normal;
        let totalWeight = 0;
        const accum = [0, 0, 0];
        for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
          const xi = hammersley(sampleIndex, sampleCount);
          const halfVector = importanceSampleGgx(xi, roughness, normal);
          const viewDotHalf = Math.max(dot(viewDirection, halfVector), 0);
          const lightDirection = normalize(
            subtract(scale(halfVector, 2 * viewDotHalf), viewDirection),
            normal
          );
          const nDotL = Math.max(dot(normal, lightDirection), 0);
          if (nDotL <= 0.000001) {
            continue;
          }
          const radiance = sampleEnvironmentRadiance(
            sourcePixels,
            sourceWidth,
            sourceHeight,
            lightDirection,
            environmentMap.rotationRadians
          );
          accum[0] += radiance[0] * nDotL;
          accum[1] += radiance[1] * nDotL;
          accum[2] += radiance[2] * nDotL;
          totalWeight += nDotL;
        }
        const offset = (y * width + x) * 4;
        data[offset] = accum[0] / Math.max(totalWeight, 0.000001);
        data[offset + 1] = accum[1] / Math.max(totalWeight, 0.000001);
        data[offset + 2] = accum[2] / Math.max(totalWeight, 0.000001);
        data[offset + 3] = 1;
      }
    }
    levels.push(Object.freeze({ width, height, data }));
  }
  return Object.freeze({
    levels,
    mipLevelCount,
    width: sourceWidth,
    height: sourceHeight,
  });
}

function createEnvironmentSamplingTables(environmentMap, fallbackColor) {
  if (!environmentMapHasSamplingData(environmentMap)) {
    return Object.freeze({
      width: 1,
      height: 1,
      pdf: new Float32Array([1]),
      marginalCdf: new Float32Array([1]),
      conditionalCdf: new Float32Array([1]),
      hasImportanceData: false,
    });
  }
  const pixels = createLinearEnvironmentPixels(environmentMap, fallbackColor);
  const width = Math.max(1, environmentMap.width);
  const height = Math.max(1, environmentMap.height);
  const pdf = new Float32Array(width * height);
  const marginalCdf = new Float32Array(height);
  const conditionalCdf = new Float32Array(width * height);
  const rowSums = new Float32Array(height);
  let totalWeight = 0;
  for (let y = 0; y < height; y += 1) {
    const theta = ((y + 0.5) / height) * Math.PI;
    const sinTheta = Math.max(Math.sin(theta), 0.0001);
    let rowWeight = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const luminance = pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722;
      const weight = Math.max(luminance * sinTheta, 0.000001);
      pdf[y * width + x] = weight;
      rowWeight += weight;
      conditionalCdf[y * width + x] = rowWeight;
    }
    rowSums[y] = rowWeight;
    totalWeight += rowWeight;
    if (rowWeight > 0) {
      for (let x = 0; x < width; x += 1) {
        conditionalCdf[y * width + x] /= rowWeight;
      }
    } else {
      for (let x = 0; x < width; x += 1) {
        conditionalCdf[y * width + x] = (x + 1) / width;
      }
    }
    marginalCdf[y] = totalWeight;
  }
  for (let y = 0; y < height; y += 1) {
    marginalCdf[y] /= Math.max(totalWeight, 0.000001);
  }
  for (let index = 0; index < pdf.length; index += 1) {
    pdf[index] /= Math.max(totalWeight, 0.000001);
  }
  return Object.freeze({
    width,
    height,
    pdf,
    marginalCdf,
    conditionalCdf,
    hasImportanceData: true,
  });
}

function createEnvironmentMapUploadBytes(environmentMap, fallbackColor) {
  const width = Math.max(1, environmentMap.width);
  const height = Math.max(1, environmentMap.height);
  const rowBytes = width * 8;
  const bytesPerRow = alignTo(rowBytes, 256);
  const bytes = new Uint8Array(bytesPerRow * height);
  const data = environmentMap.data;
  const integerScale = environmentMapIntegerScale(data);
  const view = new DataView(bytes.buffer);
  const writeComponent = (targetOffset, sourceOffset, fallback) => {
    view.setUint16(
      targetOffset,
      float32ToFloat16Bits(
        readEnvironmentMapComponent(data, sourceOffset, fallback, integerScale)
      ),
      true
    );
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (y * width + x) * 4;
      const targetOffset = y * bytesPerRow + x * 8;
      writeComponent(targetOffset, sourceOffset, fallbackColor[0]);
      writeComponent(targetOffset + 2, sourceOffset + 1, fallbackColor[1]);
      writeComponent(targetOffset + 4, sourceOffset + 2, fallbackColor[2]);
      writeComponent(targetOffset + 6, sourceOffset + 3, fallbackColor[3] ?? 1);
    }
  }

  const upload = Object.freeze({
    bytes,
    bytesPerRow,
    width,
    height,
  });
  return upload;
}

export function createEnvironmentMapResource(device, constants, environmentMap, fallbackColor) {
  if (environmentMap.view) {
    return Object.freeze({
      view: environmentMap.view,
      sampler: environmentMap.sampler ?? device.createSampler({
        label: "plasius.wavefront.environmentMapSampler",
        addressModeU: "repeat",
        addressModeV: "clamp-to-edge",
        magFilter: "linear",
        minFilter: "linear",
        mipmapFilter: "linear",
      }),
      texture: null,
      ownsTexture: false,
      width: Math.max(1, environmentMap.width),
      height: Math.max(1, environmentMap.height),
      mipLevelCount: Math.max(1, environmentMap.mipLevelCount ?? 1),
    });
  }

  if (environmentMap.texture && typeof environmentMap.texture.createView === "function") {
    return Object.freeze({
      view: environmentMap.texture.createView(),
      sampler: environmentMap.sampler ?? device.createSampler({
        label: "plasius.wavefront.environmentMapSampler",
        addressModeU: "repeat",
        addressModeV: "clamp-to-edge",
        magFilter: "linear",
        minFilter: "linear",
        mipmapFilter: "linear",
      }),
      texture: environmentMap.texture,
      ownsTexture: false,
      width: Math.max(1, environmentMap.width),
      height: Math.max(1, environmentMap.height),
      mipLevelCount: Math.max(1, environmentMap.mipLevelCount ?? 1),
    });
  }

  const prefiltered = createPrefilteredEnvironmentLevels(environmentMap, fallbackColor);
  const uploads = createFloat16RgbaUploadFromLevels(prefiltered.levels);
  const texture = device.createTexture({
    label: environmentMap.enabled
      ? "plasius.wavefront.environmentMap"
      : "plasius.wavefront.environmentMapFallback",
    size: { width: prefiltered.width, height: prefiltered.height },
    format: "rgba16float",
    mipLevelCount: prefiltered.mipLevelCount,
    usage: constants.texture.TEXTURE_BINDING | constants.texture.COPY_DST,
  });
  uploads.forEach((upload, mipLevel) => {
    device.queue.writeTexture(
      { texture, mipLevel },
      upload.bytes,
      { bytesPerRow: upload.bytesPerRow, rowsPerImage: upload.height },
      { width: upload.width, height: upload.height, depthOrArrayLayers: 1 }
    );
  });
  return Object.freeze({
    view: texture.createView(),
    sampler: environmentMap.sampler ?? device.createSampler({
      label: "plasius.wavefront.environmentMapSampler",
      addressModeU: "repeat",
      addressModeV: "clamp-to-edge",
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
    }),
    texture,
    ownsTexture: true,
    width: prefiltered.width,
    height: prefiltered.height,
    mipLevelCount: prefiltered.mipLevelCount,
  });
}

export function createEnvironmentSamplingTextureResource(device, constants, environmentMap, fallbackColor) {
  const tables = createEnvironmentSamplingTables(environmentMap, fallbackColor);
  const rowBytes = tables.width * 8;
  const bytesPerRow = alignTo(rowBytes, 256);
  const bytes = new Uint8Array(bytesPerRow * tables.height);
  const view = new DataView(bytes.buffer);
  for (let y = 0; y < tables.height; y += 1) {
    for (let x = 0; x < tables.width; x += 1) {
      const probability = tables.pdf[y * tables.width + x];
      const conditional = tables.conditionalCdf[y * tables.width + x];
      const marginal = tables.marginalCdf[y];
      const offset = y * bytesPerRow + x * 8;
      view.setUint16(offset, float32ToFloat16Bits(probability), true);
      view.setUint16(offset + 2, float32ToFloat16Bits(conditional), true);
      view.setUint16(offset + 4, float32ToFloat16Bits(marginal), true);
      view.setUint16(offset + 6, float32ToFloat16Bits(1), true);
    }
  }
  const texture = device.createTexture({
    label: "plasius.wavefront.environmentSampling",
    size: { width: tables.width, height: tables.height },
    format: "rgba16float",
    usage: constants.texture.TEXTURE_BINDING | constants.texture.COPY_DST,
  });
  device.queue.writeTexture(
    { texture },
    bytes,
    { bytesPerRow, rowsPerImage: tables.height },
    { width: tables.width, height: tables.height, depthOrArrayLayers: 1 }
  );
  return Object.freeze({
    view: texture.createView(),
    texture,
    ownsTexture: true,
    hasImportanceData: tables.hasImportanceData,
  });
}

export function createBrdfLutResource(device, constants, size = DEFAULT_BRDF_LUT_SIZE) {
  const upload = createBrdfLutUploadBytes(size);
  const texture = device.createTexture({
    label: "plasius.wavefront.brdfLut",
    size: { width: upload.width, height: upload.height },
    format: "rgba16float",
    usage: constants.texture.TEXTURE_BINDING | constants.texture.COPY_DST,
  });
  device.queue.writeTexture(
    { texture },
    upload.bytes,
    { bytesPerRow: upload.bytesPerRow, rowsPerImage: upload.height },
    { width: upload.width, height: upload.height, depthOrArrayLayers: 1 }
  );
  return Object.freeze({
    view: texture.createView(),
    sampler: device.createSampler({
      label: "plasius.wavefront.brdfLutSampler",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
      magFilter: "linear",
      minFilter: "linear",
    }),
    texture,
    ownsTexture: true,
    width: upload.width,
    height: upload.height,
  });
}

export function createMediumTextureResource(device, constants, mediums) {
  const normalized = Array.isArray(mediums) && mediums.length > 0 ? mediums : [{ id: 0 }];
  const width = Math.max(
    1,
    normalized.reduce((maximum, medium) => Math.max(maximum, medium.id ?? 0), 0) + 1
  );
  const level = {
    width,
    height: MEDIUM_TABLE_ROWS,
    data: new Float32Array(width * MEDIUM_TABLE_ROWS * 4),
  };

  for (const medium of normalized) {
    const mediumId = Math.max(0, Math.trunc(Number(medium.id) || 0));
    const absorptionOffset = mediumId * 4;
    level.data[absorptionOffset] = Math.max(0, medium.absorption?.[0] ?? 0);
    level.data[absorptionOffset + 1] = Math.max(0, medium.absorption?.[1] ?? 0);
    level.data[absorptionOffset + 2] = Math.max(0, medium.absorption?.[2] ?? 0);
    level.data[absorptionOffset + 3] = Math.max(0, medium.phaseModel ?? 0);

    const scatteringOffset = (width + mediumId) * 4;
    level.data[scatteringOffset] = Math.max(0, medium.scattering?.[0] ?? 0);
    level.data[scatteringOffset + 1] = Math.max(0, medium.scattering?.[1] ?? 0);
    level.data[scatteringOffset + 2] = Math.max(0, medium.scattering?.[2] ?? 0);
    level.data[scatteringOffset + 3] = Math.max(0, medium.density ?? 0);
  }

  const upload = createFloat16RgbaUploadFromLevels([level])[0];
  const texture = device.createTexture({
    label: "plasius.wavefront.mediumTable",
    size: { width, height: MEDIUM_TABLE_ROWS },
    format: "rgba16float",
    usage: constants.texture.TEXTURE_BINDING | constants.texture.COPY_DST,
  });
  device.queue.writeTexture(
    { texture },
    upload.bytes,
    { bytesPerRow: upload.bytesPerRow, rowsPerImage: upload.height },
    { width, height: MEDIUM_TABLE_ROWS, depthOrArrayLayers: 1 }
  );
  return Object.freeze({
    texture,
    view: texture.createView(),
    ownsTexture: true,
    count: normalized.length,
    width,
  });
}

export function mediumTablesEqual(left, right) {
  const leftMediums = Array.isArray(left) ? left : [];
  const rightMediums = Array.isArray(right) ? right : [];
  if (leftMediums.length !== rightMediums.length) {
    return false;
  }
  for (let index = 0; index < leftMediums.length; index += 1) {
    const leftMedium = leftMediums[index];
    const rightMedium = rightMediums[index];
    if ((leftMedium?.id ?? 0) !== (rightMedium?.id ?? 0)) {
      return false;
    }
    if ((leftMedium?.phaseModel ?? 0) !== (rightMedium?.phaseModel ?? 0)) {
      return false;
    }
    if ((leftMedium?.density ?? 0) !== (rightMedium?.density ?? 0)) {
      return false;
    }
    for (let component = 0; component < 3; component += 1) {
      if ((leftMedium?.absorption?.[component] ?? 0) !== (rightMedium?.absorption?.[component] ?? 0)) {
        return false;
      }
      if ((leftMedium?.scattering?.[component] ?? 0) !== (rightMedium?.scattering?.[component] ?? 0)) {
        return false;
      }
    }
  }
  return true;
}

export function createAtlasTextureResource(device, constants, atlas, label) {
  const upload = createRgba8TextureUpload(atlas);
  const texture = device.createTexture({
    label,
    size: { width: upload.width, height: upload.height },
    format: "rgba8unorm",
    usage: constants.texture.TEXTURE_BINDING | constants.texture.COPY_DST,
  });
  device.queue.writeTexture(
    { texture },
    upload.bytes,
    { bytesPerRow: upload.bytesPerRow, rowsPerImage: upload.height },
    { width: upload.width, height: upload.height, depthOrArrayLayers: 1 }
  );
  return Object.freeze({
    texture,
    view: texture.createView(),
    ownsTexture: true,
  });
}
