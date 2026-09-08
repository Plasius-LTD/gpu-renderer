import { ADAPTIVE_COUNT_BITS, ADAPTIVE_COUNT_MASK } from "./wavefront-adaptive-shader.js";

export const ADAPTIVE_SAMPLE_FAILURE_MASK = 0x80000000;
export const ADAPTIVE_RESOLVE_WGSL = `
const ADAPTIVE_COUNT_MASK: u32 = ${ADAPTIVE_COUNT_MASK}u;
const ADAPTIVE_COUNT_SHIFT: u32 = ${ADAPTIVE_COUNT_BITS}u;
const ADAPTIVE_FAILURE_MASK: u32 = ${ADAPTIVE_SAMPLE_FAILURE_MASK}u;

struct AdaptivePixelState { word: u32, };
struct AdaptivePixels { records: array<AdaptivePixelState>, };
struct AdaptiveCameraSample {
  radiance: vec3<f32>,
  sourcePixelId: u32,
  sampleOrdinal: u32,
  status: u32,
  reserved0: u32,
  reserved1: u32,
};
struct AdaptiveSamples { records: array<AdaptiveCameraSample>, };
struct AdaptiveRadiance { records: array<vec4<f32>>, };
struct AdaptiveResolveConfig {
  canvasWidth: u32,
  canvasHeight: u32,
  tileX: u32,
  tileY: u32,
  tileWidth: u32,
  tileHeight: u32,
  sampleOrdinal: u32,
  frameValid: u32,
};
@group(0) @binding(0) var<storage, read_write> pixels: AdaptivePixels;
@group(0) @binding(1) var<storage, read> samples: AdaptiveSamples;
@group(0) @binding(2) var<storage, read_write> sums: AdaptiveRadiance;
@group(0) @binding(3) var<storage, read_write> resolved: AdaptiveRadiance;
@group(0) @binding(4) var<uniform> config: AdaptiveResolveConfig;

fn valid_tile() -> bool {
  if (config.canvasWidth == 0u || config.canvasHeight == 0u) { return false; }
  if (config.canvasHeight > 0xffffffffu / config.canvasWidth) { return false; }
  if (config.tileX >= config.canvasWidth || config.tileY >= config.canvasHeight) { return false; }
  if (config.tileWidth == 0u || config.tileHeight == 0u) { return false; }
  if (config.tileWidth > config.canvasWidth - config.tileX || config.tileHeight > config.canvasHeight - config.tileY) { return false; }
  if (config.tileHeight > 16384u / config.tileWidth || config.sampleOrdinal > 255u) { return false; }
  return true;
}
fn source_pixel(localId: u32) -> u32 {
  return (config.tileY + localId / config.tileWidth) * config.canvasWidth + config.tileX + localId % config.tileWidth;
}
fn valid_radiance(value: vec3<f32>) -> bool {
  // Exponent check rejects NaN and infinity without imposing an HDR ceiling.
  return all((bitcast<vec3<u32>>(value) & vec3<u32>(0x7f800000u)) < vec3<u32>(0x7f800000u)) && all(value >= vec3<f32>(0.0));
}
fn valid_counts(word: u32) -> bool {
  let requested = word & ADAPTIVE_COUNT_MASK;
  let completed = (word >> ADAPTIVE_COUNT_SHIFT) & ADAPTIVE_COUNT_MASK;
  return requested > 0u && requested <= 256u && completed <= requested && (word & ADAPTIVE_FAILURE_MASK) == 0u;
}

@compute @workgroup_size(64)
fn commit_adaptive_sample(@builtin(global_invocation_id) id: vec3<u32>) {
  let localId = id.x;
  if (localId >= arrayLength(&resolved.records)) { return; }
  resolved.records[localId] = vec4<f32>(0.0);
  if (!valid_tile() || localId >= config.tileWidth * config.tileHeight) { return; }
  let pixelId = source_pixel(localId);
  if (pixelId >= arrayLength(&pixels.records)) { return; }
  let word = pixels.records[pixelId].word;
  let requested = word & ADAPTIVE_COUNT_MASK;
  let completed = (word >> ADAPTIVE_COUNT_SHIFT) & ADAPTIVE_COUNT_MASK;
  if (!valid_counts(word)) { pixels.records[pixelId].word = word | ADAPTIVE_FAILURE_MASK; return; }
  if (config.sampleOrdinal >= requested) { return; }
  if (config.frameValid != 1u || localId >= arrayLength(&samples.records) || localId >= arrayLength(&sums.records)) {
    pixels.records[pixelId].word = word | ADAPTIVE_FAILURE_MASK; return;
  }
  let sample = samples.records[localId];
  if (sample.status != 1u || sample.sourcePixelId != pixelId || sample.sampleOrdinal != config.sampleOrdinal || completed != config.sampleOrdinal || !valid_radiance(sample.radiance)) {
    pixels.records[pixelId].word = word | ADAPTIVE_FAILURE_MASK; return;
  }
  var prior = vec3<f32>(0.0);
  if (completed > 0u) { prior = sums.records[localId].xyz; }
  let nextSum = prior + sample.radiance;
  if (!valid_radiance(prior) || !valid_radiance(nextSum)) {
    pixels.records[pixelId].word = word | ADAPTIVE_FAILURE_MASK; return;
  }
  sums.records[localId] = vec4<f32>(nextSum, 0.0);
  pixels.records[pixelId].word = (word & ~(ADAPTIVE_COUNT_MASK << ADAPTIVE_COUNT_SHIFT)) | ((completed + 1u) << ADAPTIVE_COUNT_SHIFT);
}

@compute @workgroup_size(64)
fn resolve_adaptive_radiance(@builtin(global_invocation_id) id: vec3<u32>) {
  let localId = id.x;
  if (localId >= arrayLength(&resolved.records)) { return; }
  resolved.records[localId] = vec4<f32>(0.0);
  if (!valid_tile() || config.frameValid != 1u || localId >= config.tileWidth * config.tileHeight || localId >= arrayLength(&samples.records) || localId >= arrayLength(&sums.records)) { return; }
  let pixelId = source_pixel(localId);
  if (pixelId >= arrayLength(&pixels.records)) { return; }
  let word = pixels.records[pixelId].word;
  let completed = (word >> ADAPTIVE_COUNT_SHIFT) & ADAPTIVE_COUNT_MASK;
  if (!valid_counts(word) || completed == 0u) { return; }
  let sum = sums.records[localId].xyz;
  if (!valid_radiance(sum)) { return; }
  resolved.records[localId] = vec4<f32>(sum / f32(completed), 1.0);
}
`;
