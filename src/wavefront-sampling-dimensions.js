import { hashUint32, mixSeed, random01FromSeed } from "./wavefront-core.js";

const sampleDimensionEntries = Object.freeze([
  ["cameraJitter", 1],
  ["transmissionSelector", 11],
  ["guidedLightSelector", 12],
  ["guidedEmissiveSelection", 13],
  ["guidedEmissiveSurface", 14],
  ["guidedPortalSelection", 15],
  ["guidedPortalSurface", 16],
  ["bsdfLobeSelector", 21],
  ["diffuseHemisphere", 22],
  ["specularHalfVector", 23],
  ["clearcoatHalfVector", 24],
  ["fallbackHemisphere", 25],
  ["russianRoulette", 26],
  ["emissiveLightSelection", 31],
  ["emissiveLightSurface", 32],
  ["directLightSelector", 41],
  ["directEnvironment", 42],
]);

function toWgslConstName(name) {
  return `SAMPLE_DIM_${name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase()}`;
}

const usedDimensions = new Set();
for (const [, dimension] of sampleDimensionEntries) {
  if (usedDimensions.has(dimension)) {
    throw new Error(`Duplicate wavefront sample dimension ${dimension}.`);
  }
  usedDimensions.add(dimension);
}

export const WAVEFRONT_SAMPLE_DIMENSIONS = Object.freeze(
  Object.fromEntries(sampleDimensionEntries)
);

export function listWavefrontSampleDimensions() {
  return sampleDimensionEntries.map(([name, dimension]) =>
    Object.freeze({
      name,
      dimension,
      wgslName: toWgslConstName(name),
    })
  );
}

export const WAVEFRONT_SAMPLE_DIMENSIONS_WGSL = listWavefrontSampleDimensions()
  .map(({ wgslName, dimension }) => `const ${wgslName}: u32 = ${dimension}u;`)
  .join("\n");

function fract(value) {
  return value - Math.floor(value);
}

export function radicalInverseVdc(value) {
  let bits = value >>> 0;
  bits = ((bits << 16) | (bits >>> 16)) >>> 0;
  bits = (((bits & 0x55555555) << 1) | ((bits & 0xaaaaaaaa) >>> 1)) >>> 0;
  bits = (((bits & 0x33333333) << 2) | ((bits & 0xcccccccc) >>> 2)) >>> 0;
  bits = (((bits & 0x0f0f0f0f) << 4) | ((bits & 0xf0f0f0f0) >>> 4)) >>> 0;
  bits = (((bits & 0x00ff00ff) << 8) | ((bits & 0xff00ff00) >>> 8)) >>> 0;
  return bits / 0x100000000;
}

export function sampleWavefrontDimension1D(pixelId, sampleId, bounce, frameIndex, dimension) {
  return random01FromSeed(mixSeed(pixelId, sampleId, bounce, frameIndex, dimension));
}

export function sampleWavefrontDimension2D(
  pixelId,
  sampleId,
  bounce,
  frameIndex,
  dimension,
  strataCount
) {
  const strata = Math.max(1, Number.isFinite(strataCount) ? Math.trunc(strataCount) : 1);
  const jitter = sampleWavefrontDimension1D(
    pixelId,
    sampleId,
    bounce,
    frameIndex,
    dimension
  );
  const scramble = hashUint32(mixSeed(pixelId, sampleId, bounce, frameIndex, dimension));
  const stratified = fract((((sampleId >>> 0) % strata) + jitter) / strata);
  const lowDiscrepancy = fract(radicalInverseVdc((sampleId >>> 0) ^ scramble) + jitter);
  return Object.freeze([stratified, lowDiscrepancy]);
}
// Canonical GPU sequence helpers shared by fixed and compacted camera stages.
export const WAVEFRONT_STABLE_SAMPLE_ROUTING_WGSL = `const TRANSPORT_EXPERIMENT_STABLE_SAMPLE_ROUTING = 1u;`;
export const WAVEFRONT_SAMPLE_SEQUENCE_WGSL = `fn hash_u32(value: u32) -> u32 {
  var x = value;
  x = ((x >> 16u) ^ x) * 0x45d9f3bu;
  x = ((x >> 16u) ^ x) * 0x45d9f3bu;
  x = (x >> 16u) ^ x;
  return x;
}

fn mix_seed(pixelId: u32, sampleId: u32, bounce: u32, frameIndex: u32, dimension: u32) -> u32 {
  var x =
    (pixelId * 747796405u) ^
    (sampleId * 2891336453u) ^
    (bounce * 277803737u) ^
    (frameIndex * 1442695041u) ^
    (dimension * 1597334677u);
  x = x ^ (x >> 16u);
  x = x * 0x7feb352du;
  x = x ^ (x >> 15u);
  x = x * 0x846ca68bu;
  x = x ^ (x >> 16u);
  return x;
}

fn random01(seed: u32) -> f32 {
  return f32(hash_u32(seed) & 0x00ffffffu) / 16777215.0;
}

fn transport_experiment_enabled(bit: u32) -> bool {
  return (config.transportExperimentFlags & bit) != 0u;
}

fn sample_frame_index(frameIndex: u32) -> u32 {
  return select(frameIndex, 0u, transport_experiment_enabled(TRANSPORT_EXPERIMENT_STABLE_SAMPLE_ROUTING));
}

fn radical_inverse_vdc(bits: u32) -> f32 {
  var value = bits;
  value = (value << 16u) | (value >> 16u);
  value = ((value & 0x55555555u) << 1u) | ((value & 0xaaaaaaaau) >> 1u);
  value = ((value & 0x33333333u) << 2u) | ((value & 0xccccccccu) >> 2u);
  value = ((value & 0x0f0f0f0fu) << 4u) | ((value & 0xf0f0f0f0u) >> 4u);
  value = ((value & 0x00ff00ffu) << 8u) | ((value & 0xff00ff00u) >> 8u);
  return f32(value) * 2.3283064365386963e-10;
}

fn sample_dimension_1d(
  pixelId: u32,
  sampleId: u32,
  bounce: u32,
  frameIndex: u32,
  dimension: u32
) -> f32 {
  return random01(mix_seed(pixelId, sampleId, bounce, sample_frame_index(frameIndex), dimension));
}

fn sample_dimension_2d(
  pixelId: u32,
  sampleId: u32,
  bounce: u32,
  frameIndex: u32,
  dimension: u32,
  strataCount: u32
) -> vec2<f32> {
  let strata = max(strataCount, 1u);
  let jitter = sample_dimension_1d(pixelId, sampleId, bounce, frameIndex, dimension);
  let scramble = hash_u32(mix_seed(pixelId, sampleId, bounce, sample_frame_index(frameIndex), dimension));
  let stratified = fract((f32(sampleId % strata) + jitter) / f32(strata));
  let lowDiscrepancy = fract(radical_inverse_vdc(sampleId ^ scramble) + jitter);
  return vec2<f32>(stratified, lowDiscrepancy);
}`;
