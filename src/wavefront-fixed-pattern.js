import { sobolPairWords, SOBOL_PAIR_WGSL } from "./wavefront-progressive-sampling.js";

// Diagnostic shared-point pattern. No pixel/frame randomness. Fixed digital
// shifts separate events but do not guarantee high-dimensional decorrelation.
export function fixedPatternWords(sampleId, bounce, dimension) {
  const key = ((dimension - 1) + Math.imul(bounce, 64)) >>> 0;
  const [x, y] = sobolPairWords(sampleId);
  return [(x ^ 0x80000000 ^ Math.imul(key, 0x9e3779b9)) >>> 0,
    (y ^ 0x80000000 ^ Math.imul(key, 0x7546dc55)) >>> 0];
}

export const FIXED_PATTERN_WGSL = SOBOL_PAIR_WGSL + `
fn fixed_pattern_words(sampleId: u32, bounce: u32, dimension: u32) -> vec2<u32> {
  let key = (dimension - 1u) + bounce * 64u;
  let shift = vec2<u32>(0x80000000u) ^ (vec2<u32>(key) * vec2<u32>(0x9e3779b9u, 0x7546dc55u));
  return sobol_pair_words(sampleId) ^ shift;
}
fn sample_dimension_1d(pixelId: u32, sampleId: u32, bounce: u32, frameIndex: u32, dimension: u32) -> f32 {
  return f32(fixed_pattern_words(sampleId, bounce, dimension).x >> 8u) / 16777216.0;
}
fn sample_dimension_2d(pixelId: u32, sampleId: u32, bounce: u32, frameIndex: u32, dimension: u32, strataCount: u32) -> vec2<f32> {
  return vec2<f32>(fixed_pattern_words(sampleId, bounce, dimension) >> vec2<u32>(8u)) / 16777216.0;
}
`;
