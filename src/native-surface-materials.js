// Decoded RGBA contract matches gpu-shared's glTF loader. No network or DOM work.
const MAX_BYTES = 64 * 1024 * 1024;
const MAPS = ["baseColor", "normal", "orm", "clearcoatMap"];
const defaults = {
  baseColor: [255, 255, 255, 255],
  normal: [128, 128, 255, 255],
  orm: [255, 255, 255, 255],
  clearcoatMap: [255, 255, 255, 255],
};
const dimension = (n) =>
  Number.isInteger(n) && n >= 1 && n <= 2048 && (n & (n - 1)) === 0;

export function validateNativeMaterials(materials) {
  if (!Array.isArray(materials) || materials.length > 16)
    throw new Error("materials must contain at most 16 entries.");
  let bytes = 0;
  for (const material of materials) {
    if (!material || typeof material !== "object")
      throw new Error("Each material must be an object.");
    if (
      !Number.isFinite(material.normalScale ?? 1) ||
      (material.normalScale ?? 1) < 0 ||
      (material.normalScale ?? 1) > 4
    ) {
      throw new Error("material normalScale must be between 0 and 4.");
    }
    for (const key of ["clearcoat", "clearcoatRoughness"]) {
      const value = material[key] ?? 0;
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error(`material ${key} must be between 0 and 1.`);
      }
    }
    for (const key of MAPS) {
      const map = material[key];
      if (map === undefined) continue;
      if (
        !map ||
        !dimension(map.width) ||
        !dimension(map.height) ||
        !(
          map.data instanceof Uint8Array ||
          map.data instanceof Uint8ClampedArray
        ) ||
        map.data.length !== map.width * map.height * 4
      ) {
        throw new Error(
          `material ${key} texture must contain RGBA8 data with power-of-two dimensions between 1 and 2048.`,
        );
      }
      bytes += map.data.byteLength;
      if (bytes > MAX_BYTES)
        throw new Error("material textures exceed the 64 MiB source budget.");
    }
  }
}
const linear = (x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
const srgb = (x) =>
  x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055;

function nextMip(image, colour) {
  const width = Math.max(1, image.width / 2),
    height = Math.max(1, image.height / 2);
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (let dy = 0; dy < 2; dy++)
          for (let dx = 0; dx < 2; dx++) {
            const offset =
              (Math.min(image.height - 1, y * 2 + dy) * image.width +
                Math.min(image.width - 1, x * 2 + dx)) *
                4 +
              c;
            const value = image.data[offset] / 255;
            sum += colour && c < 3 ? linear(value) : value;
          }
        data[(y * width + x) * 4 + c] = Math.round(
          255 * (colour && c < 3 ? srgb(sum / 4) : sum / 4),
        );
      }
  return { width, height, data };
}

export function createNativeMaterialTextures(device, materials, own) {
  // Index zero is the backwards-compatible material; caller materials start at one.
  return [{}, ...materials].map((material, index) => {
    const result = {
      normalScale: material.normal ? (material.normalScale ?? 1) : 0,
      authored: ["baseColor", "normal", "orm"].some((key) => material[key]),
      clearcoat: material.clearcoat ?? 0,
      clearcoatRoughness: material.clearcoatRoughness ?? 0,
    };
    for (const key of MAPS) {
      let level = material[key] ?? {
        width: 1,
        height: 1,
        data: new Uint8Array(defaults[key]),
      };
      const mipLevelCount = 1 + Math.log2(Math.max(level.width, level.height));
      const texture = own(
        device.createTexture({
          label: `native.material.${index}.${key}`,
          size: { width: level.width, height: level.height },
          format: key === "baseColor" ? "rgba8unorm-srgb" : "rgba8unorm",
          mipLevelCount,
          usage: 0x06,
        }),
      );
      for (let mipLevel = 0; mipLevel < mipLevelCount; mipLevel++) {
        device.queue.writeTexture(
          { texture, mipLevel },
          level.data,
          { bytesPerRow: level.width * 4, rowsPerImage: level.height },
          { width: level.width, height: level.height, depthOrArrayLayers: 1 },
        );
        if (mipLevel + 1 < mipLevelCount)
          level = nextMip(level, key === "baseColor");
      }
      result[key] = texture.createView();
    }
    return result;
  });
}
