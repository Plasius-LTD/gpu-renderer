import {
  DEFAULT_ENVIRONMENT_LIGHTING,
  add,
  asUnitVec3,
  asVec3,
  clamp,
  cross,
  dot,
  mixSeed,
  normalize,
  random01FromSeed,
  readFiniteNumber,
  readNonNegativeInteger,
  readPositiveInteger,
  scale,
  subtract,
} from "./wavefront-core.js";
import {
  distributionGgx,
  geometrySmith,
  hammersley,
  integrateBrdfSample,
  localToWorld,
  reflectVector,
} from "./wavefront-sampling.js";

function evaluateReferenceEnvironmentRadiance(config, origin, direction) {
  void origin;
  const rayDirection = normalize(direction, [0, 1, 0]);
  const upFactor = clamp(rayDirection[1] * 0.5 + 0.5, 0, 1);
  const sunDirection = normalize(
    config.environmentLighting?.sunDirection ?? DEFAULT_ENVIRONMENT_LIGHTING.sunDirection,
    DEFAULT_ENVIRONMENT_LIGHTING.sunDirection
  );
  const sunGlow = Math.pow(clamp(dot(rayDirection, sunDirection), 0, 1), 192);
  const horizonColor =
    config.environmentLighting?.horizonColor ?? DEFAULT_ENVIRONMENT_LIGHTING.horizonColor;
  const zenithColor =
    config.environmentLighting?.zenithColor ?? DEFAULT_ENVIRONMENT_LIGHTING.zenithColor;
  const sunColor = config.environmentLighting?.sunColor ?? DEFAULT_ENVIRONMENT_LIGHTING.sunColor;
  const intensity = Math.max(
    0.0001,
    Number(config.environmentLighting?.intensity ?? DEFAULT_ENVIRONMENT_LIGHTING.intensity)
  );

  return Object.freeze([
    (horizonColor[0] * (1 - upFactor) + zenithColor[0] * upFactor + sunColor[0] * sunGlow) *
      intensity,
    (horizonColor[1] * (1 - upFactor) + zenithColor[1] * upFactor + sunColor[1] * sunGlow) *
      intensity,
    (horizonColor[2] * (1 - upFactor) + zenithColor[2] * upFactor + sunColor[2] * sunGlow) *
      intensity,
    1,
  ]);
}

function normalizeReferenceTile(config, tileInput = {}) {
  const tileX = clamp(
    readNonNegativeInteger("tile.x", tileInput.x, 0),
    0,
    Math.max(0, config.width - 1)
  );
  const tileY = clamp(
    readNonNegativeInteger("tile.y", tileInput.y, 0),
    0,
    Math.max(0, config.height - 1)
  );
  const tileWidth = clamp(
    readPositiveInteger("tile.width", tileInput.width, config.width - tileX),
    1,
    config.width - tileX
  );
  const tileHeight = clamp(
    readPositiveInteger("tile.height", tileInput.height, config.height - tileY),
    1,
    config.height - tileY
  );

  return Object.freeze({
    x: tileX,
    y: tileY,
    width: tileWidth,
    height: tileHeight,
  });
}

function repairReferenceShadingNormal(geometricNormal, shadingNormal) {
  const normal = normalize(shadingNormal, geometricNormal);
  return dot(normal, geometricNormal) < 0 ? scale(normal, -1) : normal;
}

function readOptionalMaxDistance(value) {
  if (value === undefined || value === null) {
    return Number.POSITIVE_INFINITY;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error("maxDistance must be a positive finite number when provided.");
  }
  return numeric;
}

export function createWavefrontReferenceRay(config, options = {}) {
  if (!config || typeof config !== "object") {
    throw new Error("config must be a wavefront path tracing config.");
  }

  const tile = normalizeReferenceTile(config, options.tile);
  const tilePixelCount = tile.width * tile.height;
  const pixelIndex = readNonNegativeInteger("pixelIndex", options.pixelIndex, 0);
  if (pixelIndex >= tilePixelCount) {
    throw new Error(`pixelIndex ${pixelIndex} exceeds tile capacity ${tilePixelCount}.`);
  }

  const sampleIndex = readNonNegativeInteger("sampleIndex", options.sampleIndex, 0);
  const frameIndex = readNonNegativeInteger("frameIndex", options.frameIndex, config.frameIndex ?? 0);
  const jitterScale = clamp(readFiniteNumber("jitterScale", options.jitterScale, 0.35), 0, 1);
  const localX = pixelIndex % tile.width;
  const localY = Math.floor(pixelIndex / tile.width);
  const pixelX = tile.x + localX;
  const pixelY = tile.y + localY;
  const sourcePixelId = pixelY * config.width + pixelX;
  const jitterX = random01FromSeed(mixSeed(sourcePixelId, sampleIndex, 0, frameIndex, 1)) - 0.5;
  const jitterY = random01FromSeed(mixSeed(sourcePixelId, sampleIndex, 0, frameIndex, 2)) - 0.5;
  const ndcX = ((pixelX + 0.5 + jitterX * jitterScale) / config.width) * 2 - 1;
  const ndcY = 1 - ((pixelY + 0.5 + jitterY * jitterScale) / config.height) * 2;
  const viewX = ndcX * config.camera.tanHalfFovY * config.camera.aspect;
  const viewY = ndcY * config.camera.tanHalfFovY;
  const direction = normalize(
    add(
      add(config.camera.forward, scale(config.camera.right, viewX)),
      scale(config.camera.up, viewY)
    ),
    config.camera.forward
  );

  return Object.freeze({
    rayId: pixelIndex,
    parentRayId: 0xffffffff,
    sourcePixelId,
    sampleId: sampleIndex,
    bounce: 0,
    mediumRefId: 0,
    flags: 0,
    origin: Object.freeze([...config.camera.position]),
    direction: Object.freeze(direction),
    throughput: Object.freeze([1, 1, 1, 1]),
    pixelX,
    pixelY,
  });
}

export function intersectWavefrontReferenceTriangle(ray, triangle, options = {}) {
  if (!ray || typeof ray !== "object") {
    throw new Error("ray must be a wavefront reference ray.");
  }
  if (!triangle || typeof triangle !== "object") {
    throw new Error("triangle must be a wavefront triangle record.");
  }

  const maxDistance = readOptionalMaxDistance(options.maxDistance);
  const triangleIndex = readNonNegativeInteger("triangleIndex", options.triangleIndex, 0);
  const edge1 = subtract(triangle.v1, triangle.v0);
  const edge2 = subtract(triangle.v2, triangle.v0);
  const pvec = cross(ray.direction, edge2);
  const determinant = dot(edge1, pvec);
  if (Math.abs(determinant) < 0.0000001) {
    return null;
  }

  const invDet = 1 / determinant;
  const tvec = subtract(ray.origin, triangle.v0);
  const u = dot(tvec, pvec) * invDet;
  if (u < 0 || u > 1) {
    return null;
  }

  const qvec = cross(tvec, edge1);
  const v = dot(ray.direction, qvec) * invDet;
  if (v < 0 || u + v > 1) {
    return null;
  }

  const distance = dot(edge2, qvec) * invDet;
  if (distance <= 0.001 || distance > maxDistance) {
    return null;
  }

  const geometric = normalize(cross(edge1, edge2), [0, 1, 0]);
  const frontFace = dot(ray.direction, geometric) < 0;
  const orientedGeometric = frontFace ? geometric : scale(geometric, -1);
  const w = 1 - u - v;
  const interpolated = [
    triangle.n0[0] * w + triangle.n1[0] * u + triangle.n2[0] * v,
    triangle.n0[1] * w + triangle.n1[1] * u + triangle.n2[1] * v,
    triangle.n0[2] * w + triangle.n1[2] * u + triangle.n2[2] * v,
  ];
  const shadingNormal = repairReferenceShadingNormal(orientedGeometric, interpolated);
  const uv = [
    triangle.uv0[0] * w + triangle.uv1[0] * u + triangle.uv2[0] * v,
    triangle.uv0[1] * w + triangle.uv1[1] * u + triangle.uv2[1] * v,
  ];
  const position = add(ray.origin, scale(ray.direction, distance));

  return Object.freeze({
    hitType: "surface",
    rayId: ray.rayId,
    sourcePixelId: ray.sourcePixelId,
    distance,
    entityId: triangle.meshId,
    instanceId: 0,
    primitiveId: triangle.triangleId,
    materialId: triangle.materialKind,
    materialRefId: triangle.materialRefId,
    mediumRefId: triangle.mediumRefId,
    barycentrics: Object.freeze([w, u, v]),
    uv: Object.freeze(uv),
    geometricNormal: Object.freeze(orientedGeometric),
    shadingNormal: Object.freeze(shadingNormal),
    frontFace,
    triangleIndex,
    triangleId: triangle.triangleId,
    position: Object.freeze(position),
    color: triangle.color,
    emission: triangle.emission,
    material: triangle.material,
    materialResponse: triangle.materialResponse,
  });
}

function createWavefrontReferenceEnvironmentHit(config, ray) {
  const radiance = evaluateReferenceEnvironmentRadiance(config, ray.origin, ray.direction);
  return Object.freeze({
    hitType: "environment",
    rayId: ray.rayId,
    sourcePixelId: ray.sourcePixelId,
    distance: -1,
    entityId: 0,
    instanceId: 0,
    primitiveId: 0,
    materialId: 0,
    materialRefId: 0,
    mediumRefId: 0,
    barycentrics: Object.freeze([0, 0, 0]),
    uv: Object.freeze([0, 0]),
    geometricNormal: Object.freeze(scale(ray.direction, -1)),
    shadingNormal: Object.freeze(scale(ray.direction, -1)),
    frontFace: true,
    triangleIndex: -1,
    triangleId: -1,
    position: Object.freeze(add(ray.origin, scale(ray.direction, 1000))),
    color: Object.freeze([0, 0, 0, 0]),
    emission: radiance,
    material: Object.freeze([1, 0, 1, 1]),
    materialResponse: Object.freeze([0, 0, 0, 0]),
  });
}

export function traceWavefrontReferenceTriangles(config, ray, triangles, options = {}) {
  if (!config || typeof config !== "object") {
    throw new Error("config must be a wavefront path tracing config.");
  }

  const source = Array.isArray(triangles) ? triangles : [];
  let nearestHit = null;
  let nearestDistance = readOptionalMaxDistance(options.maxDistance);

  source.forEach((triangle, index) => {
    const hit = intersectWavefrontReferenceTriangle(ray, triangle, {
      maxDistance: Number.isFinite(nearestDistance) ? nearestDistance : undefined,
      triangleIndex: index,
    });
    if (hit && hit.distance < nearestDistance) {
      nearestDistance = hit.distance;
      nearestHit = hit;
    }
  });

  return nearestHit ?? createWavefrontReferenceEnvironmentHit(config, ray);
}

function maxComponentVec3(value) {
  return Math.max(value[0] ?? 0, value[1] ?? 0, value[2] ?? 0);
}

function clampVec3(value, min = 0, max = 1) {
  const minVec = Array.isArray(min) ? min : [min, min, min];
  const maxVec = Array.isArray(max) ? max : [max, max, max];
  return [
    clamp(Number(value?.[0]) || 0, minVec[0], maxVec[0]),
    clamp(Number(value?.[1]) || 0, minVec[1], maxVec[1]),
    clamp(Number(value?.[2]) || 0, minVec[2], maxVec[2]),
  ];
}

function maxVec3(left, right) {
  return [
    Math.max(left[0] ?? 0, right[0] ?? 0),
    Math.max(left[1] ?? 0, right[1] ?? 0),
    Math.max(left[2] ?? 0, right[2] ?? 0),
  ];
}

function multiplyVec3(left, right) {
  return [
    (left[0] ?? 0) * (right[0] ?? 0),
    (left[1] ?? 0) * (right[1] ?? 0),
    (left[2] ?? 0) * (right[2] ?? 0),
  ];
}

function addVec3(left, right) {
  return [
    (left[0] ?? 0) + (right[0] ?? 0),
    (left[1] ?? 0) + (right[1] ?? 0),
    (left[2] ?? 0) + (right[2] ?? 0),
  ];
}

function mixScalar(a, b, factor) {
  return a * (1 - factor) + b * factor;
}

function mixVec3(left, right, factor) {
  return [
    mixScalar(left[0] ?? 0, right[0] ?? 0, factor),
    mixScalar(left[1] ?? 0, right[1] ?? 0, factor),
    mixScalar(left[2] ?? 0, right[2] ?? 0, factor),
  ];
}

function sanitizeWavefrontPdf(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return value;
}

function sanitizeWavefrontThroughputComponent(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.min(value, 65504);
}

function sanitizeWavefrontThroughput(value) {
  return [
    sanitizeWavefrontThroughputComponent(value?.[0]),
    sanitizeWavefrontThroughputComponent(value?.[1]),
    sanitizeWavefrontThroughputComponent(value?.[2]),
  ];
}

function coerceWavefrontVec3(value, fallback) {
  const source = Array.isArray(value) ? value : [];
  return [
    Number.isFinite(source[0]) ? Number(source[0]) : fallback[0],
    Number.isFinite(source[1]) ? Number(source[1]) : fallback[1],
    Number.isFinite(source[2]) ? Number(source[2]) : fallback[2],
  ];
}

function clampWavefrontSampleRadiance(value) {
  return [
    clamp(Number(value?.[0]) || 0, 0, 4),
    clamp(Number(value?.[1]) || 0, 0, 4),
    clamp(Number(value?.[2]) || 0, 0, 4),
  ];
}

function fresnelSchlick(cosine, f0) {
  const factor = (1 - clamp(Number(cosine) || 0, 0, 1)) ** 5;
  return [
    (f0[0] ?? 0) + (1 - (f0[0] ?? 0)) * factor,
    (f0[1] ?? 0) + (1 - (f0[1] ?? 0)) * factor,
    (f0[2] ?? 0) + (1 - (f0[2] ?? 0)) * factor,
  ];
}

function normalizeWavefrontReferenceHit(input = {}) {
  const material = Array.isArray(input.material) ? input.material : [];
  const materialResponse = Array.isArray(input.materialResponse) ? input.materialResponse : [];
  const materialExtension = Array.isArray(input.materialExtension) ? input.materialExtension : [];
  return Object.freeze({
    color: Object.freeze(coerceWavefrontVec3(input.color, [0.8, 0.8, 0.8])),
    shadingNormal: Object.freeze(
      normalize(coerceWavefrontVec3(input.shadingNormal, [0, 1, 0]), [0, 1, 0])
    ),
    material: Object.freeze([
      clamp(Number(material[0] ?? input.roughness ?? 0.45) || 0, 0, 1),
      clamp(Number(material[1] ?? input.metallic ?? 0) || 0, 0, 1),
      clamp(Number(material[2] ?? 1) || 1, 0, 1),
      clamp(Number(material[3] ?? 1.45) || 1.45, 1, 3),
    ]),
    materialResponse: Object.freeze([
      clamp(Number(materialResponse[0] ?? input.sheen ?? 0) || 0, 0, 1),
      clamp(Number(materialResponse[1] ?? input.sheenTint ?? 0) || 0, 0, 1),
      clamp(Number(materialResponse[2] ?? input.anisotropy ?? 0) || 0, 0, 1),
      clamp(Number(materialResponse[3] ?? input.clearcoat ?? 0) || 0, 0, 1),
    ]),
    materialExtension: Object.freeze([
      clamp(Number(materialExtension[0] ?? input.clearcoatRoughness ?? 0.08) || 0, 0, 1),
      clamp(Number(materialExtension[1] ?? input.specularWeight ?? 1) || 0, 0, 1),
      clamp(Number(materialExtension[2] ?? input.transmission ?? 0) || 0, 0, 1),
      clamp(Number(materialExtension[3] ?? 0) || 0, 0, 1),
    ]),
    specularColor: Object.freeze(coerceWavefrontVec3(input.specularColor, [1, 1, 1])),
    occlusion: clamp(Number(input.occlusion ?? 1) || 0, 0, 1),
    materialKind: readNonNegativeInteger("materialKind", input.materialKind, 0),
    position: Object.freeze(coerceWavefrontVec3(input.position, [0, 0, 0])),
  });
}

function surfaceSpecularF0Reference(hit, surfaceColor) {
  const metallic = clamp(hit.material[1], 0, 1);
  const specularWeight = clamp(hit.materialExtension[1], 0, 1);
  const specularColor = clampVec3(hit.specularColor, 0, 1);
  const dielectricF0 = specularColor.map((value) => 0.04 * specularWeight * value);
  return mixVec3(dielectricF0, surfaceColor, metallic);
}

function surfaceBsdfSamplingWeightsReference(hit) {
  const metallic = clamp(hit.material[1], 0, 1);
  const clearcoat = clamp(hit.materialResponse[3], 0, 1);
  const specularWeight = clamp(hit.materialExtension[1], 0, 1);
  const diffuseWeight = clamp(
    (1 - metallic) * Math.max(1 - specularWeight * 0.5 - clearcoat * 0.25, 0.15),
    0,
    1
  );
  const specWeight = clamp(
    Math.max(metallic, specularWeight * 0.75) * (1 - clearcoat * 0.5),
    0,
    1
  );
  const clearcoatWeight = clamp(clearcoat, 0, 1);
  const totalWeight = Math.max(diffuseWeight + specWeight + clearcoatWeight, 0.000001);
  return Object.freeze([
    diffuseWeight / totalWeight,
    specWeight / totalWeight,
    clearcoatWeight / totalWeight,
  ]);
}

function evaluateWavefrontSurfaceBsdfReference(hitInput, viewDirectionInput, lightDirectionInput, ambientColor = [0.018, 0.022, 0.026]) {
  const hit = normalizeWavefrontReferenceHit(hitInput);
  const normal = normalize(hit.shadingNormal, [0, 1, 0]);
  const viewDirection = normalize(viewDirectionInput, normal);
  const lightDirection = normalize(lightDirectionInput, normal);
  const surfaceColor = clampVec3(maxVec3(hit.color, scale(asVec3(ambientColor, [0.018, 0.022, 0.026]), 0.35)), 0, 1);
  const roughness = clamp(hit.material[0], 0, 1);
  const metallic = clamp(hit.material[1], 0, 1);
  const clearcoat = clamp(hit.materialResponse[3], 0, 1);
  const clearcoatRoughness = clamp(hit.materialExtension[0], 0, 1);
  const occlusion = clamp(hit.occlusion, 0, 1);
  const nDotV = clamp(dot(normal, viewDirection), 0, 1);
  const nDotL = clamp(dot(normal, lightDirection), 0, 1);
  if (nDotV <= 0 || nDotL <= 0) {
    return Object.freeze([0, 0, 0]);
  }
  const halfVector = normalize(add(viewDirection, lightDirection), normal);
  const vDotH = clamp(dot(viewDirection, halfVector), 0, 1);
  const f0 = surfaceSpecularF0Reference(hit, surfaceColor);
  const fresnel = fresnelSchlick(vDotH, f0);
  const nDotH = clamp(dot(normal, halfVector), 0, 1);
  const distribution = distributionGgx(nDotH, roughness);
  const geometry = geometrySmith(nDotV, nDotL, roughness);
  const specular = fresnel.map(
    (value) => (distribution * geometry * value) / Math.max(4 * nDotV * nDotL, 0.000001)
  );
  const diffuseWeight =
    (1 - metallic) * (1 - clearcoat * 0.24) * (1 - clamp(maxComponentVec3(fresnel), 0, 0.98));
  const diffuse = surfaceColor.map((value) => (value * diffuseWeight) / Math.PI);
  const clearcoatHalf = normalize(add(viewDirection, lightDirection), normal);
  const clearcoatVDotH = clamp(dot(viewDirection, clearcoatHalf), 0, 1);
  const clearcoatDistribution = distributionGgx(
    clamp(dot(normal, clearcoatHalf), 0, 1),
    Math.max(clearcoatRoughness, 0.02)
  );
  const clearcoatGeometry = geometrySmith(nDotV, nDotL, Math.max(clearcoatRoughness, 0.02));
  const clearcoatFresnel = fresnelSchlick(clearcoatVDotH, [0.04, 0.04, 0.04]);
  const clearcoatTerm = clearcoatFresnel.map(
    (value) =>
      ((clearcoatDistribution * clearcoatGeometry * value) /
        Math.max(4 * nDotV * nDotL, 0.000001)) *
      clearcoat
  );
  const occlusionWeight = mixScalar(0.42, 1, occlusion);
  return Object.freeze(
    addVec3(addVec3(diffuse, specular), clearcoatTerm).map((value) => value * occlusionWeight)
  );
}

function diffusePdfReference(normal, lightDirection) {
  return clamp(dot(normal, lightDirection), 0, 1) / Math.PI;
}

function ggxPdfReference(normal, viewDirection, lightDirection, roughness) {
  const halfVector = normalize(add(viewDirection, lightDirection), normal);
  const nDotH = clamp(dot(normal, halfVector), 0, 1);
  const vDotH = clamp(dot(viewDirection, halfVector), 0, 1);
  const distribution = distributionGgx(nDotH, roughness);
  return (distribution * nDotH) / Math.max(4 * vDotH, 0.000001);
}

function evaluateWavefrontSurfaceBsdfPdfReference(hitInput, viewDirectionInput, lightDirectionInput) {
  const hit = normalizeWavefrontReferenceHit(hitInput);
  const normal = normalize(hit.shadingNormal, [0, 1, 0]);
  const viewDirection = normalize(viewDirectionInput, normal);
  const lightDirection = normalize(lightDirectionInput, normal);
  const roughness = clamp(hit.material[0], 0, 1);
  const weights = surfaceBsdfSamplingWeightsReference(hit);
  return (
    weights[0] * diffusePdfReference(normal, lightDirection) +
    weights[1] * ggxPdfReference(normal, viewDirection, lightDirection, Math.max(roughness, 0.02)) +
    weights[2] *
      ggxPdfReference(
        normal,
        viewDirection,
        lightDirection,
        Math.max(clamp(hit.materialExtension[0], 0, 1), 0.02)
      )
  );
}

function surfaceGlossinessReference(hitInput) {
  const hit = normalizeWavefrontReferenceHit(hitInput);
  const roughness = clamp(hit.material[0], 0, 1);
  const metallic = clamp(hit.material[1], 0, 1);
  const sheen = clamp(maxComponentVec3(hit.materialResponse), 0, 1);
  const clearcoat = clamp(hit.materialResponse[3], 0, 1);
  const specularWeight = clamp(hit.materialExtension[1], 0, 1);
  const transmission = clamp(hit.materialExtension[2], 0, 1);
  const baseGloss = Math.max(
    clearcoat,
    Math.max(sheen * 0.72, Math.max(specularWeight * (0.38 + metallic * 0.62), transmission))
  );
  return clamp(baseGloss * (1 - roughness * 0.72) + metallic * (1 - roughness) * 0.35, 0, 1);
}

function glossyEnvironmentDirectionReference(incidentDirection, normal, roughness, normalBlendScale) {
  const reflectionDirection = reflectVector(incidentDirection, normal);
  const blend = clamp(roughness * roughness * normalBlendScale, 0, 0.92);
  return normalize(
    add(scale(reflectionDirection, 1 - blend), scale(normal, blend)),
    normal
  );
}

function wavefrontPowerHeuristicReference(pdfA, pdfB) {
  const a = sanitizeWavefrontPdf(pdfA);
  const b = sanitizeWavefrontPdf(pdfB);
  if (a <= 0) {
    return 0;
  }
  const a2 = a * a;
  const b2 = b * b;
  return a2 / Math.max(a2 + b2, 0.000001);
}

function sunlitBaselineRadianceReference(configInput, normal) {
  const config = configInput ?? {};
  const baseline = Math.max(
    0,
    Number(config.environmentLighting?.sunlitBaseline ?? config.pathResolveBaseline ?? 0.16)
  );
  if (baseline <= 0.000001) {
    return [0, 0, 0];
  }
  const sunDirection = asUnitVec3(
    config.environmentLighting?.sunDirection,
    DEFAULT_ENVIRONMENT_LIGHTING.sunDirection
  );
  const sunFacing = clamp(dot(normal, sunDirection), 0, 1);
  const skyFacing = 0.35 + clamp(normal[1] * 0.5 + 0.5, 0, 1) * 0.65;
  const directionalWeight = 0.38 + sunFacing * 0.62;
  const sunTint = maxVec3(asVec3(config.environmentLighting?.sunColor, DEFAULT_ENVIRONMENT_LIGHTING.sunColor), [0, 0, 0]);
  return clampWavefrontSampleRadiance(
    sunTint.map((value) => value * baseline * skyFacing * directionalWeight * 0.04)
  );
}

export function validateWavefrontBsdfSample({
  hit,
  viewDirection = [0, 1, 0],
  lightDirection = [0, 1, 0],
  sampledPdf,
  lightPdf = 0,
  ambientColor = [0.018, 0.022, 0.026],
} = {}) {
  const normalizedHit = normalizeWavefrontReferenceHit(hit);
  const normal = normalize(normalizedHit.shadingNormal, [0, 1, 0]);
  const resolvedViewDirection = normalize(viewDirection, normal);
  const resolvedLightDirection = normalize(lightDirection, normal);
  const bsdf = evaluateWavefrontSurfaceBsdfReference(
    normalizedHit,
    resolvedViewDirection,
    resolvedLightDirection,
    ambientColor
  );
  const expectedPdf = evaluateWavefrontSurfaceBsdfPdfReference(
    normalizedHit,
    resolvedViewDirection,
    resolvedLightDirection
  );
  const resolvedSampledPdf =
    sampledPdf === undefined ? expectedPdf : sanitizeWavefrontPdf(sampledPdf);
  const nDotL = clamp(dot(normal, resolvedLightDirection), 0, 1);
  const continuationThroughput =
    resolvedSampledPdf <= 0.000001
      ? [0, 0, 0]
      : sanitizeWavefrontThroughput(
          bsdf.map((value) => value * (nDotL / Math.max(resolvedSampledPdf, 0.000001)))
        );
  const pdfTolerance = Math.max(0.00005, expectedPdf * 0.05);
  return Object.freeze({
    bsdf: Object.freeze(bsdf),
    expectedPdf,
    sampledPdf: resolvedSampledPdf,
    lightPdf: sanitizeWavefrontPdf(lightPdf),
    misWeight: wavefrontPowerHeuristicReference(lightPdf, resolvedSampledPdf),
    continuationThroughput: Object.freeze(continuationThroughput),
    pdfMismatch: Math.abs(resolvedSampledPdf - expectedPdf) > pdfTolerance,
  });
}

export function estimateWavefrontDirectionalHemisphericalReflectance(
  hit,
  viewDirection = [0, 1, 0],
  options = {}
) {
  const normalizedHit = normalizeWavefrontReferenceHit(hit);
  const normal = normalize(normalizedHit.shadingNormal, [0, 1, 0]);
  const resolvedViewDirection = normalize(viewDirection, normal);
  const sampleCount = Math.max(32, readPositiveInteger("sampleCount", options.sampleCount, 512));
  let total = [0, 0, 0];
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = hammersley(index, sampleCount);
    const phi = sample[0] * 2 * Math.PI;
    const cosTheta = sample[1];
    const sinTheta = Math.sqrt(Math.max(1 - cosTheta * cosTheta, 0));
    const lightDirection = localToWorld(
      [Math.cos(phi) * sinTheta, Math.sin(phi) * sinTheta, cosTheta],
      normal
    );
    const bsdf = evaluateWavefrontSurfaceBsdfReference(
      normalizedHit,
      resolvedViewDirection,
      lightDirection,
      options.ambientColor ?? [0.018, 0.022, 0.026]
    );
    const nDotL = clamp(dot(normal, lightDirection), 0, 1);
    total = addVec3(total, bsdf.map((value) => value * nDotL * ((2 * Math.PI) / sampleCount)));
  }
  return Object.freeze(clampVec3(total, 0, 4));
}

export function computeWavefrontTerminalEnvironmentContributionReference(
  configInput = {},
  rayInput = {},
  throughputInput = [1, 1, 1],
  hitInput = {}
) {
  const config = configInput ?? {};
  const hit = normalizeWavefrontReferenceHit(hitInput);
  const normal = normalize(hit.shadingNormal, [0, 1, 0]);
  const origin = add(hit.position, scale(normal, 0.003));
  const roughness = clamp(hit.material[0], 0, 1);
  const glossiness = surfaceGlossinessReference(hit);
  const rayDirection = normalize(rayInput.direction ?? [0, -1, 0], [0, -1, 0]);
  const viewDirection = normalize(scale(rayDirection, -1), normal);
  const normalEnvironment = evaluateReferenceEnvironmentRadiance(config, origin, normal).slice(0, 3);
  const reflectionDirection = glossyEnvironmentDirectionReference(
    rayDirection,
    normal,
    roughness,
    mixScalar(0.88, 0.38, glossiness)
  );
  const reflectionEnvironment = evaluateReferenceEnvironmentRadiance(
    config,
    origin,
    reflectionDirection
  ).slice(0, 3);
  const surfaceColor = clampVec3(
    maxVec3(hit.color, scale(asVec3(config.ambientColor, [0.018, 0.022, 0.026]), 0.35)),
    0,
    1
  );
  const f0 = surfaceSpecularF0Reference(hit, surfaceColor);
  const [brdfScale, brdfBias] = integrateBrdfSample(
    clamp(dot(normal, viewDirection), 0, 1),
    roughness,
    128
  );
  const specularEnvironment = multiplyVec3(
    reflectionEnvironment,
    addVec3(scale(f0, brdfScale), [brdfBias, brdfBias, brdfBias])
  );
  const sunlitFloor = sunlitBaselineRadianceReference(config, normal);
  const ambientColor = asVec3(config.ambientColor, [0.018, 0.022, 0.026]);
  const ambientFloor = maxVec3(ambientColor, scale(sunlitFloor, 0.82));
  const environmentInfluence = Math.max(
    0.12,
    Number(config.environmentLighting?.sunlitBaseline ?? config.pathResolveBaseline ?? 0.16) * 0.42
  );
  const glossyEnvironment = maxVec3(
    normalEnvironment,
    maxVec3(
      scale(reflectionEnvironment, mixScalar(0.24, 0.92, glossiness)),
      specularEnvironment
    )
  );
  const environmentFloor = maxVec3(
    ambientFloor,
    maxVec3(sunlitFloor, scale(glossyEnvironment, environmentInfluence))
  );
  const materialFloor = hit.materialKind === 0 || hit.materialKind === 3 ? 1 : 0.7;
  const source = clampWavefrontSampleRadiance(scale(environmentFloor, materialFloor));
  const occlusion = mixScalar(0.75, 1, clamp(hit.occlusion, 0, 1));
  const contribution = clampWavefrontSampleRadiance(
    scale(
      multiplyVec3(
        multiplyVec3(sanitizeWavefrontThroughput(throughputInput), maxVec3(hit.color, ambientColor)),
        source
      ),
      occlusion
    )
  );
  return Object.freeze({
    source: Object.freeze(source),
    contribution: Object.freeze(contribution),
  });
}
