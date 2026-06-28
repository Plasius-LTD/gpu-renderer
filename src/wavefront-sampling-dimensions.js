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
