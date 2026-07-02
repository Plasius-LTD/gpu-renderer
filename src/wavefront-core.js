import { WAVEFRONT_COMPUTE_WORKGROUP_SIZE } from "./wavefront-workgroup.js";

export const DEFAULT_WIDTH = 1280;
export const DEFAULT_HEIGHT = 720;
export const DEFAULT_MAX_DEPTH = 6;
export const MAX_PATH_TRACING_DEPTH = 32;
export const DEFAULT_TILE_SIZE = 128;
export const DEFAULT_SAMPLES_PER_PIXEL = 1;
export const MAX_SAMPLES_PER_PIXEL = 256;
export const DEFAULT_BRDF_LUT_SIZE = 128;
export const DEFAULT_BRDF_LUT_SAMPLE_COUNT = 256;
export const DEFAULT_MAX_FRAME_PASSES_PER_SUBMISSION = 256;
export const DEFAULT_SCENE_OBJECT_CAPACITY = 128;
export const DEFAULT_ENVIRONMENT_PORTAL_CAPACITY = 32;
export const DEFAULT_MEDIUM_PHASE_MODEL = 0;
export const WORKGROUP_SIZE = WAVEFRONT_COMPUTE_WORKGROUP_SIZE;
export const rendererWavefrontComputeMode = "webgpu-compute";
export const rendererWavefrontComputeWorkgroupSize = WORKGROUP_SIZE;
export const rendererWavefrontComputeStatsStride = 8;
export const RAY_RECORD_BYTES = 80;
export const HIT_RECORD_BYTES = 256;
export const SCENE_OBJECT_RECORD_BYTES = 160;
export const MESH_VERTEX_RECORD_BYTES = 48;
export const MESH_RANGE_RECORD_BYTES = 240;
export const TRIANGLE_RECORD_BYTES = 352;
export const GPU_MATERIAL_RECORD_BYTES = 192;
export const BVH_NODE_RECORD_BYTES = 48;
export const BVH_LEAF_REF_RECORD_BYTES = 16;
export const EMISSIVE_TRIANGLE_INDEX_BYTES = 4;
export const ENVIRONMENT_PORTAL_RECORD_BYTES = 96;
export const MEDIUM_TABLE_ROWS = 2;
export const ACCUMULATION_RECORD_BYTES = 16;
export const PATH_VERTEX_RECORD_BYTES = 16;
export const GPU_SUBMITTED_WORK_TIMEOUT_MS = 5_000;
export const GPU_READBACK_COMPLETION_TIMEOUT_MS = 60_000;
export const GPU_MAX_SUBMITTED_WORK_TIMEOUT_MS = 60_000;
export const GPU_MAX_SUBMITTED_WORK_DEADLINE_MS = 180_000;
export const CONFIG_BUFFER_BYTES = 320;
export const COUNTER_DISPATCH_ARGS_OFFSET = 16;
export const INDIRECT_DISPATCH_ARGS_BYTES = 12;
export const COUNTER_BUFFER_BYTES = 80;
export const TERMINATION_LUMINANCE_SCALE = 1_000_000;
export const COUNTER_TERMINATION_EMISSIVE_OFFSET = 8;
export const COUNTER_TERMINATION_ENVIRONMENT_OFFSET = 9;
export const COUNTER_TERMINATION_AMBIENT_MAX_DEPTH_OFFSET = 10;
export const COUNTER_TERMINATION_QUEUE_OVERFLOW_OFFSET = 11;
export const COUNTER_TERMINATION_AMBIENT_LUMINANCE_OFFSET = 12;
export const COUNTER_TERMINATION_TOTAL_LUMINANCE_OFFSET = 13;
export const COUNTER_TERMINATION_INVALID_SAMPLE_OFFSET = 14;
export const COUNTER_TERMINATION_LEGACY_CLAMP_EQUIVALENT_OFFSET = 15;
export const COUNTER_TERMINATION_ABSORPTION_NULL_OFFSET = 16;
export const COUNTER_TERMINATION_RUSSIAN_ROULETTE_OFFSET = 17;
export const COUNTER_TERMINATION_MAX_DEPTH_STRICT_OFFSET = 18;
export const TRACE_STORAGE_BUFFER_BINDINGS = 10;
export const BRDF_LUT_UPLOAD_CACHE = new Map();
export const HIT_TYPE_SURFACE = 0;
export const HIT_TYPE_EMISSIVE = 1;
export const TERMINAL_SOURCE_KIND_EMISSIVE = 1;
export const TERMINAL_SOURCE_KIND_ENVIRONMENT = 2;
export const TERMINAL_SOURCE_KIND_AMBIENT_MAX_DEPTH = 3;
export const TERMINAL_SOURCE_KIND_AMBIENT_QUEUE_OVERFLOW = 4;
export const TERMINAL_SOURCE_KIND_ABSORPTION_NULL = 5;
export const TERMINAL_SOURCE_KIND_RUSSIAN_ROULETTE = 6;
export const TERMINAL_SOURCE_KIND_MAX_DEPTH_STRICT = 7;
export const MATERIAL_DIFFUSE = 0;
export const MATERIAL_METAL = 1;
export const MATERIAL_DIELECTRIC = 2;
export const MATERIAL_TRANSPARENT = 3;
export const MATERIAL_EMISSIVE = 4;
export const OBJECT_KIND_SPHERE = 1;
export const OBJECT_KIND_BOX = 2;

export const DEFAULT_CAMERA = Object.freeze({
  position: Object.freeze([0, 1.15, 5.6]),
  target: Object.freeze([0, 0.65, 0]),
  up: Object.freeze([0, 1, 0]),
  fovYDegrees: 46,
});

export const DEFAULT_ENVIRONMENT_COLOR = Object.freeze([0.35, 0.43, 0.49, 1]);
export const DEFAULT_AMBIENT_COLOR = Object.freeze([0.018, 0.022, 0.026, 1]);
export const DEFAULT_ENVIRONMENT_LIGHTING = Object.freeze({
  horizonColor: Object.freeze([0.46, 0.56, 0.68, 1]),
  zenithColor: Object.freeze([0.04, 0.08, 0.16, 1]),
  sunDirection: Object.freeze([0.22, 0.88, 0.42]),
  sunColor: Object.freeze([2.8, 2.65, 2.35, 1]),
  intensity: 1,
  mode: 0,
  exposure: 1,
  sunlitBaseline: 0.16,
});

export const EMPTY_TERMINATION_METRICS = Object.freeze({
  termination: Object.freeze({
    emissive: 0,
    environment: 0,
    ambientFallback: 0,
    maxDepth: 0,
    absorptionNull: 0,
    russianRoulette: 0,
    strictMaxDepth: 0,
  }),
  queueOverflow: 0,
  terminalRadiance: Object.freeze({
    totalLuminance: 0,
    ambientResidualLuminance: 0,
    ambientResidualShare: 0,
  }),
  radianceDiagnostics: Object.freeze({
    invalidSamples: 0,
    legacyClampEquivalentSamples: 0,
  }),
});

export const wavefrontPathTracingComputeLimits = Object.freeze({
  workgroupSize: WORKGROUP_SIZE,
  traceStorageBufferBindings: TRACE_STORAGE_BUFFER_BINDINGS,
  rayRecordBytes: RAY_RECORD_BYTES,
  hitRecordBytes: HIT_RECORD_BYTES,
  sceneObjectRecordBytes: SCENE_OBJECT_RECORD_BYTES,
  meshVertexRecordBytes: MESH_VERTEX_RECORD_BYTES,
  meshRangeRecordBytes: MESH_RANGE_RECORD_BYTES,
  triangleRecordBytes: TRIANGLE_RECORD_BYTES,
  materialRecordBytes: GPU_MATERIAL_RECORD_BYTES,
  bvhNodeRecordBytes: BVH_NODE_RECORD_BYTES,
  bvhLeafReferenceRecordBytes: BVH_LEAF_REF_RECORD_BYTES,
  emissiveTriangleIndexBytes: EMISSIVE_TRIANGLE_INDEX_BYTES,
  emissiveTriangleMetadataRecordBytes: BVH_NODE_RECORD_BYTES,
  environmentPortalRecordBytes: ENVIRONMENT_PORTAL_RECORD_BYTES,
  accumulationRecordBytes: ACCUMULATION_RECORD_BYTES,
  pathVertexRecordBytes: PATH_VERTEX_RECORD_BYTES,
  counterRecordBytes: COUNTER_BUFFER_BYTES,
  indirectDispatchRecordBytes: INDIRECT_DISPATCH_ARGS_BYTES,
});

export const wavefrontSceneObjectKinds = Object.freeze({
  sphere: OBJECT_KIND_SPHERE,
  box: OBJECT_KIND_BOX,
});

export const wavefrontMaterialKinds = Object.freeze({
  diffuse: MATERIAL_DIFFUSE,
  metal: MATERIAL_METAL,
  dielectric: MATERIAL_DIELECTRIC,
  transparent: MATERIAL_TRANSPARENT,
  emissive: MATERIAL_EMISSIVE,
});

export function readPositiveInteger(name, value, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return numeric;
}

export function readNonNegativeInteger(name, value, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return numeric;
}

export function readFiniteNumber(name, value, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`${name} must be a finite number.`);
  }
  return numeric;
}

export function assertAnalyticDisplayQualityPolicy(options = {}) {
  const meshes = Array.isArray(options.meshes)
    ? options.meshes
    : options.mesh
      ? [options.mesh]
      : [];
  if (options.displayQuality === true && meshes.length === 0) {
    throw new Error(
      "Display-quality path tracing requires mesh BVH triangle intersections. " +
        "The analytic sphere/box wavefront renderer is debug-only."
    );
  }
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function asVec3(value, fallback) {
  if (!Array.isArray(value) && !(ArrayBuffer.isView(value) && value.length >= 3)) {
    return [...fallback];
  }
  return [
    readFiniteNumber("vector[0]", value[0], fallback[0]),
    readFiniteNumber("vector[1]", value[1], fallback[1]),
    readFiniteNumber("vector[2]", value[2], fallback[2]),
  ];
}

export function asColor(value, fallback = [1, 1, 1, 1]) {
  if (!Array.isArray(value) && !(ArrayBuffer.isView(value) && value.length >= 3)) {
    return [...fallback];
  }
  return [
    clamp(readFiniteNumber("color[0]", value[0], fallback[0]), 0, 64),
    clamp(readFiniteNumber("color[1]", value[1], fallback[1]), 0, 64),
    clamp(readFiniteNumber("color[2]", value[2], fallback[2]), 0, 64),
    clamp(readFiniteNumber("color[3]", value[3], fallback[3] ?? 1), 0, 1),
  ];
}

export function maxComponent(value) {
  return Math.max(value?.[0] ?? 0, value?.[1] ?? 0, value?.[2] ?? 0);
}

export function deriveLegacySheenColor(baseColor, sheen, sheenTint) {
  const sheenStrength = clamp(Number(sheen) || 0, 0, 1);
  if (sheenStrength <= 0) {
    return [0, 0, 0, 1];
  }
  const tint = clamp(Number(sheenTint) || 0, 0, 1);
  const base = asColor(baseColor, [1, 1, 1, 1]);
  return [
    clamp((1 - tint) * sheenStrength + base[0] * tint * sheenStrength, 0, 1),
    clamp((1 - tint) * sheenStrength + base[1] * tint * sheenStrength, 0, 1),
    clamp((1 - tint) * sheenStrength + base[2] * tint * sheenStrength, 0, 1),
    1,
  ];
}

export function resolveSheenColor(input, fallbackBaseColor) {
  if (input?.sheenColor || input?.material?.sheenColor) {
    return asColor(input.sheenColor ?? input.material?.sheenColor, [0, 0, 0, 1]).map((value, index) =>
      index < 3 ? clamp(value, 0, 1) : 1
    );
  }
  return deriveLegacySheenColor(
    fallbackBaseColor,
    input?.sheen ?? input?.material?.sheen,
    input?.sheenTint ?? input?.material?.sheenTint
  );
}

export function resolveEnvironmentMap(input = null) {
  const source = input && typeof input === "object" ? input : null;
  const hasTexture = Boolean(source?.view || source?.texture || source?.data);
  const width = readPositiveInteger("environmentMap.width", source?.width, 1);
  const height = readPositiveInteger("environmentMap.height", source?.height, 1);
  return Object.freeze({
    enabled: hasTexture && source?.enabled !== false,
    width,
    height,
    mipLevelCount: readPositiveInteger(
      "environmentMap.mipLevelCount",
      source?.mipLevelCount,
      1
    ),
    format: typeof source?.format === "string" ? source.format : "rgba16float",
    projection: typeof source?.projection === "string" ? source.projection : "equirectangular",
    texture: source?.texture ?? null,
    view: source?.view ?? null,
    sampler: source?.sampler ?? null,
    data: source?.data ?? null,
    intensity: Math.max(0, readFiniteNumber("environmentMap.intensity", source?.intensity ?? source?.radianceScale, 1)),
    rotationRadians: readFiniteNumber("environmentMap.rotationRadians", source?.rotationRadians ?? source?.rotation, 0),
    ambientStrength: Math.max(
      0,
      readFiniteNumber("environmentMap.ambientStrength", source?.ambientStrength, 0.32)
    ),
    hasImportanceData: source?.hasImportanceData === true,
  });
}

export function resolveDeferredPathResolve(options = {}) {
  const value =
    options.deferredPathResolve ??
    options.deferredResolve ??
    options.pathResolve?.deferred ??
    true;
  return value !== false;
}

export function resolveStrictPhysicalLowSppLighting(options = {}) {
  const value =
    options.strictPhysicalLowSppLighting ??
    options.featureFlags?.["renderer.transport.strictPhysicalLowSppLighting"] ??
    options.featureFlags?.renderer?.transport?.strictPhysicalLowSppLighting ??
    false;
  return value === true;
}

export function emissionPower(emission) {
  return Math.max(0, emission?.[0] ?? 0) + Math.max(0, emission?.[1] ?? 0) + Math.max(0, emission?.[2] ?? 0);
}

export function asUnitVec3(value, fallback) {
  const vector = asVec3(value, fallback);
  return normalize(vector, fallback);
}

export function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(a, scalar) {
  return [a[0] * scalar, a[1] * scalar, a[2] * scalar];
}

export function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function normalize(value, fallback = [0, 0, 1]) {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (!Number.isFinite(length) || length <= 0.000001) {
    return [...fallback];
  }
  return [value[0] / length, value[1] / length, value[2] / length];
}

export function hashUint32(value) {
  let x = value >>> 0;
  x = ((((x >>> 16) ^ x) >>> 0) * 0x45d9f3b) >>> 0;
  x = ((((x >>> 16) ^ x) >>> 0) * 0x45d9f3b) >>> 0;
  return ((x >>> 16) ^ x) >>> 0;
}

export function mixSeed(pixelId, sampleId, bounce, frameIndex, dimension) {
  let x =
    ((pixelId >>> 0) * 747796405) ^
    ((sampleId >>> 0) * 2891336453) ^
    ((bounce >>> 0) * 277803737) ^
    ((frameIndex >>> 0) * 1442695041) ^
    ((dimension >>> 0) * 1597334677);
  x >>>= 0;
  x ^= x >>> 16;
  x = (x * 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = (x * 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

export function random01FromSeed(seed) {
  return (hashUint32(seed) & 0x00ffffff) / 16777215;
}

export function getArrayLikeLength(value) {
  return Array.isArray(value) || ArrayBuffer.isView(value) ? value.length : 0;
}

export function readVector(values, index, componentCount, fallback) {
  const offset = index * componentCount;
  const output = [];
  for (let component = 0; component < componentCount; component += 1) {
    output.push(readFiniteNumber("mesh attribute", values?.[offset + component], fallback[component] ?? 0));
  }
  return output;
}

export function readVector2(values, index, fallback = [0, 0]) {
  return readVector(values, index, 2, fallback);
}

export function triangleBounds(v0, v1, v2) {
  return {
    min: [
      Math.min(v0[0], v1[0], v2[0]),
      Math.min(v0[1], v1[1], v2[1]),
      Math.min(v0[2], v1[2], v2[2]),
    ],
    max: [
      Math.max(v0[0], v1[0], v2[0]),
      Math.max(v0[1], v1[1], v2[1]),
      Math.max(v0[2], v1[2], v2[2]),
    ],
  };
}

export function mergeBounds(left, right) {
  if (!left) {
    return {
      min: [...right.min],
      max: [...right.max],
    };
  }
  return {
    min: [
      Math.min(left.min[0], right.min[0]),
      Math.min(left.min[1], right.min[1]),
      Math.min(left.min[2], right.min[2]),
    ],
    max: [
      Math.max(left.max[0], right.max[0]),
      Math.max(left.max[1], right.max[1]),
      Math.max(left.max[2], right.max[2]),
    ],
  };
}

export function boundsCentroid(bounds) {
  return [
    (bounds.min[0] + bounds.max[0]) * 0.5,
    (bounds.min[1] + bounds.max[1]) * 0.5,
    (bounds.min[2] + bounds.max[2]) * 0.5,
  ];
}
