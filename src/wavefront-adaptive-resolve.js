import { packAdaptivePixelState } from "./wavefront-adaptive-metadata.js";
import { ADAPTIVE_RESOLVE_WGSL, ADAPTIVE_SAMPLE_FAILURE_MASK } from "./wavefront-adaptive-resolve-shader.js";
import { assertShaderModuleCompiles, createComputePipeline } from "./wavefront-runtime-support.js";
import * as abi from "./wavefront-adaptive-resolve-constants.js";

function uint(name, value, maximum = 0xffffffff) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw new RangeError(`Invalid ${name}.`);
  return value;
}
function rgb(value) {
  if (!Array.isArray(value) || value.length !== 3 || !value.every((channel) => typeof channel === "number" && Number.isFinite(Math.fround(channel)) && channel >= 0)) return null;
  return value.map(Math.fround);
}
function validCounts(word) {
  const requested = word & 511;
  return requested >= 1 && requested <= 256 && ((word >>> 9) & 511) <= requested && !(word & ADAPTIVE_SAMPLE_FAILURE_MASK);
}
function validateConfig(config) {
  for (const key of ["width", "height", "tileX", "tileY", "tileWidth", "tileHeight"]) uint(key, config[key]);
  uint("sampleOrdinal", config.sampleOrdinal, 255);
  if (!config.width || !config.height || config.width * config.height > 0xffffffff || !config.tileWidth || !config.tileHeight
    || config.tileWidth * config.tileHeight > 16384 || config.tileX + config.tileWidth > config.width
    || config.tileY + config.tileHeight > config.height || typeof config.frameValid !== "boolean") throw new RangeError("Invalid adaptive resolve configuration.");
}

export function packAdaptiveResolveConfig(config) {
  validateConfig(config);
  const values = {
    CANVAS_WIDTH: config.width, CANVAS_HEIGHT: config.height, TILE_X: config.tileX, TILE_Y: config.tileY,
    TILE_WIDTH: config.tileWidth, TILE_HEIGHT: config.tileHeight, SAMPLE_ORDINAL: config.sampleOrdinal,
    FRAME_VALID: config.frameValid ? 1 : 0,
  };
  const buffer = new ArrayBuffer(abi.ADAPTIVE_RESOLVE_CONFIG_BYTE_SIZE);
  const view = new DataView(buffer);
  for (const [field, value] of Object.entries(values)) view.setUint32(abi[`ADAPTIVE_RESOLVE_CONFIG_${field}_OFFSET`], value, true);
  return buffer;
}

export function packAdaptiveCameraSamples(samples) {
  if (!Array.isArray(samples) || samples.length < 1 || samples.length > 16384) throw new RangeError("Invalid camera sample count.");
  const bytes = new ArrayBuffer(samples.length * abi.ADAPTIVE_CAMERA_SAMPLE_BYTE_SIZE);
  const view = new DataView(bytes);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    const radiance = rgb(sample.radiance);
    if (!radiance) throw new RangeError("Invalid camera sample radiance.");
    const base = index * abi.ADAPTIVE_CAMERA_SAMPLE_BYTE_SIZE;
    radiance.forEach((value, channel) => view.setFloat32(base + abi.ADAPTIVE_CAMERA_SAMPLE_RADIANCE_OFFSET + channel * 4, value, true));
    view.setUint32(base + abi.ADAPTIVE_CAMERA_SAMPLE_SOURCE_PIXEL_ID_OFFSET, uint("sourcePixelId", sample.sourcePixelId), true);
    view.setUint32(base + abi.ADAPTIVE_CAMERA_SAMPLE_SAMPLE_ORDINAL_OFFSET, uint("sampleOrdinal", sample.sampleOrdinal, 255), true);
    view.setUint32(base + abi.ADAPTIVE_CAMERA_SAMPLE_STATUS_OFFSET, uint("status", sample.status, 2), true);
  }
  return bytes;
}

// Reference oracle only. The GPU transport producer must reduce its own branches.
export function reduceAdaptiveSampleBranches({ sourcePixelId, sampleOrdinal, expectedBranches, branches }) {
  uint("sourcePixelId", sourcePixelId);
  uint("sampleOrdinal", sampleOrdinal, 255);
  uint("expectedBranches", expectedBranches, 16384);
  const failure = () => Object.freeze({ sourcePixelId, sampleOrdinal, radiance: Object.freeze([0, 0, 0]), status: 2 });
  if (!expectedBranches || !Array.isArray(branches) || branches.length !== expectedBranches) return failure();
  const ids = new Set();
  let sum = [0, 0, 0];
  for (const branch of branches) {
    const value = rgb(branch.radiance);
    if (!value || branch.status !== 1 || branch.sourcePixelId !== sourcePixelId || branch.sampleOrdinal !== sampleOrdinal
      || !Number.isSafeInteger(branch.branchId) || branch.branchId < 0 || branch.branchId > 0xffffffff || ids.has(branch.branchId)) return failure();
    ids.add(branch.branchId);
    sum = sum.map((channel, index) => Math.fround(channel + value[index]));
    if (!rgb(sum)) return failure();
  }
  return Object.freeze({ sourcePixelId, sampleOrdinal, radiance: Object.freeze(sum), status: 1 });
}

export function commitAdaptiveSampleReference(state, sample, config, localId) {
  validateConfig(config);
  uint("localId", localId, config.tileWidth * config.tileHeight - 1);
  uint("packed word", state.word);
  const { word } = state;
  const requested = word & 511;
  const completed = (word >>> 9) & 511;
  const failed = () => ({ word: (word | ADAPTIVE_SAMPLE_FAILURE_MASK) >>> 0, sum: state.sum });
  if (!validCounts(word)) return failed();
  if (config.sampleOrdinal >= requested) return state;
  const pixelId = (config.tileY + Math.floor(localId / config.tileWidth)) * config.width + config.tileX + localId % config.tileWidth;
  const contribution = rgb(sample?.radiance);
  if (!config.frameValid || sample?.status !== 1 || sample.sourcePixelId !== pixelId || sample.sampleOrdinal !== config.sampleOrdinal || completed !== config.sampleOrdinal || !contribution) return failed();
  const prior = completed === 0 ? [0, 0, 0] : rgb(state.sum);
  if (!prior) return failed();
  const sum = prior.map((channel, index) => Math.fround(channel + contribution[index]));
  if (!rgb(sum)) return failed();
  return { word: packAdaptivePixelState({ requested, completed: completed + 1, flags: word >>> 18 }), sum };
}

export function resolveAdaptiveRadianceReference({ word, sum }) {
  uint("packed word", word);
  const completed = (word >>> 9) & 511;
  const radiance = rgb(sum);
  if (!validCounts(word) || !completed || !radiance) return [0, 0, 0, 0];
  return [...radiance.map((channel) => Math.fround(channel / completed)), 1];
}

export async function createAdaptiveResolvePipelines(device, shaderStage, { enabled = false } = {}) {
  if (!enabled) return null;
  const shader = device.createShaderModule({ label: "wavefront-adaptive-count-resolve", code: ADAPTIVE_RESOLVE_WGSL });
  await assertShaderModuleCompiles(shader, "wavefront-adaptive-count-resolve");
  const layout = device.createBindGroupLayout({
    label: "wavefront-adaptive-count-resolve",
    entries: [
      { binding: 0, visibility: shaderStage.COMPUTE, buffer: { type: "storage", minBindingSize: 4 } },
      { binding: 1, visibility: shaderStage.COMPUTE, buffer: { type: "read-only-storage", minBindingSize: abi.ADAPTIVE_CAMERA_SAMPLE_BYTE_SIZE } },
      { binding: 2, visibility: shaderStage.COMPUTE, buffer: { type: "storage", minBindingSize: 16 } },
      { binding: 3, visibility: shaderStage.COMPUTE, buffer: { type: "storage", minBindingSize: 16 } },
      { binding: 4, visibility: shaderStage.COMPUTE, buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: abi.ADAPTIVE_RESOLVE_CONFIG_BYTE_SIZE } },
    ],
  });
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
  const commit = await createComputePipeline(device, shader, pipelineLayout, "commit_adaptive_sample", "wavefront-adaptive-commit");
  const resolve = await createComputePipeline(device, shader, pipelineLayout, "resolve_adaptive_radiance", "wavefront-adaptive-resolve");
  return Object.freeze({ layout, commit, resolve });
}
