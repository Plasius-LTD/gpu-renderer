import { ADAPTIVE_PRIMARY_WGSL } from "./wavefront-adaptive-primary-shader.js";
import { assertShaderModuleCompiles, createComputePipeline } from "./wavefront-runtime-support.js";
import * as abi from "./wavefront-adaptive-primary-constants.js";

function uint(name, value, maximum = 0xffffffff) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw new RangeError(`Invalid ${name}.`);
  return value;
}

function validate(config) {
  for (const key of ["width", "height", "tileX", "tileY", "tileWidth", "tileHeight"]) uint(key, config[key]);
  uint("tier", config.tier, 256);
  if (!config.width || !config.height || config.width * config.height > 0xffffffff || !config.tileWidth || !config.tileHeight || !config.tier
    || config.tileWidth * config.tileHeight > 16384 || config.tileX + config.tileWidth > config.width || config.tileY + config.tileHeight > config.height) {
    throw new RangeError("Invalid primary tile configuration.");
  }
}

export function packAdaptivePrimaryConfig(config) {
  validate(config);
  const values = { CANVAS_WIDTH: config.width, CANVAS_HEIGHT: config.height, TILE_X: config.tileX, TILE_Y: config.tileY,
    TILE_WIDTH: config.tileWidth, TILE_HEIGHT: config.tileHeight, TIER: config.tier, RESERVED: 0 };
  const bytes = new ArrayBuffer(abi.ADAPTIVE_PRIMARY_CONFIG_BYTE_SIZE);
  const view = new DataView(bytes);
  for (const [name, value] of Object.entries(values)) view.setUint32(abi[`ADAPTIVE_PRIMARY_CONFIG_${name}_OFFSET`], value, true);
  return bytes;
}

// Oracle only: production compaction is GPU-owned; cross-workgroup order is unspecified.
export function compactAdaptivePrimaryReference(words, config, capacity) {
  validate(config); uint("capacity", capacity, 16384);
  if (!capacity || !(words instanceof Uint32Array) || words.length < config.width * config.height) throw new RangeError("Invalid primary buffers.");
  const localPixelIds = [], sourcePixelIds = [];
  const failure = () => ({ failed: true, count: 0, localPixelIds: [], sourcePixelIds: [], dispatch: [0, 1, 1] });
  for (let local = 0; local < config.tileWidth * config.tileHeight; local += 1) {
    const source = (config.tileY + Math.floor(local / config.tileWidth)) * config.width + config.tileX + local % config.tileWidth;
    const word = words[source], requested = word & 511, completed = (word >>> 9) & 511;
    if (!requested || requested > 256 || completed > requested || (word & 0x80000000) || (requested === config.tier && completed !== 0)) return failure();
    if (requested === config.tier) {
      if (localPixelIds.length >= capacity) return failure();
      localPixelIds.push(local); sourcePixelIds.push(source);
    }
  }
  return { failed: false, count: localPixelIds.length, localPixelIds, sourcePixelIds, dispatch: [Math.ceil(localPixelIds.length / 64), 1, 1] };
}

export async function createAdaptivePrimaryPipelines(device, shaderStage, { enabled = false } = {}) {
  if (!enabled) return null;
  const shader = device.createShaderModule({ label: "wavefront-adaptive-primary", code: ADAPTIVE_PRIMARY_WGSL });
  await assertShaderModuleCompiles(shader, "wavefront-adaptive-primary");
  const sizes = [4, 4, abi.ADAPTIVE_PRIMARY_CONTROL_BYTE_SIZE, abi.ADAPTIVE_PRIMARY_DISPATCH_BYTE_SIZE, abi.ADAPTIVE_PRIMARY_CONFIG_BYTE_SIZE];
  const layout = device.createBindGroupLayout({ label: "wavefront-adaptive-primary", entries: sizes.map((minBindingSize, binding) => ({
    binding, visibility: shaderStage.COMPUTE,
    buffer: { type: binding === 4 ? "uniform" : binding === 0 ? "read-only-storage" : "storage", minBindingSize,
      ...(binding === 4 ? { hasDynamicOffset: true } : {}) },
  })) });
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
  const initialize = await createComputePipeline(device, shader, pipelineLayout, "initialize_primary_worklist", "adaptive-primary-initialize");
  const compact = await createComputePipeline(device, shader, pipelineLayout, "compact_primary_tier", "adaptive-primary-compact");
  const finalize = await createComputePipeline(device, shader, pipelineLayout, "finalize_primary_dispatch", "adaptive-primary-finalize");
  return Object.freeze({ layout, initialize, compact, finalize });
}

export function encodeAdaptivePrimaryWorklist(encoder, pipelines, bindGroup, configOffset, config) {
  validate(config); uint("configOffset", configOffset);
  const tilePixelCount = config.tileWidth * config.tileHeight;
  if (configOffset % 256 !== 0) throw new RangeError("Invalid immutable primary config slot.");
  for (const [pipeline, groups] of [[pipelines.initialize, Math.ceil(tilePixelCount / 64)], [pipelines.compact, Math.ceil(tilePixelCount / 64)], [pipelines.finalize, 1]]) {
    const pass = encoder.beginComputePass(); pass.setPipeline(pipeline); pass.setBindGroup(0, bindGroup, [configOffset]);
    pass.dispatchWorkgroups(groups); pass.end();
  }
}
