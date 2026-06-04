var rendererWavefrontComputeMode = "webgpu-compute";
var rendererWavefrontComputeWorkgroupSize = 64;
var rendererWavefrontComputeStatsStride = 8;
var DEFAULT_WIDTH = 1280;
var DEFAULT_HEIGHT = 720;
var DEFAULT_MAX_DEPTH = 5;
var DEFAULT_FORMAT = "rgba8unorm";
var CONFIG_BYTE_LENGTH = 144;
var PASS_BYTE_LENGTH = 16;
var RAY_RECORD_BYTE_LENGTH = 80;
var SCENE_OBJECT_RECORD_BYTE_LENGTH = 80;
var DEFAULT_SCENE_OBJECT_LIMIT = 128;
var COUNTER_BYTE_LENGTH = 8 * Uint32Array.BYTES_PER_ELEMENT;
var INDIRECT_BYTE_LENGTH = 3 * Uint32Array.BYTES_PER_ELEMENT;
var CAMERA = Object.freeze({
  origin: Object.freeze([0, 0.45, 2.85, 0]),
  forward: Object.freeze([-0.019916939, -0.13692907, -0.99038124, 0]),
  right: Object.freeze([0.9997977, 0, -0.02011397, 0]),
  up: Object.freeze([-27546e-7, 0.9905942, -0.13690137, 0])
});
var AMBIENT = Object.freeze([0.0216, 0.02448, 0.0288, 1]);
function readPositiveInteger(name, value) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}
function clampInteger(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function alignTo4(value) {
  return Math.ceil(value / 4) * 4;
}
function alignTo256(value) {
  return Math.ceil(value / 256) * 256;
}
function assertGpuConstants() {
  const { GPUBufferUsage, GPUMapMode, GPUShaderStage, GPUTextureUsage } = globalThis;
  if (!GPUBufferUsage || !GPUMapMode || !GPUShaderStage || !GPUTextureUsage) {
    throw new Error("WebGPU constants are unavailable in this runtime.");
  }
  return { GPUBufferUsage, GPUMapMode, GPUShaderStage, GPUTextureUsage };
}
function readNavigator(navigatorOverride) {
  const currentNavigator = navigatorOverride ?? globalThis.navigator;
  if (!currentNavigator || typeof currentNavigator !== "object") {
    throw new Error("Navigator unavailable. Provide a browser-like navigator object.");
  }
  return currentNavigator;
}
function readGpu(navigatorOverride) {
  const currentNavigator = readNavigator(navigatorOverride);
  const gpu = currentNavigator.gpu;
  if (!gpu || typeof gpu.requestAdapter !== "function") {
    throw new Error("WebGPU runtime unavailable. navigator.gpu is missing.");
  }
  return gpu;
}
function resolveCanvas(canvas) {
  if (!canvas || typeof canvas !== "object") {
    throw new Error("canvas must be an HTMLCanvasElement with a WebGPU context.");
  }
  return canvas;
}
function createBuffer(device, label, size, usage) {
  return device.createBuffer({
    label,
    size: alignTo4(size),
    usage
  });
}

function resolveWavefrontPathTracingComputeStorageFormat(format = DEFAULT_FORMAT) {
  if (format === "rgba16float") {
    return "rgba16float";
  }
  return "rgba8unorm";
}
function writeVec4(target, offset, value) {
  target.set(value, offset);
}
function buildConfigBufferData(config, frameIndex, tile) {
  const buffer = new ArrayBuffer(CONFIG_BYTE_LENGTH);
  const dataView = new DataView(buffer);
  dataView.setUint32(0, config.width, true);
  dataView.setUint32(4, config.height, true);
  dataView.setUint32(8, config.maxDepth, true);
  dataView.setUint32(12, config.queueCapacity, true);
  dataView.setUint32(16, frameIndex, true);
  dataView.setUint32(20, config.samples, true);
  dataView.setUint32(24, config.denoise ? 1 : 0, true);
  dataView.setUint32(28, tile.x, true);
  dataView.setUint32(32, tile.y, true);
  dataView.setUint32(36, tile.width, true);
  dataView.setUint32(40, tile.height, true);
  dataView.setUint32(44, tile.pixelCount, true);
  dataView.setUint32(48, config.sceneObjectCount, true);
  const floatView = new Float32Array(buffer);
  writeVec4(floatView, 16, CAMERA.origin);
  writeVec4(floatView, 20, CAMERA.forward);
  writeVec4(floatView, 24, CAMERA.right);
  writeVec4(floatView, 28, CAMERA.up);
  writeVec4(floatView, 32, AMBIENT);
  return buffer;
}
function buildPassBufferData(bounce) {
  const values = new Uint32Array(PASS_BYTE_LENGTH / Uint32Array.BYTES_PER_ELEMENT);
  values[0] = bounce;
  values[1] = bounce % 2;
  return values;
}
function parseStats(data, config) {
  const bounces = [];
  const termination = {
    emissive: 0,
    environment: 0,
    ambientFallback: 0,
    maxDepth: 0
  };
  let queueOverflow = 0;
  for (let bounce = 0; bounce < config.maxDepth; bounce += 1) {
    const offset = bounce * rendererWavefrontComputeStatsStride;
    const entry = {
      bounce,
      active: data[offset],
      surfaceHits: data[offset + 1],
      emissiveHits: data[offset + 2],
      environmentHits: data[offset + 3],
      spawned: data[offset + 4],
      ambientFallback: data[offset + 5],
      queueOverflow: data[offset + 6],
      maxDepth: data[offset + 7]
    };
    termination.emissive += entry.emissiveHits;
    termination.environment += entry.environmentHits;
    termination.ambientFallback += entry.ambientFallback;
    termination.maxDepth += entry.maxDepth;
    queueOverflow += entry.queueOverflow;
    bounces.push(Object.freeze(entry));
  }
  return Object.freeze({
    bounces: Object.freeze(bounces),
    termination: Object.freeze(termination),
    queueOverflow
  });
}
function createWavefrontTiles(config) {
  const tiles = [];
  for (let y = 0; y < config.height; y += config.tileHeight) {
    for (let x = 0; x < config.width; x += config.tileWidth) {
      const width = Math.min(config.tileWidth, config.width - x);
      const height = Math.min(config.tileHeight, config.height - y);
      const pixelCount = width * height * config.samples;
      tiles.push(Object.freeze({
        x,
        y,
        width,
        height,
        pixelCount,
        workgroups: Math.ceil(pixelCount / config.workgroupSize)
      }));
    }
  }
  return Object.freeze(tiles);
}
function readSceneVec3(name, value, fallback) {
  if (value == null) {
    return fallback;
  }
  if (!Array.isArray(value) && !(ArrayBuffer.isView(value) && value.length != null)) {
    throw new Error(`${name} must be an array-like vec3.`);
  }
  if (value.length < 3) {
    throw new Error(`${name} must contain at least three numeric values.`);
  }
  const result = [Number(value[0]), Number(value[1]), Number(value[2])];
  if (!result.every(Number.isFinite)) {
    throw new Error(`${name} must contain finite numeric values.`);
  }
  return result;
}
function readSceneVec4(name, value, fallback) {
  const vec3 = readSceneVec3(name, value, fallback);
  const alpha = value != null && value.length >= 4 ? Number(value[3]) : fallback[3] ?? 1;
  if (!Number.isFinite(alpha)) {
    throw new Error(`${name} alpha must be finite when provided.`);
  }
  return [vec3[0], vec3[1], vec3[2], alpha];
}
function normalizeMaterialKind(value) {
  if (value == null) {
    return 1;
  }
  const materialKind = Number(value);
  if (!Number.isInteger(materialKind) || materialKind < 1 || materialKind > 6) {
    throw new Error("scene object materialKind must be an integer between 1 and 6.");
  }
  return materialKind;
}
function normalizeSceneObject(object, index) {
  if (!object || typeof object !== "object") {
    throw new Error(`sceneObjects[${index}] must be an object.`);
  }
  const kindName = object.kind ?? object.type ?? "box";
  const kind = kindName === "sphere" ? 2 : 1;
  const materialKind = normalizeMaterialKind(object.materialKind);
  const color = readSceneVec4(`sceneObjects[${index}].color`, object.color, [0.65, 0.58, 0.48, 1]);
  const emission = readSceneVec4(`sceneObjects[${index}].emission`, object.emission, [0, 0, 0, 0]);
  const ior = Number(object.ior ?? 1);
  if (!Number.isFinite(ior) || ior <= 0) {
    throw new Error(`sceneObjects[${index}].ior must be a positive finite number.`);
  }
  if (kind === 2) {
    const center = readSceneVec3(`sceneObjects[${index}].center`, object.center, [0, 0, -1]);
    const radius = Number(object.radius ?? 0.25);
    if (!Number.isFinite(radius) || radius <= 0) {
      throw new Error(`sceneObjects[${index}].radius must be a positive finite number.`);
    }
    return Object.freeze({
      kind,
      materialKind,
      boundsMin: Object.freeze([center[0] - radius, center[1] - radius, center[2] - radius, ior]),
      boundsMax: Object.freeze([center[0] + radius, center[1] + radius, center[2] + radius, radius]),
      color: Object.freeze(color),
      emission: Object.freeze(emission)
    });
  }
  const bounds = object.bounds ?? object;
  const min = readSceneVec3(`sceneObjects[${index}].bounds.min`, bounds.min, [-0.5, -0.5, -1.5]);
  const max = readSceneVec3(`sceneObjects[${index}].bounds.max`, bounds.max, [0.5, 0.5, -0.5]);
  if (min.some((value, axis) => value >= max[axis])) {
    throw new Error(`sceneObjects[${index}] bounds min values must be lower than max values.`);
  }
  return Object.freeze({
    kind,
    materialKind,
    boundsMin: Object.freeze([min[0], min[1], min[2], ior]),
    boundsMax: Object.freeze([max[0], max[1], max[2], 0]),
    color: Object.freeze(color),
    emission: Object.freeze(emission)
  });
}
function normalizeSceneObjects(value, limit = DEFAULT_SCENE_OBJECT_LIMIT) {
  if (value == null) {
    return Object.freeze([]);
  }
  if (!Array.isArray(value)) {
    throw new Error("sceneObjects must be an array when provided.");
  }
  if (value.length > limit) {
    throw new Error(`sceneObjects supports at most ${limit} analytic objects.`);
  }
  return Object.freeze(value.map(normalizeSceneObject));
}
function buildSceneObjectBufferData(config) {
  const buffer = new ArrayBuffer(config.sceneObjectCapacity * SCENE_OBJECT_RECORD_BYTE_LENGTH);
  const dataView = new DataView(buffer);
  const floatView = new Float32Array(buffer);
  config.sceneObjects.forEach((object, index) => {
    const byteOffset = index * SCENE_OBJECT_RECORD_BYTE_LENGTH;
    const floatOffset = byteOffset / Float32Array.BYTES_PER_ELEMENT;
    dataView.setUint32(byteOffset, object.kind, true);
    dataView.setUint32(byteOffset + 4, object.materialKind, true);
    dataView.setUint32(byteOffset + 8, 0, true);
    dataView.setUint32(byteOffset + 12, 0, true);
    writeVec4(floatView, floatOffset + 4, object.boundsMin);
    writeVec4(floatView, floatOffset + 8, object.boundsMax);
    writeVec4(floatView, floatOffset + 12, object.color);
    writeVec4(floatView, floatOffset + 16, object.emission);
  });
  return buffer;
}
function getOutputProbeByteLength(config) {
  return alignTo256(config.width * 4) * config.height;
}
function getOutputProbeBytesPerRow(config) {
  return alignTo256(config.width * 4);
}
async function readOutputProbeBuffer(device, resources, config) {
  const { GPUMapMode } = assertGpuConstants();
  await device.queue.onSubmittedWorkDone();
  await resources.outputReadbackBuffer.mapAsync(GPUMapMode.READ);
  const mapped = resources.outputReadbackBuffer.getMappedRange();
  const bytes = new Uint8Array(mapped.slice(0));
  resources.outputReadbackBuffer.unmap();
  const bytesPerRow = getOutputProbeBytesPerRow(config);
  const stepX = Math.max(1, Math.floor(config.width / 96));
  const stepY = Math.max(1, Math.floor(config.height / 54));
  let sampledPixels = 0;
  let nonZeroSamples = 0;
  let maxChannel = 0;
  let luminanceTotal = 0;
  for (let y = 0; y < config.height; y += stepY) {
    for (let x = 0; x < config.width; x += stepX) {
      const offset = y * bytesPerRow + x * 4;
      const r = bytes[offset] ?? 0;
      const g = bytes[offset + 1] ?? 0;
      const b = bytes[offset + 2] ?? 0;
      const a = bytes[offset + 3] ?? 0;
      const max = Math.max(r, g, b, a);
      sampledPixels += 1;
      if (max > 0) {
        nonZeroSamples += 1;
      }
      maxChannel = Math.max(maxChannel, max);
      luminanceTotal += r + g + b;
    }
  }
  return Object.freeze({
    sampledPixels,
    nonZeroSamples,
    maxChannel,
    averageRgb: sampledPixels > 0 ? luminanceTotal / (sampledPixels * 3) : 0
  });
}
function createPassBindGroup(device, layout, resources, passBuffer, outputView) {
  return device.createBindGroup({
    label: "plasius.wavefront.bindGroup",
    layout,
    entries: [
      { binding: 0, resource: { buffer: resources.configBuffer } },
      { binding: 1, resource: { buffer: passBuffer } },
      { binding: 2, resource: { buffer: resources.activeQueueBuffer } },
      { binding: 3, resource: { buffer: resources.nextQueueBuffer } },
      { binding: 4, resource: { buffer: resources.accumulationBuffer } },
      { binding: 5, resource: { buffer: resources.counterBuffer } },
      { binding: 6, resource: { buffer: resources.statsBuffer } },
      { binding: 7, resource: { buffer: resources.activeIndirectBuffer } },
      { binding: 8, resource: { buffer: resources.nextIndirectBuffer } },
      { binding: 9, resource: outputView },
      { binding: 10, resource: { buffer: resources.sceneObjectBuffer } }
    ]
  });
}
async function createPipelines(device, shaderSource, format = DEFAULT_FORMAT) {
  const { GPUShaderStage } = assertGpuConstants();
  const bindGroupLayout = device.createBindGroupLayout({
    label: "plasius.wavefront.bindGroupLayout",
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      {
        binding: 9,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: { access: "write-only", format }
      },
      { binding: 10, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } }
    ]
  });
  const layout = device.createPipelineLayout({
    label: "plasius.wavefront.pipelineLayout",
    bindGroupLayouts: [bindGroupLayout]
  });
  const module = device.createShaderModule({
    label: "plasius.wavefront.compute.shader",
    code: shaderSource
  });
  if (typeof module.getCompilationInfo === "function") {
    const info = await module.getCompilationInfo();
    const errors = info.messages.filter((message) => message.type === "error");
    if (errors.length > 0) {
      throw new Error(
        `WGSL compilation failed: ${errors.map((message) => `line ${message.lineNum}:${message.linePos} ${message.message}`).join(" | ")}`
      );
    }
  }
  const createPipeline = async (label, entryPoint) => {
    const descriptor = {
      label,
      layout,
      compute: { module, entryPoint }
    };
    try {
      return typeof device.createComputePipelineAsync === "function"
        ? await device.createComputePipelineAsync(descriptor)
        : device.createComputePipeline(descriptor);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`WebGPU pipeline creation failed for ${entryPoint}: ${message}`, { cause: error });
    }
  };
  const generate = await createPipeline(
    "plasius.wavefront.generatePrimaryRays",
    "generatePrimaryRays"
  );
  const trace = await createPipeline("plasius.wavefront.traceBounce", "traceBounce");
  const finalize = await createPipeline(
    "plasius.wavefront.compactAndSwapQueues",
    "compactAndSwapQueues"
  );
  const resolve = await createPipeline("plasius.wavefront.resolveOutput", "resolveOutput");
  return { bindGroupLayout, generate, trace, finalize, resolve };
}
function createResources(device, config, outputTextureFormat) {
  const { GPUBufferUsage, GPUTextureUsage } = assertGpuConstants();
  const rayQueueBytes = config.queueCapacity * RAY_RECORD_BYTE_LENGTH;
  const accumulationBytes = config.primaryRayCount * 4 * Float32Array.BYTES_PER_ELEMENT;
  const statsBytes = config.maxDepth * rendererWavefrontComputeStatsStride * Uint32Array.BYTES_PER_ELEMENT;
  const maxStorageBufferBindingSize = device.limits?.maxStorageBufferBindingSize;
  if (maxStorageBufferBindingSize && rayQueueBytes > maxStorageBufferBindingSize) {
    throw new Error(
      `Wavefront tiled ray queue requires ${rayQueueBytes.toLocaleString()} bytes per queue, but this WebGPU device exposes maxStorageBufferBindingSize=${maxStorageBufferBindingSize.toLocaleString()}. Reduce tileWidth/tileHeight or select a lower resolution.`
    );
  }
  if (maxStorageBufferBindingSize && accumulationBytes > maxStorageBufferBindingSize) {
    throw new Error(
      `Wavefront accumulation buffer requires ${accumulationBytes.toLocaleString()} bytes, but this WebGPU device exposes maxStorageBufferBindingSize=${maxStorageBufferBindingSize.toLocaleString()}. Select a lower resolution or reduce accumulation storage until tiled accumulation is implemented.`
    );
  }
  const maxBufferSize = device.limits?.maxBufferSize;
  if (maxBufferSize && rayQueueBytes > maxBufferSize) {
    throw new Error(
      `Wavefront tiled ray queue requires ${rayQueueBytes.toLocaleString()} bytes per queue, but this WebGPU device exposes maxBufferSize=${maxBufferSize.toLocaleString()}. Reduce tileWidth/tileHeight or select a lower resolution.`
    );
  }
  if (maxBufferSize && accumulationBytes > maxBufferSize) {
    throw new Error(
      `Wavefront accumulation buffer requires ${accumulationBytes.toLocaleString()} bytes, but this WebGPU device exposes maxBufferSize=${maxBufferSize.toLocaleString()}. Select a lower resolution or reduce accumulation storage until tiled accumulation is implemented.`
    );
  }
  const resources = {
    configBuffer: createBuffer(
      device,
      "plasius.wavefront.config",
      CONFIG_BYTE_LENGTH,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    ),
    activeQueueBuffer: createBuffer(
      device,
      "plasius.wavefront.activeQueue",
      rayQueueBytes,
      GPUBufferUsage.STORAGE
    ),
    nextQueueBuffer: createBuffer(
      device,
      "plasius.wavefront.nextQueue",
      rayQueueBytes,
      GPUBufferUsage.STORAGE
    ),
    accumulationBuffer: createBuffer(
      device,
      "plasius.wavefront.accumulation",
      accumulationBytes,
      GPUBufferUsage.STORAGE
    ),
    counterBuffer: createBuffer(
      device,
      "plasius.wavefront.counters",
      COUNTER_BYTE_LENGTH,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    ),
    statsBuffer: createBuffer(
      device,
      "plasius.wavefront.stats",
      statsBytes,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
    ),
    statsReadbackBuffer: createBuffer(
      device,
      "plasius.wavefront.stats.readback",
      statsBytes,
      GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    ),
    activeIndirectBuffer: createBuffer(
      device,
      "plasius.wavefront.activeIndirect",
      INDIRECT_BYTE_LENGTH,
      GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST
    ),
    nextIndirectBuffer: createBuffer(
      device,
      "plasius.wavefront.nextIndirect",
      INDIRECT_BYTE_LENGTH,
      GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST
    ),
    outputTexture: device.createTexture({
      label: "plasius.wavefront.outputTexture",
      size: {
        width: config.width,
        height: config.height,
        depthOrArrayLayers: 1
      },
      format: outputTextureFormat,
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC
    }),
    outputReadbackBuffer: createBuffer(
      device,
      "plasius.wavefront.output.readback",
      getOutputProbeByteLength(config),
      GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    ),
    sceneObjectBuffer: createBuffer(
      device,
      "plasius.wavefront.sceneObjects",
      config.sceneObjectCapacity * SCENE_OBJECT_RECORD_BYTE_LENGTH,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    ),
    passBuffers: Array.from({ length: config.maxDepth }, (_, bounce) => {
      const passBuffer = createBuffer(
        device,
        `plasius.wavefront.pass.${bounce}`,
        PASS_BYTE_LENGTH,
        GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      );
      device.queue.writeBuffer(passBuffer, 0, buildPassBufferData(bounce));
      return passBuffer;
    })
  };
  device.queue.writeBuffer(resources.sceneObjectBuffer, 0, buildSceneObjectBufferData(config));
  return resources;
}
async function readStatsBuffer(device, resources, config) {
  const { GPUMapMode } = assertGpuConstants();
  await device.queue.onSubmittedWorkDone();
  await resources.statsReadbackBuffer.mapAsync(GPUMapMode.READ);
  const mapped = resources.statsReadbackBuffer.getMappedRange();
  const values = new Uint32Array(mapped.slice(0));
  resources.statsReadbackBuffer.unmap();
  return parseStats(values, config);
}
function supportsWavefrontPathTracingCompute(options = {}) {
  try {
    const gpu = readGpu(options.navigator);
    return Boolean(gpu);
  } catch {
    return false;
  }
}
function createWavefrontPathTracingComputeConfig(options = {}) {
  const width = readPositiveInteger("width", options.width ?? DEFAULT_WIDTH);
  const height = readPositiveInteger("height", options.height ?? DEFAULT_HEIGHT);
  const samples = readPositiveInteger("samples", options.samples ?? 1);
  if (samples !== 1) {
    throw new Error("WebGPU wavefront compute currently supports exactly one sample per pixel.");
  }
  const maxDepth = clampInteger(
    readPositiveInteger("maxDepth", options.maxDepth ?? DEFAULT_MAX_DEPTH),
    1,
    8
  );
  const workgroupSize = readPositiveInteger(
    "workgroupSize",
    options.workgroupSize ?? rendererWavefrontComputeWorkgroupSize
  );
  const primaryRayCount = width * height * samples;
  const tileWidth = readPositiveInteger("tileWidth", options.tileWidth ?? 256);
  const tileHeight = readPositiveInteger("tileHeight", options.tileHeight ?? 256);
  const tilePixelCapacity = tileWidth * tileHeight * samples;
  const sceneObjectLimit = readPositiveInteger(
    "sceneObjectLimit",
    options.sceneObjectLimit ?? DEFAULT_SCENE_OBJECT_LIMIT
  );
  const sceneObjects = normalizeSceneObjects(options.sceneObjects, sceneObjectLimit);
  const queueCapacity = readPositiveInteger(
    "queueCapacity",
    options.queueCapacity ?? tilePixelCapacity
  );
  if (queueCapacity < tilePixelCapacity) {
    throw new Error("queueCapacity must be at least tileWidth * tileHeight * samples.");
  }
  const config = {
    mode: rendererWavefrontComputeMode,
    width,
    height,
    samples,
    maxDepth,
    queueCapacity,
    primaryRayCount,
    tileWidth,
    tileHeight,
    tilePixelCapacity,
    sceneObjects,
    sceneObjectCount: sceneObjects.length,
    sceneObjectCapacity: Math.max(1, sceneObjectLimit),
    tileCountX: Math.ceil(width / tileWidth),
    tileCountY: Math.ceil(height / tileHeight),
    workgroupSize,
    primaryWorkgroups: Math.ceil(primaryRayCount / workgroupSize),
    bouncePasses: maxDepth,
    indirectDispatch: true,
    cpuReference: false,
    denoise: options.denoise === true,
    format: options.format ?? DEFAULT_FORMAT
  };
  config.tiles = createWavefrontTiles(config);
  config.tileCount = config.tiles.length;
  config.maxTileWorkgroups = Math.max(...config.tiles.map((tile) => tile.workgroups));
  return Object.freeze(config);
}
async function createWavefrontPathTracingComputeRenderer(options = {}) {
  const { GPUTextureUsage } = assertGpuConstants();
  const config = createWavefrontPathTracingComputeConfig(options);
  const canvas = resolveCanvas(options.canvas);
  canvas.width = config.width;
  canvas.height = config.height;
  const gpu = options.gpu ?? readGpu(options.navigator);
  const adapter = options.adapter ?? await gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) {
    throw new Error("Unable to obtain GPU adapter for wavefront path tracing.");
  }
  const device = options.device ?? await adapter.requestDevice();
  const context = options.context ?? canvas.getContext?.("webgpu");
  if (!context) {
    throw new Error("Unable to obtain WebGPU canvas context for wavefront path tracing.");
  }
  const outputTextureFormat = resolveWavefrontPathTracingComputeStorageFormat(config.format);
  context.configure({
    device,
    format: outputTextureFormat,
    alphaMode: "opaque",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST
  });
  const shaderSource = createWavefrontPathTracingComputeShaderSource({
    workgroupSize: config.workgroupSize,
    outputTextureFormat
  });
  const pipelines = await createPipelines(device, shaderSource, outputTextureFormat);
  const resources = createResources(device, config, outputTextureFormat);
  const bindGroupLayout = pipelines.bindGroupLayout;
  let frameIndex = 0;
  return {
    config,
    device,
    context,
    canvas,
    async renderFrame(renderOptions = {}) {
      const startedAt = performance.now();
      frameIndex += 1;
      if (typeof device.pushErrorScope === "function") {
        device.pushErrorScope("validation");
      }
      const texture = context.getCurrentTexture();
      const outputView = resources.outputTexture.createView();
      const bindGroups = resources.passBuffers.map(
        (passBuffer) => createPassBindGroup(device, bindGroupLayout, resources, passBuffer, outputView)
      );
      device.queue.writeBuffer(
        resources.statsBuffer,
        0,
        new Uint32Array(config.maxDepth * rendererWavefrontComputeStatsStride)
      );
      for (const tile of config.tiles) {
        device.queue.writeBuffer(
          resources.configBuffer,
          0,
          buildConfigBufferData(config, frameIndex, tile)
        );
        device.queue.writeBuffer(
          resources.counterBuffer,
          0,
          new Uint32Array([
            tile.pixelCount,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ])
        );
        device.queue.writeBuffer(
          resources.activeIndirectBuffer,
          0,
          new Uint32Array([tile.workgroups, 1, 1])
        );
        device.queue.writeBuffer(resources.nextIndirectBuffer, 0, new Uint32Array([1, 1, 1]));
        const tileEncoder = device.createCommandEncoder({
          label: `plasius.wavefront.frame.${frameIndex}.tile.${tile.x}.${tile.y}`
        });
        let activeIndirectBuffer = resources.activeIndirectBuffer;
        const generatePass = tileEncoder.beginComputePass({
          label: "plasius.wavefront.generatePrimaryRays"
        });
        generatePass.setPipeline(pipelines.generate);
        generatePass.setBindGroup(0, bindGroups[0]);
        generatePass.dispatchWorkgroups(tile.workgroups);
        generatePass.end();
        for (let bounce = 0; bounce < config.maxDepth; bounce += 1) {
          const tracePass = tileEncoder.beginComputePass({
            label: `plasius.wavefront.traceBounce.${bounce}`
          });
          tracePass.setPipeline(pipelines.trace);
          tracePass.setBindGroup(0, bindGroups[bounce]);
          tracePass.dispatchWorkgroupsIndirect(activeIndirectBuffer, 0);
          tracePass.end();
          const compactPass = tileEncoder.beginComputePass({
            label: `plasius.wavefront.compactAndSwapQueues.${bounce}`
          });
          compactPass.setPipeline(pipelines.finalize);
          compactPass.setBindGroup(0, bindGroups[bounce]);
          compactPass.dispatchWorkgroups(1);
          compactPass.end();
          activeIndirectBuffer =
            activeIndirectBuffer === resources.activeIndirectBuffer
              ? resources.nextIndirectBuffer
              : resources.activeIndirectBuffer;
        }
        const resolvePass = tileEncoder.beginComputePass({
          label: "plasius.wavefront.resolveOutput"
        });
        resolvePass.setPipeline(pipelines.resolve);
        resolvePass.setBindGroup(0, bindGroups[0]);
        resolvePass.dispatchWorkgroups(tile.workgroups);
        resolvePass.end();
        device.queue.submit([tileEncoder.finish()]);
      }
      const encoder = device.createCommandEncoder({
        label: `plasius.wavefront.frame.${frameIndex}.present`
      });
      encoder.copyTextureToTexture(
        { texture: resources.outputTexture },
        { texture },
        {
          width: config.width,
          height: config.height,
          depthOrArrayLayers: 1
        }
      );
      if (renderOptions.readOutputProbe !== false) {
        encoder.copyTextureToBuffer(
          { texture: resources.outputTexture },
          {
            buffer: resources.outputReadbackBuffer,
            bytesPerRow: getOutputProbeBytesPerRow(config),
            rowsPerImage: config.height
          },
          {
            width: config.width,
            height: config.height,
            depthOrArrayLayers: 1
          }
        );
      }
      if (renderOptions.readStats !== false) {
        encoder.copyBufferToBuffer(
          resources.statsBuffer,
          0,
          resources.statsReadbackBuffer,
          0,
          resources.statsReadbackBuffer.size
        );
      }
      device.queue.submit([encoder.finish()]);
      const stats = renderOptions.readStats === false ? {
        bounces: [],
        termination: { emissive: 0, environment: 0, ambientFallback: 0, maxDepth: 0 },
        queueOverflow: 0
      } : await readStatsBuffer(device, resources, config);
      const outputProbe = renderOptions.readOutputProbe === false ? null : await readOutputProbeBuffer(device, resources, config);
      const validationError = typeof device.popErrorScope === "function" ? await device.popErrorScope() : null;
      if (validationError) {
        throw new Error(`WebGPU validation error: ${validationError.message}`);
      }
      const renderMs = performance.now() - startedAt;
      return Object.freeze({
        plan: Object.freeze({
          mode: rendererWavefrontComputeMode,
          maxDepth: config.maxDepth,
          queueCapacity: config.queueCapacity,
          dispatch: Object.freeze({
            workgroupSize: config.workgroupSize,
            primaryWorkgroups: config.primaryWorkgroups,
            tileCount: config.tileCount,
            tileWidth: config.tileWidth,
            tileHeight: config.tileHeight,
            maxTileWorkgroups: config.maxTileWorkgroups,
            indirectDispatch: config.indirectDispatch
          })
        }),
        settings: config,
        renderMs,
        queueOverflow: stats.queueOverflow,
        outputProbe,
        bounces: stats.bounces,
        termination: stats.termination
      });
    },
    destroy() {
      for (const buffer of Object.values(resources)) {
        if (Array.isArray(buffer)) {
          for (const item of buffer) {
            item.destroy?.();
          }
        } else {
          buffer.destroy?.();
        }
      }
    }
  };
}
async function renderWavefrontPathTracingComputeFrame(options = {}) {
  const renderer = await createWavefrontPathTracingComputeRenderer(options);
  try {
    return await renderer.renderFrame(options);
  } finally {
    if (options.destroy !== false) {
      renderer.destroy();
    }
  }
}
function createWavefrontPathTracingComputeShaderSource(options = {}) {
  const workgroupSize = readPositiveInteger(
    "workgroupSize",
    options.workgroupSize ?? rendererWavefrontComputeWorkgroupSize
  );
  const outputTextureFormat = options.outputTextureFormat ?? DEFAULT_FORMAT;
  return `
struct RenderConfig {
  width: u32,
  height: u32,
  maxDepth: u32,
  queueCapacity: u32,
  frameIndex: u32,
  samples: u32,
  denoise: u32,
  tileOriginX: u32,
  tileOriginY: u32,
  tileWidth: u32,
  tileHeight: u32,
  tilePixelCount: u32,
  sceneObjectCount: u32,
  _configPad0: u32,
  _configPad1: u32,
  _configPad2: u32,
  cameraOrigin: vec4<f32>,
  cameraForward: vec4<f32>,
  cameraRight: vec4<f32>,
  cameraUp: vec4<f32>,
  ambient: vec4<f32>,
}

struct PassConfig {
  bounce: u32,
  readQueue: u32,
  _pad0: u32,
  _pad1: u32,
}

struct RayRecord {
  rayId: u32,
  parentRayId: u32,
  sourcePixelId: u32,
  sampleId: u32,
  bounce: u32,
  mediumRefId: u32,
  flags: u32,
  _pad0: u32,
  origin: vec4<f32>,
  direction: vec4<f32>,
  throughput: vec4<f32>,
}

struct Counters {
  activeCount: atomic<u32>,
  nextCount: atomic<u32>,
  terminalCount: atomic<u32>,
  environmentCount: atomic<u32>,
  emissiveCount: atomic<u32>,
  ambientCount: atomic<u32>,
  surfaceCount: atomic<u32>,
  overflowCount: atomic<u32>,
}

struct Hit {
  hit: u32,
  hitType: u32,
  materialKind: u32,
  frontFace: u32,
  distance: f32,
  ior: f32,
  _pad0: f32,
  _pad1: f32,
  position: vec4<f32>,
  normal: vec4<f32>,
  color: vec4<f32>,
  emission: vec4<f32>,
}

struct SceneObject {
  kind: u32,
  materialKind: u32,
  _pad0: u32,
  _pad1: u32,
  boundsMin: vec4<f32>,
  boundsMax: vec4<f32>,
  color: vec4<f32>,
  emission: vec4<f32>,
}

@group(0) @binding(0) var<uniform> config: RenderConfig;
@group(0) @binding(1) var<uniform> bounceConfig: PassConfig;
@group(0) @binding(2) var<storage, read_write> activeQueue: array<RayRecord>;
@group(0) @binding(3) var<storage, read_write> nextQueue: array<RayRecord>;
@group(0) @binding(4) var<storage, read_write> accumulation: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> counters: Counters;
@group(0) @binding(6) var<storage, read_write> stats: array<atomic<u32>>;
@group(0) @binding(7) var<storage, read_write> activeIndirect: array<u32>;
@group(0) @binding(8) var<storage, read_write> nextIndirect: array<u32>;
@group(0) @binding(9) var outputTexture: texture_storage_2d<${outputTextureFormat}, write>;
@group(0) @binding(10) var<storage, read> sceneObjects: array<SceneObject>;

fn safeNormalize(value: vec3<f32>) -> vec3<f32> {
  let len = length(value);
  if (len <= 0.000001) {
    return vec3<f32>(0.0, 1.0, 0.0);
  }
  return value / len;
}

fn hash(seed: f32) -> f32 {
  return fract(sin(seed * 12.9898 + 78.233) * 43758.5453);
}

fn mix3(a: vec3<f32>, b: vec3<f32>, t: f32) -> vec3<f32> {
  return a + (b - a) * t;
}

fn sampleEnvironment(direction: vec3<f32>) -> vec3<f32> {
  let t = clamp(direction.y * 0.5 + 0.5, 0.0, 1.0);
  let base = mix3(vec3<f32>(0.018, 0.022, 0.04), mix3(vec3<f32>(0.08, 0.18, 0.24), vec3<f32>(0.38, 0.56, 0.72), t), 0.84);
  let glint = pow(clamp(dot(direction, safeNormalize(vec3<f32>(0.26, 0.82, -0.52))), 0.0, 1.0), 180.0);
  return base + vec3<f32>(1.0, 0.72, 0.34) * glint * 8.0;
}

fn ambientResidual(materialColor: vec3<f32>) -> vec3<f32> {
  return config.ambient.rgb * mix3(vec3<f32>(1.0), materialColor, 0.35);
}

fn rayDirection(pixelX: u32, pixelY: u32) -> vec3<f32> {
  let aspect = f32(config.width) / f32(config.height);
  let viewScale = tan(47.0 * 0.01745329252 * 0.5);
  let ndcX = ((f32(pixelX) + 0.5) / f32(config.width)) * 2.0 - 1.0;
  let ndcY = 1.0 - ((f32(pixelY) + 0.5) / f32(config.height)) * 2.0;
  return safeNormalize(
    config.cameraForward.xyz +
    config.cameraRight.xyz * ndcX * aspect * viewScale +
    config.cameraUp.xyz * ndcY * viewScale
  );
}

fn emptyHit() -> Hit {
  return Hit(
    0u,
    3u,
    0u,
    0u,
    1000000.0,
    1.0,
    0.0,
    0.0,
    vec4<f32>(0.0),
    vec4<f32>(0.0, 1.0, 0.0, 0.0),
    vec4<f32>(1.0),
    vec4<f32>(0.0)
  );
}

fn makeHit(
  distance: f32,
  position: vec3<f32>,
  outwardNormal: vec3<f32>,
  rayDirectionValue: vec3<f32>,
  materialKind: u32,
  color: vec3<f32>,
  emission: vec3<f32>,
  ior: f32
) -> Hit {
  let frontFace = dot(rayDirectionValue, outwardNormal) < 0.0;
  var normal = outwardNormal;
  if (!frontFace) {
    normal = -outwardNormal;
  }
  var hitType = 1u;
  if (materialKind == 5u) {
    hitType = 2u;
  }
  return Hit(
    1u,
    hitType,
    materialKind,
    select(0u, 1u, frontFace),
    distance,
    ior,
    0.0,
    0.0,
    vec4<f32>(position, 0.0),
    vec4<f32>(normal, 0.0),
    vec4<f32>(color, 1.0),
    vec4<f32>(emission, 0.0)
  );
}

fn intersectSphere(
  ray: RayRecord,
  center: vec3<f32>,
  radius: f32,
  materialKind: u32,
  color: vec3<f32>,
  emission: vec3<f32>,
  ior: f32
) -> Hit {
  let oc = ray.origin.xyz - center;
  let halfB = dot(oc, ray.direction.xyz);
  let c = dot(oc, oc) - radius * radius;
  let discriminant = halfB * halfB - c;
  if (discriminant < 0.0) {
    return emptyHit();
  }
  let root = sqrt(discriminant);
  let first = -halfB - root;
  let second = -halfB + root;
  var distance = first;
  if (distance <= 0.001) {
    distance = second;
  }
  if (distance <= 0.001) {
    return emptyHit();
  }
  let position = ray.origin.xyz + ray.direction.xyz * distance;
  let normal = safeNormalize(position - center);
  return makeHit(distance, position, normal, ray.direction.xyz, materialKind, color, emission, ior);
}

fn inRange(value: f32, minValue: f32, maxValue: f32) -> bool {
  return value >= minValue && value <= maxValue;
}

fn intersectPlane(
  ray: RayRecord,
  point: vec3<f32>,
  normalValue: vec3<f32>,
  boundsMin: vec3<f32>,
  boundsMax: vec3<f32>,
  materialKind: u32,
  color: vec3<f32>,
  emission: vec3<f32>,
  ior: f32
) -> Hit {
  let normal = safeNormalize(normalValue);
  let denominator = dot(normal, ray.direction.xyz);
  if (abs(denominator) < 0.001) {
    return emptyHit();
  }
  let distance = dot(point - ray.origin.xyz, normal) / denominator;
  if (distance <= 0.001) {
    return emptyHit();
  }
  let position = ray.origin.xyz + ray.direction.xyz * distance;
  if (
    !inRange(position.x, boundsMin.x, boundsMax.x) ||
    !inRange(position.y, boundsMin.y, boundsMax.y) ||
    !inRange(position.z, boundsMin.z, boundsMax.z)
  ) {
    return emptyHit();
  }
  return makeHit(distance, position, normal, ray.direction.xyz, materialKind, color, emission, ior);
}

fn safeInverse(value: f32) -> f32 {
  if (abs(value) < 0.000001) {
    return select(-1000000.0, 1000000.0, value >= 0.0);
  }
  return 1.0 / value;
}

fn boxNormal(position: vec3<f32>, boundsMin: vec3<f32>, boundsMax: vec3<f32>) -> vec3<f32> {
  let distanceToMin = abs(position - boundsMin);
  let distanceToMax = abs(position - boundsMax);
  let closest = min(
    min(min(distanceToMin.x, distanceToMax.x), min(distanceToMin.y, distanceToMax.y)),
    min(distanceToMin.z, distanceToMax.z)
  );
  if (closest == distanceToMin.x) {
    return vec3<f32>(-1.0, 0.0, 0.0);
  }
  if (closest == distanceToMax.x) {
    return vec3<f32>(1.0, 0.0, 0.0);
  }
  if (closest == distanceToMin.y) {
    return vec3<f32>(0.0, -1.0, 0.0);
  }
  if (closest == distanceToMax.y) {
    return vec3<f32>(0.0, 1.0, 0.0);
  }
  if (closest == distanceToMin.z) {
    return vec3<f32>(0.0, 0.0, -1.0);
  }
  return vec3<f32>(0.0, 0.0, 1.0);
}

fn intersectBox(
  ray: RayRecord,
  boundsMin: vec3<f32>,
  boundsMax: vec3<f32>,
  materialKind: u32,
  color: vec3<f32>,
  emission: vec3<f32>,
  ior: f32
) -> Hit {
  let invDir = vec3<f32>(
    safeInverse(ray.direction.x),
    safeInverse(ray.direction.y),
    safeInverse(ray.direction.z)
  );
  let t0 = (boundsMin - ray.origin.xyz) * invDir;
  let t1 = (boundsMax - ray.origin.xyz) * invDir;
  let tSmall = min(t0, t1);
  let tBig = max(t0, t1);
  let tNear = max(max(tSmall.x, tSmall.y), tSmall.z);
  let tFar = min(min(tBig.x, tBig.y), tBig.z);
  if (tFar < max(tNear, 0.001)) {
    return emptyHit();
  }
  var distance = tNear;
  if (distance <= 0.001) {
    distance = tFar;
  }
  if (distance <= 0.001) {
    return emptyHit();
  }
  let position = ray.origin.xyz + ray.direction.xyz * distance;
  let normal = boxNormal(position, boundsMin, boundsMax);
  return makeHit(distance, position, normal, ray.direction.xyz, materialKind, color, emission, ior);
}

fn intersectSceneObject(ray: RayRecord, object: SceneObject) -> Hit {
  if (object.kind == 2u) {
    let center = (object.boundsMin.xyz + object.boundsMax.xyz) * 0.5;
    return intersectSphere(
      ray,
      center,
      object.boundsMax.w,
      object.materialKind,
      object.color.rgb,
      object.emission.rgb,
      object.boundsMin.w
    );
  }
  return intersectBox(
    ray,
    object.boundsMin.xyz,
    object.boundsMax.xyz,
    object.materialKind,
    object.color.rgb,
    object.emission.rgb,
    object.boundsMin.w
  );
}

fn nearest(a: Hit, b: Hit) -> Hit {
  if (b.hit == 1u && b.distance < a.distance) {
    return b;
  }
  return a;
}

fn intersectScene(ray: RayRecord) -> Hit {
  var hit = emptyHit();
  if (config.sceneObjectCount > 0u) {
    var objectIndex = 0u;
    loop {
      if (objectIndex >= config.sceneObjectCount) {
        break;
      }
      hit = nearest(hit, intersectSceneObject(ray, sceneObjects[objectIndex]));
      objectIndex = objectIndex + 1u;
    }
    return hit;
  }
  hit = nearest(hit, intersectSphere(ray, vec3<f32>(-0.95, -0.08, -1.0), 0.68, 1u, vec3<f32>(0.74, 0.42, 0.28), vec3<f32>(0.0), 1.0));
  hit = nearest(hit, intersectSphere(ray, vec3<f32>(0.68, -0.2, -1.35), 0.48, 2u, vec3<f32>(0.92, 0.86, 0.72), vec3<f32>(0.0), 1.0));
  hit = nearest(hit, intersectSphere(ray, vec3<f32>(0.08, -0.28, -0.25), 0.34, 3u, vec3<f32>(0.74, 0.9, 1.0), vec3<f32>(0.0), 1.45));
  hit = nearest(hit, intersectSphere(ray, vec3<f32>(0.25, 1.3, -1.7), 0.32, 5u, vec3<f32>(1.0, 0.78, 0.43), vec3<f32>(9.5, 6.4, 3.1), 1.0));
  hit = nearest(hit, intersectSphere(ray, vec3<f32>(-1.72, -0.12, -0.42), 0.22, 6u, vec3<f32>(0.02, 0.018, 0.015), vec3<f32>(0.0), 1.0));
  hit = nearest(hit, intersectPlane(ray, vec3<f32>(0.0, -0.58, 0.0), vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(-2.5, -0.59, -3.2), vec3<f32>(2.5, -0.57, 0.9), 4u, vec3<f32>(0.45, 0.78, 0.92), vec3<f32>(0.0), 1.33));
  hit = nearest(hit, intersectPlane(ray, vec3<f32>(0.0, -0.64, -2.55), vec3<f32>(0.0, 0.12, 1.0), vec3<f32>(-2.8, -0.65, -2.75), vec3<f32>(2.8, 2.2, -2.25), 1u, vec3<f32>(0.74, 0.42, 0.28), vec3<f32>(0.0), 1.0));
  return hit;
}

fn reflectDirection(direction: vec3<f32>, normal: vec3<f32>) -> vec3<f32> {
  return safeNormalize(direction - normal * 2.0 * dot(direction, normal));
}

fn refractDirection(direction: vec3<f32>, normal: vec3<f32>, etaRatio: f32) -> vec3<f32> {
  let cosTheta = min(dot(-direction, normal), 1.0);
  let perpendicular = (direction + normal * cosTheta) * etaRatio;
  let k = 1.0 - dot(perpendicular, perpendicular);
  if (k < 0.0) {
    return vec3<f32>(9999.0);
  }
  return safeNormalize(perpendicular - normal * sqrt(k));
}

fn hemisphereDirection(normal: vec3<f32>, seed: f32) -> vec3<f32> {
  let u = hash(seed + 3.17);
  let v = hash(seed + 9.91);
  let phi = 6.28318530718 * u;
  let cosTheta = sqrt(1.0 - v);
  let sinTheta = sqrt(v);
  var tangent = vec3<f32>(1.0, 0.0, 0.0);
  if (abs(normal.y) < 0.92) {
    tangent = safeNormalize(cross(vec3<f32>(0.0, 1.0, 0.0), normal));
  }
  let bitangent = cross(normal, tangent);
  return safeNormalize(tangent * cos(phi) * sinTheta + bitangent * sin(phi) * sinTheta + normal * cosTheta);
}

fn addRadiance(pixelId: u32, throughput: vec3<f32>, radiance: vec3<f32>) {
  accumulation[pixelId] = accumulation[pixelId] + vec4<f32>(throughput * radiance, 1.0);
}

fn writeContinuation(ray: RayRecord, hit: Hit, direction: vec3<f32>, throughput: vec3<f32>, flags: u32, mediumRefId: u32) {
  let slot = atomicAdd(&counters.nextCount, 1u);
  if (slot >= config.queueCapacity) {
    atomicAdd(&counters.overflowCount, 1u);
    atomicAdd(&stats[bounceConfig.bounce * ${rendererWavefrontComputeStatsStride}u + 6u], 1u);
    return;
  }
  let nextRay = RayRecord(
    ray.rayId + config.queueCapacity * (bounceConfig.bounce + 1u),
    ray.rayId,
    ray.sourcePixelId,
    ray.sampleId,
    bounceConfig.bounce + 1u,
    mediumRefId,
    flags,
    0u,
    vec4<f32>(hit.position.xyz + hit.normal.xyz * 0.008, 0.0),
    vec4<f32>(direction, 0.0),
    vec4<f32>(throughput, 0.0)
  );
  if (bounceConfig.readQueue == 0u) {
    nextQueue[slot] = nextRay;
  } else {
    activeQueue[slot] = nextRay;
  }
  atomicAdd(&stats[bounceConfig.bounce * ${rendererWavefrontComputeStatsStride}u + 4u], 1u);
}

fn toneMap(color: vec3<f32>) -> vec3<f32> {
  let mapped = color / (vec3<f32>(1.0) + color);
  return pow(clamp(mapped, vec3<f32>(0.0), vec3<f32>(1.0)), vec3<f32>(1.0 / 2.2));
}

@compute @workgroup_size(${workgroupSize}, 1, 1)
fn generatePrimaryRays(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let tilePixelId = globalId.x;
  let total = config.tilePixelCount;
  if (tilePixelId == 0u) {
    atomicStore(&counters.activeCount, total);
    atomicStore(&counters.nextCount, 0u);
    atomicStore(&counters.terminalCount, 0u);
    atomicStore(&counters.environmentCount, 0u);
    atomicStore(&counters.emissiveCount, 0u);
    atomicStore(&counters.ambientCount, 0u);
    atomicStore(&counters.surfaceCount, 0u);
    atomicStore(&counters.overflowCount, 0u);
    activeIndirect[0] = max(1u, (total + ${workgroupSize - 1}u) / ${workgroupSize}u);
    activeIndirect[1] = 1u;
    activeIndirect[2] = 1u;
    nextIndirect[0] = 1u;
    nextIndirect[1] = 1u;
    nextIndirect[2] = 1u;
  }
  if (tilePixelId >= total) {
    return;
  }
  let localX = tilePixelId % config.tileWidth;
  let localY = tilePixelId / config.tileWidth;
  let x = config.tileOriginX + localX;
  let y = config.tileOriginY + localY;
  let sourcePixelId = y * config.width + x;
  accumulation[sourcePixelId] = vec4<f32>(0.0);
  activeQueue[tilePixelId] = RayRecord(
    sourcePixelId,
    0u,
    sourcePixelId,
    0u,
    0u,
    0u,
    0u,
    0u,
    config.cameraOrigin,
    vec4<f32>(rayDirection(x, y), 0.0),
    vec4<f32>(1.0, 1.0, 1.0, 0.0)
  );
}

@compute @workgroup_size(${workgroupSize}, 1, 1)
fn traceBounce(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let index = globalId.x;
  let activeCount = atomicLoad(&counters.activeCount);
  if (index >= activeCount) {
    return;
  }
  var ray: RayRecord;
  if (bounceConfig.readQueue == 0u) {
    ray = activeQueue[index];
  } else {
    ray = nextQueue[index];
  }
  let statsBase = bounceConfig.bounce * ${rendererWavefrontComputeStatsStride}u;
  if (index == 0u) {
    atomicAdd(&stats[statsBase], activeCount);
  }
  let hit = intersectScene(ray);

  if (hit.hit == 0u) {
    addRadiance(ray.sourcePixelId, ray.throughput.rgb, sampleEnvironment(ray.direction.xyz));
    atomicAdd(&counters.terminalCount, 1u);
    atomicAdd(&counters.environmentCount, 1u);
    atomicAdd(&stats[statsBase + 3u], 1u);
    return;
  }

  if (hit.materialKind == 5u) {
    addRadiance(ray.sourcePixelId, ray.throughput.rgb, hit.emission.rgb);
    atomicAdd(&counters.terminalCount, 1u);
    atomicAdd(&counters.emissiveCount, 1u);
    atomicAdd(&stats[statsBase + 2u], 1u);
    return;
  }

  atomicAdd(&counters.surfaceCount, 1u);
  atomicAdd(&stats[statsBase + 1u], 1u);

  if (hit.materialKind == 6u) {
    addRadiance(ray.sourcePixelId, ray.throughput.rgb, ambientResidual(hit.color.rgb));
    atomicAdd(&counters.terminalCount, 1u);
    atomicAdd(&counters.ambientCount, 1u);
    atomicAdd(&stats[statsBase + 5u], 1u);
    return;
  }

  if (bounceConfig.bounce + 1u >= config.maxDepth) {
    addRadiance(ray.sourcePixelId, ray.throughput.rgb, ambientResidual(hit.color.rgb));
    atomicAdd(&counters.terminalCount, 1u);
    atomicAdd(&counters.ambientCount, 1u);
    atomicAdd(&stats[statsBase + 5u], 1u);
    atomicAdd(&stats[statsBase + 7u], 1u);
    return;
  }

  let seed = f32(ray.sourcePixelId * 97u + ray.sampleId * 13u + bounceConfig.bounce * 31u + config.frameIndex);
  var direction = vec3<f32>(0.0);
  var throughput = ray.throughput.rgb * hit.color.rgb;
  var mediumRefId = ray.mediumRefId;
  var flags = ray.flags;

  if (hit.materialKind == 2u) {
    direction = reflectDirection(ray.direction.xyz, hit.normal.xyz);
    throughput = throughput * 0.92;
    flags = flags | 1u;
  } else if (hit.materialKind == 3u) {
    let eta = select(hit.ior, 1.0 / hit.ior, hit.frontFace == 1u);
    let refracted = refractDirection(ray.direction.xyz, hit.normal.xyz, eta);
    if (refracted.x > 9000.0) {
      direction = reflectDirection(ray.direction.xyz, hit.normal.xyz);
      throughput = throughput * 0.82;
      flags = flags | 1u;
    } else {
      direction = refracted;
      throughput = throughput * 0.9;
      mediumRefId = select(0u, 3u, hit.frontFace == 1u);
      flags = flags | 2u;
    }
  } else if (hit.materialKind == 4u) {
    let transmission = refractDirection(ray.direction.xyz, hit.normal.xyz, select(hit.ior, 1.0 / hit.ior, hit.frontFace == 1u));
    if (hash(seed) > 0.38 && transmission.x < 9000.0) {
      direction = transmission;
    } else {
      direction = reflectDirection(ray.direction.xyz, hit.normal.xyz);
    }
    throughput = throughput * 0.72;
    mediumRefId = 4u;
    flags = flags | 4u;
  } else {
    direction = hemisphereDirection(hit.normal.xyz, seed);
    throughput = throughput * clamp(dot(direction, hit.normal.xyz), 0.18, 1.0) * 0.84;
  }

  writeContinuation(ray, hit, direction, throughput, flags, mediumRefId);
}

@compute @workgroup_size(1, 1, 1)
fn compactAndSwapQueues(@builtin(global_invocation_id) globalId: vec3<u32>) {
  if (globalId.x > 0u) {
    return;
  }
  let count = atomicLoad(&counters.nextCount);
  let groups = max(1u, (count + ${workgroupSize - 1}u) / ${workgroupSize}u);
  atomicStore(&counters.activeCount, count);
  atomicStore(&counters.nextCount, 0u);
  if (bounceConfig.readQueue == 0u) {
    nextIndirect[0] = groups;
    nextIndirect[1] = 1u;
    nextIndirect[2] = 1u;
  } else {
    activeIndirect[0] = groups;
    activeIndirect[1] = 1u;
    activeIndirect[2] = 1u;
  }
}

@compute @workgroup_size(${workgroupSize}, 1, 1)
fn resolveOutput(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let tilePixelId = globalId.x;
  let total = config.tilePixelCount;
  if (tilePixelId >= total) {
    return;
  }
  let localX = tilePixelId % config.tileWidth;
  let localY = tilePixelId / config.tileWidth;
  let x = config.tileOriginX + localX;
  let y = config.tileOriginY + localY;
  let sourcePixelId = y * config.width + x;
  let color = toneMap(accumulation[sourcePixelId].rgb);
  textureStore(outputTexture, vec2<i32>(i32(x), i32(y)), vec4<f32>(color, 1.0));
}
`;
}

export {
  createWavefrontPathTracingComputeConfig,
  createWavefrontPathTracingComputeRenderer,
  createWavefrontPathTracingComputeShaderSource,
  renderWavefrontPathTracingComputeFrame,
  rendererWavefrontComputeMode,
  rendererWavefrontComputeStatsStride,
  rendererWavefrontComputeWorkgroupSize,
  supportsWavefrontPathTracingCompute,
};
