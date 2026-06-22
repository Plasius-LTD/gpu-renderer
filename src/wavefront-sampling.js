import {
  add,
  cross,
  dot,
  normalize,
  scale,
  subtract,
} from "./wavefront-core.js";

export function reflectVector(direction, normal) {
  return subtract(direction, scale(normal, 2 * dot(direction, normal)));
}

export function buildOrthonormalBasis(normal) {
  const tangentFallback = Math.abs(normal[1]) < 0.999 ? [0, 1, 0] : [1, 0, 0];
  const tangent = normalize(cross(tangentFallback, normal), [1, 0, 0]);
  const bitangent = normalize(cross(normal, tangent), [0, 0, 1]);
  return { tangent, bitangent };
}

export function localToWorld(local, normal) {
  const basis = buildOrthonormalBasis(normal);
  return normalize(
    add(
      add(scale(basis.tangent, local[0]), scale(basis.bitangent, local[1])),
      scale(normal, local[2])
    ),
    normal
  );
}

export function radicalInverseVdc(bits) {
  let value = bits >>> 0;
  value = ((value << 16) | (value >>> 16)) >>> 0;
  value = (((value & 0x55555555) << 1) | ((value & 0xaaaaaaaa) >>> 1)) >>> 0;
  value = (((value & 0x33333333) << 2) | ((value & 0xcccccccc) >>> 2)) >>> 0;
  value = (((value & 0x0f0f0f0f) << 4) | ((value & 0xf0f0f0f0) >>> 4)) >>> 0;
  value = (((value & 0x00ff00ff) << 8) | ((value & 0xff00ff00) >>> 8)) >>> 0;
  return value * 2.3283064365386963e-10;
}

export function hammersley(index, count) {
  return [index / Math.max(count, 1), radicalInverseVdc(index)];
}

export function importanceSampleGgx(sample, roughness, normal) {
  const alpha = Math.max(roughness * roughness, 0.0001);
  const phi = 2 * Math.PI * sample[0];
  const cosTheta = Math.sqrt((1 - sample[1]) / (1 + (alpha * alpha - 1) * sample[1]));
  const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
  const halfVector = localToWorld(
    [Math.cos(phi) * sinTheta, Math.sin(phi) * sinTheta, cosTheta],
    normal
  );
  return normalize(halfVector, normal);
}

export function distributionGgx(nDotH, roughness) {
  const alpha = Math.max(roughness * roughness, 0.0001);
  const alpha2 = alpha * alpha;
  const denom = (nDotH * nDotH) * (alpha2 - 1) + 1;
  return alpha2 / Math.max(Math.PI * denom * denom, 0.000001);
}

export function geometrySchlickGgx(nDotV, roughness) {
  const k = ((roughness + 1) * (roughness + 1)) / 8;
  return nDotV / Math.max(nDotV * (1 - k) + k, 0.000001);
}

export function geometrySmith(nDotV, nDotL, roughness) {
  return geometrySchlickGgx(nDotV, roughness) * geometrySchlickGgx(nDotL, roughness);
}

export function integrateBrdfSample(nDotV, roughness, sampleCount) {
  const viewDirection = [Math.sqrt(Math.max(0, 1 - nDotV * nDotV)), 0, nDotV];
  const normal = [0, 0, 1];
  let scaleTerm = 0;
  let biasTerm = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const xi = hammersley(index, sampleCount);
    const halfVector = importanceSampleGgx(xi, roughness, normal);
    const vDotH = Math.max(dot(viewDirection, halfVector), 0);
    const lightDirection = normalize(
      subtract(scale(halfVector, 2 * vDotH), viewDirection),
      normal
    );
    const nDotL = Math.max(lightDirection[2], 0);
    const nDotH = Math.max(halfVector[2], 0);
    if (nDotL <= 0 || nDotH <= 0 || vDotH <= 0) {
      continue;
    }
    const geometry = geometrySmith(nDotV, nDotL, roughness);
    const visibility = (geometry * vDotH) / Math.max(nDotH * nDotV, 0.000001);
    const fresnel = (1 - vDotH) ** 5;
    scaleTerm += (1 - fresnel) * visibility;
    biasTerm += fresnel * visibility;
  }
  return [scaleTerm / sampleCount, biasTerm / sampleCount];
}
