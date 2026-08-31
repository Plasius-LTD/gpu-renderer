import { clamp, dot, normalize, scale } from "./wavefront-core.js";

export const MAX_MEDIUM_STACK_DEPTH = 4;
export const MAX_TRANSPORT_BRANCHES = 2;
export const DEFAULT_SPECTRAL_WAVELENGTHS = Object.freeze([460, 550, 610]);

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function vec3(value, fallback = [0, 0, 0]) {
  return [0, 1, 2].map((index) => finite(value?.[index], fallback[index]));
}

function multiply(left, right) {
  return [left[0] * right[0], left[1] * right[1], left[2] * right[2]];
}

function reflectVector(incident, normal) {
  return add(incident, scale(normal, -2 * dot(incident, normal)));
}

function refract(incident, normal, eta) {
  const cosine = Math.min(dot(scale(incident, -1), normal), 1);
  const perpendicular = scale(add(incident, scale(normal, cosine)), eta);
  const parallel = scale(normal, -Math.sqrt(Math.abs(1 - dot(perpendicular, perpendicular))));
  return normalize(add(perpendicular, parallel), reflectVector(incident, normal));
}

function add(left, right) {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

export function createMediumStack(value = [], maxDepth = MAX_MEDIUM_STACK_DEPTH) {
  const depth = Math.max(1, Math.trunc(finite(maxDepth, MAX_MEDIUM_STACK_DEPTH)));
  const source = Array.isArray(value) ? value : [];
  return Object.freeze(
    source
      .map((mediumId) => Math.max(0, Math.trunc(finite(mediumId, 0))))
      .filter((mediumId) => mediumId > 0)
      .slice(-depth)
  );
}

export function currentMediumId(stack) {
  const normalized = createMediumStack(stack);
  return normalized.at(-1) ?? 0;
}

export function enterMediumStack(stack, mediumId, maxDepth = MAX_MEDIUM_STACK_DEPTH) {
  const normalized = createMediumStack(stack, maxDepth);
  const id = Math.max(0, Math.trunc(finite(mediumId, 0)));
  if (id === 0) {
    return Object.freeze({ stack: normalized, mediumId: currentMediumId(normalized), overflowed: false });
  }
  const depth = Math.max(1, Math.trunc(finite(maxDepth, MAX_MEDIUM_STACK_DEPTH)));
  const next = [...normalized, id];
  const overflowed = next.length > depth;
  const bounded = createMediumStack(next, depth);
  return Object.freeze({ stack: bounded, mediumId: id, overflowed });
}

export function exitMediumStack(stack, mediumId, maxDepth = MAX_MEDIUM_STACK_DEPTH) {
  const normalized = createMediumStack(stack, maxDepth);
  const id = Math.max(0, Math.trunc(finite(mediumId, 0)));
  if (id === 0 || normalized.length === 0) {
    return Object.freeze({ stack: normalized, mediumId: currentMediumId(normalized), matched: false });
  }
  const index = normalized.lastIndexOf(id);
  if (index < 0) {
    return Object.freeze({ stack: normalized, mediumId: currentMediumId(normalized), matched: false });
  }
  const next = normalized.slice(0, index).concat(normalized.slice(index + 1));
  return Object.freeze({
    stack: createMediumStack(next, maxDepth),
    mediumId: currentMediumId(next),
    matched: true,
  });
}

export function transitionMediumStack(stack, mediumId, frontFace, maxDepth = MAX_MEDIUM_STACK_DEPTH) {
  return frontFace ? enterMediumStack(stack, mediumId, maxDepth) : exitMediumStack(stack, mediumId, maxDepth);
}

export function beerLambertTransmittance(medium, distance) {
  const travelled = Math.max(0, finite(distance, 0));
  const absorption = vec3(medium?.absorption, [0, 0, 0]).map((value) => Math.max(0, value));
  return Object.freeze(absorption.map((coefficient) => Math.exp(-coefficient * travelled)));
}

export function resolveSpectralIor(ior, dispersion = 0, wavelengthNm = 550) {
  const base = clamp(finite(ior, 1.45), 1, 3);
  const spread = clamp(finite(dispersion, 0), 0, 2);
  const wavelength = clamp(finite(wavelengthNm, 550), 380, 780);
  return clamp(base + spread * (550 / wavelength - 1), 1, 3.5);
}

export function createSpectralSamples({
  ior = 1.45,
  dispersion = 0,
  wavelengths = DEFAULT_SPECTRAL_WAVELENGTHS,
} = {}) {
  const source = Array.isArray(wavelengths) && wavelengths.length > 0 ? wavelengths : DEFAULT_SPECTRAL_WAVELENGTHS;
  const weight = 1 / source.length;
  return Object.freeze(
    source.map((wavelength) =>
      Object.freeze({
        wavelengthNm: clamp(finite(wavelength, 550), 380, 780),
        ior: resolveSpectralIor(ior, dispersion, wavelength),
        weight,
      })
    )
  );
}

function fresnel(cosine, etaRatio) {
  const r0 = ((1 - etaRatio) / (1 + etaRatio)) ** 2;
  return clamp(r0 + (1 - r0) * (1 - clamp(cosine, 0, 1)) ** 5, 0, 1);
}

export function createTransportBranches({
  incidentDirection = [0, -1, 0],
  normal = [0, 1, 0],
  frontFace = true,
  ior = 1.45,
  dispersion = 0,
  transmission = 1,
  mediumStack = [],
  mediumId = 0,
  maxBranches = MAX_TRANSPORT_BRANCHES,
  wavelengths = DEFAULT_SPECTRAL_WAVELENGTHS,
} = {}) {
  const incident = normalize(vec3(incidentDirection, [0, -1, 0]), [0, -1, 0]);
  const orientedNormal = normalize(vec3(normal, [0, 1, 0]), [0, 1, 0]);
  const etaRatio = frontFace ? 1 / Math.max(finite(ior, 1.45), 1.0001) : Math.max(finite(ior, 1.45), 1.0001);
  const cosine = clamp(dot(scale(incident, -1), orientedNormal), 0, 1);
  const sinTheta = Math.sqrt(Math.max(0, 1 - cosine * cosine));
  const cannotRefract = etaRatio * sinTheta > 1;
  const reflectWeight = cannotRefract ? 1 : fresnel(cosine, etaRatio);
  const transmitWeight = cannotRefract ? 0 : (1 - reflectWeight) * clamp(finite(transmission, 1), 0, 1);
  const branches = [
    Object.freeze({
      kind: "reflection",
      direction: Object.freeze(normalize(reflectVector(incident, orientedNormal), orientedNormal)),
      weight: reflectWeight,
      mediumStack: Object.freeze(createMediumStack(mediumStack)),
      mediumId: currentMediumId(mediumStack),
      wavelengths: createSpectralSamples({ ior, dispersion, wavelengths }),
    }),
  ];
  if (transmitWeight > 0.000001 && branches.length < Math.max(1, Math.trunc(maxBranches))) {
    const transition = transitionMediumStack(mediumStack, mediumId, frontFace);
    branches.push(
      Object.freeze({
        kind: "transmission",
        direction: Object.freeze(normalize(refract(incident, orientedNormal, etaRatio), orientedNormal)),
        weight: transmitWeight,
        mediumStack: transition.stack,
        mediumId: transition.mediumId,
        mediumStackOverflowed: transition.overflowed ?? false,
        wavelengths: createSpectralSamples({ ior, dispersion, wavelengths }),
      })
    );
  }
  return Object.freeze(branches.filter((branch) => branch.weight > 0.000001));
}

export function applyMediumTransmittance(throughput, medium, distance) {
  return Object.freeze(multiply(vec3(throughput, [1, 1, 1]), beerLambertTransmittance(medium, distance)));
}
