const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;
const DEFAULT_MAX_DEPTH = 6;
const DEFAULT_TILE_SIZE = 128;
const DEFAULT_SAMPLES_PER_PIXEL = 1;
const MAX_SAMPLES_PER_PIXEL = 256;
const DEFAULT_BRDF_LUT_SIZE = 256;
const DEFAULT_MAX_FRAME_PASSES_PER_SUBMISSION = 256;
const DEFAULT_SCENE_OBJECT_CAPACITY = 128;
const DEFAULT_ENVIRONMENT_PORTAL_CAPACITY = 32;
const WORKGROUP_SIZE = 64;
export const rendererWavefrontComputeMode = "webgpu-compute";
export const rendererWavefrontComputeWorkgroupSize = WORKGROUP_SIZE;
export const rendererWavefrontComputeStatsStride = 8;
const RAY_RECORD_BYTES = 80;
const HIT_RECORD_BYTES = 256;
const SCENE_OBJECT_RECORD_BYTES = 144;
const MESH_VERTEX_RECORD_BYTES = 48;
const MESH_RANGE_RECORD_BYTES = 240;
const TRIANGLE_RECORD_BYTES = 352;
const GPU_MATERIAL_RECORD_BYTES = 192;
const BVH_NODE_RECORD_BYTES = 48;
const BVH_LEAF_REF_RECORD_BYTES = 16;
const EMISSIVE_TRIANGLE_INDEX_BYTES = 4;
const ENVIRONMENT_PORTAL_RECORD_BYTES = 96;
const ACCUMULATION_RECORD_BYTES = 16;
const PATH_VERTEX_RECORD_BYTES = 16;
const GPU_SUBMITTED_WORK_TIMEOUT_MS = 5_000;
const GPU_READBACK_COMPLETION_TIMEOUT_MS = 60_000;
const GPU_MAX_SUBMITTED_WORK_TIMEOUT_MS = 60_000;
const CONFIG_BUFFER_BYTES = 320;
const COUNTER_DISPATCH_ARGS_OFFSET = 16;
const INDIRECT_DISPATCH_ARGS_BYTES = 12;
const COUNTER_BUFFER_BYTES = 32;
const TRACE_STORAGE_BUFFER_BINDINGS = 10;
const BRDF_LUT_UPLOAD_CACHE = new Map();
const HIT_TYPE_SURFACE = 0;
const HIT_TYPE_EMISSIVE = 1;
const MATERIAL_DIFFUSE = 0;
const MATERIAL_METAL = 1;
const MATERIAL_DIELECTRIC = 2;
const MATERIAL_TRANSPARENT = 3;
const MATERIAL_EMISSIVE = 4;
const OBJECT_KIND_SPHERE = 1;
const OBJECT_KIND_BOX = 2;

const DEFAULT_CAMERA = Object.freeze({
  position: Object.freeze([0, 1.15, 5.6]),
  target: Object.freeze([0, 0.65, 0]),
  up: Object.freeze([0, 1, 0]),
  fovYDegrees: 46,
});

const DEFAULT_ENVIRONMENT_COLOR = Object.freeze([0.35, 0.43, 0.49, 1]);
const DEFAULT_AMBIENT_COLOR = Object.freeze([0.018, 0.022, 0.026, 1]);
const DEFAULT_ENVIRONMENT_LIGHTING = Object.freeze({
  horizonColor: Object.freeze([0.46, 0.56, 0.68, 1]),
  zenithColor: Object.freeze([0.04, 0.08, 0.16, 1]),
  sunDirection: Object.freeze([0.22, 0.88, 0.42]),
  sunColor: Object.freeze([2.8, 2.65, 2.35, 1]),
  intensity: 1,
  mode: 0,
  exposure: 1,
  sunlitBaseline: 0.16,
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

function readPositiveInteger(name, value, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return numeric;
}

function readNonNegativeInteger(name, value, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return numeric;
}

function readFiniteNumber(name, value, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`${name} must be a finite number.`);
  }
  return numeric;
}

function assertAnalyticDisplayQualityPolicy(options = {}) {
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function asVec3(value, fallback) {
  if (!Array.isArray(value) && !(ArrayBuffer.isView(value) && value.length >= 3)) {
    return [...fallback];
  }
  return [
    readFiniteNumber("vector[0]", value[0], fallback[0]),
    readFiniteNumber("vector[1]", value[1], fallback[1]),
    readFiniteNumber("vector[2]", value[2], fallback[2]),
  ];
}

function asColor(value, fallback = [1, 1, 1, 1]) {
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

function maxComponent(value) {
  return Math.max(value?.[0] ?? 0, value?.[1] ?? 0, value?.[2] ?? 0);
}

function deriveLegacySheenColor(baseColor, sheen, sheenTint) {
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

function resolveSheenColor(input, fallbackBaseColor) {
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

function resolveEnvironmentMap(input = null) {
  const source = input && typeof input === "object" ? input : null;
  const hasTexture = Boolean(source?.view || source?.texture || source?.data);
  const width = readPositiveInteger("environmentMap.width", source?.width, 1);
  const height = readPositiveInteger("environmentMap.height", source?.height, 1);
  return Object.freeze({
    enabled: hasTexture && source?.enabled !== false,
    width,
    height,
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
  });
}

function resolveDeferredPathResolve(options = {}) {
  const value =
    options.deferredPathResolve ??
    options.deferredResolve ??
    options.pathResolve?.deferred ??
    true;
  return value !== false;
}

function emissionPower(emission) {
  return Math.max(0, emission?.[0] ?? 0) + Math.max(0, emission?.[1] ?? 0) + Math.max(0, emission?.[2] ?? 0);
}

function asUnitVec3(value, fallback) {
  const vector = asVec3(value, fallback);
  return normalize(vector, fallback);
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(a, scalar) {
  return [a[0] * scalar, a[1] * scalar, a[2] * scalar];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(value, fallback = [0, 0, 1]) {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (!Number.isFinite(length) || length <= 0.000001) {
    return [...fallback];
  }
  return [value[0] / length, value[1] / length, value[2] / length];
}

function hashUint32(value) {
  let x = value >>> 0;
  x = ((((x >>> 16) ^ x) >>> 0) * 0x45d9f3b) >>> 0;
  x = ((((x >>> 16) ^ x) >>> 0) * 0x45d9f3b) >>> 0;
  return ((x >>> 16) ^ x) >>> 0;
}

function mixSeed(pixelId, sampleId, bounce, frameIndex, dimension) {
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

function random01FromSeed(seed) {
  return (hashUint32(seed) & 0x00ffffff) / 16777215;
}

function getArrayLikeLength(value) {
  return Array.isArray(value) || ArrayBuffer.isView(value) ? value.length : 0;
}

function readVector(values, index, componentCount, fallback) {
  const offset = index * componentCount;
  const output = [];
  for (let component = 0; component < componentCount; component += 1) {
    output.push(readFiniteNumber("mesh attribute", values?.[offset + component], fallback[component] ?? 0));
  }
  return output;
}

function readVector2(values, index, fallback = [0, 0]) {
  return readVector(values, index, 2, fallback);
}

function triangleBounds(v0, v1, v2) {
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

function mergeBounds(left, right) {
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

function boundsCentroid(bounds) {
  return [
    (bounds.min[0] + bounds.max[0]) * 0.5,
    (bounds.min[1] + bounds.max[1]) * 0.5,
    (bounds.min[2] + bounds.max[2]) * 0.5,
  ];
}

function readMaterialKind(value) {
  if (typeof value === "number") {
    return clamp(Math.trunc(value), MATERIAL_DIFFUSE, MATERIAL_EMISSIVE);
  }
  switch (value) {
    case "metal":
    case "reflective":
      return MATERIAL_METAL;
    case "dielectric":
    case "refractive":
    case "glass":
      return MATERIAL_DIELECTRIC;
    case "transparent":
    case "transmission":
      return MATERIAL_TRANSPARENT;
    case "emissive":
    case "light":
      return MATERIAL_EMISSIVE;
    case "diffuse":
    default:
      return MATERIAL_DIFFUSE;
  }
}

function readObjectKind(value) {
  if (typeof value === "number") {
    return value === OBJECT_KIND_BOX ? OBJECT_KIND_BOX : OBJECT_KIND_SPHERE;
  }
  switch (value) {
    case "box":
    case "aabb":
    case "bounds":
      return OBJECT_KIND_BOX;
    case "sphere":
    default:
      return OBJECT_KIND_SPHERE;
  }
}

function deriveBounds(input) {
  if (Array.isArray(input?.min) && Array.isArray(input?.max)) {
    const min = asVec3(input.min, [-0.5, -0.5, -0.5]);
    const max = asVec3(input.max, [0.5, 0.5, 0.5]);
    return {
      center: scale(add(min, max), 0.5),
      halfExtent: scale(subtract(max, min), 0.5).map((value) => Math.max(value, 0.001)),
    };
  }

  if (Array.isArray(input?.bounds?.min) && Array.isArray(input?.bounds?.max)) {
    return deriveBounds(input.bounds);
  }

  return null;
}

export function normalizeWavefrontSceneObject(input = {}, index = 0) {
  const bounds = deriveBounds(input);
  const kind = readObjectKind(input.kind ?? input.type ?? (bounds ? "box" : "sphere"));
  const center = asVec3(input.center ?? input.position ?? bounds?.center, [0, 0, 0]);
  const radius = readFiniteNumber("radius", input.radius, 0.5);
  const halfExtent =
    kind === OBJECT_KIND_SPHERE
      ? [Math.max(radius, 0.001), Math.max(radius, 0.001), Math.max(radius, 0.001)]
      : asVec3(
          input.halfExtent ?? input.halfExtents ?? input.extents ?? bounds?.halfExtent,
          [0.5, 0.5, 0.5]
        ).map((value) => Math.max(value, 0.001));
  const materialKindInput = input.materialKind ?? input.material?.kind;
  const materialKind = readMaterialKind(materialKindInput);
  const color = asColor(
    input.color ??
      input.baseColor ??
      input.albedo ??
      input.material?.color ??
      input.material?.baseColor,
    [0.72, 0.72, 0.68, 1]
  );
  const emission = asColor(
    input.emission ?? input.emissive ?? input.material?.emission ?? input.material?.emissive,
    [0, 0, 0, 1]
  );
  const opacity = clamp(readFiniteNumber("opacity", input.opacity ?? input.material?.opacity, color[3] ?? 1), 0, 1);
  const transmission = clamp(
    readFiniteNumber("transmission", input.transmission ?? input.material?.transmission, 0),
    0,
    1
  );
  const sheenColor = resolveSheenColor(input, color);
  const specularColor = asColor(
    input.specularColor ?? input.material?.specularColor,
    [1, 1, 1, 1]
  ).map((value, componentIndex) => (componentIndex < 3 ? clamp(value, 0, 1) : 1));
  const resolvedMaterialKind =
    emission[0] > 0 || emission[1] > 0 || emission[2] > 0
      ? MATERIAL_EMISSIVE
      : materialKindInput === undefined || materialKindInput === null
        ? transmission > 0.001 || opacity < 0.999
          ? MATERIAL_TRANSPARENT
          : materialKind
        : materialKind;

  return Object.freeze({
    id: readNonNegativeInteger("id", input.id, index + 1),
    kind,
    materialKind: resolvedMaterialKind,
    flags: readNonNegativeInteger("flags", input.flags, 0),
    center: Object.freeze(center),
    halfExtent: Object.freeze(halfExtent),
    color: Object.freeze(color),
    emission: Object.freeze(emission),
    roughness: clamp(readFiniteNumber("roughness", input.roughness ?? input.material?.roughness, 0.72), 0, 1),
    metallic: clamp(readFiniteNumber("metallic", input.metallic ?? input.material?.metallic, 0), 0, 1),
    opacity,
    ior: clamp(readFiniteNumber("ior", input.ior ?? input.material?.ior, 1.45), 1, 3),
    sheen: clamp(readFiniteNumber("sheen", input.sheen ?? input.material?.sheen, 0), 0, 1),
    sheenTint: clamp(readFiniteNumber("sheenTint", input.sheenTint ?? input.material?.sheenTint, 0), 0, 1),
    sheenColor: Object.freeze(sheenColor),
    clearcoat: clamp(readFiniteNumber("clearcoat", input.clearcoat ?? input.material?.clearcoat, 0), 0, 1),
    clearcoatRoughness: clamp(
      readFiniteNumber(
        "clearcoatRoughness",
        input.clearcoatRoughness ?? input.material?.clearcoatRoughness,
        0.08
      ),
      0,
      1
    ),
    specular: clamp(readFiniteNumber("specular", input.specular ?? input.material?.specular, 1), 0, 1),
    specularColor: Object.freeze(specularColor),
    transmission,
  });
}

export function createDefaultWavefrontSceneObjects() {
  return Object.freeze([
    normalizeWavefrontSceneObject({
      type: "box",
      id: 1,
      center: [0, -0.08, 0],
      halfExtent: [3.25, 0.08, 3.25],
      color: [0.45, 0.53, 0.54, 1],
      roughness: 0.5,
    }),
    normalizeWavefrontSceneObject({
      type: "box",
      id: 2,
      center: [0, 1.25, -1.65],
      halfExtent: [2.45, 1.45, 0.08],
      color: [0.42, 0.41, 0.38, 1],
      roughness: 0.85,
    }),
    normalizeWavefrontSceneObject({
      type: "sphere",
      id: 3,
      center: [-0.9, 0.72, 0.05],
      radius: 0.72,
      color: [0.76, 0.72, 0.64, 1],
      materialKind: "metal",
      roughness: 0.08,
      metallic: 0.7,
    }),
    normalizeWavefrontSceneObject({
      type: "sphere",
      id: 4,
      center: [0.85, 0.65, -0.05],
      radius: 0.58,
      color: [0.68, 0.82, 0.86, 0.72],
      materialKind: "dielectric",
      roughness: 0.02,
      opacity: 0.72,
      ior: 1.35,
    }),
    normalizeWavefrontSceneObject({
      type: "sphere",
      id: 5,
      center: [0, 2.55, -0.65],
      radius: 0.34,
      color: [1, 0.94, 0.78, 1],
      emission: [7.2, 6.5, 4.2, 1],
      materialKind: "emissive",
    }),
  ]);
}

export function normalizeWavefrontMesh(input = {}, meshIndex = 0) {
  const positions = input.positions;
  const positionLength = getArrayLikeLength(positions);
  if (positionLength < 9 || positionLength % 3 !== 0) {
    throw new Error("Wavefront mesh positions must contain at least three vec3 vertices.");
  }

  const vertexCount = positionLength / 3;
  const indices =
    getArrayLikeLength(input.indices) > 0
      ? Array.from(input.indices, (value) => readNonNegativeInteger("mesh index", value, 0))
      : Array.from({ length: vertexCount }, (_, index) => index);
  if (indices.length < 3 || indices.length % 3 !== 0) {
    throw new Error("Wavefront mesh indices must contain complete triangles.");
  }
  if (indices.some((index) => index >= vertexCount)) {
    throw new Error("Wavefront mesh index references a vertex outside the position buffer.");
  }

  const normals =
    getArrayLikeLength(input.normals) >= positionLength
      ? Array.from(input.normals, (value) => readFiniteNumber("mesh normal", value, 0))
      : null;
  const uvs =
    getArrayLikeLength(input.uvs ?? input.texcoords ?? input.uv) >= vertexCount * 2
      ? Array.from(input.uvs ?? input.texcoords ?? input.uv, (value) =>
          readFiniteNumber("mesh uv", value, 0)
        )
      : null;
  const materialKindInput = input.materialKind ?? input.material?.kind;
  const materialKind = readMaterialKind(materialKindInput);
  const color = asColor(
    input.color ??
      input.baseColor ??
      input.albedo ??
      input.material?.color ??
      input.material?.baseColor,
    [0.72, 0.72, 0.68, 1]
  );
  const emission = asColor(
    input.emission ?? input.emissive ?? input.material?.emission ?? input.material?.emissive,
    [0, 0, 0, 1]
  );
  const opacity = clamp(readFiniteNumber("opacity", input.opacity ?? input.material?.opacity, color[3] ?? 1), 0, 1);
  const transmission = clamp(
    readFiniteNumber("transmission", input.transmission ?? input.material?.transmission, 0),
    0,
    1
  );
  const sheenColor = resolveSheenColor(input, color);
  const specularColor = asColor(
    input.specularColor ?? input.material?.specularColor,
    [1, 1, 1, 1]
  ).map((value, componentIndex) => (componentIndex < 3 ? clamp(value, 0, 1) : 1));
  const resolvedMaterialKind =
    emission[0] > 0 || emission[1] > 0 || emission[2] > 0
      ? MATERIAL_EMISSIVE
      : materialKindInput === undefined || materialKindInput === null
        ? transmission > 0.001 || opacity < 0.999
          ? MATERIAL_TRANSPARENT
          : materialKind
        : materialKind;

  return Object.freeze({
    id: readNonNegativeInteger("mesh id", input.id, meshIndex + 1),
    positions: Object.freeze(Array.from(positions, (value) => readFiniteNumber("mesh position", value, 0))),
    indices: Object.freeze(indices),
    normals: normals ? Object.freeze(normals) : null,
    uvs: uvs ? Object.freeze(uvs) : null,
    materialKind: resolvedMaterialKind,
    flags: readNonNegativeInteger("mesh flags", input.flags, 0),
    materialRefId: readNonNegativeInteger(
      "mesh materialRefId",
      input.materialRefId ?? input.material?.id ?? input.materialId,
      meshIndex
    ),
    mediumRefId: readNonNegativeInteger(
      "mesh mediumRefId",
      input.mediumRefId ?? input.medium?.id ?? input.mediumId,
      0
    ),
    color: Object.freeze(color),
    emission: Object.freeze(emission),
    roughness: clamp(readFiniteNumber("roughness", input.roughness ?? input.material?.roughness, 0.72), 0, 1),
    metallic: clamp(readFiniteNumber("metallic", input.metallic ?? input.material?.metallic, 0), 0, 1),
    opacity,
    ior: clamp(readFiniteNumber("ior", input.ior ?? input.material?.ior, 1.45), 1, 3),
    sheen: clamp(readFiniteNumber("sheen", input.sheen ?? input.material?.sheen, 0), 0, 1),
    sheenTint: clamp(readFiniteNumber("sheenTint", input.sheenTint ?? input.material?.sheenTint, 0), 0, 1),
    sheenColor: Object.freeze(sheenColor),
    clearcoat: clamp(readFiniteNumber("clearcoat", input.clearcoat ?? input.material?.clearcoat, 0), 0, 1),
    clearcoatRoughness: clamp(
      readFiniteNumber(
        "clearcoatRoughness",
        input.clearcoatRoughness ?? input.material?.clearcoatRoughness,
        0.08
      ),
      0,
      1
    ),
    specular: clamp(readFiniteNumber("specular", input.specular ?? input.material?.specular, 1), 0, 1),
    specularColor: Object.freeze(specularColor),
    transmission,
    baseColorTexture: input.baseColorTexture ?? input.material?.baseColorTexture ?? null,
    metallicRoughnessTexture:
      input.metallicRoughnessTexture ?? input.material?.metallicRoughnessTexture ?? null,
    normalTexture: input.normalTexture ?? input.material?.normalTexture ?? null,
    occlusionTexture: input.occlusionTexture ?? input.material?.occlusionTexture ?? null,
    emissiveTexture: input.emissiveTexture ?? input.material?.emissiveTexture ?? null,
  });
}

function clampUnit(value) {
  return clamp(Number(value) || 0, 0, 1);
}

function srgbToLinear(value) {
  const channel = clampUnit(value);
  if (channel <= 0.04045) {
    return channel / 12.92;
  }
  return ((channel + 0.055) / 1.055) ** 2.4;
}

function sampleTextureRgba(texture, uv = [0, 0], colorSpace = "linear") {
  if (
    !texture ||
    !Number.isFinite(texture.width) ||
    !Number.isFinite(texture.height) ||
    !texture.data ||
    texture.width <= 0 ||
    texture.height <= 0
  ) {
    return [1, 1, 1, 1];
  }
  const u = ((uv[0] % 1) + 1) % 1;
  const v = ((uv[1] % 1) + 1) % 1;
  const x = Math.min(texture.width - 1, Math.max(0, Math.round(u * (texture.width - 1))));
  const y = Math.min(texture.height - 1, Math.max(0, Math.round((1 - v) * (texture.height - 1))));
  const offset = (y * texture.width + x) * 4;
  const data = texture.data;
  const color = [
    (data[offset] ?? 255) / 255,
    (data[offset + 1] ?? 255) / 255,
    (data[offset + 2] ?? 255) / 255,
    (data[offset + 3] ?? 255) / 255,
  ];
  if (colorSpace === "srgb") {
    return [srgbToLinear(color[0]), srgbToLinear(color[1]), srgbToLinear(color[2]), color[3]];
  }
  return color;
}

function normalizeVectorOrFallback(vector, fallback) {
  return normalize(Array.isArray(vector) ? vector : fallback, fallback);
}

function buildTriangleTangentBasis(v0, v1, v2, uv0, uv1, uv2, fallbackNormal) {
  const edge1 = subtract(v1, v0);
  const edge2 = subtract(v2, v0);
  const deltaUv1 = [uv1[0] - uv0[0], uv1[1] - uv0[1]];
  const deltaUv2 = [uv2[0] - uv0[0], uv2[1] - uv0[1]];
  const determinant = deltaUv1[0] * deltaUv2[1] - deltaUv1[1] * deltaUv2[0];
  if (Math.abs(determinant) < 1e-6) {
    const tangentFallback = Math.abs(fallbackNormal[1]) < 0.999 ? [0, 1, 0] : [1, 0, 0];
    const tangent = normalize(cross(tangentFallback, fallbackNormal), [1, 0, 0]);
    const bitangent = normalize(cross(fallbackNormal, tangent), [0, 0, 1]);
    return { tangent, bitangent };
  }
  const inverse = 1 / determinant;
  const tangent = normalize(
    [
      inverse * (edge1[0] * deltaUv2[1] - edge2[0] * deltaUv1[1]),
      inverse * (edge1[1] * deltaUv2[1] - edge2[1] * deltaUv1[1]),
      inverse * (edge1[2] * deltaUv2[1] - edge2[2] * deltaUv1[1]),
    ],
    [1, 0, 0]
  );
  const bitangent = normalize(
    [
      inverse * (-edge1[0] * deltaUv2[0] + edge2[0] * deltaUv1[0]),
      inverse * (-edge1[1] * deltaUv2[0] + edge2[1] * deltaUv1[0]),
      inverse * (-edge1[2] * deltaUv2[0] + edge2[2] * deltaUv1[0]),
    ],
    [0, 0, 1]
  );
  return { tangent, bitangent };
}

function applyNormalMap(normal, tangent, bitangent, normalTexture, uv) {
  if (!normalTexture) {
    return normalizeVectorOrFallback(normal, [0, 1, 0]);
  }
  const sample = sampleTextureRgba(normalTexture, uv, "linear");
  const strength = clampUnit(normalTexture.scale ?? 1);
  const tangentNormal = normalize(
    [
      sample[0] * 2 - 1,
      sample[1] * 2 - 1,
      1 + (sample[2] * 2 - 1 - 1) * strength,
    ],
    [0, 0, 1]
  );
  return normalize(
    [
      tangent[0] * tangentNormal[0] + bitangent[0] * tangentNormal[1] + normal[0] * tangentNormal[2],
      tangent[1] * tangentNormal[0] + bitangent[1] * tangentNormal[1] + normal[1] * tangentNormal[2],
      tangent[2] * tangentNormal[0] + bitangent[2] * tangentNormal[1] + normal[2] * tangentNormal[2],
    ],
    normal
  );
}

function sampleBaseColor(mesh, uv) {
  const sample = mesh.baseColorTexture ? sampleTextureRgba(mesh.baseColorTexture, uv, "srgb") : [1, 1, 1, 1];
  return [
    clampUnit(mesh.color[0] * sample[0]),
    clampUnit(mesh.color[1] * sample[1]),
    clampUnit(mesh.color[2] * sample[2]),
    clampUnit((mesh.color[3] ?? 1) * sample[3]),
  ];
}

function sampleSurfaceMaterial(mesh, uv) {
  const textureSample = mesh.metallicRoughnessTexture
    ? sampleTextureRgba(mesh.metallicRoughnessTexture, uv, "linear")
    : [1, 1, 1, 1];
  return {
    roughness: clamp(mesh.roughness * textureSample[1], 0, 1),
    metallic: clamp(mesh.metallic * textureSample[2], 0, 1),
  };
}

function averageColors(colors) {
  const count = Math.max(colors.length, 1);
  return colors.reduce(
    (accumulator, color) => [
      accumulator[0] + color[0] / count,
      accumulator[1] + color[1] / count,
      accumulator[2] + color[2] / count,
      accumulator[3] + color[3] / count,
    ],
    [0, 0, 0, 0]
  );
}

function averageNumbers(values, fallback = 0) {
  if (!Array.isArray(values) || values.length === 0) {
    return fallback;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function createMeshTriangleRecords(meshes) {
  const source = Array.isArray(meshes) ? meshes : [];
  let nextTriangleId = 0;
  return source.flatMap((meshInput, meshIndex) => {
    const mesh = normalizeWavefrontMesh(meshInput, meshIndex);
    const triangles = [];
    for (let index = 0; index < mesh.indices.length; index += 3) {
      const a = mesh.indices[index];
      const b = mesh.indices[index + 1];
      const c = mesh.indices[index + 2];
      const v0 = readVector(mesh.positions, a, 3, [0, 0, 0]);
      const v1 = readVector(mesh.positions, b, 3, [0, 0, 0]);
      const v2 = readVector(mesh.positions, c, 3, [0, 0, 0]);
      const faceNormal = normalize(cross(subtract(v1, v0), subtract(v2, v0)), [0, 1, 0]);
      const n0 = mesh.normals ? normalize(readVector(mesh.normals, a, 3, faceNormal), faceNormal) : faceNormal;
      const n1 = mesh.normals ? normalize(readVector(mesh.normals, b, 3, faceNormal), faceNormal) : faceNormal;
      const n2 = mesh.normals ? normalize(readVector(mesh.normals, c, 3, faceNormal), faceNormal) : faceNormal;
      const uv0 = mesh.uvs ? readVector2(mesh.uvs, a) : [0, 0];
      const uv1 = mesh.uvs ? readVector2(mesh.uvs, b) : [0, 0];
      const uv2 = mesh.uvs ? readVector2(mesh.uvs, c) : [0, 0];
      const tangentBasis = buildTriangleTangentBasis(v0, v1, v2, uv0, uv1, uv2, faceNormal);
      const shadedN0 = applyNormalMap(n0, tangentBasis.tangent, tangentBasis.bitangent, mesh.normalTexture, uv0);
      const shadedN1 = applyNormalMap(n1, tangentBasis.tangent, tangentBasis.bitangent, mesh.normalTexture, uv1);
      const shadedN2 = applyNormalMap(n2, tangentBasis.tangent, tangentBasis.bitangent, mesh.normalTexture, uv2);
      const sampledColors = [sampleBaseColor(mesh, uv0), sampleBaseColor(mesh, uv1), sampleBaseColor(mesh, uv2)];
      const sampledMaterials = [
        sampleSurfaceMaterial(mesh, uv0),
        sampleSurfaceMaterial(mesh, uv1),
        sampleSurfaceMaterial(mesh, uv2),
      ];
      const bounds = triangleBounds(v0, v1, v2);

      triangles.push(
        Object.freeze({
          triangleId: nextTriangleId,
          meshId: mesh.id,
          materialKind: mesh.materialKind,
          flags: mesh.flags,
          materialRefId: mesh.materialRefId,
          mediumRefId: mesh.mediumRefId,
          materialSlot: meshIndex,
          v0: Object.freeze(v0),
          v1: Object.freeze(v1),
          v2: Object.freeze(v2),
          n0: Object.freeze(shadedN0),
          n1: Object.freeze(shadedN1),
          n2: Object.freeze(shadedN2),
          uv0: Object.freeze(uv0),
          uv1: Object.freeze(uv1),
          uv2: Object.freeze(uv2),
          color: Object.freeze(averageColors(sampledColors)),
          emission: mesh.emission,
          material: Object.freeze([
            averageNumbers(sampledMaterials.map((sample) => sample.roughness), mesh.roughness),
            averageNumbers(sampledMaterials.map((sample) => sample.metallic), mesh.metallic),
            mesh.opacity,
            mesh.ior,
          ]),
          materialResponse: Object.freeze([
            mesh.sheenColor[0] ?? 0,
            mesh.sheenColor[1] ?? 0,
            mesh.sheenColor[2] ?? 0,
            mesh.clearcoat,
          ]),
          materialExtension: Object.freeze([
            mesh.clearcoatRoughness,
            mesh.specular,
            mesh.transmission,
            0,
          ]),
          specularColor: Object.freeze([
            mesh.specularColor[0] ?? 1,
            mesh.specularColor[1] ?? 1,
            mesh.specularColor[2] ?? 1,
            1,
          ]),
          bounds: Object.freeze({
            min: Object.freeze(bounds.min),
            max: Object.freeze(bounds.max),
          }),
          centroid: Object.freeze(boundsCentroid(bounds)),
        })
      );
      nextTriangleId += 1;
    }
    return triangles;
  });
}

function chooseSplitAxis(triangles) {
  const centroidBounds = triangles.reduce(
    (bounds, triangle) => {
      const pointBounds = { min: triangle.centroid, max: triangle.centroid };
      return mergeBounds(bounds, pointBounds);
    },
    null
  );
  const extent = subtract(centroidBounds.max, centroidBounds.min);
  if (extent[0] >= extent[1] && extent[0] >= extent[2]) {
    return 0;
  }
  return extent[1] >= extent[2] ? 1 : 2;
}

function buildBvh(triangles, maxLeafTriangles = 4) {
  if (triangles.length === 0) {
    return Object.freeze({ nodes: Object.freeze([]), triangles: Object.freeze([]) });
  }

  const nodes = [];
  const orderedTriangles = [];

  function buildNode(nodeTriangles) {
    const nodeIndex = nodes.length;
    nodes.push(null);
    const bounds = nodeTriangles.reduce((current, triangle) => mergeBounds(current, triangle.bounds), null);

    if (nodeTriangles.length <= maxLeafTriangles) {
      const firstTriangle = orderedTriangles.length;
      orderedTriangles.push(...nodeTriangles);
      nodes[nodeIndex] = Object.freeze({
        bounds: Object.freeze({
          min: Object.freeze(bounds.min),
          max: Object.freeze(bounds.max),
        }),
        firstTriangle,
        triangleCount: nodeTriangles.length,
        leftChild: 0,
        rightChild: 0,
      });
      return nodeIndex;
    }

    const axis = chooseSplitAxis(nodeTriangles);
    const sorted = [...nodeTriangles].sort((left, right) => left.centroid[axis] - right.centroid[axis]);
    const midpoint = Math.max(1, Math.floor(sorted.length / 2));
    const leftChild = buildNode(sorted.slice(0, midpoint));
    const rightChild = buildNode(sorted.slice(midpoint));
    nodes[nodeIndex] = Object.freeze({
      bounds: Object.freeze({
        min: Object.freeze(bounds.min),
        max: Object.freeze(bounds.max),
      }),
      firstTriangle: leftChild,
      triangleCount: 0,
      leftChild,
      rightChild,
    });
    return nodeIndex;
  }

  buildNode(triangles);
  return Object.freeze({
    nodes: Object.freeze(nodes),
    triangles: Object.freeze(orderedTriangles),
  });
}

export function createWavefrontMeshAcceleration(meshes = []) {
  const source = Array.isArray(meshes) ? meshes : [meshes];
  const triangles = createMeshTriangleRecords(source);
  return buildBvh(triangles);
}

function estimateMeshSourceShape(meshes) {
  const source = Array.isArray(meshes) ? meshes : [];
  return source.reduce(
    (shape, meshInput, meshIndex) => {
      const mesh = normalizeWavefrontMesh(meshInput, meshIndex);
      return {
        vertexCount: shape.vertexCount + mesh.positions.length / 3,
        indexCount: shape.indexCount + mesh.indices.length,
        meshCount: shape.meshCount + 1,
        triangleCount: shape.triangleCount + mesh.indices.length / 3,
      };
    },
    {
      vertexCount: 0,
      indexCount: 0,
      meshCount: 0,
      triangleCount: 0,
    }
  );
}

function estimateBinaryBvhNodeCapacity(triangleCount) {
  return triangleCount <= 0 ? 0 : Math.max(1, triangleCount * 2 - 1);
}

function nextPowerOfTwo(value) {
  if (value <= 1) {
    return Math.max(0, value);
  }
  return 2 ** Math.ceil(Math.log2(value));
}

function textureComponentToByte(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  if (numeric >= 0 && numeric <= 1) {
    return Math.max(0, Math.min(255, Math.round(numeric * 255)));
  }
  return Math.max(0, Math.min(255, Math.round(numeric)));
}

function createSolidTextureSample(width, height, rgba) {
  const data = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = rgba[0];
    data[offset + 1] = rgba[1];
    data[offset + 2] = rgba[2];
    data[offset + 3] = rgba[3];
  }
  return Object.freeze({
    width,
    height,
    data,
  });
}

function normalizeTextureSampleInput(texture, fallbackColor) {
  if (
    !texture ||
    !Number.isFinite(texture.width) ||
    !Number.isFinite(texture.height) ||
    texture.width <= 0 ||
    texture.height <= 0
  ) {
    return createSolidTextureSample(1, 1, fallbackColor);
  }

  const pixelCount = Math.trunc(texture.width) * Math.trunc(texture.height) * 4;
  const source =
    ArrayBuffer.isView(texture.data) || Array.isArray(texture.data) ? texture.data : null;
  if (!source || source.length < pixelCount) {
    return createSolidTextureSample(1, 1, fallbackColor);
  }

  const data = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) {
    data[index] = textureComponentToByte(source[index], fallbackColor[index % 4]);
  }

  return Object.freeze({
    width: Math.trunc(texture.width),
    height: Math.trunc(texture.height),
    data,
  });
}

function buildTextureAtlas(textures, fallbackColor) {
  const padding = 1;
  const defaultTexture = createSolidTextureSample(1, 1, fallbackColor);
  const uniqueEntries = [{ source: null, texture: defaultTexture }];
  const bySource = new Map();

  for (const texture of Array.isArray(textures) ? textures : []) {
    if (!texture || bySource.has(texture)) {
      continue;
    }
    const normalized = normalizeTextureSampleInput(texture, fallbackColor);
    bySource.set(texture, uniqueEntries.length);
    uniqueEntries.push({ source: texture, texture: normalized });
  }

  const totalArea = uniqueEntries.reduce((sum, entry) => {
    return sum + (entry.texture.width + padding * 2) * (entry.texture.height + padding * 2);
  }, 0);
  const maxTileWidth = uniqueEntries.reduce((maxWidth, entry) => {
    return Math.max(maxWidth, entry.texture.width + padding * 2);
  }, 1);
  const targetWidth = Math.max(
    maxTileWidth,
    nextPowerOfTwo(Math.max(maxTileWidth, Math.ceil(Math.sqrt(totalArea))))
  );

  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  let atlasWidth = 0;
  const placements = uniqueEntries.map((entry) => {
    const tileWidth = entry.texture.width + padding * 2;
    const tileHeight = entry.texture.height + padding * 2;
    if (cursorX > 0 && cursorX + tileWidth > targetWidth) {
      cursorX = 0;
      cursorY += rowHeight;
      rowHeight = 0;
    }
    const placement = Object.freeze({
      x: cursorX,
      y: cursorY,
      tileWidth,
      tileHeight,
      width: entry.texture.width,
      height: entry.texture.height,
    });
    cursorX += tileWidth;
    atlasWidth = Math.max(atlasWidth, cursorX);
    rowHeight = Math.max(rowHeight, tileHeight);
    return placement;
  });

  const atlasHeight = Math.max(1, cursorY + rowHeight);
  const atlasData = new Uint8Array(Math.max(1, atlasWidth * atlasHeight * 4));

  const writePixel = (x, y, rgba) => {
    const offset = (y * atlasWidth + x) * 4;
    atlasData[offset] = rgba[0];
    atlasData[offset + 1] = rgba[1];
    atlasData[offset + 2] = rgba[2];
    atlasData[offset + 3] = rgba[3];
  };

  const rects = placements.map((placement, entryIndex) => {
    const { texture } = uniqueEntries[entryIndex];
    for (let y = 0; y < placement.tileHeight; y += 1) {
      for (let x = 0; x < placement.tileWidth; x += 1) {
        const sampleX = Math.max(0, Math.min(texture.width - 1, x - padding));
        const sampleY = Math.max(0, Math.min(texture.height - 1, y - padding));
        const sourceOffset = (sampleY * texture.width + sampleX) * 4;
        writePixel(placement.x + x, placement.y + y, texture.data.slice(sourceOffset, sourceOffset + 4));
      }
    }
    return Object.freeze([
      (placement.x + padding) / Math.max(1, atlasWidth),
      (placement.y + padding) / Math.max(1, atlasHeight),
      placement.width / Math.max(1, atlasWidth),
      placement.height / Math.max(1, atlasHeight),
    ]);
  });

  const rectBySource = new Map();
  uniqueEntries.forEach((entry, index) => {
    if (entry.source) {
      rectBySource.set(entry.source, rects[index]);
    }
  });

  return Object.freeze({
    width: Math.max(1, atlasWidth),
    height: Math.max(1, atlasHeight),
    data: atlasData,
    defaultRect: rects[0],
    resolveRect(texture) {
      return rectBySource.get(texture) ?? rects[0];
    },
  });
}

export function createWavefrontGpuMaterialSource(meshes = []) {
  const source = Array.isArray(meshes) ? meshes : [meshes];
  const normalized = source.map((meshInput, meshIndex) => normalizeWavefrontMesh(meshInput, meshIndex));
  const baseColorAtlas = buildTextureAtlas(
    normalized.map((mesh) => mesh.baseColorTexture),
    [255, 255, 255, 255]
  );
  const metallicRoughnessAtlas = buildTextureAtlas(
    normalized.map((mesh) => mesh.metallicRoughnessTexture),
    [255, 255, 255, 255]
  );
  const normalAtlas = buildTextureAtlas(
    normalized.map((mesh) => mesh.normalTexture),
    [128, 128, 255, 255]
  );
  const occlusionAtlas = buildTextureAtlas(
    normalized.map((mesh) => mesh.occlusionTexture),
    [255, 255, 255, 255]
  );
  const emissiveAtlas = buildTextureAtlas(
    normalized.map((mesh) => mesh.emissiveTexture),
    [255, 255, 255, 255]
  );
  const bytes = new ArrayBuffer(Math.max(1, normalized.length) * GPU_MATERIAL_RECORD_BYTES);
  const floatView = new Float32Array(bytes);

  normalized.forEach((mesh, meshIndex) => {
    const byteOffset = meshIndex * GPU_MATERIAL_RECORD_BYTES;
    writeVec4(floatView, byteOffset, mesh.color);
    writeVec4(floatView, byteOffset + 16, mesh.emission);
    writeVec4(floatView, byteOffset + 32, [
      mesh.roughness,
      mesh.metallic,
      mesh.opacity,
      mesh.ior,
    ]);
    writeVec4(floatView, byteOffset + 48, [
      mesh.sheenColor[0] ?? 0,
      mesh.sheenColor[1] ?? 0,
      mesh.sheenColor[2] ?? 0,
      mesh.clearcoat,
    ]);
    writeVec4(floatView, byteOffset + 64, [
      mesh.clearcoatRoughness,
      mesh.specular,
      mesh.transmission,
      0,
    ]);
    writeVec4(floatView, byteOffset + 80, [
      mesh.specularColor[0] ?? 1,
      mesh.specularColor[1] ?? 1,
      mesh.specularColor[2] ?? 1,
      1,
    ]);
    writeVec4(floatView, byteOffset + 96, baseColorAtlas.resolveRect(mesh.baseColorTexture));
    writeVec4(
      floatView,
      byteOffset + 112,
      metallicRoughnessAtlas.resolveRect(mesh.metallicRoughnessTexture)
    );
    writeVec4(floatView, byteOffset + 128, normalAtlas.resolveRect(mesh.normalTexture));
    writeVec4(floatView, byteOffset + 144, occlusionAtlas.resolveRect(mesh.occlusionTexture));
    writeVec4(floatView, byteOffset + 160, emissiveAtlas.resolveRect(mesh.emissiveTexture));
    writeVec4(floatView, byteOffset + 176, [
      clampUnit(mesh.normalTexture?.scale ?? mesh.normalTexture?.strength ?? 1),
      clampUnit(mesh.occlusionTexture?.strength ?? 1),
      clampUnit(mesh.emissiveTexture?.strength ?? 1),
      0,
    ]);
  });

  return Object.freeze({
    buffer: bytes,
    count: normalized.length,
    recordBytes: GPU_MATERIAL_RECORD_BYTES,
    records: Object.freeze(normalized),
    baseColorAtlas,
    metallicRoughnessAtlas,
    normalAtlas,
    occlusionAtlas,
    emissiveAtlas,
  });
}

function estimateBvhLeafSortCapacity(triangleCount) {
  return triangleCount <= 0 ? 0 : nextPowerOfTwo(triangleCount);
}

export function createWavefrontBvhSortStages(itemCountInput) {
  const itemCount = readNonNegativeInteger("itemCount", itemCountInput, 0);
  const sortCount = estimateBvhLeafSortCapacity(itemCount);
  if (sortCount <= 1) {
    return Object.freeze([]);
  }

  const stages = [];
  for (let sequenceSize = 2; sequenceSize <= sortCount; sequenceSize *= 2) {
    for (
      let compareDistance = sequenceSize / 2;
      compareDistance >= 1;
      compareDistance /= 2
    ) {
      stages.push(
        Object.freeze({
          compareDistance,
          sequenceSize,
        })
      );
    }
  }

  return Object.freeze(stages);
}

export function createWavefrontBvhBuildLevels(triangleCountInput) {
  const triangleCount = readNonNegativeInteger("triangleCount", triangleCountInput, 0);
  const internalCount = Math.max(0, triangleCount - 1);
  if (internalCount === 0) {
    return Object.freeze([]);
  }

  const levels = [];
  let depth = 0;
  while (Math.pow(2, depth) - 1 < internalCount) {
    depth += 1;
  }

  for (let level = depth - 1; level >= 0; level -= 1) {
    const start = Math.pow(2, level) - 1;
    const end = Math.min(Math.pow(2, level + 1) - 2, internalCount - 1);
    if (end >= start) {
      levels.push(
        Object.freeze({
          start,
          count: end - start + 1,
        })
      );
    }
  }

  return Object.freeze(levels);
}

function resolveAccelerationBuildMode(options = {}) {
  const mode = options.accelerationBuildMode ?? (options.displayQuality === true ? "gpu" : "cpu-debug");
  if (mode !== "gpu" && mode !== "cpu-debug") {
    throw new Error("accelerationBuildMode must be either \"gpu\" or \"cpu-debug\".");
  }
  if (options.displayQuality === true && mode !== "gpu") {
    throw new Error("Display-quality path tracing requires GPU-built mesh acceleration.");
  }
  return mode;
}

export function createWavefrontGpuMeshSource(meshes = [], gpuMaterialSourceInput = null) {
  const source = Array.isArray(meshes) ? meshes : [meshes];
  const normalized = source.map((meshInput, meshIndex) => normalizeWavefrontMesh(meshInput, meshIndex));
  const gpuMaterialSource = gpuMaterialSourceInput ?? createWavefrontGpuMaterialSource(normalized);
  const vertexCount = normalized.reduce((count, mesh) => count + mesh.positions.length / 3, 0);
  const indexCount = normalized.reduce((count, mesh) => count + mesh.indices.length, 0);
  const triangleCount = Math.floor(indexCount / 3);
  const vertexBytes = new ArrayBuffer(Math.max(1, vertexCount) * MESH_VERTEX_RECORD_BYTES);
  const indexBytes = new ArrayBuffer(Math.max(1, indexCount) * 4);
  const meshBytes = new ArrayBuffer(Math.max(1, normalized.length) * MESH_RANGE_RECORD_BYTES);
  const vertexFloats = new Float32Array(vertexBytes);
  const indexUints = new Uint32Array(indexBytes);
  const meshUints = new Uint32Array(meshBytes);
  const meshFloats = new Float32Array(meshBytes);

  let vertexCursor = 0;
  let indexCursor = 0;
  let triangleCursor = 0;

  normalized.forEach((mesh, meshIndex) => {
    const meshVertexBase = vertexCursor;
    const meshIndexBase = indexCursor;
    const meshTriangleBase = triangleCursor;
    const meshVertexCount = mesh.positions.length / 3;

    for (let vertexIndex = 0; vertexIndex < meshVertexCount; vertexIndex += 1) {
      const recordOffset = (vertexCursor + vertexIndex) * (MESH_VERTEX_RECORD_BYTES / 4);
      const position = readVector(mesh.positions, vertexIndex, 3, [0, 0, 0]);
      const normal = mesh.normals ? readVector(mesh.normals, vertexIndex, 3, [0, 0, 0]) : [0, 0, 0];
      const uv = mesh.uvs ? readVector2(mesh.uvs, vertexIndex) : [0, 0];
      vertexFloats[recordOffset] = position[0];
      vertexFloats[recordOffset + 1] = position[1];
      vertexFloats[recordOffset + 2] = position[2];
      vertexFloats[recordOffset + 3] = 1;
      vertexFloats[recordOffset + 4] = normal[0];
      vertexFloats[recordOffset + 5] = normal[1];
      vertexFloats[recordOffset + 6] = normal[2];
      vertexFloats[recordOffset + 7] = mesh.normals ? 1 : 0;
      vertexFloats[recordOffset + 8] = uv[0];
      vertexFloats[recordOffset + 9] = uv[1];
      vertexFloats[recordOffset + 10] = mesh.uvs ? 1 : 0;
      vertexFloats[recordOffset + 11] = 0;
    }

    mesh.indices.forEach((indexValue, localIndex) => {
      indexUints[indexCursor + localIndex] = meshVertexBase + indexValue;
    });

    const meshOffset = meshIndex * (MESH_RANGE_RECORD_BYTES / 4);
    meshUints[meshOffset] = mesh.id;
    meshUints[meshOffset + 1] = mesh.materialKind;
    meshUints[meshOffset + 2] = mesh.flags;
    meshUints[meshOffset + 3] = mesh.materialRefId;
    meshUints[meshOffset + 4] = mesh.mediumRefId;
    meshUints[meshOffset + 5] = meshIndexBase;
    meshUints[meshOffset + 6] = mesh.indices.length;
    meshUints[meshOffset + 7] = meshTriangleBase;
    meshUints[meshOffset + 8] = mesh.indices.length / 3;
    meshUints[meshOffset + 9] = meshVertexBase;
    meshUints[meshOffset + 10] = meshVertexCount;
    meshUints[meshOffset + 11] = meshIndex;
    const floatOffset = meshOffset;
    writeVec4(meshFloats, floatOffset * 4 + 48, mesh.color);
    writeVec4(meshFloats, floatOffset * 4 + 64, mesh.emission);
    writeVec4(meshFloats, floatOffset * 4 + 80, [
      mesh.roughness,
      mesh.metallic,
      mesh.opacity,
      mesh.ior,
    ]);
    writeVec4(meshFloats, floatOffset * 4 + 96, [
      mesh.sheenColor[0] ?? 0,
      mesh.sheenColor[1] ?? 0,
      mesh.sheenColor[2] ?? 0,
      mesh.clearcoat,
    ]);
    writeVec4(meshFloats, floatOffset * 4 + 112, [
      mesh.clearcoatRoughness,
      mesh.specular,
      mesh.transmission,
      0,
    ]);
    writeVec4(meshFloats, floatOffset * 4 + 128, [
      mesh.specularColor[0] ?? 1,
      mesh.specularColor[1] ?? 1,
      mesh.specularColor[2] ?? 1,
      1,
    ]);
    writeVec4(
      meshFloats,
      floatOffset * 4 + 144,
      gpuMaterialSource.baseColorAtlas.resolveRect(mesh.baseColorTexture)
    );
    writeVec4(
      meshFloats,
      floatOffset * 4 + 160,
      gpuMaterialSource.metallicRoughnessAtlas.resolveRect(mesh.metallicRoughnessTexture)
    );
    writeVec4(
      meshFloats,
      floatOffset * 4 + 176,
      gpuMaterialSource.normalAtlas.resolveRect(mesh.normalTexture)
    );
    writeVec4(
      meshFloats,
      floatOffset * 4 + 192,
      gpuMaterialSource.occlusionAtlas.resolveRect(mesh.occlusionTexture)
    );
    writeVec4(
      meshFloats,
      floatOffset * 4 + 208,
      gpuMaterialSource.emissiveAtlas.resolveRect(mesh.emissiveTexture)
    );
    writeVec4(meshFloats, floatOffset * 4 + 224, [
      clampUnit(mesh.normalTexture?.scale ?? mesh.normalTexture?.strength ?? 1),
      clampUnit(mesh.occlusionTexture?.strength ?? 1),
      clampUnit(mesh.emissiveTexture?.strength ?? 1),
      0,
    ]);

    vertexCursor += meshVertexCount;
    indexCursor += mesh.indices.length;
    triangleCursor += mesh.indices.length / 3;
  });

  return Object.freeze({
    vertices: Object.freeze({
      buffer: vertexBytes,
      count: vertexCount,
      recordBytes: MESH_VERTEX_RECORD_BYTES,
    }),
    indices: Object.freeze({
      buffer: indexBytes,
      count: indexCount,
      recordBytes: 4,
    }),
    meshes: Object.freeze({
      buffer: meshBytes,
      records: Object.freeze(normalized),
      count: normalized.length,
      recordBytes: MESH_RANGE_RECORD_BYTES,
    }),
    triangleCount,
    bvhNodeCapacity: estimateBinaryBvhNodeCapacity(triangleCount),
  });
}

export function createWavefrontEmissiveTriangleIndexSource(meshes = [], capacityInput) {
  const source = Array.isArray(meshes) ? meshes : [meshes];
  const normalized = source.map((meshInput, meshIndex) => normalizeWavefrontMesh(meshInput, meshIndex));
  const indices = [];
  let triangleCursor = 0;

  normalized.forEach((mesh) => {
    const triangleCount = Math.floor(mesh.indices.length / 3);
    const isEmissive =
      mesh.materialKind === MATERIAL_EMISSIVE || emissionPower(mesh.emission) > 0.0001;
    if (isEmissive) {
      for (let triangleOffset = 0; triangleOffset < triangleCount; triangleOffset += 1) {
        indices.push(triangleCursor + triangleOffset);
      }
    }
    triangleCursor += triangleCount;
  });

  const capacity = Math.max(
    indices.length,
    readNonNegativeInteger("emissiveTriangleCapacity", capacityInput, indices.length)
  );
  const bytes = new ArrayBuffer(capacity * EMISSIVE_TRIANGLE_INDEX_BYTES);
  const uints = new Uint32Array(bytes);
  uints.fill(0xffffffff);
  indices.forEach((triangleIndex, index) => {
    uints[index] = triangleIndex;
  });

  return Object.freeze({
    buffer: bytes,
    indices: Object.freeze(indices),
    count: indices.length,
    capacity,
    recordBytes: EMISSIVE_TRIANGLE_INDEX_BYTES,
  });
}

function normalizeSceneObjects(sceneObjects, useDefaultScene = true) {
  const source =
    Array.isArray(sceneObjects) && sceneObjects.length > 0
      ? sceneObjects
      : useDefaultScene
        ? createDefaultWavefrontSceneObjects()
        : [];
  return source.map((object, index) => normalizeWavefrontSceneObject(object, index));
}

function normalizeMeshes(options = {}) {
  if (Array.isArray(options.meshes)) {
    return options.meshes;
  }
  if (options.mesh) {
    return [options.mesh];
  }
  return [];
}

function resolveEnvironmentLighting(input, environmentColor, ambientColor) {
  const source = input ?? {};
  return Object.freeze({
    environmentColor: Object.freeze(asColor(source.environmentColor, environmentColor)),
    ambientColor: Object.freeze(asColor(source.ambientColor, ambientColor)),
    horizonColor: Object.freeze(asColor(source.horizonColor, environmentColor)),
    zenithColor: Object.freeze(asColor(source.zenithColor, DEFAULT_ENVIRONMENT_LIGHTING.zenithColor)),
    sunDirection: Object.freeze(asUnitVec3(source.sunDirection, DEFAULT_ENVIRONMENT_LIGHTING.sunDirection)),
    sunColor: Object.freeze(asColor(source.sunColor, DEFAULT_ENVIRONMENT_LIGHTING.sunColor)),
    intensity: Math.max(0.0001, readFiniteNumber("environmentLighting.intensity", source.intensity, DEFAULT_ENVIRONMENT_LIGHTING.intensity)),
    mode: readNonNegativeInteger("environmentLighting.mode", source.mode, DEFAULT_ENVIRONMENT_LIGHTING.mode),
    exposure: Math.max(0.0001, readFiniteNumber("environmentLighting.exposure", source.exposure, DEFAULT_ENVIRONMENT_LIGHTING.exposure)),
    sunlitBaseline: Math.max(
      0,
      readFiniteNumber(
        "environmentLighting.sunlitBaseline",
        source.sunlitBaseline ?? source.daylightBaseline,
        DEFAULT_ENVIRONMENT_LIGHTING.sunlitBaseline
      )
    ),
  });
}

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

function resolveEnvironmentPortalMode(value, hasPortals) {
  if (value === undefined || value === null) {
    return hasPortals ? 2 : 0;
  }
  if (Number.isInteger(value) && value >= 0 && value <= 2) {
    return value;
  }
  if (value === "disabled") {
    return 0;
  }
  if (value === "guide") {
    return 1;
  }
  if (value === "guide-and-gate" || value === "gate") {
    return 2;
  }
  throw new Error(
    "environmentPortalMode must be disabled, guide, guide-and-gate, or an integer between 0 and 2."
  );
}

function orthogonalPortalTangent(normal) {
  if (Math.abs(normal[1]) < 0.92) {
    return normalize(cross([0, 1, 0], normal), [1, 0, 0]);
  }
  return normalize(cross([1, 0, 0], normal), [0, 0, 1]);
}

function resolvePortalTangent(value, normal) {
  const fallback = orthogonalPortalTangent(normal);
  const tangent = asUnitVec3(value, fallback);
  const projected = subtract(tangent, scale(normal, dot(tangent, normal)));
  return normalize(projected, fallback);
}

function readPositiveFiniteNumber(name, value, fallback) {
  const numeric = readFiniteNumber(name, value, fallback);
  if (numeric <= 0) {
    throw new Error(`${name} must be a positive finite number.`);
  }
  return numeric;
}

function readPortalExtent(name, value, halfName, halfValue) {
  if (value !== undefined && value !== null) {
    return readPositiveFiniteNumber(name, value, 1);
  }
  return readPositiveFiniteNumber(halfName, halfValue, 0.5) * 2;
}

function normalizeEnvironmentPortal(portal, index) {
  if (!portal || typeof portal !== "object") {
    throw new Error(`environmentPortals[${index}] must be an object.`);
  }
  const shape = portal.shape ?? portal.kind ?? "rectangle";
  if (shape !== "rectangle") {
    throw new Error(`environmentPortals[${index}].shape must be "rectangle".`);
  }
  const position = asVec3(portal.position ?? portal.center, [0, 0, 0]);
  const normal = asUnitVec3(portal.normal, [0, 0, 1]);
  const tangent = resolvePortalTangent(portal.tangent, normal);
  const bitangent = normalize(cross(normal, tangent), [0, 1, 0]);
  const width = readPortalExtent(
    `environmentPortals[${index}].width`,
    portal.width,
    `environmentPortals[${index}].halfWidth`,
    portal.halfWidth
  );
  const height = readPortalExtent(
    `environmentPortals[${index}].height`,
    portal.height,
    `environmentPortals[${index}].halfHeight`,
    portal.halfHeight
  );
  const radianceScale = Math.max(
    0,
    readFiniteNumber(
      `environmentPortals[${index}].radianceScale`,
      portal.radianceScale ?? portal.intensity,
      1
    )
  );
  return Object.freeze({
    kind: 1,
    flags: portal.twoSided === false ? 0 : 1,
    position: Object.freeze([position[0], position[1], position[2], width * height]),
    normal: Object.freeze([normal[0], normal[1], normal[2], radianceScale]),
    tangent: Object.freeze([tangent[0], tangent[1], tangent[2], width * 0.5]),
    bitangent: Object.freeze([bitangent[0], bitangent[1], bitangent[2], height * 0.5]),
    color: Object.freeze(asColor(portal.color, [1, 1, 1, 1])),
  });
}

function normalizeEnvironmentPortals(value) {
  if (value === undefined || value === null) {
    return Object.freeze([]);
  }
  if (!Array.isArray(value)) {
    throw new Error("environmentPortals must be an array when provided.");
  }
  return Object.freeze(value.map(normalizeEnvironmentPortal));
}

function packEnvironmentPortals(portals, capacity) {
  const bytes = new ArrayBuffer(capacity * ENVIRONMENT_PORTAL_RECORD_BYTES);
  const data = new DataView(bytes);
  const floatView = new Float32Array(bytes);
  portals.forEach((portal, index) => {
    const byteOffset = index * ENVIRONMENT_PORTAL_RECORD_BYTES;
    const floatOffset = byteOffset / Float32Array.BYTES_PER_ELEMENT;
    data.setUint32(byteOffset, portal.kind, true);
    data.setUint32(byteOffset + 4, portal.flags, true);
    data.setUint32(byteOffset + 8, 0, true);
    data.setUint32(byteOffset + 12, 0, true);
    writeVec4(floatView, floatOffset + 4, portal.position);
    writeVec4(floatView, floatOffset + 8, portal.normal);
    writeVec4(floatView, floatOffset + 12, portal.tangent);
    writeVec4(floatView, floatOffset + 16, portal.bitangent);
    writeVec4(floatView, floatOffset + 20, portal.color);
  });
  return Object.freeze({
    buffer: bytes,
    portals,
    count: portals.length,
    capacity,
    recordBytes: ENVIRONMENT_PORTAL_RECORD_BYTES,
  });
}

function getCanvasDimension(canvas, key, fallback) {
  const value = Number(canvas?.[key]);
  if (Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  return fallback;
}

function resolveCamera(input, width, height) {
  const camera = input ?? DEFAULT_CAMERA;
  const position = asVec3(camera.position, DEFAULT_CAMERA.position);
  const target = asVec3(camera.target, DEFAULT_CAMERA.target);
  const upInput = normalize(asVec3(camera.up, DEFAULT_CAMERA.up), DEFAULT_CAMERA.up);
  const forward = normalize(subtract(target, position), [0, 0, -1]);
  const right = normalize(cross(forward, upInput), [1, 0, 0]);
  const up = normalize(cross(right, forward), [0, 1, 0]);
  const fovYDegrees = clamp(
    readFiniteNumber("camera.fovYDegrees", camera.fovYDegrees ?? camera.fov, DEFAULT_CAMERA.fovYDegrees),
    10,
    120
  );
  const aspect = width / Math.max(1, height);
  const tanHalfFovY = Math.tan((fovYDegrees * Math.PI) / 360);

  return Object.freeze({
    position: Object.freeze(position),
    forward: Object.freeze(forward),
    right: Object.freeze(right),
    up: Object.freeze(up),
    fovYDegrees,
    aspect,
    tanHalfFovY,
  });
}

export function estimateWavefrontPathTracingMemory(options = {}) {
  const tilePixelCapacity = readPositiveInteger(
    "tilePixelCapacity",
    options.tilePixelCapacity,
    DEFAULT_TILE_SIZE * DEFAULT_TILE_SIZE
  );
  const maxDepth = clamp(
    readPositiveInteger("maxDepth", options.maxDepth, DEFAULT_MAX_DEPTH),
    1,
    16
  );
  const sceneObjectCapacity = readPositiveInteger(
    "sceneObjectCapacity",
    options.sceneObjectCapacity,
    DEFAULT_SCENE_OBJECT_CAPACITY
  );
  const triangleCapacity = readNonNegativeInteger("triangleCapacity", options.triangleCapacity, 0);
  const bvhNodeCapacity = readNonNegativeInteger("bvhNodeCapacity", options.bvhNodeCapacity, 0);
  const bvhLeafSortCapacity = readNonNegativeInteger(
    "bvhLeafSortCapacity",
    options.bvhLeafSortCapacity,
    0
  );
  const emissiveTriangleCapacity = readNonNegativeInteger(
    "emissiveTriangleCapacity",
    options.emissiveTriangleCapacity,
    0
  );
  const environmentPortalCapacity = readNonNegativeInteger(
    "environmentPortalCapacity",
    options.environmentPortalCapacity,
    0
  );
  const materialCapacity = readNonNegativeInteger("materialCapacity", options.materialCapacity, 0);
  const queueBytes = tilePixelCapacity * RAY_RECORD_BYTES;
  const hitBytes = tilePixelCapacity * HIT_RECORD_BYTES;
  const accumulationBytes = tilePixelCapacity * ACCUMULATION_RECORD_BYTES;
  const pathVertexBytes = tilePixelCapacity * (maxDepth + 1) * PATH_VERTEX_RECORD_BYTES;
  const sceneObjectBytes = sceneObjectCapacity * SCENE_OBJECT_RECORD_BYTES;
  const triangleBytes = triangleCapacity * TRIANGLE_RECORD_BYTES;
  const materialTableBytes = materialCapacity * GPU_MATERIAL_RECORD_BYTES;
  const bvhNodeBytes = bvhNodeCapacity * BVH_NODE_RECORD_BYTES;
  const bvhLeafReferenceBytes = bvhLeafSortCapacity * BVH_LEAF_REF_RECORD_BYTES;
  const emissiveTriangleMetadataBytes =
    emissiveTriangleCapacity * BVH_NODE_RECORD_BYTES;
  const environmentPortalBytes =
    environmentPortalCapacity * ENVIRONMENT_PORTAL_RECORD_BYTES;

  return Object.freeze({
    queueBytes,
    queuePairBytes: queueBytes * 2,
    hitBytes,
    accumulationBytes,
    pathVertexBytes,
    sceneObjectBytes,
    triangleBytes,
    materialTableBytes,
    bvhNodeBytes,
    bvhLeafReferenceBytes,
    emissiveTriangleMetadataBytes,
    environmentPortalBytes,
    configBytes: CONFIG_BUFFER_BYTES,
    counterBytes: COUNTER_BUFFER_BYTES,
    indirectDispatchBytes: INDIRECT_DISPATCH_ARGS_BYTES,
    totalHotBufferBytes:
      queueBytes * 2 +
      hitBytes +
      accumulationBytes +
      pathVertexBytes +
      sceneObjectBytes +
      triangleBytes +
      materialTableBytes +
      bvhNodeBytes +
      bvhLeafReferenceBytes +
      emissiveTriangleMetadataBytes +
      environmentPortalBytes +
      CONFIG_BUFFER_BYTES +
      COUNTER_BUFFER_BYTES +
      INDIRECT_DISPATCH_ARGS_BYTES,
  });
}

export function createWavefrontPathTracingComputeConfig(options = {}) {
  assertAnalyticDisplayQualityPolicy(options);
  const accelerationBuildMode = resolveAccelerationBuildMode(options);
  const canvas = options.canvas;
  const width = readPositiveInteger("width", options.width, getCanvasDimension(canvas, "width", DEFAULT_WIDTH));
  const height = readPositiveInteger("height", options.height, getCanvasDimension(canvas, "height", DEFAULT_HEIGHT));
  const maxDepth = clamp(readPositiveInteger("maxDepth", options.maxDepth, DEFAULT_MAX_DEPTH), 1, 16);
  const tileSize = clamp(readPositiveInteger("tileSize", options.tileSize, DEFAULT_TILE_SIZE), 16, 512);
  const samplesPerPixel = clamp(
    readPositiveInteger("samplesPerPixel", options.samplesPerPixel, DEFAULT_SAMPLES_PER_PIXEL),
    1,
    MAX_SAMPLES_PER_PIXEL
  );
  const maxFramePassesPerSubmission = clamp(
    readPositiveInteger(
      "maxFramePassesPerSubmission",
      options.maxFramePassesPerSubmission,
      DEFAULT_MAX_FRAME_PASSES_PER_SUBMISSION
    ),
    1,
    4096
  );
  const tilePixelCapacity = readPositiveInteger(
    "tilePixelCapacity",
    options.tilePixelCapacity,
    tileSize * tileSize
  );
  const meshes = normalizeMeshes(options);
  const meshSourceShape = estimateMeshSourceShape(meshes);
  const gpuMaterialSource =
    meshes.length > 0
      ? createWavefrontGpuMaterialSource(meshes)
      : createWavefrontGpuMaterialSource([]);
  const gpuMeshSource =
    meshes.length > 0
      ? createWavefrontGpuMeshSource(meshes, gpuMaterialSource)
      : createWavefrontGpuMeshSource([]);
  const meshAcceleration =
    accelerationBuildMode === "cpu-debug"
      ? createWavefrontMeshAcceleration(meshes)
      : Object.freeze({ nodes: Object.freeze([]), triangles: Object.freeze([]) });
  const emissiveTriangleIndices = createWavefrontEmissiveTriangleIndexSource(
    meshes,
    options.emissiveTriangleCapacity
  );
  const triangleCount =
    accelerationBuildMode === "gpu"
      ? meshSourceShape.triangleCount
      : meshAcceleration.triangles.length;
  const bvhNodeCount =
    accelerationBuildMode === "gpu"
      ? estimateBinaryBvhNodeCapacity(triangleCount)
      : meshAcceleration.nodes.length;
  const sceneObjects = Object.freeze(
    normalizeSceneObjects(options.sceneObjects, meshes.length === 0)
  );
  const sceneObjectCapacity = Math.max(
    sceneObjects.length,
    readPositiveInteger("sceneObjectCapacity", options.sceneObjectCapacity, DEFAULT_SCENE_OBJECT_CAPACITY)
  );
  const triangleCapacity = Math.max(
    triangleCount,
    readNonNegativeInteger("triangleCapacity", options.triangleCapacity, triangleCount)
  );
  const bvhNodeCapacity = Math.max(
    accelerationBuildMode === "gpu" ? estimateBinaryBvhNodeCapacity(triangleCount) : bvhNodeCount,
    readNonNegativeInteger(
      "bvhNodeCapacity",
      options.bvhNodeCapacity,
      accelerationBuildMode === "gpu" ? estimateBinaryBvhNodeCapacity(triangleCount) : bvhNodeCount
    )
  );
  const bvhLeafSortCapacity =
    accelerationBuildMode === "gpu" ? estimateBvhLeafSortCapacity(triangleCount) : 0;
  const bvhSortStages =
    accelerationBuildMode === "gpu"
      ? createWavefrontBvhSortStages(triangleCount)
      : Object.freeze([]);
  const bvhBuildLevels =
    accelerationBuildMode === "gpu"
      ? createWavefrontBvhBuildLevels(triangleCount)
      : Object.freeze([]);
  const camera = resolveCamera(options.camera, width, height);
  const environmentColor = Object.freeze(asColor(options.environmentColor, DEFAULT_ENVIRONMENT_COLOR));
  const ambientColor = Object.freeze(asColor(options.ambientColor, DEFAULT_AMBIENT_COLOR));
  const environmentLighting = resolveEnvironmentLighting(
    options.environmentLighting,
    environmentColor,
    ambientColor
  );
  const environmentPortals = normalizeEnvironmentPortals(
    options.environmentPortals ??
      options.environmentLightPortals ??
      options.environmentLighting?.environmentPortals
  );
  const environmentPortalCapacity = Math.max(
    environmentPortals.length,
    readNonNegativeInteger(
      "environmentPortalCapacity",
      options.environmentPortalCapacity,
      DEFAULT_ENVIRONMENT_PORTAL_CAPACITY
    )
  );
  const environmentPortalMode = resolveEnvironmentPortalMode(
    options.environmentPortalMode ??
      options.portalMode ??
      options.environmentLighting?.environmentPortalMode,
    environmentPortals.length > 0
  );
  const environmentMap = resolveEnvironmentMap(
    options.environmentMap ??
      options.environmentTexture ??
      options.environmentLighting?.environmentMap
  );
  const deferredPathResolve = resolveDeferredPathResolve(options);

  return Object.freeze({
    mode: rendererWavefrontComputeMode,
    width,
    height,
    maxDepth,
    tileSize,
    samplesPerPixel,
    maxFramePassesPerSubmission,
    tilePixelCapacity,
    sceneObjects,
    sceneObjectCount: sceneObjects.length,
    sceneObjectCapacity,
    accelerationBuildMode,
    gpuAccelerationBuildRequired: accelerationBuildMode === "gpu" && triangleCount > 0,
    gpuMeshSource,
    gpuMaterialSource,
    meshAcceleration,
    emissiveTriangleIndices,
    emissiveTriangleCount: emissiveTriangleIndices.count,
    emissiveTriangleCapacity: emissiveTriangleIndices.capacity,
    triangleCount,
    triangleCapacity,
    bvhNodeCount,
    bvhNodeCapacity,
    bvhLeafSortCapacity,
    bvhSortStages,
    bvhBuildLevels,
    camera,
    environmentColor: environmentLighting.environmentColor,
    ambientColor: environmentLighting.ambientColor,
    environmentLighting,
    environmentPortals,
    environmentPortalCount: environmentPortals.length,
    environmentPortalCapacity,
    environmentPortalMode,
    environmentMap,
    deferredPathResolve,
    displayQuality: options.displayQuality === true,
    requiresMeshBvhForDisplayQuality: true,
    denoise: options.denoise !== false,
    frameIndex: readNonNegativeInteger("frameIndex", options.frameIndex, 0),
    memory: estimateWavefrontPathTracingMemory({
      tilePixelCapacity,
      maxDepth,
      sceneObjectCapacity,
      triangleCapacity,
      materialCapacity: gpuMaterialSource.count,
      bvhNodeCapacity,
      bvhLeafSortCapacity,
      emissiveTriangleCapacity: emissiveTriangleIndices.capacity,
      environmentPortalCapacity,
    }),
  });
}

export function supportsWavefrontPathTracingCompute(options = {}) {
  const navigatorRef = options.navigator ?? globalThis.navigator;
  return typeof navigatorRef?.gpu?.requestAdapter === "function";
}

function getGpuUsageConstants() {
  if (
    typeof GPUBufferUsage === "undefined" ||
    typeof GPUTextureUsage === "undefined" ||
    typeof GPUShaderStage === "undefined"
  ) {
    throw new Error("WebGPU runtime unavailable. Required GPU constants are missing.");
  }
  if (typeof GPUBufferUsage.INDIRECT !== "number") {
    throw new Error("WebGPU runtime unavailable. GPUBufferUsage.INDIRECT is missing.");
  }

  return {
    buffer: GPUBufferUsage,
    texture: GPUTextureUsage,
    shader: GPUShaderStage,
    map: typeof GPUMapMode === "undefined" ? null : GPUMapMode,
  };
}

function resolveCanvas(canvasOrSelector, documentRef = globalThis.document) {
  if (typeof canvasOrSelector === "string") {
    const resolved = documentRef?.querySelector?.(canvasOrSelector);
    if (!resolved) {
      throw new Error(`Unable to find canvas for selector: ${canvasOrSelector}`);
    }
    return resolved;
  }

  if (canvasOrSelector?.getContext) {
    return canvasOrSelector;
  }

  const fallback = documentRef?.querySelector?.("canvas[data-plasius-wavefront-path-tracing]");
  if (!fallback) {
    throw new Error("A canvas is required for WebGPU wavefront path tracing.");
  }
  return fallback;
}

function writeVec4(floatView, byteOffset, value) {
  const index = byteOffset / 4;
  floatView[index] = value[0] ?? 0;
  floatView[index + 1] = value[1] ?? 0;
  floatView[index + 2] = value[2] ?? 0;
  floatView[index + 3] = value[3] ?? 0;
}

export function packWavefrontSceneObjects(sceneObjects, capacity = sceneObjects.length) {
  const normalized =
    Array.isArray(sceneObjects) && sceneObjects.length === 0
      ? []
      : normalizeSceneObjects(sceneObjects);
  if (normalized.length > capacity) {
    throw new Error(
      `Scene object capacity ${capacity} is too small for ${normalized.length} objects.`
    );
  }

  const bytes = new ArrayBuffer(Math.max(1, capacity) * SCENE_OBJECT_RECORD_BYTES);
  const uintView = new Uint32Array(bytes);
  const floatView = new Float32Array(bytes);

  normalized.forEach((object, index) => {
    const byteOffset = index * SCENE_OBJECT_RECORD_BYTES;
    const u32 = byteOffset / 4;
    uintView[u32] = object.kind;
    uintView[u32 + 1] = object.id;
    uintView[u32 + 2] = object.materialKind;
    uintView[u32 + 3] = object.flags;
    writeVec4(floatView, byteOffset + 16, [...object.center, 0]);
    writeVec4(floatView, byteOffset + 32, [...object.halfExtent, 0]);
    writeVec4(floatView, byteOffset + 48, object.color);
    writeVec4(floatView, byteOffset + 64, object.emission);
    writeVec4(floatView, byteOffset + 80, [
      object.roughness,
      object.metallic,
      object.opacity,
      object.ior,
    ]);
    writeVec4(floatView, byteOffset + 96, [
      object.sheenColor[0] ?? 0,
      object.sheenColor[1] ?? 0,
      object.sheenColor[2] ?? 0,
      object.clearcoat,
    ]);
    writeVec4(floatView, byteOffset + 112, [
      object.clearcoatRoughness,
      object.specular,
      object.transmission,
      0,
    ]);
    writeVec4(floatView, byteOffset + 128, [
      object.specularColor[0] ?? 1,
      object.specularColor[1] ?? 1,
      object.specularColor[2] ?? 1,
      1,
    ]);
  });

  return Object.freeze({
    buffer: bytes,
    objects: Object.freeze(normalized),
    count: normalized.length,
    capacity,
  });
}

export function packWavefrontTriangles(triangles, capacity = triangles.length) {
  if (triangles.length > capacity) {
    throw new Error(`Triangle capacity ${capacity} is too small for ${triangles.length} triangles.`);
  }

  const bytes = new ArrayBuffer(Math.max(1, capacity) * TRIANGLE_RECORD_BYTES);
  const uintView = new Uint32Array(bytes);
  const floatView = new Float32Array(bytes);

  triangles.forEach((triangle, index) => {
    const byteOffset = index * TRIANGLE_RECORD_BYTES;
    const u32 = byteOffset / 4;
    uintView[u32] = triangle.triangleId;
    uintView[u32 + 1] = triangle.meshId;
    uintView[u32 + 2] = triangle.materialKind;
    uintView[u32 + 3] = triangle.flags;
    uintView[u32 + 4] = triangle.materialRefId;
    uintView[u32 + 5] = triangle.mediumRefId;
    uintView[u32 + 6] = triangle.materialSlot ?? 0;
    uintView[u32 + 7] = 0;
    writeVec4(floatView, byteOffset + 32, [...triangle.v0, 0]);
    writeVec4(floatView, byteOffset + 48, [...triangle.v1, 0]);
    writeVec4(floatView, byteOffset + 64, [...triangle.v2, 0]);
    writeVec4(floatView, byteOffset + 80, [...triangle.n0, 0]);
    writeVec4(floatView, byteOffset + 96, [...triangle.n1, 0]);
    writeVec4(floatView, byteOffset + 112, [...triangle.n2, 0]);
    writeVec4(floatView, byteOffset + 128, [...triangle.uv0, ...triangle.uv1]);
    writeVec4(floatView, byteOffset + 144, [...triangle.uv2, 0, 0]);
    writeVec4(floatView, byteOffset + 160, triangle.color);
    writeVec4(floatView, byteOffset + 176, triangle.emission);
    writeVec4(floatView, byteOffset + 192, triangle.material);
    writeVec4(floatView, byteOffset + 208, triangle.materialResponse);
    writeVec4(floatView, byteOffset + 224, triangle.materialExtension ?? [0.08, 1, 0, 0]);
    writeVec4(floatView, byteOffset + 240, triangle.specularColor ?? [1, 1, 1, 1]);
    writeVec4(floatView, byteOffset + 256, triangle.baseColorAtlas ?? [0, 0, 1, 1]);
    writeVec4(floatView, byteOffset + 272, triangle.metallicRoughnessAtlas ?? [0, 0, 1, 1]);
    writeVec4(floatView, byteOffset + 288, triangle.normalAtlas ?? [0, 0, 1, 1]);
    writeVec4(floatView, byteOffset + 304, triangle.occlusionAtlas ?? [0, 0, 1, 1]);
    writeVec4(floatView, byteOffset + 320, triangle.emissiveAtlas ?? [0, 0, 1, 1]);
    writeVec4(floatView, byteOffset + 336, triangle.textureSettings ?? [1, 1, 1, 0]);
  });

  return Object.freeze({
    buffer: bytes,
    triangles: Object.freeze(triangles),
    count: triangles.length,
    capacity,
  });
}

export function packWavefrontBvhNodes(nodes, capacity = nodes.length) {
  if (nodes.length > capacity) {
    throw new Error(`BVH node capacity ${capacity} is too small for ${nodes.length} nodes.`);
  }

  const bytes = new ArrayBuffer(Math.max(1, capacity) * BVH_NODE_RECORD_BYTES);
  const uintView = new Uint32Array(bytes);
  const floatView = new Float32Array(bytes);

  nodes.forEach((node, index) => {
    const byteOffset = index * BVH_NODE_RECORD_BYTES;
    const u32 = byteOffset / 4;
    writeVec4(floatView, byteOffset, [...node.bounds.min, 0]);
    writeVec4(floatView, byteOffset + 16, [...node.bounds.max, 0]);
    uintView[u32 + 8] = node.triangleCount > 0 ? node.firstTriangle : node.leftChild;
    uintView[u32 + 9] = node.triangleCount;
    uintView[u32 + 10] = node.rightChild;
    uintView[u32 + 11] = 0;
  });

  return Object.freeze({
    buffer: bytes,
    nodes: Object.freeze(nodes),
    count: nodes.length,
    capacity,
  });
}

function createConfigPayload(config, tile, frameIndex, buildRange = {}) {
  const bytes = new ArrayBuffer(CONFIG_BUFFER_BYTES);
  const data = new DataView(bytes);
  const floatView = new Float32Array(bytes);
  const sampleIndex = buildRange.sampleIndex ?? 0;
  const sampleWeight = buildRange.sampleWeight ?? 1;
  data.setUint32(0, config.width, true);
  data.setUint32(4, config.height, true);
  data.setUint32(8, tile.x, true);
  data.setUint32(12, tile.y, true);
  data.setUint32(16, tile.width, true);
  data.setUint32(20, tile.height, true);
  data.setUint32(24, tile.width * tile.height, true);
  data.setUint32(28, config.maxDepth, true);
  data.setUint32(32, config.sceneObjectCount, true);
  data.setUint32(36, frameIndex, true);
  data.setUint32(40, config.denoise ? 1 : 0, true);
  data.setUint32(44, config.triangleCount, true);
  data.setUint32(48, config.bvhNodeCount, true);
  data.setUint32(52, config.displayQuality ? 1 : 0, true);
  data.setUint32(56, config.gpuMeshSource.meshes.count, true);
  data.setUint32(60, config.bvhNodeCapacity, true);
  writeVec4(floatView, 64, [...config.camera.position, 1]);
  writeVec4(floatView, 80, [...config.camera.forward, 0]);
  writeVec4(floatView, 96, [...config.camera.right, 0]);
  writeVec4(floatView, 112, [...config.camera.up, 0]);
  writeVec4(floatView, 128, [
    config.camera.tanHalfFovY,
    config.camera.aspect,
    sampleWeight,
    sampleIndex,
  ]);
  writeVec4(floatView, 144, config.environmentColor);
  writeVec4(floatView, 160, config.ambientColor);
  writeVec4(floatView, 176, config.environmentLighting.horizonColor);
  writeVec4(floatView, 192, config.environmentLighting.zenithColor);
  writeVec4(floatView, 208, [
    ...config.environmentLighting.sunDirection,
    config.environmentLighting.intensity,
  ]);
  writeVec4(floatView, 224, config.environmentLighting.sunColor);
  data.setUint32(240, buildRange.start ?? 0, true);
  data.setUint32(244, buildRange.count ?? 0, true);
  data.setUint32(248, buildRange.sortItemCount ?? 0, true);
  data.setUint32(252, config.emissiveTriangleCount ?? 0, true);
  data.setUint32(256, config.environmentPortalCount ?? 0, true);
  data.setUint32(260, config.environmentPortalMode ?? 0, true);
  data.setUint32(264, 0, true);
  data.setUint32(268, 0, true);
  writeVec4(floatView, 272, [
    config.environmentMap.enabled ? 1 : 0,
    config.environmentMap.intensity,
    config.environmentMap.rotationRadians,
    config.environmentMap.ambientStrength,
  ]);
  writeVec4(floatView, 288, [
    config.deferredPathResolve ? 1 : 0,
    config.environmentLighting.sunlitBaseline,
    0,
    0,
  ]);
  writeVec4(floatView, 304, [
    config.environmentMap.width ?? 1,
    config.environmentMap.height ?? 1,
    config.environmentMap.mipLevelCount ?? 1,
    0,
  ]);
  return bytes;
}

function createTiles(width, height, tileSize) {
  const tiles = [];
  for (let y = 0; y < height; y += tileSize) {
    for (let x = 0; x < width; x += tileSize) {
      tiles.push(
        Object.freeze({
          x,
          y,
          width: Math.min(tileSize, width - x),
          height: Math.min(tileSize, height - y),
        })
      );
    }
  }
  return Object.freeze(tiles);
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

function clampTileSizeForDevice(config, device) {
  const limit = Number(device?.limits?.maxStorageBufferBindingSize);
  if (!Number.isFinite(limit) || limit <= 0) {
    return config.tileSize;
  }

  const maxPixelsByRay = Math.floor(limit / RAY_RECORD_BYTES);
  const maxPixelsByHit = Math.floor(limit / HIT_RECORD_BYTES);
  const maxPixels = Math.max(256, Math.min(maxPixelsByRay, maxPixelsByHit));
  if (config.tilePixelCapacity <= maxPixels) {
    return config.tileSize;
  }

  return Math.max(16, Math.floor(Math.sqrt(maxPixels)));
}

function createBuffer(device, usage, size, label) {
  return device.createBuffer({
    label,
    size: Math.max(4, size),
    usage,
  });
}

function alignTo(value, alignment) {
  const resolvedAlignment = Math.max(1, alignment);
  return Math.ceil(value / resolvedAlignment) * resolvedAlignment;
}

function float32ToFloat16Bits(value) {
  const floatView = new Float32Array(1);
  const intView = new Uint32Array(floatView.buffer);
  floatView[0] = Number.isFinite(value) ? value : 0;
  const x = intView[0];
  const sign = (x >> 16) & 0x8000;
  let mantissa = x & 0x7fffff;
  let exponent = (x >> 23) & 0xff;

  if (exponent === 0xff) {
    return sign | (mantissa ? 0x7e00 : 0x7c00);
  }

  exponent = exponent - 127 + 15;
  if (exponent >= 0x1f) {
    return sign | 0x7c00;
  }
  if (exponent <= 0) {
    if (exponent < -10) {
      return sign;
    }
    mantissa = (mantissa | 0x800000) >> (1 - exponent);
    return sign | ((mantissa + 0x1000) >> 13);
  }
  return sign | (exponent << 10) | ((mantissa + 0x1000) >> 13);
}

function environmentMapIntegerScale(data) {
  if (data instanceof Uint8Array) {
    return 1 / 255;
  }
  if (data instanceof Uint16Array) {
    return 1 / 65535;
  }
  return 1;
}

function createRgba8TextureUpload(source) {
  const width = Math.max(1, Math.trunc(source.width));
  const height = Math.max(1, Math.trunc(source.height));
  const bytesPerRow = alignTo(width * 4, 256);
  const bytes = new Uint8Array(bytesPerRow * height);
  const data = source.data instanceof Uint8Array ? source.data : new Uint8Array(source.data);
  for (let y = 0; y < height; y += 1) {
    const sourceOffset = y * width * 4;
    const targetOffset = y * bytesPerRow;
    bytes.set(data.subarray(sourceOffset, sourceOffset + width * 4), targetOffset);
  }
  return Object.freeze({
    bytes,
    bytesPerRow,
    width,
    height,
  });
}

function readEnvironmentMapComponent(data, index, fallback, integerScale = 1) {
  if (!data || index >= data.length) {
    return fallback;
  }
  const value = Number(data[index]);
  return Number.isFinite(value) ? Math.max(0, value) * integerScale : fallback;
}

function reflectVector(direction, normal) {
  return subtract(direction, scale(normal, 2 * dot(direction, normal)));
}

function buildOrthonormalBasis(normal) {
  const tangentFallback = Math.abs(normal[1]) < 0.999 ? [0, 1, 0] : [1, 0, 0];
  const tangent = normalize(cross(tangentFallback, normal), [1, 0, 0]);
  const bitangent = normalize(cross(normal, tangent), [0, 0, 1]);
  return { tangent, bitangent };
}

function localToWorld(local, normal) {
  const basis = buildOrthonormalBasis(normal);
  return normalize(
    add(
      add(scale(basis.tangent, local[0]), scale(basis.bitangent, local[1])),
      scale(normal, local[2])
    ),
    normal
  );
}

function radicalInverseVdc(bits) {
  let value = bits >>> 0;
  value = ((value << 16) | (value >>> 16)) >>> 0;
  value = (((value & 0x55555555) << 1) | ((value & 0xaaaaaaaa) >>> 1)) >>> 0;
  value = (((value & 0x33333333) << 2) | ((value & 0xcccccccc) >>> 2)) >>> 0;
  value = (((value & 0x0f0f0f0f) << 4) | ((value & 0xf0f0f0f0) >>> 4)) >>> 0;
  value = (((value & 0x00ff00ff) << 8) | ((value & 0xff00ff00) >>> 8)) >>> 0;
  return value * 2.3283064365386963e-10;
}

function hammersley(index, count) {
  return [index / Math.max(count, 1), radicalInverseVdc(index)];
}

function importanceSampleGgx(sample, roughness, normal) {
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

function distributionGgx(nDotH, roughness) {
  const alpha = Math.max(roughness * roughness, 0.0001);
  const alpha2 = alpha * alpha;
  const denom = (nDotH * nDotH) * (alpha2 - 1) + 1;
  return alpha2 / Math.max(Math.PI * denom * denom, 0.000001);
}

function geometrySchlickGgx(nDotV, roughness) {
  const k = ((roughness + 1) * (roughness + 1)) / 8;
  return nDotV / Math.max(nDotV * (1 - k) + k, 0.000001);
}

function geometrySmith(nDotV, nDotL, roughness) {
  return geometrySchlickGgx(nDotV, roughness) * geometrySchlickGgx(nDotL, roughness);
}

function integrateBrdfSample(nDotV, roughness, sampleCount) {
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

function createBrdfLutUploadBytes(size = DEFAULT_BRDF_LUT_SIZE, sampleCount = 1024) {
  const cacheKey = `${Math.max(1, Math.trunc(size))}:${Math.max(1, Math.trunc(sampleCount))}`;
  const cached = BRDF_LUT_UPLOAD_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }
  const width = Math.max(1, Math.trunc(size));
  const height = Math.max(1, Math.trunc(size));
  const rowBytes = width * 8;
  const bytesPerRow = alignTo(rowBytes, 256);
  const bytes = new Uint8Array(bytesPerRow * height);
  const view = new DataView(bytes.buffer);
  for (let y = 0; y < height; y += 1) {
    const roughness = (y + 0.5) / height;
    for (let x = 0; x < width; x += 1) {
      const nDotV = Math.max((x + 0.5) / width, 0.0001);
      const [scaleTerm, biasTerm] = integrateBrdfSample(nDotV, roughness, sampleCount);
      const offset = y * bytesPerRow + x * 8;
      view.setUint16(offset, float32ToFloat16Bits(scaleTerm), true);
      view.setUint16(offset + 2, float32ToFloat16Bits(biasTerm), true);
      view.setUint16(offset + 4, float32ToFloat16Bits(0), true);
      view.setUint16(offset + 6, float32ToFloat16Bits(1), true);
    }
  }
  return Object.freeze({ bytes, bytesPerRow, width, height });
}

function createLinearEnvironmentPixels(environmentMap, fallbackColor) {
  const width = Math.max(1, environmentMap.width);
  const height = Math.max(1, environmentMap.height);
  const pixels = new Float32Array(width * height * 4);
  const data = environmentMap.data;
  const integerScale = environmentMapIntegerScale(data);
  for (let index = 0; index < width * height; index += 1) {
    const sourceOffset = index * 4;
    const targetOffset = index * 4;
    pixels[targetOffset] = readEnvironmentMapComponent(data, sourceOffset, fallbackColor[0], integerScale);
    pixels[targetOffset + 1] = readEnvironmentMapComponent(data, sourceOffset + 1, fallbackColor[1], integerScale);
    pixels[targetOffset + 2] = readEnvironmentMapComponent(data, sourceOffset + 2, fallbackColor[2], integerScale);
    pixels[targetOffset + 3] = readEnvironmentMapComponent(data, sourceOffset + 3, fallbackColor[3] ?? 1, integerScale);
  }
  return pixels;
}

function environmentUvToDirection(u, v, rotationRadians = 0) {
  const angle = (u - rotationRadians / (2 * Math.PI) - 0.5) * 2 * Math.PI;
  const theta = v * Math.PI;
  const sinTheta = Math.sin(theta);
  return [
    Math.cos(angle) * sinTheta,
    Math.cos(theta),
    Math.sin(angle) * sinTheta,
  ];
}

function sampleEnvironmentPixelsBilinear(pixels, width, height, u, v) {
  const wrappedU = ((u % 1) + 1) % 1;
  const clampedV = clamp(v, 0, 1);
  const x = wrappedU * width - 0.5;
  const y = clampedV * height - 0.5;
  const x0 = ((Math.floor(x) % width) + width) % width;
  const y0 = clamp(Math.floor(y), 0, height - 1);
  const x1 = (x0 + 1) % width;
  const y1 = clamp(y0 + 1, 0, height - 1);
  const tx = x - Math.floor(x);
  const ty = y - Math.floor(y);
  const read = (px, py) => {
    const offset = (py * width + px) * 4;
    return [pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3]];
  };
  const a = read(x0, y0);
  const b = read(x1, y0);
  const c = read(x0, y1);
  const d = read(x1, y1);
  const mixPair = (first, second, factor) => first * (1 - factor) + second * factor;
  return [
    mixPair(mixPair(a[0], b[0], tx), mixPair(c[0], d[0], tx), ty),
    mixPair(mixPair(a[1], b[1], tx), mixPair(c[1], d[1], tx), ty),
    mixPair(mixPair(a[2], b[2], tx), mixPair(c[2], d[2], tx), ty),
    mixPair(mixPair(a[3], b[3], tx), mixPair(c[3], d[3], tx), ty),
  ];
}

function directionToEnvironmentUv(direction, rotationRadians = 0) {
  const unitDirection = normalize(direction, [0, 1, 0]);
  const rotationTurns = rotationRadians / (2 * Math.PI);
  const u = ((((Math.atan2(unitDirection[2], unitDirection[0]) / (2 * Math.PI)) + 0.5 + rotationTurns) % 1) + 1) % 1;
  const v = Math.acos(clamp(unitDirection[1], -1, 1)) / Math.PI;
  return [u, clamp(v, 0, 1)];
}

function sampleEnvironmentRadiance(pixels, width, height, direction, rotationRadians = 0) {
  const [u, v] = directionToEnvironmentUv(direction, rotationRadians);
  return sampleEnvironmentPixelsBilinear(pixels, width, height, u, v);
}

function createFloat16RgbaUploadFromLevels(levels) {
  return levels.map((level) => {
    const rowBytes = level.width * 8;
    const bytesPerRow = alignTo(rowBytes, 256);
    const bytes = new Uint8Array(bytesPerRow * level.height);
    const view = new DataView(bytes.buffer);
    for (let y = 0; y < level.height; y += 1) {
      for (let x = 0; x < level.width; x += 1) {
        const sourceOffset = (y * level.width + x) * 4;
        const targetOffset = y * bytesPerRow + x * 8;
        view.setUint16(targetOffset, float32ToFloat16Bits(level.data[sourceOffset]), true);
        view.setUint16(targetOffset + 2, float32ToFloat16Bits(level.data[sourceOffset + 1]), true);
        view.setUint16(targetOffset + 4, float32ToFloat16Bits(level.data[sourceOffset + 2]), true);
        view.setUint16(targetOffset + 6, float32ToFloat16Bits(level.data[sourceOffset + 3]), true);
      }
    }
    return Object.freeze({ bytes, bytesPerRow, width: level.width, height: level.height });
  });
}

function createPrefilteredEnvironmentLevels(environmentMap, fallbackColor) {
  const sourcePixels = createLinearEnvironmentPixels(environmentMap, fallbackColor);
  const sourceWidth = Math.max(1, environmentMap.width);
  const sourceHeight = Math.max(1, environmentMap.height);
  const mipLevelCount = Math.max(1, Math.floor(Math.log2(Math.max(sourceWidth, sourceHeight))) + 1);
  const levels = [
    Object.freeze({
      width: sourceWidth,
      height: sourceHeight,
      data: sourcePixels,
    }),
  ];
  for (let mipLevel = 1; mipLevel < mipLevelCount; mipLevel += 1) {
    const width = Math.max(1, sourceWidth >> mipLevel);
    const height = Math.max(1, sourceHeight >> mipLevel);
    const roughness = mipLevelCount <= 1 ? 0 : mipLevel / (mipLevelCount - 1);
    const data = new Float32Array(width * height * 4);
    const sampleCount = roughness < 0.25 ? 64 : roughness < 0.6 ? 96 : 128;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const direction = environmentUvToDirection((x + 0.5) / width, (y + 0.5) / height, environmentMap.rotationRadians);
        const normal = normalize(direction, [0, 1, 0]);
        const viewDirection = normal;
        let totalWeight = 0;
        const accum = [0, 0, 0];
        for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
          const xi = hammersley(sampleIndex, sampleCount);
          const halfVector = importanceSampleGgx(xi, roughness, normal);
          const viewDotHalf = Math.max(dot(viewDirection, halfVector), 0);
          const lightDirection = normalize(
            subtract(scale(halfVector, 2 * viewDotHalf), viewDirection),
            normal
          );
          const nDotL = Math.max(dot(normal, lightDirection), 0);
          if (nDotL <= 0.000001) {
            continue;
          }
          const radiance = sampleEnvironmentRadiance(
            sourcePixels,
            sourceWidth,
            sourceHeight,
            lightDirection,
            environmentMap.rotationRadians
          );
          accum[0] += radiance[0] * nDotL;
          accum[1] += radiance[1] * nDotL;
          accum[2] += radiance[2] * nDotL;
          totalWeight += nDotL;
        }
        const offset = (y * width + x) * 4;
        data[offset] = accum[0] / Math.max(totalWeight, 0.000001);
        data[offset + 1] = accum[1] / Math.max(totalWeight, 0.000001);
        data[offset + 2] = accum[2] / Math.max(totalWeight, 0.000001);
        data[offset + 3] = 1;
      }
    }
    levels.push(Object.freeze({ width, height, data }));
  }
  return Object.freeze({
    levels,
    mipLevelCount,
    width: sourceWidth,
    height: sourceHeight,
  });
}

function createEnvironmentSamplingTables(environmentMap, fallbackColor) {
  const pixels = createLinearEnvironmentPixels(environmentMap, fallbackColor);
  const width = Math.max(1, environmentMap.width);
  const height = Math.max(1, environmentMap.height);
  const pdf = new Float32Array(width * height);
  const marginalCdf = new Float32Array(height);
  const conditionalCdf = new Float32Array(width * height);
  const rowSums = new Float32Array(height);
  let totalWeight = 0;
  for (let y = 0; y < height; y += 1) {
    const theta = ((y + 0.5) / height) * Math.PI;
    const sinTheta = Math.max(Math.sin(theta), 0.0001);
    let rowWeight = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const luminance = pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722;
      const weight = Math.max(luminance * sinTheta, 0.000001);
      pdf[y * width + x] = weight;
      rowWeight += weight;
      conditionalCdf[y * width + x] = rowWeight;
    }
    rowSums[y] = rowWeight;
    totalWeight += rowWeight;
    if (rowWeight > 0) {
      for (let x = 0; x < width; x += 1) {
        conditionalCdf[y * width + x] /= rowWeight;
      }
    } else {
      for (let x = 0; x < width; x += 1) {
        conditionalCdf[y * width + x] = (x + 1) / width;
      }
    }
    marginalCdf[y] = totalWeight;
  }
  for (let y = 0; y < height; y += 1) {
    marginalCdf[y] /= Math.max(totalWeight, 0.000001);
  }
  for (let index = 0; index < pdf.length; index += 1) {
    pdf[index] /= Math.max(totalWeight, 0.000001);
  }
  return Object.freeze({
    width,
    height,
    pdf,
    marginalCdf,
    conditionalCdf,
  });
}

function createEnvironmentMapUploadBytes(environmentMap, fallbackColor) {
  const width = Math.max(1, environmentMap.width);
  const height = Math.max(1, environmentMap.height);
  const rowBytes = width * 8;
  const bytesPerRow = alignTo(rowBytes, 256);
  const bytes = new Uint8Array(bytesPerRow * height);
  const data = environmentMap.data;
  const integerScale = environmentMapIntegerScale(data);
  const view = new DataView(bytes.buffer);
  const writeComponent = (targetOffset, sourceOffset, fallback) => {
    view.setUint16(
      targetOffset,
      float32ToFloat16Bits(
        readEnvironmentMapComponent(data, sourceOffset, fallback, integerScale)
      ),
      true
    );
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (y * width + x) * 4;
      const targetOffset = y * bytesPerRow + x * 8;
      writeComponent(targetOffset, sourceOffset, fallbackColor[0]);
      writeComponent(targetOffset + 2, sourceOffset + 1, fallbackColor[1]);
      writeComponent(targetOffset + 4, sourceOffset + 2, fallbackColor[2]);
      writeComponent(targetOffset + 6, sourceOffset + 3, fallbackColor[3] ?? 1);
    }
  }

  const upload = Object.freeze({
    bytes,
    bytesPerRow,
    width,
    height,
  });
  return upload;
}

function createEnvironmentMapResource(device, constants, environmentMap, fallbackColor) {
  if (environmentMap.view) {
    return Object.freeze({
      view: environmentMap.view,
      sampler: environmentMap.sampler ?? device.createSampler({
        label: "plasius.wavefront.environmentMapSampler",
        addressModeU: "repeat",
        addressModeV: "clamp-to-edge",
        magFilter: "linear",
        minFilter: "linear",
        mipmapFilter: "linear",
      }),
      texture: null,
      ownsTexture: false,
      width: Math.max(1, environmentMap.width),
      height: Math.max(1, environmentMap.height),
      mipLevelCount: 1,
    });
  }

  if (environmentMap.texture && typeof environmentMap.texture.createView === "function") {
    return Object.freeze({
      view: environmentMap.texture.createView(),
      sampler: environmentMap.sampler ?? device.createSampler({
        label: "plasius.wavefront.environmentMapSampler",
        addressModeU: "repeat",
        addressModeV: "clamp-to-edge",
        magFilter: "linear",
        minFilter: "linear",
        mipmapFilter: "linear",
      }),
      texture: environmentMap.texture,
      ownsTexture: false,
      width: Math.max(1, environmentMap.width),
      height: Math.max(1, environmentMap.height),
      mipLevelCount: 1,
    });
  }

  const prefiltered = createPrefilteredEnvironmentLevels(environmentMap, fallbackColor);
  const uploads = createFloat16RgbaUploadFromLevels(prefiltered.levels);
  const texture = device.createTexture({
    label: environmentMap.enabled
      ? "plasius.wavefront.environmentMap"
      : "plasius.wavefront.environmentMapFallback",
    size: { width: prefiltered.width, height: prefiltered.height },
    format: "rgba16float",
    mipLevelCount: prefiltered.mipLevelCount,
    usage: constants.texture.TEXTURE_BINDING | constants.texture.COPY_DST,
  });
  uploads.forEach((upload, mipLevel) => {
    device.queue.writeTexture(
      { texture, mipLevel },
      upload.bytes,
      { bytesPerRow: upload.bytesPerRow, rowsPerImage: upload.height },
      { width: upload.width, height: upload.height, depthOrArrayLayers: 1 }
    );
  });
  return Object.freeze({
    view: texture.createView(),
    sampler: environmentMap.sampler ?? device.createSampler({
      label: "plasius.wavefront.environmentMapSampler",
      addressModeU: "repeat",
      addressModeV: "clamp-to-edge",
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
    }),
    texture,
    ownsTexture: true,
    width: prefiltered.width,
    height: prefiltered.height,
    mipLevelCount: prefiltered.mipLevelCount,
  });
}

function createEnvironmentSamplingTextureResource(device, constants, environmentMap, fallbackColor) {
  const tables = createEnvironmentSamplingTables(environmentMap, fallbackColor);
  const rowBytes = tables.width * 8;
  const bytesPerRow = alignTo(rowBytes, 256);
  const bytes = new Uint8Array(bytesPerRow * tables.height);
  const view = new DataView(bytes.buffer);
  for (let y = 0; y < tables.height; y += 1) {
    for (let x = 0; x < tables.width; x += 1) {
      const probability = tables.pdf[y * tables.width + x];
      const conditional = tables.conditionalCdf[y * tables.width + x];
      const marginal = tables.marginalCdf[y];
      const offset = y * bytesPerRow + x * 8;
      view.setUint16(offset, float32ToFloat16Bits(probability), true);
      view.setUint16(offset + 2, float32ToFloat16Bits(conditional), true);
      view.setUint16(offset + 4, float32ToFloat16Bits(marginal), true);
      view.setUint16(offset + 6, float32ToFloat16Bits(1), true);
    }
  }
  const texture = device.createTexture({
    label: "plasius.wavefront.environmentSampling",
    size: { width: tables.width, height: tables.height },
    format: "rgba16float",
    usage: constants.texture.TEXTURE_BINDING | constants.texture.COPY_DST,
  });
  device.queue.writeTexture(
    { texture },
    bytes,
    { bytesPerRow, rowsPerImage: tables.height },
    { width: tables.width, height: tables.height, depthOrArrayLayers: 1 }
  );
  return Object.freeze({
    view: texture.createView(),
    texture,
    ownsTexture: true,
  });
}

function createBrdfLutResource(device, constants, size = DEFAULT_BRDF_LUT_SIZE) {
  const upload = createBrdfLutUploadBytes(size);
  const texture = device.createTexture({
    label: "plasius.wavefront.brdfLut",
    size: { width: upload.width, height: upload.height },
    format: "rgba16float",
    usage: constants.texture.TEXTURE_BINDING | constants.texture.COPY_DST,
  });
  device.queue.writeTexture(
    { texture },
    upload.bytes,
    { bytesPerRow: upload.bytesPerRow, rowsPerImage: upload.height },
    { width: upload.width, height: upload.height, depthOrArrayLayers: 1 }
  );
  return Object.freeze({
    view: texture.createView(),
    sampler: device.createSampler({
      label: "plasius.wavefront.brdfLutSampler",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
      magFilter: "linear",
      minFilter: "linear",
    }),
    texture,
    ownsTexture: true,
    width: upload.width,
    height: upload.height,
  });
}

function createAtlasTextureResource(device, constants, atlas, label) {
  const upload = createRgba8TextureUpload(atlas);
  const texture = device.createTexture({
    label,
    size: { width: upload.width, height: upload.height },
    format: "rgba8unorm",
    usage: constants.texture.TEXTURE_BINDING | constants.texture.COPY_DST,
  });
  device.queue.writeTexture(
    { texture },
    upload.bytes,
    { bytesPerRow: upload.bytesPerRow, rowsPerImage: upload.height },
    { width: upload.width, height: upload.height, depthOrArrayLayers: 1 }
  );
  return Object.freeze({
    texture,
    view: texture.createView(),
    ownsTexture: true,
  });
}

async function getPipelineDiagnostics(shaderModule) {
  if (typeof shaderModule?.compilationInfo !== "function") {
    return "";
  }
  try {
    const info = await shaderModule.compilationInfo();
    const messages = info.messages ?? [];
    if (messages.length === 0) {
      return "";
    }
    return messages
      .map((message) => {
        const line = message.lineNum ?? "?";
        const column = message.linePos ?? "?";
        return `line ${line}:${column} ${message.message}`;
      })
      .join("\n");
  } catch {
    return "";
  }
}

async function createComputePipeline(device, shaderModule, layout, entryPoint, label) {
  const descriptor = {
    label,
    layout,
    compute: {
      module: shaderModule,
      entryPoint,
    },
  };

  try {
    if (typeof device.createComputePipelineAsync === "function") {
      return await device.createComputePipelineAsync(descriptor);
    }
    return device.createComputePipeline(descriptor);
  } catch (error) {
    const diagnostics = await getPipelineDiagnostics(shaderModule);
    const suffix = diagnostics ? `\n${diagnostics}` : "";
    throw new Error(`WGSL compilation failed for ${label}: ${error.message}${suffix}`, {
      cause: error,
    });
  }
}

async function assertShaderModuleCompiles(shaderModule, label) {
  if (typeof shaderModule?.compilationInfo !== "function") {
    return;
  }
  const info = await shaderModule.compilationInfo();
  const messages = Array.isArray(info?.messages) ? info.messages : [];
  const errors = messages.filter((message) => message?.type === "error");
  if (errors.length <= 0) {
    return;
  }
  const diagnostics = errors
    .map((message) => {
      const line = Number.isFinite(message.lineNum) ? message.lineNum : "?";
      const column = Number.isFinite(message.linePos) ? message.linePos : "?";
      return `line ${line}:${column} ${message.message}`;
    })
    .join("\n");
  throw new Error(`WGSL compilation preflight failed for ${label}:\n${diagnostics}`);
}

async function createRenderPipeline(device, descriptor) {
  if (typeof device.createRenderPipelineAsync === "function") {
    return device.createRenderPipelineAsync(descriptor);
  }
  return device.createRenderPipeline(descriptor);
}

const WAVEFRONT_COMPUTE_WGSL = `
const RAY_FLAG_GUIDED_EMISSIVE: u32 = 1u;
const RAY_FLAG_DELTA_SAMPLE: u32 = 2u;

struct RayRecord {
  rayId: u32,
  parentRayId: u32,
  sourcePixelId: u32,
  sampleId: u32,
  bounce: u32,
  mediumRefId: u32,
  flags: u32,
  pad0: u32,
  origin: vec4<f32>,
  direction: vec4<f32>,
  throughput: vec4<f32>,
};

struct HitRecord {
  rayId: u32,
  sourcePixelId: u32,
  hitType: u32,
  objectId: u32,
  materialKind: u32,
  frontFace: u32,
  primitiveId: u32,
  materialRefId: u32,
  mediumRefId: u32,
  materialSlot: u32,
  pad0: u32,
  pad1: u32,
  distance: f32,
  occlusion: f32,
  pad2: vec2<f32>,
  position: vec4<f32>,
  geometricNormal: vec4<f32>,
  shadingNormal: vec4<f32>,
  barycentric: vec4<f32>,
  uv: vec4<f32>,
  color: vec4<f32>,
  emission: vec4<f32>,
  material: vec4<f32>,
  materialResponse: vec4<f32>,
  materialExtension: vec4<f32>,
  specularColor: vec4<f32>,
};

struct SceneObject {
  kind: u32,
  objectId: u32,
  materialKind: u32,
  flags: u32,
  center: vec4<f32>,
  halfExtent: vec4<f32>,
  color: vec4<f32>,
  emission: vec4<f32>,
  material: vec4<f32>,
  materialResponse: vec4<f32>,
  materialExtension: vec4<f32>,
  specularColor: vec4<f32>,
};

struct TriangleRecord {
  triangleId: u32,
  meshId: u32,
  materialKind: u32,
  flags: u32,
  materialRefId: u32,
  mediumRefId: u32,
  materialSlot: u32,
  pad1: u32,
  v0: vec4<f32>,
  v1: vec4<f32>,
  v2: vec4<f32>,
  n0: vec4<f32>,
  n1: vec4<f32>,
  n2: vec4<f32>,
  uv0uv1: vec4<f32>,
  uv2Pad: vec4<f32>,
  color: vec4<f32>,
  emission: vec4<f32>,
  material: vec4<f32>,
  materialResponse: vec4<f32>,
  materialExtension: vec4<f32>,
  specularColor: vec4<f32>,
  baseColorAtlas: vec4<f32>,
  metallicRoughnessAtlas: vec4<f32>,
  normalAtlas: vec4<f32>,
  occlusionAtlas: vec4<f32>,
  emissiveAtlas: vec4<f32>,
  textureSettings: vec4<f32>,
};

struct BvhNode {
  boundsMin: vec4<f32>,
  boundsMax: vec4<f32>,
  childOrFirst: u32,
  triangleCount: u32,
  rightChild: u32,
  pad0: u32,
};

struct BvhLeafRef {
  key: u32,
  triangleIndex: u32,
  pad0: u32,
  pad1: u32,
};

struct ScatterResult {
  direction: vec4<f32>,
  pdf: f32,
  flags: u32,
  pad0: u32,
  pad1: u32,
};

struct MeshVertex {
  position: vec4<f32>,
  normal: vec4<f32>,
  uv: vec4<f32>,
};

struct MeshRange {
  meshId: u32,
  materialKind: u32,
  flags: u32,
  materialRefId: u32,
  mediumRefId: u32,
  firstIndex: u32,
  indexCount: u32,
  firstTriangle: u32,
  triangleCount: u32,
  firstVertex: u32,
  vertexCount: u32,
  materialSlot: u32,
  color: vec4<f32>,
  emission: vec4<f32>,
  material: vec4<f32>,
  materialResponse: vec4<f32>,
  materialExtension: vec4<f32>,
  specularColor: vec4<f32>,
  baseColorAtlas: vec4<f32>,
  metallicRoughnessAtlas: vec4<f32>,
  normalAtlas: vec4<f32>,
  occlusionAtlas: vec4<f32>,
  emissiveAtlas: vec4<f32>,
  textureSettings: vec4<f32>,
};

struct FrameConfig {
  canvasWidth: u32,
  canvasHeight: u32,
  tileX: u32,
  tileY: u32,
  tileWidth: u32,
  tileHeight: u32,
  tilePixelCount: u32,
  maxDepth: u32,
  sceneObjectCount: u32,
  frameIndex: u32,
  denoise: u32,
  triangleCount: u32,
  bvhNodeCount: u32,
  displayQuality: u32,
  meshSourceCount: u32,
  bvhNodeCapacity: u32,
  cameraPosition: vec4<f32>,
  cameraForward: vec4<f32>,
  cameraRight: vec4<f32>,
  cameraUp: vec4<f32>,
  projectionAndSampling: vec4<f32>,
  environmentColor: vec4<f32>,
  ambientColor: vec4<f32>,
  environmentHorizonColor: vec4<f32>,
  environmentZenithColor: vec4<f32>,
  environmentSunDirectionIntensity: vec4<f32>,
  environmentSunColor: vec4<f32>,
  bvhBuildNodeStart: u32,
  bvhBuildNodeCount: u32,
  bvhSortItemCount: u32,
  emissiveTriangleCount: u32,
  environmentPortalCount: u32,
  environmentPortalMode: u32,
  _portalPad0: u32,
  _portalPad1: u32,
  environmentMapSettings: vec4<f32>,
  pathResolveSettings: vec4<f32>,
  environmentMapMeta: vec4<f32>,
};

struct Counters {
  activeCount: atomic<u32>,
  nextCount: atomic<u32>,
  terminatedCount: atomic<u32>,
  hitCount: atomic<u32>,
  dispatchX: u32,
  dispatchY: u32,
  dispatchZ: u32,
  dispatchPad: u32,
};

struct Candidate {
  hit: u32,
  distance: f32,
  geometricNormal: vec3<f32>,
  shadingNormal: vec3<f32>,
  barycentric: vec3<f32>,
  uv: vec2<f32>,
  frontFace: u32,
  triangleIndex: u32,
  primitiveId: u32,
  materialRefId: u32,
  mediumRefId: u32,
};

struct EnvironmentPortal {
  kind: u32,
  flags: u32,
  _pad0: u32,
  _pad1: u32,
  position: vec4<f32>,
  normal: vec4<f32>,
  tangent: vec4<f32>,
  bitangent: vec4<f32>,
  color: vec4<f32>,
};

@group(0) @binding(0) var<storage, read_write> activeQueue: array<RayRecord>;
@group(0) @binding(1) var<storage, read_write> nextQueue: array<RayRecord>;
@group(0) @binding(2) var<storage, read_write> hits: array<HitRecord>;
@group(0) @binding(3) var<storage, read_write> accumulation: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read> sceneObjects: array<SceneObject>;
@group(0) @binding(5) var<uniform> config: FrameConfig;
@group(0) @binding(6) var<storage, read_write> counters: Counters;
@group(0) @binding(7) var outputImage: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(8) var<storage, read_write> triangles: array<TriangleRecord>;
@group(0) @binding(9) var<storage, read_write> bvhNodes: array<BvhNode>;
@group(0) @binding(10) var<storage, read> meshVertices: array<MeshVertex>;
@group(0) @binding(11) var<storage, read> meshIndices: array<u32>;
@group(0) @binding(12) var<storage, read> meshRanges: array<MeshRange>;
@group(0) @binding(13) var<storage, read_write> bvhLeafRefs: array<BvhLeafRef>;
@group(0) @binding(14) var denoiseInputRadiance: texture_2d<f32>;
@group(0) @binding(15) var denoisedRadianceImage: texture_storage_2d<rgba16float, write>;
@group(0) @binding(16) var radianceImage: texture_storage_2d<rgba16float, write>;
@group(0) @binding(17) var finalDenoiseInputRadiance: texture_2d<f32>;
@group(0) @binding(18) var denoisedOutputImage: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(19) var<storage, read> environmentPortals: array<EnvironmentPortal>;
@group(0) @binding(20) var environmentMapTexture: texture_2d<f32>;
@group(0) @binding(21) var environmentMapSampler: sampler;
@group(0) @binding(22) var<storage, read_write> pathVertices: array<vec4<f32>>;
@group(0) @binding(23) var baseColorAtlasTexture: texture_2d<f32>;
@group(0) @binding(24) var metallicRoughnessAtlasTexture: texture_2d<f32>;
@group(0) @binding(25) var normalAtlasTexture: texture_2d<f32>;
@group(0) @binding(26) var occlusionAtlasTexture: texture_2d<f32>;
@group(0) @binding(27) var emissiveAtlasTexture: texture_2d<f32>;
@group(0) @binding(28) var materialAtlasSampler: sampler;
@group(0) @binding(29) var brdfLutTexture: texture_2d<f32>;
@group(0) @binding(30) var brdfLutSampler: sampler;
@group(0) @binding(31) var environmentSamplingTexture: texture_2d<f32>;

fn hash_u32(value: u32) -> u32 {
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

fn safe_normalize(value: vec3<f32>, fallback: vec3<f32>) -> vec3<f32> {
  let len = length(value);
  if (len <= 0.000001) {
    return fallback;
  }
  return value / len;
}

struct TangentBasis {
  tangent: vec3<f32>,
  bitangent: vec3<f32>,
};

struct SurfaceMaterialSample {
  color: vec4<f32>,
  emission: vec4<f32>,
  material: vec4<f32>,
  materialResponse: vec4<f32>,
  materialExtension: vec4<f32>,
  specularColor: vec4<f32>,
  shadingNormal: vec3<f32>,
  occlusion: f32,
};

fn srgb_to_linear_channel(value: f32) -> f32 {
  if (value <= 0.04045) {
    return value / 12.92;
  }
  return pow((value + 0.055) / 1.055, 2.4);
}

fn srgb_to_linear_vec3(value: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(
    srgb_to_linear_channel(value.x),
    srgb_to_linear_channel(value.y),
    srgb_to_linear_channel(value.z)
  );
}

fn wrap_uv(uv: vec2<f32>) -> vec2<f32> {
  return fract(fract(uv) + vec2<f32>(1.0));
}

fn atlas_sample_uv(rect: vec4<f32>, uv: vec2<f32>) -> vec2<f32> {
  let local = wrap_uv(uv);
  let clamped = clamp(local, vec2<f32>(0.001), vec2<f32>(0.999));
  return rect.xy + clamped * rect.zw;
}

fn sample_atlas(textureRef: texture_2d<f32>, rect: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
  return textureSampleLevel(textureRef, materialAtlasSampler, atlas_sample_uv(rect, uv), 0.0);
}

fn build_triangle_tangent_basis(
  triangle: TriangleRecord,
  fallbackNormal: vec3<f32>
) -> TangentBasis {
  let edge1 = triangle.v1.xyz - triangle.v0.xyz;
  let edge2 = triangle.v2.xyz - triangle.v0.xyz;
  let uv0 = triangle.uv0uv1.xy;
  let uv1 = triangle.uv0uv1.zw;
  let uv2 = triangle.uv2Pad.xy;
  let deltaUv1 = uv1 - uv0;
  let deltaUv2 = uv2 - uv0;
  let determinant = deltaUv1.x * deltaUv2.y - deltaUv1.y * deltaUv2.x;
  if (abs(determinant) <= 0.000001) {
    let tangentFallback = select(vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(1.0, 0.0, 0.0), abs(fallbackNormal.y) >= 0.999);
    let tangent = safe_normalize(cross(tangentFallback, fallbackNormal), vec3<f32>(1.0, 0.0, 0.0));
    let bitangent = safe_normalize(cross(fallbackNormal, tangent), vec3<f32>(0.0, 0.0, 1.0));
    return TangentBasis(tangent, bitangent);
  }
  let inverse = 1.0 / determinant;
  let tangent = safe_normalize(
    inverse * (edge1 * deltaUv2.y - edge2 * deltaUv1.y),
    vec3<f32>(1.0, 0.0, 0.0)
  );
  let bitangent = safe_normalize(
    inverse * (-edge1 * deltaUv2.x + edge2 * deltaUv1.x),
    vec3<f32>(0.0, 0.0, 1.0)
  );
  return TangentBasis(tangent, bitangent);
}

fn sample_surface_material(
  triangle: TriangleRecord,
  uv: vec2<f32>,
  geometricNormal: vec3<f32>,
  shadingNormal: vec3<f32>
) -> SurfaceMaterialSample {
  let baseColorTexel = sample_atlas(baseColorAtlasTexture, triangle.baseColorAtlas, uv);
  let baseColor = vec4<f32>(
    clamp(triangle.color.rgb * srgb_to_linear_vec3(baseColorTexel.rgb), vec3<f32>(0.0), vec3<f32>(1.0)),
    clamp(triangle.color.a * baseColorTexel.a, 0.0, 1.0)
  );
  let metallicRoughnessTexel = sample_atlas(
    metallicRoughnessAtlasTexture,
    triangle.metallicRoughnessAtlas,
    uv
  );
  let normalTexel = sample_atlas(normalAtlasTexture, triangle.normalAtlas, uv);
  let occlusionTexel = sample_atlas(occlusionAtlasTexture, triangle.occlusionAtlas, uv);
  let emissiveTexel = sample_atlas(emissiveAtlasTexture, triangle.emissiveAtlas, uv);
  let normalScale = clamp(triangle.textureSettings.x, 0.0, 1.0);
  let tangentBasis = build_triangle_tangent_basis(triangle, geometricNormal);
  let tangentNormal = safe_normalize(
    vec3<f32>(
      normalTexel.x * 2.0 - 1.0,
      normalTexel.y * 2.0 - 1.0,
      1.0 + ((normalTexel.z * 2.0 - 1.0) - 1.0) * normalScale
    ),
    vec3<f32>(0.0, 0.0, 1.0)
  );
  let mappedNormal = safe_normalize(
    tangentBasis.tangent * tangentNormal.x +
      tangentBasis.bitangent * tangentNormal.y +
      shadingNormal * tangentNormal.z,
    shadingNormal
  );
  let emission = vec4<f32>(
    max(
      triangle.emission.rgb *
        srgb_to_linear_vec3(emissiveTexel.rgb) *
        max(triangle.textureSettings.z, 0.0),
      vec3<f32>(0.0)
    ),
    clamp(triangle.emission.a * emissiveTexel.a, 0.0, 1.0)
  );
  return SurfaceMaterialSample(
    baseColor,
    emission,
    vec4<f32>(
      clamp(triangle.material.x * metallicRoughnessTexel.y, 0.0, 1.0),
      clamp(triangle.material.y * metallicRoughnessTexel.z, 0.0, 1.0),
      clamp(triangle.material.z * baseColor.a, 0.0, 1.0),
      clamp(triangle.material.w, 1.0, 3.0)
    ),
    triangle.materialResponse,
    triangle.materialExtension,
    triangle.specularColor,
    repair_shading_normal(geometricNormal, mappedNormal),
    clamp(occlusionTexel.x * max(triangle.textureSettings.y, 0.0), 0.0, 1.0)
  );
}

fn saturate(value: f32) -> f32 {
  return clamp(value, 0.0, 1.0);
}

fn max_component(value: vec3<f32>) -> f32 {
  return max(max(value.x, value.y), value.z);
}

fn radiance_luminance(value: vec3<f32>) -> f32 {
  return dot(value, vec3<f32>(0.2126, 0.7152, 0.0722));
}

fn environment_map_enabled() -> bool {
  return config.environmentMapSettings.x > 0.5;
}

fn deferred_path_resolve_enabled() -> bool {
  return config.pathResolveSettings.x > 0.5;
}

fn path_vertex_count_per_ray() -> u32 {
  return config.maxDepth + 1u;
}

fn path_vertex_index(rayId: u32, depth: u32) -> u32 {
  return rayId * path_vertex_count_per_ray() + min(depth, config.maxDepth);
}

fn clear_deferred_path(rayId: u32) {
  if (!deferred_path_resolve_enabled()) {
    return;
  }

  for (var depth = 0u; depth <= config.maxDepth; depth = depth + 1u) {
    pathVertices[path_vertex_index(rayId, depth)] = vec4<f32>(0.0);
    if (depth == config.maxDepth) {
      break;
    }
  }
}

fn record_deferred_path_response(ray: RayRecord, response: vec3<f32>) {
  if (!deferred_path_resolve_enabled() || ray.rayId >= config.tilePixelCount || ray.bounce >= config.maxDepth) {
    return;
  }
  pathVertices[path_vertex_index(ray.rayId, ray.bounce)] =
    vec4<f32>(max(response, vec3<f32>(0.0)), 1.0);
}

fn record_deferred_terminal_source(ray: RayRecord, sourceRadiance: vec3<f32>) {
  if (!deferred_path_resolve_enabled() || ray.rayId >= config.tilePixelCount) {
    return;
  }
  pathVertices[path_vertex_index(ray.rayId, config.maxDepth)] =
    vec4<f32>(clamp_sample_radiance(sourceRadiance), 1.0);
}

fn environment_map_uv(direction: vec3<f32>) -> vec2<f32> {
  let rayDirection = safe_normalize(direction, vec3<f32>(0.0, 1.0, 0.0));
  let rotationTurns = config.environmentMapSettings.z / 6.28318530718;
  let u = fract(atan2(rayDirection.z, rayDirection.x) / 6.28318530718 + 0.5 + rotationTurns);
  let v = acos(clamp(rayDirection.y, -1.0, 1.0)) / 3.14159265359;
  return vec2<f32>(u, clamp(v, 0.0, 1.0));
}

fn environment_map_radiance(direction: vec3<f32>) -> vec3<f32> {
  let uv = environment_map_uv(direction);
  let texel = max(textureSampleLevel(environmentMapTexture, environmentMapSampler, uv, 0.0).rgb, vec3<f32>(0.0));
  return texel * max(config.environmentMapSettings.y, 0.0);
}

fn procedural_environment_radiance(direction: vec3<f32>) -> vec3<f32> {
  let rayDirection = safe_normalize(direction, vec3<f32>(0.0, 1.0, 0.0));
  let upFactor = saturate(rayDirection.y * 0.5 + 0.5);
  let sunDirection = safe_normalize(
    config.environmentSunDirectionIntensity.xyz,
    vec3<f32>(0.0, 1.0, 0.0)
  );
  let sunGlow = pow(saturate(dot(rayDirection, sunDirection)), 192.0);
  let gradient =
    config.environmentHorizonColor.xyz * (1.0 - upFactor) +
    config.environmentZenithColor.xyz * upFactor;
  return (
    gradient +
    config.environmentSunColor.xyz * sunGlow
  ) * max(config.environmentSunDirectionIntensity.w, 0.0001);
}

fn base_environment_radiance(direction: vec3<f32>) -> vec3<f32> {
  if (environment_map_enabled()) {
    return environment_map_radiance(direction);
  }
  return procedural_environment_radiance(direction);
}

fn environment_portal_radiance_scale(origin: vec3<f32>, direction: vec3<f32>) -> vec3<f32> {
  if (config.environmentPortalCount == 0u || config.environmentPortalMode == 0u) {
    return vec3<f32>(1.0);
  }
  var scale = vec3<f32>(0.0);
  for (var portalIndex = 0u; portalIndex < config.environmentPortalCount; portalIndex = portalIndex + 1u) {
    let portal = environmentPortals[portalIndex];
    if (portal.kind == 1u) {
      let portalNormal = safe_normalize(portal.normal.xyz, vec3<f32>(0.0, 0.0, 1.0));
      let denominator = dot(direction, portalNormal);
      let twoSided = (portal.flags & 1u) != 0u;
      var facing = abs(denominator) > 0.0001;
      if (!twoSided && denominator <= 0.0001) {
        facing = false;
      }
      if (facing) {
        let distance = dot(portal.position.xyz - origin, portalNormal) / denominator;
        if (distance > 0.001) {
          let hitPosition = origin + direction * distance;
          let local = hitPosition - portal.position.xyz;
          let tangent = safe_normalize(portal.tangent.xyz, vec3<f32>(1.0, 0.0, 0.0));
          let bitangent = safe_normalize(portal.bitangent.xyz, vec3<f32>(0.0, 1.0, 0.0));
          let u = dot(local, tangent);
          let v = dot(local, bitangent);
          if (abs(u) <= portal.tangent.w && abs(v) <= portal.bitangent.w) {
            let areaWeight = clamp(sqrt(max(portal.position.w, 0.0001)), 0.25, 4.0);
            let angleWeight = max(abs(denominator), 0.08);
            let portalScale = portal.color.rgb * portal.normal.w * portal.color.a * areaWeight * angleWeight;
            scale = max(scale, portalScale);
          }
        }
      }
    }
  }
  return scale;
}

fn environment_radiance(origin: vec3<f32>, direction: vec3<f32>) -> vec3<f32> {
  let rayDirection = safe_normalize(direction, vec3<f32>(0.0, 1.0, 0.0));
  let portalScale = environment_portal_radiance_scale(origin, rayDirection);
  let portalHit = max_component(portalScale) > 0.0001;
  return base_environment_radiance(rayDirection) *
    select(vec3<f32>(1.0), portalScale, portalHit);
}

fn direct_environment_radiance(origin: vec3<f32>, direction: vec3<f32>) -> vec3<f32> {
  let rayDirection = safe_normalize(direction, vec3<f32>(0.0, 1.0, 0.0));
  let portalScale = environment_portal_radiance_scale(origin, rayDirection);
  let portalHit = max_component(portalScale) > 0.0001;
  if (
    config.environmentPortalCount > 0u &&
    config.environmentPortalMode == 2u &&
    !portalHit
  ) {
    return vec3<f32>(0.0);
  }
  return base_environment_radiance(rayDirection) *
    select(vec3<f32>(1.0), portalScale, portalHit);
}

fn radical_inverse_vdc(bitsValue: u32) -> f32 {
  var bits = bitsValue;
  bits = (bits << 16u) | (bits >> 16u);
  bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xaaaaaaaau) >> 1u);
  bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xccccccccu) >> 2u);
  bits = ((bits & 0x0f0f0f0fu) << 4u) | ((bits & 0xf0f0f0f0u) >> 4u);
  bits = ((bits & 0x00ff00ffu) << 8u) | ((bits & 0xff00ff00u) >> 8u);
  return f32(bits) * 2.3283064365386963e-10;
}

fn hammersley_2d(index: u32, count: u32) -> vec2<f32> {
  return vec2<f32>(f32(index) / max(f32(count), 1.0), radical_inverse_vdc(index));
}

fn build_basis_tangent(normal: vec3<f32>) -> vec3<f32> {
  let tangentFallback = select(vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(1.0, 0.0, 0.0), abs(normal.y) >= 0.999);
  return safe_normalize(cross(tangentFallback, normal), vec3<f32>(1.0, 0.0, 0.0));
}

fn local_to_world(local: vec3<f32>, normal: vec3<f32>) -> vec3<f32> {
  let tangent = build_basis_tangent(normal);
  let bitangent = safe_normalize(cross(normal, tangent), vec3<f32>(0.0, 0.0, 1.0));
  return safe_normalize(tangent * local.x + bitangent * local.y + normal * local.z, normal);
}

fn cosine_sample_hemisphere(sample: vec2<f32>, normal: vec3<f32>) -> vec3<f32> {
  let phi = 6.28318530718 * sample.x;
  let radius = sqrt(sample.y);
  let x = cos(phi) * radius;
  let y = sin(phi) * radius;
  let z = sqrt(max(0.0, 1.0 - sample.y));
  return local_to_world(vec3<f32>(x, y, z), normal);
}

fn importance_sample_ggx(sample: vec2<f32>, roughness: f32, normal: vec3<f32>) -> vec3<f32> {
  let alpha = max(roughness * roughness, 0.0001);
  let phi = 6.28318530718 * sample.x;
  let cosTheta = sqrt((1.0 - sample.y) / max(1.0 + (alpha * alpha - 1.0) * sample.y, 0.0001));
  let sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));
  let localHalf = vec3<f32>(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);
  return local_to_world(localHalf, normal);
}

fn distribution_ggx(normal: vec3<f32>, halfVector: vec3<f32>, roughness: f32) -> f32 {
  let alpha = max(roughness * roughness, 0.0001);
  let alpha2 = alpha * alpha;
  let nDotH = saturate(dot(normal, halfVector));
  let denominator = nDotH * nDotH * (alpha2 - 1.0) + 1.0;
  return alpha2 / max(3.14159265359 * denominator * denominator, 0.000001);
}

fn geometry_schlick_ggx(nDotValue: f32, roughness: f32) -> f32 {
  let k = ((roughness + 1.0) * (roughness + 1.0)) / 8.0;
  return nDotValue / max(nDotValue * (1.0 - k) + k, 0.000001);
}

fn geometry_smith(normal: vec3<f32>, viewDirection: vec3<f32>, lightDirection: vec3<f32>, roughness: f32) -> f32 {
  let nDotV = saturate(dot(normal, viewDirection));
  let nDotL = saturate(dot(normal, lightDirection));
  return geometry_schlick_ggx(nDotV, roughness) * geometry_schlick_ggx(nDotL, roughness);
}

fn fresnel_schlick(cosine: f32, f0: vec3<f32>) -> vec3<f32> {
  return f0 + (vec3<f32>(1.0) - f0) * pow(1.0 - cosine, 5.0);
}

fn sample_brdf_lut(nDotV: f32, roughness: f32) -> vec2<f32> {
  let uv = vec2<f32>(clamp(nDotV, 0.0, 1.0), clamp(roughness, 0.0, 1.0));
  return textureSampleLevel(brdfLutTexture, brdfLutSampler, uv, 0.0).xy;
}

fn prefiltered_environment_radiance(direction: vec3<f32>, roughness: f32) -> vec3<f32> {
  let uv = environment_map_uv(direction);
  let maxLevel = max(config.environmentMapMeta.z - 1.0, 0.0);
  let lod = clamp(roughness, 0.0, 1.0) * maxLevel;
  let texel = max(textureSampleLevel(environmentMapTexture, environmentMapSampler, uv, lod).rgb, vec3<f32>(0.0));
  return texel * max(config.environmentMapSettings.y, 0.0);
}

fn environment_pdf_dimensions() -> vec2<u32> {
  return vec2<u32>(
    max(u32(config.environmentMapMeta.x), 1u),
    max(u32(config.environmentMapMeta.y), 1u)
  );
}

fn environment_sampling_texel(x: u32, y: u32) -> vec4<f32> {
  return textureLoad(environmentSamplingTexture, vec2<i32>(i32(x), i32(y)), 0);
}

fn environment_pdf_texel(x: u32, y: u32) -> f32 {
  return environment_sampling_texel(x, y).x;
}

fn environment_row_cdf_texel(y: u32) -> f32 {
  return environment_sampling_texel(0u, y).z;
}

fn environment_column_cdf_texel(x: u32, y: u32) -> f32 {
  return environment_sampling_texel(x, y).y;
}

fn environment_direction_pdf(direction: vec3<f32>) -> f32 {
  let rayDirection = safe_normalize(direction, vec3<f32>(0.0, 1.0, 0.0));
  let uv = environment_map_uv(rayDirection);
  let dimensions = environment_pdf_dimensions();
  let width = max(f32(dimensions.x), 1.0);
  let height = max(f32(dimensions.y), 1.0);
  let x = min(u32(uv.x * width), dimensions.x - 1u);
  let y = min(u32(uv.y * height), dimensions.y - 1u);
  let discretePdf = max(environment_pdf_texel(x, y), 0.0);
  let sinTheta = sqrt(max(1.0 - rayDirection.y * rayDirection.y, 0.0));
  let solidAngle = max((2.0 * 3.14159265359 * 3.14159265359 * sinTheta) / (width * height), 0.000001);
  return discretePdf / solidAngle;
}

fn sample_row_cdf(count: u32, sampleValue: f32) -> u32 {
  if (count == 0u) {
    return 0u;
  }
  var low = 0u;
  var high = count - 1u;
  loop {
    if (low >= high) {
      break;
    }
    let mid = (low + high) / 2u;
    let cdfValue = environment_row_cdf_texel(mid);
    if (sampleValue <= cdfValue) {
      high = mid;
    } else {
      low = mid + 1u;
    }
  }
  return min(low, count - 1u);
}

fn sample_column_cdf(row: u32, count: u32, sampleValue: f32) -> u32 {
  if (count == 0u) {
    return 0u;
  }
  var low = 0u;
  var high = count - 1u;
  loop {
    if (low >= high) {
      break;
    }
    let mid = (low + high) / 2u;
    let cdfValue = environment_column_cdf_texel(mid, row);
    if (sampleValue <= cdfValue) {
      high = mid;
    } else {
      low = mid + 1u;
    }
  }
  return min(low, count - 1u);
}

struct EnvironmentSample {
  direction: vec3<f32>,
  radiance: vec3<f32>,
  pdf: f32,
};

fn sample_environment_importance(sample: vec2<f32>) -> EnvironmentSample {
  let dimensions = environment_pdf_dimensions();
  let row = sample_row_cdf(dimensions.y, sample.y);
  let column = sample_column_cdf(row, dimensions.x, sample.x);
  let uv = vec2<f32>(
    (f32(column) + 0.5) / max(f32(dimensions.x), 1.0),
    (f32(row) + 0.5) / max(f32(dimensions.y), 1.0)
  );
  let theta = uv.y * 3.14159265359;
  let phi = (uv.x - 0.5 - config.environmentMapSettings.z / 6.28318530718) * 6.28318530718;
  let sinTheta = sin(theta);
  let direction = vec3<f32>(cos(phi) * sinTheta, cos(theta), sin(phi) * sinTheta);
  let pdf = environment_direction_pdf(direction);
  return EnvironmentSample(direction, base_environment_radiance(direction), pdf);
}

fn power_heuristic(pdfA: f32, pdfB: f32) -> f32 {
  let a2 = pdfA * pdfA;
  let b2 = pdfB * pdfB;
  return a2 / max(a2 + b2, 0.000001);
}

fn visible_environment_radiance(origin: vec3<f32>, direction: vec3<f32>) -> vec3<f32> {
  let rayDirection = safe_normalize(direction, vec3<f32>(0.0, 1.0, 0.0));
  let visible = !scene_visibility_blocked(origin, rayDirection, 1000000.0);
  return select(vec3<f32>(0.0), direct_environment_radiance(origin, rayDirection), visible);
}

fn glossy_environment_direction(
  incidentDirection: vec3<f32>,
  normal: vec3<f32>,
  roughness: f32,
  normalBlendScale: f32
) -> vec3<f32> {
  let reflectionDirection = reflect(incidentDirection, normal);
  let blend = clamp(roughness * roughness * normalBlendScale, 0.0, 0.92);
  return safe_normalize(mix(reflectionDirection, normal, blend), normal);
}

fn surface_glossiness(hit: HitRecord) -> f32 {
  let roughness = clamp(hit.material.x, 0.0, 1.0);
  let metallic = clamp(hit.material.y, 0.0, 1.0);
  let sheen = clamp(max_component(hit.materialResponse.xyz), 0.0, 1.0);
  let clearcoat = clamp(hit.materialResponse.w, 0.0, 1.0);
  let specularWeight = clamp(hit.materialExtension.y, 0.0, 1.0);
  let transmission = clamp(hit.materialExtension.z, 0.0, 1.0);
  let baseGloss =
    max(
      clearcoat,
      max(sheen * 0.72, max(specularWeight * (0.38 + metallic * 0.62), transmission))
    );
  return clamp(baseGloss * (1.0 - roughness * 0.72) + metallic * (1.0 - roughness) * 0.35, 0.0, 1.0);
}

fn surface_specular_f0(hit: HitRecord, surfaceColor: vec3<f32>) -> vec3<f32> {
  let metallic = clamp(hit.material.y, 0.0, 1.0);
  let specularWeight = clamp(hit.materialExtension.y, 0.0, 1.0);
  let specularColor = clamp(hit.specularColor.xyz, vec3<f32>(0.0), vec3<f32>(1.0));
  let dielectricF0 = vec3<f32>(0.04) * specularWeight * specularColor;
  return mix(dielectricF0, surfaceColor, metallic);
}

fn surface_bsdf_sampling_weights(hit: HitRecord) -> vec3<f32> {
  let metallic = clamp(hit.material.y, 0.0, 1.0);
  let clearcoat = clamp(hit.materialResponse.w, 0.0, 1.0);
  let specularWeight = clamp(hit.materialExtension.y, 0.0, 1.0);
  let diffuseWeight = clamp(
    (1.0 - metallic) * max(1.0 - specularWeight * 0.5 - clearcoat * 0.25, 0.15),
    0.0,
    1.0
  );
  let specWeight = clamp(max(metallic, specularWeight * 0.75) * (1.0 - clearcoat * 0.5), 0.0, 1.0);
  let clearcoatWeight = clamp(clearcoat, 0.0, 1.0);
  let totalWeight = max(diffuseWeight + specWeight + clearcoatWeight, 0.000001);
  return vec3<f32>(
    diffuseWeight / totalWeight,
    specWeight / totalWeight,
    clearcoatWeight / totalWeight
  );
}

fn evaluate_surface_bsdf(hit: HitRecord, viewDirection: vec3<f32>, lightDirection: vec3<f32>) -> vec3<f32> {
  let normal = safe_normalize(hit.shadingNormal.xyz, vec3<f32>(0.0, 1.0, 0.0));
  let surfaceColor = clamp(max(hit.color.xyz, config.ambientColor.xyz * 0.35), vec3<f32>(0.0), vec3<f32>(1.0));
  let roughness = clamp(hit.material.x, 0.0, 1.0);
  let metallic = clamp(hit.material.y, 0.0, 1.0);
  let clearcoat = clamp(hit.materialResponse.w, 0.0, 1.0);
  let clearcoatRoughness = clamp(hit.materialExtension.x, 0.0, 1.0);
  let occlusion = clamp(hit.occlusion, 0.0, 1.0);
  let nDotV = saturate(dot(normal, viewDirection));
  let nDotL = saturate(dot(normal, lightDirection));
  if (nDotV <= 0.0 || nDotL <= 0.0) {
    return vec3<f32>(0.0);
  }
  let halfVector = safe_normalize(viewDirection + lightDirection, normal);
  let vDotH = saturate(dot(viewDirection, halfVector));
  let f0 = surface_specular_f0(hit, surfaceColor);
  let fresnel = fresnel_schlick(vDotH, f0);
  let distribution = distribution_ggx(normal, halfVector, roughness);
  let geometry = geometry_smith(normal, viewDirection, lightDirection, roughness);
  let specular = (distribution * geometry * fresnel) / max(4.0 * nDotV * nDotL, 0.000001);
  let diffuseWeight = (1.0 - metallic) * (1.0 - clearcoat * 0.24) * (1.0 - clamp(max_component(fresnel), 0.0, 0.98));
  let diffuse = surfaceColor * diffuseWeight / 3.14159265359;
  let clearcoatHalf = safe_normalize(viewDirection + lightDirection, normal);
  let clearcoatDistribution = distribution_ggx(normal, clearcoatHalf, max(clearcoatRoughness, 0.02));
  let clearcoatGeometry = geometry_smith(normal, viewDirection, lightDirection, max(clearcoatRoughness, 0.02));
  let clearcoatFresnel = fresnel_schlick(saturate(dot(viewDirection, clearcoatHalf)), vec3<f32>(0.04));
  let clearcoatTerm =
    (clearcoatDistribution * clearcoatGeometry * clearcoatFresnel) /
    max(4.0 * nDotV * nDotL, 0.000001) *
    clearcoat;
  return (diffuse + specular + clearcoatTerm) * mix(0.42, 1.0, occlusion);
}

fn diffuse_pdf(normal: vec3<f32>, lightDirection: vec3<f32>) -> f32 {
  return saturate(dot(normal, lightDirection)) / 3.14159265359;
}

fn ggx_pdf(normal: vec3<f32>, viewDirection: vec3<f32>, lightDirection: vec3<f32>, roughness: f32) -> f32 {
  let halfVector = safe_normalize(viewDirection + lightDirection, normal);
  let nDotH = saturate(dot(normal, halfVector));
  let vDotH = saturate(dot(viewDirection, halfVector));
  let distribution = distribution_ggx(normal, halfVector, roughness);
  return (distribution * nDotH) / max(4.0 * vDotH, 0.000001);
}

fn evaluate_surface_bsdf_pdf(hit: HitRecord, viewDirection: vec3<f32>, lightDirection: vec3<f32>) -> f32 {
  let normal = safe_normalize(hit.shadingNormal.xyz, vec3<f32>(0.0, 1.0, 0.0));
  let roughness = clamp(hit.material.x, 0.0, 1.0);
  let weights = surface_bsdf_sampling_weights(hit);
  let diffuseTerm = diffuse_pdf(normal, lightDirection);
  let specTerm = ggx_pdf(normal, viewDirection, lightDirection, max(roughness, 0.02));
  let clearcoatTerm = ggx_pdf(normal, viewDirection, lightDirection, max(clamp(hit.materialExtension.x, 0.0, 1.0), 0.02));
  return weights.x * diffuseTerm + weights.y * specTerm + weights.z * clearcoatTerm;
}

fn gated_environment_radiance(origin: vec3<f32>, direction: vec3<f32>) -> vec3<f32> {
  let portalScale = environment_portal_radiance_scale(origin, safe_normalize(direction, vec3<f32>(0.0, 1.0, 0.0)));
  if (
    config.environmentPortalCount > 0u &&
    config.environmentPortalMode == 2u &&
    max_component(portalScale) <= 0.0001
  ) {
    return config.ambientColor.xyz * 0.65;
  }
  return environment_radiance(origin, direction);
}

fn surface_path_response(hit: HitRecord) -> vec3<f32> {
  let color = clamp(hit.color.xyz, vec3<f32>(0.0), vec3<f32>(1.0));
  let opacity = clamp(hit.material.z, 0.0, 1.0);
  let occlusion = clamp(hit.occlusion, 0.0, 1.0);
  let materialEnergy = select(0.68, 0.92, hit.materialKind == 1u || hit.materialKind == 2u);
  let transparentEnergy = select(materialEnergy, 0.9, hit.hitType == 3u);
  return mix(vec3<f32>(1.0), color, max(opacity, 0.18)) * transparentEnergy * mix(0.55, 1.0, occlusion);
}

fn bounded_path_response_luminance(ray: RayRecord, hit: HitRecord) -> f32 {
  let daylightFloor = max(config.pathResolveSettings.y, 0.0) * 0.08;
  let hdriFloor = max(config.environmentMapSettings.w, 0.0) * 0.02;
  let sceneFloor = max(daylightFloor, hdriFloor);
  if (sceneFloor <= 0.000001) {
    return 0.0;
  }
  let bounceRatio = select(
    0.0,
    f32(ray.bounce) / max(f32(config.maxDepth - 1u), 1.0),
    config.maxDepth > 1u
  );
  let bounceScale = 1.0 - bounceRatio * 0.55;
  let materialScale = select(1.0, 0.34, hit.materialKind == 1u || hit.materialKind == 2u);
  let transparentScale = select(materialScale, 0.58, hit.hitType == 3u);
  let opacityScale = mix(0.55, 1.0, clamp(hit.material.z, 0.0, 1.0));
  return sceneFloor * bounceScale * transparentScale * opacityScale;
}

fn stabilize_surface_path_response(ray: RayRecord, hit: HitRecord, response: vec3<f32>) -> vec3<f32> {
  let minimumLuminance = bounded_path_response_luminance(ray, hit);
  let responseLuminance = radiance_luminance(response);
  if (minimumLuminance <= 0.000001 || responseLuminance >= minimumLuminance) {
    return response;
  }
  let tintBase = max(response, max(hit.color.xyz * 0.65, config.ambientColor.xyz * 0.35));
  let tint = tintBase / max(max_component(tintBase), 0.0001);
  let lifted = select(
    tint * minimumLuminance,
    response * (minimumLuminance / max(responseLuminance, 0.0001)),
    responseLuminance > 0.0001
  );
  return clamp(lifted, vec3<f32>(0.0), vec3<f32>(0.98));
}

fn sunlit_baseline_radiance(normal: vec3<f32>) -> vec3<f32> {
  let baseline = max(config.pathResolveSettings.y, 0.0);
  if (baseline <= 0.000001) {
    return vec3<f32>(0.0);
  }
  let sunDirection = safe_normalize(
    config.environmentSunDirectionIntensity.xyz,
    vec3<f32>(0.0, 1.0, 0.0)
  );
  let sunFacing = saturate(dot(normal, sunDirection));
  let skyFacing = 0.35 + saturate(normal.y * 0.5 + 0.5) * 0.65;
  let directionalWeight = 0.38 + sunFacing * 0.62;
  let sunTint = max(config.environmentSunColor.xyz, vec3<f32>(0.0));
  return clamp_sample_radiance(sunTint * baseline * skyFacing * directionalWeight * 0.04);
}

fn terminal_surface_environment_source(ray: RayRecord, hit: HitRecord) -> vec3<f32> {
  let normal = safe_normalize(hit.shadingNormal.xyz, vec3<f32>(0.0, 1.0, 0.0));
  let origin = hit.position.xyz + normal * 0.003;
  let roughness = clamp(hit.material.x, 0.0, 1.0);
  let glossiness = surface_glossiness(hit);
  let normalEnvironment = gated_environment_radiance(origin, normal);
  let viewDirection = safe_normalize(-ray.direction.xyz, normal);
  let reflectionDirection = glossy_environment_direction(
    ray.direction.xyz,
    normal,
    roughness,
    mix(0.88, 0.38, glossiness)
  );
  let reflectionEnvironment = prefiltered_environment_radiance(reflectionDirection, roughness);
  let surfaceColor = clamp(max(hit.color.xyz, config.ambientColor.xyz * 0.35), vec3<f32>(0.0), vec3<f32>(1.0));
  let f0 = surface_specular_f0(hit, surfaceColor);
  let brdfTerm = sample_brdf_lut(saturate(dot(normal, viewDirection)), roughness);
  let specularEnvironment = reflectionEnvironment * (f0 * brdfTerm.x + vec3<f32>(brdfTerm.y));
  let sunlitFloor = sunlit_baseline_radiance(normal);
  let ambientFloor = select(
    max(config.ambientColor.xyz, sunlitFloor * 0.82),
    max(config.ambientColor.xyz * 0.35, sunlitFloor * 0.58),
    environment_map_enabled()
  );
  let environmentInfluence = select(
    max(0.12, config.pathResolveSettings.y * 0.42),
    max(config.environmentMapSettings.w, max(0.12, config.pathResolveSettings.y * 0.42)),
    environment_map_enabled()
  );
  let glossyEnvironment = max(
    normalEnvironment,
    max(reflectionEnvironment * mix(0.24, 0.92, glossiness), specularEnvironment)
  );
  let environmentFloor = max(ambientFloor, max(sunlitFloor, glossyEnvironment * environmentInfluence));
  let materialFloor = select(0.7, 1.0, hit.materialKind == 0u || hit.materialKind == 3u);
  return clamp_sample_radiance(environmentFloor * materialFloor);
}

fn terminal_surface_environment_contribution(ray: RayRecord, hit: HitRecord) -> vec3<f32> {
  let surfaceColor = max(hit.color.xyz, config.ambientColor.xyz);
  let occlusion = mix(0.75, 1.0, clamp(hit.occlusion, 0.0, 1.0));
  return clamp_sample_radiance(
    ray.throughput.xyz *
    surfaceColor *
    terminal_surface_environment_source(ray, hit) *
    occlusion
  );
}

fn direct_environment_portal_irradiance(origin: vec3<f32>, normal: vec3<f32>) -> vec3<f32> {
  if (config.environmentPortalCount == 0u || config.environmentPortalMode == 0u) {
    return vec3<f32>(0.0);
  }

  var irradiance = vec3<f32>(0.0);
  for (var portalIndex = 0u; portalIndex < config.environmentPortalCount; portalIndex = portalIndex + 1u) {
    let portal = environmentPortals[portalIndex];
    if (portal.kind != 1u) {
      continue;
    }

    let toPortal = portal.position.xyz - origin;
    let distanceSquared = max(dot(toPortal, toPortal), 0.01);
    let direction = safe_normalize(toPortal, normal);
    let surfaceFacing = saturate(dot(normal, direction));
    if (surfaceFacing <= 0.0001) {
      continue;
    }

    let portalNormal = safe_normalize(portal.normal.xyz, vec3<f32>(0.0, 0.0, 1.0));
    let twoSided = (portal.flags & 1u) != 0u;
    let portalFacing = select(
      saturate(dot(-direction, portalNormal)),
      max(abs(dot(direction, portalNormal)), 0.15),
      twoSided
    );
    let area = max(portal.position.w, 0.0001);
    let distanceFalloff = clamp(area / max(distanceSquared, area * 0.25), 0.0, 2.5);
    let traceDistance = max(sqrt(distanceSquared) - 0.01, 0.01);
    if (scene_visibility_blocked(origin, direction, traceDistance)) {
      continue;
    }
    irradiance = irradiance +
      portal.color.rgb *
      portal.normal.w *
      portal.color.a *
      surfaceFacing *
      portalFacing *
      distanceFalloff;
  }
  return irradiance;
}

fn visibility_test_ray(origin: vec3<f32>, direction: vec3<f32>) -> RayRecord {
  let rayDirection = safe_normalize(direction, vec3<f32>(0.0, 1.0, 0.0));
  return RayRecord(
    0u,
    0u,
    0u,
    0u,
    0u,
    0u,
    0u,
    0u,
    vec4<f32>(origin, 1.0),
    vec4<f32>(rayDirection, 0.0),
    vec4<f32>(1.0, 1.0, 1.0, 1.0)
  );
}

fn scene_visibility_blocked(origin: vec3<f32>, direction: vec3<f32>, maxDistance: f32) -> bool {
  let testRay = visibility_test_ray(origin, direction);
  let nearest = max(maxDistance, 0.001);

  for (var objectIndex = 0u; objectIndex < config.sceneObjectCount; objectIndex = objectIndex + 1u) {
    let object = sceneObjects[objectIndex];
    var current = no_candidate();
    if (object.kind == 1u) {
      current = intersect_sphere(testRay, object);
    } else if (object.kind == 2u) {
      current = intersect_box(testRay, object);
    }
    if (current.hit == 1u && current.distance < nearest) {
      return true;
    }
  }

  let meshCandidate = intersect_bvh(testRay, nearest);
  return meshCandidate.hit == 1u && meshCandidate.distance < nearest;
}

fn surface_direct_environment_contribution(ray: RayRecord, hit: HitRecord) -> vec3<f32> {
  let normal = safe_normalize(hit.shadingNormal.xyz, vec3<f32>(0.0, 1.0, 0.0));
  let origin = hit.position.xyz + normal * 0.003;
  let viewDirection = safe_normalize(-ray.direction.xyz, normal);
  let lightSample = sample_environment_importance(vec2<f32>(
    random01(mix_seed(ray.sourcePixelId, ray.sampleId, ray.bounce, config.frameIndex, 41u)),
    random01(mix_seed(ray.sourcePixelId, ray.sampleId, ray.bounce, config.frameIndex, 43u))
  ));
  if (lightSample.pdf <= 0.000001) {
    return vec3<f32>(0.0);
  }
  let lightDirection = safe_normalize(lightSample.direction, normal);
  let nDotL = saturate(dot(normal, lightDirection));
  if (nDotL <= 0.000001) {
    return vec3<f32>(0.0);
  }
  if (scene_visibility_blocked(origin, lightDirection, 1000000.0)) {
    return vec3<f32>(0.0);
  }
  let incidentRadiance = direct_environment_radiance(origin, lightDirection);
  if (max_component(incidentRadiance) <= 0.000001) {
    return vec3<f32>(0.0);
  }
  let bsdf = evaluate_surface_bsdf(hit, viewDirection, lightDirection);
  if (max_component(bsdf) <= 0.000001) {
    return vec3<f32>(0.0);
  }
  let bsdfPdf = evaluate_surface_bsdf_pdf(hit, viewDirection, lightDirection);
  let misWeight = power_heuristic(lightSample.pdf, bsdfPdf);
  let contribution =
    ray.throughput.xyz *
    bsdf *
    incidentRadiance *
    (nDotL * misWeight / max(lightSample.pdf, 0.000001));
  return clamp_sample_radiance(contribution);
}

fn default_mesh_range() -> MeshRange {
  return MeshRange(
    0u,
    0u,
    0u,
    0u,
    0u,
    0u,
    0u,
    0u,
    0u,
    0u,
    0u,
    0u,
    vec4<f32>(0.72, 0.72, 0.68, 1.0),
    vec4<f32>(0.0),
    vec4<f32>(0.72, 0.0, 1.0, 1.45),
    vec4<f32>(0.0, 0.0, 0.0, 0.08),
    vec4<f32>(1.0, 1.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 1.0, 1.0),
    vec4<f32>(1.0, 1.0, 1.0, 0.0)
  );
}

fn mesh_range_for_triangle(triangleIndex: u32) -> MeshRange {
  var selected = default_mesh_range();
  for (var meshIndex = 0u; meshIndex < config.meshSourceCount; meshIndex = meshIndex + 1u) {
    let mesh = meshRanges[meshIndex];
    let triangleStart = mesh.firstTriangle;
    let triangleEnd = mesh.firstTriangle + mesh.triangleCount;
    if (triangleIndex >= triangleStart && triangleIndex < triangleEnd) {
      selected = mesh;
      break;
    }
  }
  return selected;
}

fn node_bounds_min(left: BvhNode, right: BvhNode) -> vec3<f32> {
  return min(left.boundsMin.xyz, right.boundsMin.xyz);
}

fn node_bounds_max(left: BvhNode, right: BvhNode) -> vec3<f32> {
  return max(left.boundsMax.xyz, right.boundsMax.xyz);
}

fn ordered_float_key(value: f32) -> u32 {
  let bits = bitcast<u32>(value);
  let sign = bits & 0x80000000u;
  let mask = select(0x80000000u, 0xffffffffu, sign != 0u);
  return bits ^ mask;
}

fn split_by_3(value: u32) -> u32 {
  var x = value & 0x000003ffu;
  x = (x | (x << 16u)) & 0x030000ffu;
  x = (x | (x << 8u)) & 0x0300f00fu;
  x = (x | (x << 4u)) & 0x030c30c3u;
  x = (x | (x << 2u)) & 0x09249249u;
  return x;
}

fn morton_key_from_centroid(centroid: vec3<f32>) -> u32 {
  let x = (ordered_float_key(centroid.x) >> 12u) & 0x000003ffu;
  let y = (ordered_float_key(centroid.y) >> 12u) & 0x000003ffu;
  let z = (ordered_float_key(centroid.z) >> 12u) & 0x000003ffu;
  return (split_by_3(x) << 2u) | (split_by_3(y) << 1u) | split_by_3(z);
}

fn leaf_ref_less(left: BvhLeafRef, right: BvhLeafRef) -> bool {
  if (left.key < right.key) {
    return true;
  }
  if (left.key > right.key) {
    return false;
  }
  return left.triangleIndex < right.triangleIndex;
}

@compute @workgroup_size(64)
fn prepareMeshTrianglesAndLeaves(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let triangleIndex = globalId.x;
  if (triangleIndex >= config.triangleCount) {
    if (triangleIndex < config.bvhSortItemCount) {
      bvhLeafRefs[triangleIndex] = BvhLeafRef(0xffffffffu, 0xffffffffu, 0u, 0u);
    }
    return;
  }

  let mesh = mesh_range_for_triangle(triangleIndex);
  let localTriangle = triangleIndex - mesh.firstTriangle;
  let indexOffset = mesh.firstIndex + localTriangle * 3u;
  let index0 = meshIndices[indexOffset];
  let index1 = meshIndices[indexOffset + 1u];
  let index2 = meshIndices[indexOffset + 2u];
  let vertex0 = meshVertices[index0];
  let vertex1 = meshVertices[index1];
  let vertex2 = meshVertices[index2];
  let edge1 = vertex1.position.xyz - vertex0.position.xyz;
  let edge2 = vertex2.position.xyz - vertex0.position.xyz;
  let centroid = (vertex0.position.xyz + vertex1.position.xyz + vertex2.position.xyz) / 3.0;
  let faceNormal = safe_normalize(cross(edge1, edge2), vec3<f32>(0.0, 1.0, 0.0));
  let n0 = select(faceNormal, safe_normalize(vertex0.normal.xyz, faceNormal), vertex0.normal.w > 0.5);
  let n1 = select(faceNormal, safe_normalize(vertex1.normal.xyz, faceNormal), vertex1.normal.w > 0.5);
  let n2 = select(faceNormal, safe_normalize(vertex2.normal.xyz, faceNormal), vertex2.normal.w > 0.5);
  let uv0 = select(vec2<f32>(0.0), vertex0.uv.xy, vertex0.uv.z > 0.5);
  let uv1 = select(vec2<f32>(0.0), vertex1.uv.xy, vertex1.uv.z > 0.5);
  let uv2 = select(vec2<f32>(0.0), vertex2.uv.xy, vertex2.uv.z > 0.5);

  triangles[triangleIndex] = TriangleRecord(
    triangleIndex,
    mesh.meshId,
    mesh.materialKind,
    mesh.flags,
    mesh.materialRefId,
    mesh.mediumRefId,
    mesh.materialSlot,
    0u,
    vec4<f32>(vertex0.position.xyz, 0.0),
    vec4<f32>(vertex1.position.xyz, 0.0),
    vec4<f32>(vertex2.position.xyz, 0.0),
    vec4<f32>(n0, 0.0),
    vec4<f32>(n1, 0.0),
    vec4<f32>(n2, 0.0),
    vec4<f32>(uv0, uv1),
    vec4<f32>(uv2, 0.0, 0.0),
    mesh.color,
    mesh.emission,
    mesh.material,
    mesh.materialResponse,
    mesh.materialExtension,
    mesh.specularColor,
    mesh.baseColorAtlas,
    mesh.metallicRoughnessAtlas,
    mesh.normalAtlas,
    mesh.occlusionAtlas,
    mesh.emissiveAtlas,
    mesh.textureSettings
  );

  let leafBase = config.triangleCount - 1u;
  let nodeIndex = leafBase + triangleIndex;
  let boundsMin = min(vertex0.position.xyz, min(vertex1.position.xyz, vertex2.position.xyz));
  let boundsMax = max(vertex0.position.xyz, max(vertex1.position.xyz, vertex2.position.xyz));
  bvhLeafRefs[triangleIndex] = BvhLeafRef(
    morton_key_from_centroid(centroid),
    triangleIndex,
    0u,
    0u
  );
  bvhNodes[nodeIndex] = BvhNode(
    vec4<f32>(boundsMin, 0.0),
    vec4<f32>(boundsMax, 0.0),
    triangleIndex,
    1u,
    0u,
    0u
  );
}

@compute @workgroup_size(64)
fn sortBvhLeafRefs(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let index = globalId.x;
  let sortCount = config.bvhSortItemCount;
  if (sortCount <= 1u || index >= sortCount) {
    return;
  }

  let compareDistance = config.bvhBuildNodeStart;
  let sequenceSize = config.bvhBuildNodeCount;
  if (compareDistance == 0u || sequenceSize == 0u) {
    return;
  }

  let partner = index ^ compareDistance;
  if (partner <= index || partner >= sortCount) {
    return;
  }

  let left = bvhLeafRefs[index];
  let right = bvhLeafRefs[partner];
  let ascending = (index & sequenceSize) == 0u;
  let leftIsLess = leaf_ref_less(left, right);
  let rightIsLess = leaf_ref_less(right, left);
  let shouldSwap = select(leftIsLess, rightIsLess, ascending);
  if (shouldSwap) {
    bvhLeafRefs[index] = right;
    bvhLeafRefs[partner] = left;
  }
}

@compute @workgroup_size(64)
fn writeSortedBvhLeaves(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let sortedIndex = globalId.x;
  if (sortedIndex >= config.triangleCount || config.triangleCount == 0u) {
    return;
  }

  let leafRef = bvhLeafRefs[sortedIndex];
  if (leafRef.triangleIndex >= config.triangleCount) {
    return;
  }

  let triangle = triangles[leafRef.triangleIndex];
  let boundsMin = min(triangle.v0.xyz, min(triangle.v1.xyz, triangle.v2.xyz));
  let boundsMax = max(triangle.v0.xyz, max(triangle.v1.xyz, triangle.v2.xyz));
  let leafBase = config.triangleCount - 1u;
  let nodeIndex = leafBase + sortedIndex;
  bvhNodes[nodeIndex] = BvhNode(
    vec4<f32>(boundsMin, 0.0),
    vec4<f32>(boundsMax, 0.0),
    leafRef.triangleIndex,
    1u,
    0u,
    0u
  );
}

@compute @workgroup_size(64)
fn buildBvhInternalLevel(@builtin(global_invocation_id) globalId: vec3<u32>) {
  if (config.triangleCount <= 1u || globalId.x >= config.bvhBuildNodeCount) {
    return;
  }

  let internalCount = config.triangleCount - 1u;
  let nodeIndex = config.bvhBuildNodeStart + globalId.x;
  if (nodeIndex >= internalCount || nodeIndex >= config.bvhNodeCapacity) {
    return;
  }

  let leftIndex = nodeIndex * 2u + 1u;
  let rightIndex = nodeIndex * 2u + 2u;
  if (rightIndex >= config.bvhNodeCapacity || rightIndex >= config.bvhNodeCount) {
    return;
  }

  let left = bvhNodes[leftIndex];
  let right = bvhNodes[rightIndex];
  bvhNodes[nodeIndex] = BvhNode(
    vec4<f32>(node_bounds_min(left, right), 0.0),
    vec4<f32>(node_bounds_max(left, right), 0.0),
    leftIndex,
    0u,
    rightIndex,
    0u
  );
}

fn make_ray(pixelIndex: u32) -> RayRecord {
  let localX = pixelIndex % config.tileWidth;
  let localY = pixelIndex / config.tileWidth;
  let px = config.tileX + localX;
  let py = config.tileY + localY;
  let sampleId = u32(config.projectionAndSampling.w);
  let sourcePixelId = py * config.canvasWidth + px;
  let jitterX = random01(mix_seed(sourcePixelId, sampleId, 0u, config.frameIndex, 1u)) - 0.5;
  let jitterY = random01(mix_seed(sourcePixelId, sampleId, 0u, config.frameIndex, 2u)) - 0.5;
  let ndcX = ((f32(px) + 0.5 + jitterX * 0.35) / f32(config.canvasWidth)) * 2.0 - 1.0;
  let ndcY = 1.0 - ((f32(py) + 0.5 + jitterY * 0.35) / f32(config.canvasHeight)) * 2.0;
  let viewX = ndcX * config.projectionAndSampling.x * config.projectionAndSampling.y;
  let viewY = ndcY * config.projectionAndSampling.x;
  let direction = safe_normalize(
    config.cameraForward.xyz + config.cameraRight.xyz * viewX + config.cameraUp.xyz * viewY,
    config.cameraForward.xyz
  );
  return RayRecord(
    pixelIndex,
    0xffffffffu,
    sourcePixelId,
    sampleId,
    0u,
    0u,
    0u,
    0u,
    vec4<f32>(config.cameraPosition.xyz, 1.0),
    vec4<f32>(direction, 0.0),
    vec4<f32>(1.0, 1.0, 1.0, 1.0)
  );
}

fn make_miss(ray: RayRecord) -> HitRecord {
  let radiance = gated_environment_radiance(ray.origin.xyz, ray.direction.xyz);
  return HitRecord(
    ray.rayId,
    ray.sourcePixelId,
    2u,
    0u,
    0u,
    1u,
    0u,
    0u,
    0u,
    0u,
    0u,
    0u,
    -1.0,
    1.0,
    vec2<f32>(0.0),
    vec4<f32>(ray.origin.xyz + ray.direction.xyz * 1000.0, 1.0),
    vec4<f32>(-ray.direction.xyz, 0.0),
    vec4<f32>(-ray.direction.xyz, 0.0),
    vec4<f32>(0.0),
    vec4<f32>(0.0),
    vec4<f32>(radiance, 1.0),
    vec4<f32>(0.0),
    vec4<f32>(1.0, 0.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 0.0, 0.08),
    vec4<f32>(0.08, 1.0, 0.0, 0.0),
    vec4<f32>(1.0, 1.0, 1.0, 1.0)
  );
}

fn intersect_sphere(ray: RayRecord, object: SceneObject) -> Candidate {
  let oc = ray.origin.xyz - object.center.xyz;
  let radius = max(object.halfExtent.x, 0.001);
  let halfB = dot(oc, ray.direction.xyz);
  let c = dot(oc, oc) - radius * radius;
  let discriminant = halfB * halfB - c;
  if (discriminant < 0.0) {
    return no_candidate();
  }
  let sqrtD = sqrt(discriminant);
  var distance = -halfB - sqrtD;
  if (distance <= 0.001) {
    distance = -halfB + sqrtD;
  }
  if (distance <= 0.001) {
    return no_candidate();
  }
  let position = ray.origin.xyz + ray.direction.xyz * distance;
  let outward = safe_normalize((position - object.center.xyz) / radius, vec3<f32>(0.0, 1.0, 0.0));
  let frontFace = select(0u, 1u, dot(ray.direction.xyz, outward) < 0.0);
  let normal = select(-outward, outward, frontFace == 1u);
  return surface_candidate(
    distance,
    normal,
    normal,
    vec3<f32>(1.0, 0.0, 0.0),
    vec2<f32>(0.0),
    frontFace,
    0xffffffffu,
    object.objectId,
    object.objectId,
    0u
  );
}

fn safe_inverse(value: f32) -> f32 {
  if (abs(value) < 0.000001) {
    return select(-1000000.0, 1000000.0, value >= 0.0);
  }
  return 1.0 / value;
}

fn intersect_box(ray: RayRecord, object: SceneObject) -> Candidate {
  let boxMin = object.center.xyz - object.halfExtent.xyz;
  let boxMax = object.center.xyz + object.halfExtent.xyz;
  let inv = vec3<f32>(
    safe_inverse(ray.direction.x),
    safe_inverse(ray.direction.y),
    safe_inverse(ray.direction.z)
  );
  let t0 = (boxMin - ray.origin.xyz) * inv;
  let t1 = (boxMax - ray.origin.xyz) * inv;
  let tNear = min(t0, t1);
  let tFar = max(t0, t1);
  let entry = max(max(tNear.x, tNear.y), tNear.z);
  let exit = min(min(tFar.x, tFar.y), tFar.z);
  if (exit < max(entry, 0.001)) {
    return no_candidate();
  }
  let distance = max(entry, 0.001);
  let position = ray.origin.xyz + ray.direction.xyz * distance;
  let rel = (position - object.center.xyz) / max(object.halfExtent.xyz, vec3<f32>(0.001));
  let absRel = abs(rel);
  var outward = vec3<f32>(0.0, 1.0, 0.0);
  if (absRel.x >= absRel.y && absRel.x >= absRel.z) {
    outward = vec3<f32>(select(-1.0, 1.0, rel.x >= 0.0), 0.0, 0.0);
  } else if (absRel.y >= absRel.z) {
    outward = vec3<f32>(0.0, select(-1.0, 1.0, rel.y >= 0.0), 0.0);
  } else {
    outward = vec3<f32>(0.0, 0.0, select(-1.0, 1.0, rel.z >= 0.0));
  }
  let frontFace = select(0u, 1u, dot(ray.direction.xyz, outward) < 0.0);
  let normal = select(-outward, outward, frontFace == 1u);
  return surface_candidate(
    distance,
    normal,
    normal,
    vec3<f32>(1.0, 0.0, 0.0),
    vec2<f32>(0.0),
    frontFace,
    0xffffffffu,
    object.objectId,
    object.objectId,
    0u
  );
}

fn intersect_bounds(ray: RayRecord, boundsMin: vec3<f32>, boundsMax: vec3<f32>, nearest: f32) -> bool {
  let inv = vec3<f32>(
    safe_inverse(ray.direction.x),
    safe_inverse(ray.direction.y),
    safe_inverse(ray.direction.z)
  );
  let t0 = (boundsMin - ray.origin.xyz) * inv;
  let t1 = (boundsMax - ray.origin.xyz) * inv;
  let tNear = min(t0, t1);
  let tFar = max(t0, t1);
  let entry = max(max(tNear.x, tNear.y), tNear.z);
  let exit = min(min(tFar.x, tFar.y), tFar.z);
  return exit >= max(entry, 0.001) && entry <= nearest;
}

fn repair_shading_normal(geometricNormal: vec3<f32>, shadingNormal: vec3<f32>) -> vec3<f32> {
  var normal = safe_normalize(shadingNormal, geometricNormal);
  if (dot(normal, geometricNormal) < 0.0) {
    normal = -normal;
  }
  return normal;
}

fn no_candidate() -> Candidate {
  return Candidate(
    0u,
    0.0,
    vec3<f32>(0.0, 1.0, 0.0),
    vec3<f32>(0.0, 1.0, 0.0),
    vec3<f32>(0.0),
    vec2<f32>(0.0),
    1u,
    0xffffffffu,
    0xffffffffu,
    0u,
    0u
  );
}

fn surface_candidate(
  distance: f32,
  geometricNormal: vec3<f32>,
  shadingNormal: vec3<f32>,
  barycentric: vec3<f32>,
  uv: vec2<f32>,
  frontFace: u32,
  triangleIndex: u32,
  primitiveId: u32,
  materialRefId: u32,
  mediumRefId: u32
) -> Candidate {
  return Candidate(
    1u,
    distance,
    geometricNormal,
    shadingNormal,
    barycentric,
    uv,
    frontFace,
    triangleIndex,
    primitiveId,
    materialRefId,
    mediumRefId
  );
}

fn intersect_triangle(ray: RayRecord, triangle: TriangleRecord, triangleIndex: u32) -> Candidate {
  let edge1 = triangle.v1.xyz - triangle.v0.xyz;
  let edge2 = triangle.v2.xyz - triangle.v0.xyz;
  let pvec = cross(ray.direction.xyz, edge2);
  let det = dot(edge1, pvec);
  if (abs(det) < 0.0000001) {
    return no_candidate();
  }

  let invDet = 1.0 / det;
  let tvec = ray.origin.xyz - triangle.v0.xyz;
  let u = dot(tvec, pvec) * invDet;
  if (u < 0.0 || u > 1.0) {
    return no_candidate();
  }

  let qvec = cross(tvec, edge1);
  let v = dot(ray.direction.xyz, qvec) * invDet;
  if (v < 0.0 || u + v > 1.0) {
    return no_candidate();
  }

  let distance = dot(edge2, qvec) * invDet;
  if (distance <= 0.001) {
    return no_candidate();
  }

  let geometric = safe_normalize(cross(edge1, edge2), vec3<f32>(0.0, 1.0, 0.0));
  let frontFace = select(0u, 1u, dot(ray.direction.xyz, geometric) < 0.0);
  let orientedGeometric = select(-geometric, geometric, frontFace == 1u);
  let w = 1.0 - u - v;
  let interpolated =
    triangle.n0.xyz * w +
    triangle.n1.xyz * u +
    triangle.n2.xyz * v;
  let shading = repair_shading_normal(orientedGeometric, interpolated);
  let barycentric = vec3<f32>(w, u, v);
  let uv =
    triangle.uv0uv1.xy * w +
    triangle.uv0uv1.zw * u +
    triangle.uv2Pad.xy * v;
  return surface_candidate(
    distance,
    orientedGeometric,
    shading,
    barycentric,
    uv,
    frontFace,
    triangleIndex,
    triangle.triangleId,
    triangle.materialRefId,
    triangle.mediumRefId
  );
}

fn intersect_bvh(ray: RayRecord, initialNearest: f32) -> Candidate {
  var nearest = initialNearest;
  var best = no_candidate();
  if (config.bvhNodeCount == 0u || config.triangleCount == 0u) {
    return best;
  }

  var stack = array<u32, 64>();
  var stackSize = 1u;
  stack[0] = 0u;

  loop {
    if (stackSize == 0u) {
      break;
    }

    stackSize = stackSize - 1u;
    let nodeIndex = stack[stackSize];
    if (nodeIndex >= config.bvhNodeCount) {
      continue;
    }

    let node = bvhNodes[nodeIndex];
    if (!intersect_bounds(ray, node.boundsMin.xyz, node.boundsMax.xyz, nearest)) {
      continue;
    }

    if (node.triangleCount > 0u) {
      for (var offset = 0u; offset < node.triangleCount; offset = offset + 1u) {
        let triangleIndex = node.childOrFirst + offset;
        if (triangleIndex >= config.triangleCount) {
          continue;
        }
        let current = intersect_triangle(ray, triangles[triangleIndex], triangleIndex);
        if (current.hit == 1u && current.distance < nearest) {
          nearest = current.distance;
          best = current;
        }
      }
    } else {
      if (stackSize + 2u <= 64u) {
        stack[stackSize] = node.childOrFirst;
        stack[stackSize + 1u] = node.rightChild;
        stackSize = stackSize + 2u;
      }
    }
  }

  return best;
}

fn emission_power(emission: vec4<f32>) -> f32 {
  return emission.x + emission.y + emission.z;
}

fn sample_weight() -> f32 {
  return max(config.projectionAndSampling.z, 0.000001);
}

fn clamp_sample_radiance(value: vec3<f32>) -> vec3<f32> {
  return min(max(value, vec3<f32>(0.0)), vec3<f32>(4.0));
}

fn tone_map_radiance(value: vec3<f32>) -> vec3<f32> {
  let mapped = value / (vec3<f32>(1.0) + value);
  return pow(clamp(mapped, vec3<f32>(0.0), vec3<f32>(1.0)), vec3<f32>(1.0 / 2.2));
}

fn ray_workgroups_for_count(rayCount: u32) -> u32 {
  return max(1u, (rayCount + 63u) / 64u);
}

fn write_active_dispatch_args(activeCount: u32) {
  counters.dispatchX = ray_workgroups_for_count(activeCount);
  counters.dispatchY = 1u;
  counters.dispatchZ = 1u;
  counters.dispatchPad = 0u;
}

fn denoise_range_space(value: vec3<f32>) -> vec3<f32> {
  return value / (vec3<f32>(1.0) + value);
}

fn denoise_sample_count() -> f32 {
  return clamp(1.0 / max(config.projectionAndSampling.z, 0.000001), 1.0, 256.0);
}

fn denoise_strength() -> f32 {
  let spp = denoise_sample_count();
  return clamp(0.44 / sqrt(spp), 0.08, 0.44);
}

fn denoise_kernel_radius() -> i32 {
  return select(1i, 2i, denoise_sample_count() < 2.5);
}

@compute @workgroup_size(64)
fn generatePrimaryRays(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let index = globalId.x;
  if (index == 0u) {
    atomicStore(&counters.activeCount, config.tilePixelCount);
    atomicStore(&counters.nextCount, 0u);
    atomicStore(&counters.terminatedCount, 0u);
    atomicStore(&counters.hitCount, 0u);
    write_active_dispatch_args(config.tilePixelCount);
  }
  if (index >= config.tilePixelCount) {
    return;
  }
  activeQueue[index] = make_ray(index);
  clear_deferred_path(index);
  if (u32(config.projectionAndSampling.w) == 0u) {
    accumulation[index] = vec4<f32>(0.0);
  }
}

@compute @workgroup_size(64)
fn intersectActiveQueue(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let index = globalId.x;
  let activeCount = atomicLoad(&counters.activeCount);
  if (index >= activeCount) {
    return;
  }
  let ray = activeQueue[index];
  var nearest = 1000000.0;
  var hitObject = SceneObject(
    0u,
    0u,
    0u,
    0u,
    vec4<f32>(0.0),
    vec4<f32>(0.0),
    vec4<f32>(0.0),
    vec4<f32>(0.0),
    vec4<f32>(1.0, 0.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 0.0, 0.08),
    vec4<f32>(0.08, 1.0, 0.0, 0.0),
    vec4<f32>(1.0, 1.0, 1.0, 1.0)
  );
  var candidate = no_candidate();
  var hitTriangle = TriangleRecord(
    0u,
    0u,
    0u,
    0u,
    0u,
    0u,
    0u,
    0u,
    vec4<f32>(0.0),
    vec4<f32>(0.0),
    vec4<f32>(0.0),
    vec4<f32>(0.0, 1.0, 0.0, 0.0),
    vec4<f32>(0.0, 1.0, 0.0, 0.0),
    vec4<f32>(0.0, 1.0, 0.0, 0.0),
    vec4<f32>(0.0),
    vec4<f32>(0.0),
    vec4<f32>(0.0),
    vec4<f32>(0.0),
    vec4<f32>(1.0, 0.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 0.0, 0.08),
    vec4<f32>(0.08, 1.0, 0.0, 0.0),
    vec4<f32>(1.0, 1.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 1.0, 1.0),
    vec4<f32>(1.0, 1.0, 1.0, 0.0)
  );

  for (var objectIndex = 0u; objectIndex < config.sceneObjectCount; objectIndex = objectIndex + 1u) {
    let object = sceneObjects[objectIndex];
    var current = no_candidate();
    if (object.kind == 1u) {
      current = intersect_sphere(ray, object);
    } else if (object.kind == 2u) {
      current = intersect_box(ray, object);
    }
    if (current.hit == 1u && current.distance < nearest) {
      nearest = current.distance;
      hitObject = object;
      candidate = current;
    }
  }

  let meshCandidate = intersect_bvh(ray, nearest);
  if (meshCandidate.hit == 1u && meshCandidate.distance < nearest) {
    nearest = meshCandidate.distance;
    candidate = meshCandidate;
    hitTriangle = triangles[meshCandidate.triangleIndex];
  }

  if (candidate.hit == 0u) {
    hits[index] = make_miss(ray);
    return;
  }

  let position = ray.origin.xyz + ray.direction.xyz * candidate.distance;
  let hitMaterialKind = select(hitObject.materialKind, hitTriangle.materialKind, candidate.triangleIndex != 0xffffffffu);
  let hitObjectId = select(hitObject.objectId, hitTriangle.meshId, candidate.triangleIndex != 0xffffffffu);
  let meshSurface = sample_surface_material(
    hitTriangle,
    candidate.uv,
    candidate.geometricNormal,
    candidate.shadingNormal
  );
  let hitColor = select(hitObject.color, meshSurface.color, candidate.triangleIndex != 0xffffffffu);
  let hitEmission = select(hitObject.emission, meshSurface.emission, candidate.triangleIndex != 0xffffffffu);
  let hitMaterial = select(hitObject.material, meshSurface.material, candidate.triangleIndex != 0xffffffffu);
  let hitMaterialResponse = select(hitObject.materialResponse, meshSurface.materialResponse, candidate.triangleIndex != 0xffffffffu);
  let hitMaterialExtension = select(hitObject.materialExtension, meshSurface.materialExtension, candidate.triangleIndex != 0xffffffffu);
  let hitSpecularColor = select(hitObject.specularColor, meshSurface.specularColor, candidate.triangleIndex != 0xffffffffu);
  let hitShadingNormal = select(candidate.shadingNormal, meshSurface.shadingNormal, candidate.triangleIndex != 0xffffffffu);
  let hitPrimitiveId = select(candidate.primitiveId, hitTriangle.triangleId, candidate.triangleIndex != 0xffffffffu);
  let hitMaterialRefId = select(candidate.materialRefId, hitTriangle.materialRefId, candidate.triangleIndex != 0xffffffffu);
  let hitMediumRefId = select(candidate.mediumRefId, hitTriangle.mediumRefId, candidate.triangleIndex != 0xffffffffu);
  let hitMaterialSlot = select(0u, hitTriangle.materialSlot, candidate.triangleIndex != 0xffffffffu);
  let hitOcclusion = select(1.0, meshSurface.occlusion, candidate.triangleIndex != 0xffffffffu);
  var hitType = 0u;
  if (hitMaterialKind == 4u || emission_power(hitEmission) > 0.0001) {
    hitType = 1u;
  } else if (hitMaterialKind == 3u || hitMaterial.z < 0.999 || hitMaterialExtension.z > 0.001) {
    hitType = 3u;
  }
  atomicAdd(&counters.hitCount, 1u);
  hits[index] = HitRecord(
    ray.rayId,
    ray.sourcePixelId,
    hitType,
    hitObjectId,
    hitMaterialKind,
    candidate.frontFace,
    hitPrimitiveId,
    hitMaterialRefId,
    hitMediumRefId,
    hitMaterialSlot,
    0u,
    0u,
    candidate.distance,
    hitOcclusion,
    vec2<f32>(0.0),
    vec4<f32>(position, 1.0),
    vec4<f32>(candidate.geometricNormal, 0.0),
    vec4<f32>(hitShadingNormal, 0.0),
    vec4<f32>(candidate.barycentric, 0.0),
    vec4<f32>(candidate.uv, 0.0, 0.0),
    hitColor,
    hitEmission,
    hitMaterial,
    hitMaterialResponse,
    hitMaterialExtension,
    hitSpecularColor
  );
}

fn offset_origin(position: vec3<f32>, normal: vec3<f32>) -> vec3<f32> {
  return position + normal * 0.0025;
}

fn random_unit_vector(seed: u32) -> vec3<f32> {
  let z = random01(seed) * 2.0 - 1.0;
  let a = random01(seed + 11u) * 6.28318530718;
  let r = sqrt(max(0.0, 1.0 - z * z));
  return vec3<f32>(r * cos(a), r * sin(a), z);
}

fn schlick(cosine: f32, refractionRatio: f32) -> f32 {
  var r0 = (1.0 - refractionRatio) / (1.0 + refractionRatio);
  r0 = r0 * r0;
  return r0 + (1.0 - r0) * pow(1.0 - cosine, 5.0);
}

fn refract_direction(unitDirection: vec3<f32>, normal: vec3<f32>, etaRatio: f32) -> vec3<f32> {
  let cosTheta = min(dot(-unitDirection, normal), 1.0);
  let rOutPerp = etaRatio * (unitDirection + cosTheta * normal);
  let rOutParallel = -sqrt(abs(1.0 - dot(rOutPerp, rOutPerp))) * normal;
  return safe_normalize(rOutPerp + rOutParallel, reflect(unitDirection, normal));
}

fn sample_emissive_triangle_direction(hit: HitRecord, seed: u32, fallback: vec3<f32>) -> vec3<f32> {
  if (config.emissiveTriangleCount == 0u) {
    return fallback;
  }
  let lightSlot = min(u32(random01(seed + 71u) * f32(config.emissiveTriangleCount)), config.emissiveTriangleCount - 1u);
  let lightMetadata = bvhNodes[config.bvhNodeCapacity + lightSlot];
  let triangleIndex = lightMetadata.childOrFirst;
  if (triangleIndex >= config.triangleCount) {
    return fallback;
  }

  let lightTriangle = triangles[triangleIndex];
  let r1 = random01(seed + 101u);
  let r2 = random01(seed + 193u);
  let root = sqrt(r1);
  let b0 = 1.0 - root;
  let b1 = root * (1.0 - r2);
  let b2 = root * r2;
  let lightPoint =
    lightTriangle.v0.xyz * b0 +
    lightTriangle.v1.xyz * b1 +
    lightTriangle.v2.xyz * b2;
  return safe_normalize(lightPoint - hit.position.xyz, fallback);
}

fn sample_environment_portal_direction(hit: HitRecord, seed: u32, fallback: vec3<f32>) -> vec3<f32> {
  if (config.environmentPortalCount == 0u || config.environmentPortalMode == 0u) {
    return fallback;
  }
  let portalSlot = min(
    u32(random01(seed + 211u) * f32(config.environmentPortalCount)),
    config.environmentPortalCount - 1u
  );
  let portal = environmentPortals[portalSlot];
  let u = (random01(seed + 223u) * 2.0 - 1.0) * portal.tangent.w;
  let v = (random01(seed + 227u) * 2.0 - 1.0) * portal.bitangent.w;
  let portalTarget = portal.position.xyz + portal.tangent.xyz * u + portal.bitangent.xyz * v;
  return safe_normalize(portalTarget - hit.position.xyz, fallback);
}

fn scatter_direction(ray: RayRecord, hit: HitRecord, seed: u32) -> ScatterResult {
  let normal = safe_normalize(hit.shadingNormal.xyz, vec3<f32>(0.0, 1.0, 0.0));
  let viewDirection = safe_normalize(-ray.direction.xyz, normal);
  let roughness = clamp(hit.material.x, 0.0, 1.0);
  let transmission = clamp(hit.materialExtension.z, 0.0, 1.0);
  if (hit.materialKind == 1u && roughness <= 0.02) {
    return ScatterResult(
      vec4<f32>(reflect(ray.direction.xyz, normal), 0.0),
      1.0,
      RAY_FLAG_DELTA_SAMPLE,
      0u,
      0u
    );
  }

  if (hit.materialKind == 2u || hit.materialKind == 3u || transmission > 0.001) {
    let ior = max(hit.material.w, 1.01);
    let etaRatio = select(ior, 1.0 / ior, hit.frontFace == 1u);
    let cosTheta = min(dot(-ray.direction.xyz, normal), 1.0);
    let sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));
    let cannotRefract = etaRatio * sinTheta > 1.0;
    let reflectChance = schlick(cosTheta, etaRatio);
    let transmissionReflectChance = select(
      reflectChance,
      max(reflectChance, 1.0 - transmission),
      transmission > 0.001
    );
    if (cannotRefract || random01(seed + 23u) < transmissionReflectChance) {
      return ScatterResult(
        vec4<f32>(reflect(ray.direction.xyz, normal), 0.0),
        1.0,
        RAY_FLAG_DELTA_SAMPLE,
        0u,
        0u
      );
    }
    return ScatterResult(
      vec4<f32>(refract_direction(ray.direction.xyz, normal, etaRatio), 0.0),
      1.0,
      RAY_FLAG_DELTA_SAMPLE,
      0u,
      0u
    );
  }

  let weights = surface_bsdf_sampling_weights(hit);
  let selector = random01(seed + 31u);
  var lightDirection = normal;
  if (selector < weights.x) {
    lightDirection = cosine_sample_hemisphere(
      vec2<f32>(random01(seed + 37u), random01(seed + 41u)),
      normal
    );
  } else if (selector < weights.x + weights.y) {
    let halfVector = importance_sample_ggx(
      vec2<f32>(random01(seed + 47u), random01(seed + 53u)),
      max(roughness, 0.02),
      normal
    );
    lightDirection = safe_normalize(reflect(-viewDirection, halfVector), normal);
  } else {
    let halfVector = importance_sample_ggx(
      vec2<f32>(random01(seed + 59u), random01(seed + 61u)),
      max(clamp(hit.materialExtension.x, 0.0, 1.0), 0.02),
      normal
    );
    lightDirection = safe_normalize(reflect(-viewDirection, halfVector), normal);
  }
  if (dot(normal, lightDirection) <= 0.000001) {
    lightDirection = cosine_sample_hemisphere(
      vec2<f32>(random01(seed + 67u), random01(seed + 71u)),
      normal
    );
  }
  let pdf = max(evaluate_surface_bsdf_pdf(hit, viewDirection, lightDirection), 0.000001);
  return ScatterResult(vec4<f32>(lightDirection, 0.0), pdf, 0u, 0u, 0u);
}

@compute @workgroup_size(64)
fn resolveSurfaceRecords(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let index = globalId.x;
  let activeCount = atomicLoad(&counters.activeCount);
  if (index >= activeCount) {
    return;
  }

  let ray = activeQueue[index];
  let hit = hits[index];
  var contribution = vec3<f32>(0.0);

  if (hit.hitType == 1u) {
    let guidedLightWeight = select(1.0, 0.24, (ray.flags & RAY_FLAG_GUIDED_EMISSIVE) != 0u);
    let sourceRadiance = max(hit.emission.xyz, hit.color.xyz) * guidedLightWeight;
    if (deferred_path_resolve_enabled()) {
      record_deferred_terminal_source(ray, sourceRadiance);
    } else {
      contribution = clamp_sample_radiance(ray.throughput.xyz * sourceRadiance);
      accumulation[ray.rayId] =
        accumulation[ray.rayId] + vec4<f32>(contribution * sample_weight(), 1.0);
    }
    atomicAdd(&counters.terminatedCount, 1u);
    return;
  }

  if (hit.hitType == 2u) {
    var sourceRadiance = hit.color.xyz;
    if ((ray.flags & RAY_FLAG_DELTA_SAMPLE) == 0u) {
      let bsdfPdf = max(ray.throughput.w, 0.000001);
      let lightPdf = environment_direction_pdf(ray.direction.xyz);
      let misWeight = power_heuristic(bsdfPdf, lightPdf);
      sourceRadiance = sourceRadiance * misWeight;
    }
    if (deferred_path_resolve_enabled()) {
      record_deferred_terminal_source(ray, sourceRadiance);
    } else {
      contribution = clamp_sample_radiance(ray.throughput.xyz * sourceRadiance);
      accumulation[ray.rayId] =
        accumulation[ray.rayId] + vec4<f32>(contribution * sample_weight(), 1.0);
    }
    atomicAdd(&counters.terminatedCount, 1u);
    return;
  }

  let response = stabilize_surface_path_response(ray, hit, surface_path_response(hit));
  record_deferred_path_response(ray, response);

  let shouldEstimateDirectEnvironment =
    (hit.materialKind == 0u || hit.materialKind == 1u) &&
    hit.material.z >= 0.95 &&
    ray.bounce < 2u;
  if (shouldEstimateDirectEnvironment) {
    let directEnvironment = surface_direct_environment_contribution(ray, hit);
    accumulation[ray.rayId] =
      accumulation[ray.rayId] + vec4<f32>(directEnvironment * sample_weight(), 0.0);
  }

  if (ray.bounce + 1u >= config.maxDepth) {
    if (deferred_path_resolve_enabled()) {
      record_deferred_terminal_source(ray, terminal_surface_environment_source(ray, hit));
    } else {
      let terminalEnvironment = terminal_surface_environment_contribution(ray, hit);
      accumulation[ray.rayId] =
        accumulation[ray.rayId] + vec4<f32>(terminalEnvironment * sample_weight(), 1.0);
    }
    atomicAdd(&counters.terminatedCount, 1u);
    return;
  }

  let seed = mix_seed(ray.sourcePixelId, ray.sampleId, ray.bounce, config.frameIndex, 11u);
  let scatter = scatter_direction(ray, hit, seed);
  let nextIndex = atomicAdd(&counters.nextCount, 1u);
  if (nextIndex >= config.tilePixelCount) {
    if (deferred_path_resolve_enabled()) {
      record_deferred_terminal_source(ray, terminal_surface_environment_source(ray, hit));
    } else {
      let overflowEnvironment = terminal_surface_environment_contribution(ray, hit);
      accumulation[ray.rayId] =
        accumulation[ray.rayId] + vec4<f32>(overflowEnvironment * sample_weight(), 1.0);
    }
    atomicAdd(&counters.terminatedCount, 1u);
    return;
  }
  let throughput = ray.throughput.xyz * response;
  nextQueue[nextIndex] = RayRecord(
    ray.rayId,
    ray.rayId,
    ray.sourcePixelId,
    ray.sampleId,
    ray.bounce + 1u,
    ray.mediumRefId,
    scatter.flags,
    0u,
    vec4<f32>(offset_origin(hit.position.xyz, hit.shadingNormal.xyz), 1.0),
    scatter.direction,
    vec4<f32>(throughput, scatter.pdf)
  );
}

@compute @workgroup_size(1)
fn compactAndSwapQueues(@builtin(global_invocation_id) globalId: vec3<u32>) {
  if (globalId.x > 0u) {
    return;
  }
  let nextCount = atomicLoad(&counters.nextCount);
  let activeCount = min(nextCount, config.tilePixelCount);
  atomicStore(&counters.activeCount, activeCount);
  atomicStore(&counters.nextCount, 0u);
  write_active_dispatch_args(activeCount);
}

fn resolve_deferred_path_radiance(rayId: u32) -> vec3<f32> {
  let terminal = pathVertices[path_vertex_index(rayId, config.maxDepth)];
  if (terminal.w <= 0.0) {
    return vec3<f32>(0.0);
  }

  var radiance = terminal.xyz;
  var depth = config.maxDepth;
  loop {
    if (depth == 0u) {
      break;
    }
    depth = depth - 1u;
    let response = pathVertices[path_vertex_index(rayId, depth)];
    if (response.w > 0.0) {
      radiance = radiance * response.xyz;
    }
  }
  return clamp_sample_radiance(radiance);
}

@compute @workgroup_size(64)
fn accumulateTerminalRadiance(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let index = globalId.x;
  if (index >= config.tilePixelCount) {
    return;
  }
  let localX = index % config.tileWidth;
  let localY = index / config.tileWidth;
  let pixel = vec2<i32>(i32(config.tileX + localX), i32(config.tileY + localY));
  var radiance = max(accumulation[index].xyz, vec3<f32>(0.0));
  if (deferred_path_resolve_enabled()) {
    let resolved = resolve_deferred_path_radiance(index) * sample_weight();
    radiance = clamp_sample_radiance(radiance + resolved);
    accumulation[index] = vec4<f32>(radiance, 1.0);
  }

  textureStore(radianceImage, pixel, vec4<f32>(radiance, 1.0));
  if (config.denoise == 0u) {
    textureStore(outputImage, pixel, vec4<f32>(tone_map_radiance(radiance), 1.0));
  }
}

@compute @workgroup_size(8, 8)
fn denoiseLinearRadiance(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let x = globalId.x;
  let y = globalId.y;
  if (x >= config.canvasWidth || y >= config.canvasHeight) {
    return;
  }

  let pixel = vec2<i32>(i32(x), i32(y));
  let center = textureLoad(denoiseInputRadiance, pixel, 0).xyz;
  let strength = denoise_strength();
  let kernelRadius = denoise_kernel_radius();
  let centerWeight = 1.7 - strength * 0.35;
  var sum = center * centerWeight;
  var totalWeight = centerWeight;
  let centerRange = denoise_range_space(center);

  for (var oy = -2i; oy <= 2i; oy = oy + 1i) {
    for (var ox = -2i; ox <= 2i; ox = ox + 1i) {
      if (ox == 0i && oy == 0i) {
        continue;
      }
      if (abs(ox) > kernelRadius || abs(oy) > kernelRadius) {
        continue;
      }
      let sx = clamp(i32(x) + ox, 0i, i32(config.canvasWidth) - 1i);
      let sy = clamp(i32(y) + oy, 0i, i32(config.canvasHeight) - 1i);
      let sampleColor = textureLoad(denoiseInputRadiance, vec2<i32>(sx, sy), 0).xyz;
      let colorDistance = length(denoise_range_space(sampleColor) - centerRange);
      let rangeWeight = 1.0 / (1.0 + colorDistance * (11.0 + strength * 6.0));
      let distanceWeight = 1.0 / (1.0 + f32(ox * ox + oy * oy) * (0.62 + strength * 0.24));
      let diagonalWeight = select(1.0, 0.92, abs(ox) + abs(oy) > 1i);
      let weight = rangeWeight * diagonalWeight * distanceWeight;
      sum = sum + sampleColor * weight;
      totalWeight = totalWeight + weight;
    }
  }

  let filtered = sum / max(totalWeight, 0.0001);
  let outlier = saturate(length(denoise_range_space(center) - denoise_range_space(filtered)) * 2.1);
  let blend = min(0.3, strength * (0.62 + outlier * 0.12));
  let color = min(mix(center, filtered, blend), vec3<f32>(16.0));
  textureStore(denoisedRadianceImage, pixel, vec4<f32>(color, 1.0));
}

@compute @workgroup_size(8, 8)
fn resolveDenoisedOutputImage(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let x = globalId.x;
  let y = globalId.y;
  if (x >= config.canvasWidth || y >= config.canvasHeight) {
    return;
  }

  let pixel = vec2<i32>(i32(x), i32(y));
  let center = textureLoad(finalDenoiseInputRadiance, pixel, 0).xyz;
  let strength = denoise_strength();
  let centerWeight = 1.35 - strength * 0.25;
  var sum = center * centerWeight;
  var totalWeight = centerWeight;
  let centerRange = denoise_range_space(center);

  for (var oy = -1i; oy <= 1i; oy = oy + 1i) {
    for (var ox = -1i; ox <= 1i; ox = ox + 1i) {
      if (ox == 0i && oy == 0i) {
        continue;
      }
      let sx = clamp(i32(x) + ox, 0i, i32(config.canvasWidth) - 1i);
      let sy = clamp(i32(y) + oy, 0i, i32(config.canvasHeight) - 1i);
      let sampleColor = textureLoad(finalDenoiseInputRadiance, vec2<i32>(sx, sy), 0).xyz;
      let colorDistance = length(denoise_range_space(sampleColor) - centerRange);
      let rangeWeight = 1.0 / (1.0 + colorDistance * (12.0 + strength * 8.0));
      let distanceWeight = 1.0 / (1.0 + f32(ox * ox + oy * oy) * (0.82 + strength * 0.28));
      let weight = rangeWeight * distanceWeight;
      sum = sum + sampleColor * weight;
      totalWeight = totalWeight + weight;
    }
  }

  let filtered = sum / max(totalWeight, 0.0001);
  let outlier = saturate(length(denoise_range_space(center) - denoise_range_space(filtered)) * 2.2);
  let blend = min(0.18, strength * (0.42 + outlier * 0.08));
  let radiance = min(mix(center, filtered, blend), vec3<f32>(16.0));
  textureStore(denoisedOutputImage, pixel, vec4<f32>(tone_map_radiance(radiance), 1.0));
}
`;

const PRESENT_WGSL = `
struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOut {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  var uvs = array<vec2<f32>, 3>(
    vec2<f32>(0.0, 1.0),
    vec2<f32>(2.0, 1.0),
    vec2<f32>(0.0, -1.0)
  );
  var out: VertexOut;
  out.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
  out.uv = uvs[vertexIndex];
  return out;
}

@group(0) @binding(0) var renderTexture: texture_2d<f32>;
@group(0) @binding(1) var renderSampler: sampler;

@fragment
fn fragmentMain(in: VertexOut) -> @location(0) vec4<f32> {
  return textureSample(renderTexture, renderSampler, in.uv);
}
`;

function createWavefrontDeviceDescriptor(adapter, options = {}) {
  const requiredLimits = { ...(options.requiredLimits ?? {}) };
  const exposedStorageBufferLimit = Number(adapter?.limits?.maxStorageBuffersPerShaderStage);
  if (Number.isFinite(exposedStorageBufferLimit)) {
    if (exposedStorageBufferLimit < TRACE_STORAGE_BUFFER_BINDINGS) {
      throw new Error(
        `Wavefront mesh tracing requires maxStorageBuffersPerShaderStage>=${TRACE_STORAGE_BUFFER_BINDINGS}, ` +
          `but this adapter exposes ${exposedStorageBufferLimit}.`
      );
    }
    requiredLimits.maxStorageBuffersPerShaderStage = Math.max(
      Number(requiredLimits.maxStorageBuffersPerShaderStage ?? 0),
      TRACE_STORAGE_BUFFER_BINDINGS
    );
  }

  const descriptor = { ...(options.deviceDescriptor ?? {}) };
  if (Object.keys(requiredLimits).length > 0) {
    descriptor.requiredLimits = {
      ...(descriptor.requiredLimits ?? {}),
      ...requiredLimits,
    };
  }
  return Object.keys(descriptor).length > 0 ? descriptor : undefined;
}

function readGpuLimit(adapter, device, name) {
  const adapterValue = Number(adapter?.limits?.[name]);
  if (Number.isFinite(adapterValue)) {
    return adapterValue;
  }
  const deviceValue = Number(device?.limits?.[name]);
  return Number.isFinite(deviceValue) ? deviceValue : null;
}

function createAdapterInfoSnapshot(adapter) {
  const info = adapter?.info;
  if (!info || typeof info !== "object") {
    return null;
  }
  return Object.freeze({
    vendor: typeof info.vendor === "string" ? info.vendor : "",
    architecture: typeof info.architecture === "string" ? info.architecture : "",
    device: typeof info.device === "string" ? info.device : "",
    description: typeof info.description === "string" ? info.description : "",
  });
}

function createGpuAdapterParallelismDiagnostics(adapter, device) {
  return Object.freeze({
    physicalCoreCount: null,
    physicalCoreCountAvailable: false,
    physicalCoreCountUnavailableReason: "WebGPU does not expose physical GPU core counts.",
    adapterInfo: createAdapterInfoSnapshot(adapter),
    adapterLimits: Object.freeze({
      maxComputeInvocationsPerWorkgroup: readGpuLimit(adapter, device, "maxComputeInvocationsPerWorkgroup"),
      maxComputeWorkgroupSizeX: readGpuLimit(adapter, device, "maxComputeWorkgroupSizeX"),
      maxComputeWorkgroupSizeY: readGpuLimit(adapter, device, "maxComputeWorkgroupSizeY"),
      maxComputeWorkgroupSizeZ: readGpuLimit(adapter, device, "maxComputeWorkgroupSizeZ"),
      maxComputeWorkgroupsPerDimension: readGpuLimit(adapter, device, "maxComputeWorkgroupsPerDimension"),
      maxStorageBuffersPerShaderStage: readGpuLimit(adapter, device, "maxStorageBuffersPerShaderStage"),
      maxStorageBufferBindingSize: readGpuLimit(adapter, device, "maxStorageBufferBindingSize"),
    }),
    configuredWorkgroupSize: WORKGROUP_SIZE,
  });
}

function createGpuParallelismCounters() {
  return {
    directDispatches: 0,
    directWorkgroups: 0,
    directShaderInvocations: 0,
    multiWorkgroupDispatches: 0,
    largestDirectWorkgroupsPerDispatch: 0,
    indirectDispatches: 0,
    estimatedIndirectWorkgroupsUpperBound: 0,
    estimatedIndirectShaderInvocationsUpperBound: 0,
    indirectDispatchesWithMultiWorkgroupCapacity: 0,
    largestEstimatedIndirectWorkgroupsPerDispatch: 0,
  };
}

function countDispatchWorkgroups(groups) {
  return groups.reduce((product, value) => {
    const numeric = Number(value ?? 1);
    const count = Number.isFinite(numeric) ? Math.max(1, Math.trunc(numeric)) : 1;
    return product * count;
  }, 1);
}

function recordDirectDispatch(parallelism, groups, invocationsPerWorkgroup = WORKGROUP_SIZE) {
  const workgroups = countDispatchWorkgroups(groups);
  parallelism.directDispatches += 1;
  parallelism.directWorkgroups += workgroups;
  parallelism.directShaderInvocations += workgroups * invocationsPerWorkgroup;
  parallelism.largestDirectWorkgroupsPerDispatch = Math.max(
    parallelism.largestDirectWorkgroupsPerDispatch,
    workgroups
  );
  if (workgroups > 1) {
    parallelism.multiWorkgroupDispatches += 1;
  }
}

function recordIndirectDispatch(parallelism, estimatedWorkgroupsUpperBound, invocationsPerWorkgroup = WORKGROUP_SIZE) {
  const workgroups = Math.max(1, Math.trunc(Number(estimatedWorkgroupsUpperBound) || 1));
  parallelism.indirectDispatches += 1;
  parallelism.estimatedIndirectWorkgroupsUpperBound += workgroups;
  parallelism.estimatedIndirectShaderInvocationsUpperBound += workgroups * invocationsPerWorkgroup;
  parallelism.largestEstimatedIndirectWorkgroupsPerDispatch = Math.max(
    parallelism.largestEstimatedIndirectWorkgroupsPerDispatch,
    workgroups
  );
  if (workgroups > 1) {
    parallelism.indirectDispatchesWithMultiWorkgroupCapacity += 1;
  }
}

function createGpuParallelismDiagnostics(adapterDiagnostics, counters) {
  const totalEstimatedWorkgroupsUpperBound =
    counters.directWorkgroups + counters.estimatedIndirectWorkgroupsUpperBound;
  const totalEstimatedShaderInvocationsUpperBound =
    counters.directShaderInvocations + counters.estimatedIndirectShaderInvocationsUpperBound;
  const exposesMultiWorkgroupParallelism =
    counters.multiWorkgroupDispatches > 0 || counters.indirectDispatchesWithMultiWorkgroupCapacity > 0;
  return Object.freeze({
    ...adapterDiagnostics,
    directDispatches: counters.directDispatches,
    directWorkgroups: counters.directWorkgroups,
    directShaderInvocations: counters.directShaderInvocations,
    multiWorkgroupDispatches: counters.multiWorkgroupDispatches,
    largestDirectWorkgroupsPerDispatch: counters.largestDirectWorkgroupsPerDispatch,
    indirectDispatches: counters.indirectDispatches,
    estimatedIndirectWorkgroupsUpperBound: counters.estimatedIndirectWorkgroupsUpperBound,
    estimatedIndirectShaderInvocationsUpperBound: counters.estimatedIndirectShaderInvocationsUpperBound,
    indirectDispatchesWithMultiWorkgroupCapacity: counters.indirectDispatchesWithMultiWorkgroupCapacity,
    largestEstimatedIndirectWorkgroupsPerDispatch: counters.largestEstimatedIndirectWorkgroupsPerDispatch,
    totalEstimatedWorkgroupsUpperBound,
    totalEstimatedShaderInvocationsUpperBound,
    exposesMultiWorkgroupParallelism,
    likelyUsesMoreThanOnePhysicalGpuCore: null,
    coreUtilizationStatus: "not-exposed-by-webgpu",
  });
}

function createEnvironmentMapSnapshot(environmentMap) {
  return Object.freeze({
    enabled: environmentMap.enabled,
    width: environmentMap.width,
    height: environmentMap.height,
    mipLevelCount: environmentMap.mipLevelCount ?? 1,
    projection: environmentMap.projection,
    intensity: environmentMap.intensity,
    rotationRadians: environmentMap.rotationRadians,
    ambientStrength: environmentMap.ambientStrength,
  });
}

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function createGpuWorkerJobDiagnostics(
  parallelism,
  commandSubmissions,
  frameTimeMs,
  awaitedGpuCompletion
) {
  const directDispatchesCompleted = Math.max(0, Number(parallelism?.directDispatches ?? 0));
  const indirectDispatchesCompleted = Math.max(0, Number(parallelism?.indirectDispatches ?? 0));
  const completedPerFrame = directDispatchesCompleted + indirectDispatchesCompleted;
  const completedPerSubmission =
    commandSubmissions > 0 ? completedPerFrame / commandSubmissions : completedPerFrame;
  const completedPerSecond =
    awaitedGpuCompletion && frameTimeMs > 0 ? (completedPerFrame * 1000) / frameTimeMs : null;
  return Object.freeze({
    completedPerFrame,
    completedPerSecond,
    completedPerSubmission,
    directDispatchesCompleted,
    indirectDispatchesCompleted,
    frameTimeMs,
    awaitedGpuCompletion,
  });
}

function estimateSubmittedGpuWorkTimeoutMs(config, tileCount, overrideTimeoutMs = null) {
  if (Number.isFinite(overrideTimeoutMs)) {
    return Math.max(1, Math.trunc(Number(overrideTimeoutMs)));
  }
  const samplesPerPixel = Math.max(
    1,
    Number(config?.renderedSamplesPerPixel ?? config?.samplesPerPixel ?? 1)
  );
  const maxDepth = Math.max(1, Number(config?.maxDepth ?? 1));
  const deferredResolvePasses = config?.deferredPathResolve ? 1 : 0;
  const denoisePasses = config?.denoise ? (samplesPerPixel < 4 ? 2 : 1) : 0;
  const tiles = Math.max(1, Number(tileCount ?? 1));
  const estimatedPasses =
    tiles * (samplesPerPixel * (maxDepth + 1 + deferredResolvePasses) + denoisePasses + 1);
  return Math.min(
    GPU_MAX_SUBMITTED_WORK_TIMEOUT_MS,
    GPU_SUBMITTED_WORK_TIMEOUT_MS + estimatedPasses * 5
  );
}

export async function createWavefrontPathTracingComputeRenderer(options = {}) {
  assertAnalyticDisplayQualityPolicy(options);
  const constants = getGpuUsageConstants();
  const navigatorRef = options.navigator ?? globalThis.navigator;
  if (!supportsWavefrontPathTracingCompute({ navigator: navigatorRef })) {
    throw new Error("WebGPU wavefront path tracing requires navigator.gpu.");
  }

  const canvas = resolveCanvas(options.canvas, options.document);
  const initialConfig = createWavefrontPathTracingComputeConfig({
    ...options,
    canvas,
  });
  const adapter = await navigatorRef.gpu.requestAdapter({
    powerPreference: options.powerPreference ?? "high-performance",
  });
  if (!adapter) {
    throw new Error("Unable to acquire a WebGPU adapter for wavefront path tracing.");
  }

  const device = await adapter.requestDevice(createWavefrontDeviceDescriptor(adapter, options));
  const gpuAdapterParallelism = createGpuAdapterParallelismDiagnostics(adapter, device);
  const context = canvas.getContext("webgpu");
  if (!context || typeof context.configure !== "function") {
    throw new Error("Canvas WebGPU context does not support configure().");
  }

  const format =
    options.format ??
    (typeof navigatorRef.gpu.getPreferredCanvasFormat === "function"
      ? navigatorRef.gpu.getPreferredCanvasFormat()
      : "bgra8unorm");
  let config = initialConfig;
  const safeTileSize = clampTileSizeForDevice(config, device);
  if (safeTileSize !== config.tileSize) {
    config = createWavefrontPathTracingComputeConfig({
      ...options,
      canvas,
      width: config.width,
      height: config.height,
      tileSize: safeTileSize,
    });
  }
  canvas.width = config.width;
  canvas.height = config.height;
  context.configure({
    device,
    format,
    alphaMode: options.alpha === true ? "premultiplied" : "opaque",
  });

  const bufferUsage = constants.buffer.STORAGE | constants.buffer.COPY_DST;
  const rayQueueBytes = config.tilePixelCapacity * RAY_RECORD_BYTES;
  const hitBytes = config.tilePixelCapacity * HIT_RECORD_BYTES;
  const accumulationBytes = config.tilePixelCapacity * ACCUMULATION_RECORD_BYTES;
  const pathVertexBytes = config.tilePixelCapacity * (config.maxDepth + 1) * PATH_VERTEX_RECORD_BYTES;
  const activeQueue = createBuffer(device, bufferUsage, rayQueueBytes, "plasius.wavefront.activeQueue");
  const nextQueue = createBuffer(device, bufferUsage, rayQueueBytes, "plasius.wavefront.nextQueue");
  const hitBuffer = createBuffer(device, bufferUsage, hitBytes, "plasius.wavefront.hitBuffer");
  const accumulationBuffer = createBuffer(
    device,
    bufferUsage,
    accumulationBytes,
    "plasius.wavefront.accumulation"
  );
  const pathVertexBuffer = createBuffer(
    device,
    bufferUsage,
    pathVertexBytes,
    "plasius.wavefront.pathVertices"
  );
  const sceneObjectBuffer = createBuffer(
    device,
    constants.buffer.STORAGE | constants.buffer.COPY_DST,
    config.sceneObjectCapacity * SCENE_OBJECT_RECORD_BYTES,
    "plasius.wavefront.sceneObjects"
  );
  const triangleBuffer = createBuffer(
    device,
    constants.buffer.STORAGE | constants.buffer.COPY_DST,
    Math.max(1, config.triangleCapacity) * TRIANGLE_RECORD_BYTES,
    "plasius.wavefront.triangles"
  );
  const bvhNodeBuffer = createBuffer(
    device,
    constants.buffer.STORAGE | constants.buffer.COPY_DST,
    Math.max(1, config.bvhNodeCapacity + config.emissiveTriangleCapacity) *
      BVH_NODE_RECORD_BYTES,
    "plasius.wavefront.bvhNodes"
  );
  const meshVertexBuffer = createBuffer(
    device,
    constants.buffer.STORAGE | constants.buffer.COPY_DST,
    Math.max(1, config.gpuMeshSource.vertices.count) * MESH_VERTEX_RECORD_BYTES,
    "plasius.wavefront.meshVertices"
  );
  const meshIndexBuffer = createBuffer(
    device,
    constants.buffer.STORAGE | constants.buffer.COPY_DST,
    Math.max(1, config.gpuMeshSource.indices.count) * 4,
    "plasius.wavefront.meshIndices"
  );
  const meshRangeBuffer = createBuffer(
    device,
    constants.buffer.STORAGE | constants.buffer.COPY_DST,
    Math.max(1, config.gpuMeshSource.meshes.count) * MESH_RANGE_RECORD_BYTES,
    "plasius.wavefront.meshRanges"
  );
  const environmentPortalBuffer = createBuffer(
    device,
    constants.buffer.STORAGE | constants.buffer.COPY_DST,
    Math.max(1, config.environmentPortalCapacity) * ENVIRONMENT_PORTAL_RECORD_BYTES,
    "plasius.wavefront.environmentPortals"
  );
  const bvhLeafRefBuffer = createBuffer(
    device,
    constants.buffer.STORAGE | constants.buffer.COPY_DST,
    Math.max(1, config.bvhLeafSortCapacity) * BVH_LEAF_REF_RECORD_BYTES,
    "plasius.wavefront.bvhLeafRefs"
  );
  const tiles = createTiles(config.width, config.height, config.tileSize);
  const uniformOffsetAlignment = Number(device?.limits?.minUniformBufferOffsetAlignment);
  const configBufferStride = alignTo(
    CONFIG_BUFFER_BYTES,
    Number.isFinite(uniformOffsetAlignment) && uniformOffsetAlignment > 0
      ? uniformOffsetAlignment
      : CONFIG_BUFFER_BYTES
  );
  const outputConfigSlotCount = config.deferredPathResolve ? 0 : tiles.length;
  const frameConfigSlotCount = Math.max(
    1,
    tiles.length * config.samplesPerPixel + outputConfigSlotCount + (config.denoise ? 1 : 0)
  );
  const configBuffer = createBuffer(
    device,
    constants.buffer.UNIFORM | constants.buffer.COPY_DST,
    frameConfigSlotCount * configBufferStride,
    "plasius.wavefront.frameConfig"
  );
  const bvhBuildConfigSlots =
    1 + config.bvhSortStages.length + config.bvhBuildLevels.length;
  const bvhBuildConfigBuffer = createBuffer(
    device,
    constants.buffer.UNIFORM | constants.buffer.COPY_DST,
    Math.max(1, bvhBuildConfigSlots) * configBufferStride,
    "plasius.wavefront.bvhBuildConfig"
  );
  const counterBuffer = createBuffer(
    device,
    constants.buffer.STORAGE | constants.buffer.COPY_DST | constants.buffer.COPY_SRC,
    COUNTER_BUFFER_BYTES,
    "plasius.wavefront.counters"
  );
  const activeDispatchBuffer = createBuffer(
    device,
    constants.buffer.INDIRECT | constants.buffer.COPY_DST,
    INDIRECT_DISPATCH_ARGS_BYTES,
    "plasius.wavefront.activeDispatchArgs"
  );

  let packedScene = packWavefrontSceneObjects(config.sceneObjects, config.sceneObjectCapacity);
  device.queue.writeBuffer(sceneObjectBuffer, 0, packedScene.buffer);
  const packedTriangles = packWavefrontTriangles(
    config.meshAcceleration.triangles,
    Math.max(1, config.triangleCapacity)
  );
  const packedBvhNodes = packWavefrontBvhNodes(
    config.meshAcceleration.nodes,
    Math.max(1, config.bvhNodeCapacity + config.emissiveTriangleCapacity)
  );
  const packedBvhNodeUints = new Uint32Array(packedBvhNodes.buffer);
  config.emissiveTriangleIndices.indices.forEach((triangleIndex, index) => {
    const nodeOffset = (config.bvhNodeCapacity + index) * (BVH_NODE_RECORD_BYTES / 4);
    packedBvhNodeUints[nodeOffset + 8] = triangleIndex;
  });
  device.queue.writeBuffer(triangleBuffer, 0, packedTriangles.buffer);
  device.queue.writeBuffer(bvhNodeBuffer, 0, packedBvhNodes.buffer);
  device.queue.writeBuffer(meshVertexBuffer, 0, config.gpuMeshSource.vertices.buffer);
  device.queue.writeBuffer(meshIndexBuffer, 0, config.gpuMeshSource.indices.buffer);
  device.queue.writeBuffer(meshRangeBuffer, 0, config.gpuMeshSource.meshes.buffer);
  const packedEnvironmentPortals = packEnvironmentPortals(
    config.environmentPortals,
    Math.max(1, config.environmentPortalCapacity)
  );
  device.queue.writeBuffer(environmentPortalBuffer, 0, packedEnvironmentPortals.buffer);

  const radianceTexture = device.createTexture({
    label: "plasius.wavefront.radiance",
    size: { width: config.width, height: config.height },
    format: "rgba16float",
    usage:
      constants.texture.STORAGE_BINDING |
      constants.texture.TEXTURE_BINDING,
  });
  const radianceView = radianceTexture.createView();
  const denoiseScratchTexture = device.createTexture({
    label: "plasius.wavefront.denoiseScratch",
    size: { width: config.width, height: config.height },
    format: "rgba16float",
    usage:
      constants.texture.STORAGE_BINDING |
      constants.texture.TEXTURE_BINDING,
  });
  const denoiseScratchView = denoiseScratchTexture.createView();
  const outputTexture = device.createTexture({
    label: "plasius.wavefront.output",
    size: { width: config.width, height: config.height },
    format: "rgba8unorm",
    usage:
      constants.texture.STORAGE_BINDING |
      constants.texture.TEXTURE_BINDING |
      constants.texture.COPY_SRC,
  });
  const outputView = outputTexture.createView();
  const sampler = device.createSampler({
    label: "plasius.wavefront.presentSampler",
    magFilter: "nearest",
    minFilter: "nearest",
  });
  const environmentMapResource = createEnvironmentMapResource(
    device,
    constants,
    config.environmentMap,
    config.environmentColor
  );
  config = Object.freeze({
    ...config,
    environmentMap: Object.freeze({
      ...config.environmentMap,
      width: environmentMapResource.width,
      height: environmentMapResource.height,
      mipLevelCount: environmentMapResource.mipLevelCount,
    }),
  });
  const environmentSamplingResource = createEnvironmentSamplingTextureResource(
    device,
    constants,
    config.environmentMap,
    config.environmentColor
  );
  const brdfLutResource = createBrdfLutResource(device, constants);
  const baseColorAtlasResource = createAtlasTextureResource(
    device,
    constants,
    config.gpuMaterialSource.baseColorAtlas,
    "plasius.wavefront.materialAtlas.baseColor"
  );
  const metallicRoughnessAtlasResource = createAtlasTextureResource(
    device,
    constants,
    config.gpuMaterialSource.metallicRoughnessAtlas,
    "plasius.wavefront.materialAtlas.metallicRoughness"
  );
  const normalAtlasResource = createAtlasTextureResource(
    device,
    constants,
    config.gpuMaterialSource.normalAtlas,
    "plasius.wavefront.materialAtlas.normal"
  );
  const occlusionAtlasResource = createAtlasTextureResource(
    device,
    constants,
    config.gpuMaterialSource.occlusionAtlas,
    "plasius.wavefront.materialAtlas.occlusion"
  );
  const emissiveAtlasResource = createAtlasTextureResource(
    device,
    constants,
    config.gpuMaterialSource.emissiveAtlas,
    "plasius.wavefront.materialAtlas.emissive"
  );
  const materialAtlasSampler = device.createSampler({
    label: "plasius.wavefront.materialAtlasSampler",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
    magFilter: "linear",
    minFilter: "linear",
  });

  const traceBindGroupLayout = device.createBindGroupLayout({
    label: "plasius.wavefront.traceBindGroupLayout",
    entries: [
      { binding: 0, visibility: constants.shader.COMPUTE, buffer: { type: "storage" } },
      { binding: 1, visibility: constants.shader.COMPUTE, buffer: { type: "storage" } },
      { binding: 2, visibility: constants.shader.COMPUTE, buffer: { type: "storage" } },
      { binding: 3, visibility: constants.shader.COMPUTE, buffer: { type: "storage" } },
      { binding: 4, visibility: constants.shader.COMPUTE, buffer: { type: "read-only-storage" } },
      {
        binding: 5,
        visibility: constants.shader.COMPUTE,
        buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: CONFIG_BUFFER_BYTES },
      },
      { binding: 6, visibility: constants.shader.COMPUTE, buffer: { type: "storage" } },
      {
        binding: 7,
        visibility: constants.shader.COMPUTE,
        storageTexture: { access: "write-only", format: "rgba8unorm" },
      },
      { binding: 8, visibility: constants.shader.COMPUTE, buffer: { type: "storage" } },
      { binding: 9, visibility: constants.shader.COMPUTE, buffer: { type: "storage" } },
      {
        binding: 16,
        visibility: constants.shader.COMPUTE,
        storageTexture: { access: "write-only", format: "rgba16float" },
      },
      { binding: 19, visibility: constants.shader.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 20, visibility: constants.shader.COMPUTE, texture: { sampleType: "float" } },
      { binding: 21, visibility: constants.shader.COMPUTE, sampler: { type: "filtering" } },
      { binding: 22, visibility: constants.shader.COMPUTE, buffer: { type: "storage" } },
      { binding: 23, visibility: constants.shader.COMPUTE, texture: { sampleType: "float" } },
      { binding: 24, visibility: constants.shader.COMPUTE, texture: { sampleType: "float" } },
      { binding: 25, visibility: constants.shader.COMPUTE, texture: { sampleType: "float" } },
      { binding: 26, visibility: constants.shader.COMPUTE, texture: { sampleType: "float" } },
      { binding: 27, visibility: constants.shader.COMPUTE, texture: { sampleType: "float" } },
      { binding: 28, visibility: constants.shader.COMPUTE, sampler: { type: "filtering" } },
      { binding: 29, visibility: constants.shader.COMPUTE, texture: { sampleType: "float" } },
      { binding: 30, visibility: constants.shader.COMPUTE, sampler: { type: "filtering" } },
      { binding: 31, visibility: constants.shader.COMPUTE, texture: { sampleType: "float" } },
    ],
  });
  const accelerationBindGroupLayout = device.createBindGroupLayout({
    label: "plasius.wavefront.accelerationBindGroupLayout",
    entries: [
      {
        binding: 5,
        visibility: constants.shader.COMPUTE,
        buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: CONFIG_BUFFER_BYTES },
      },
      { binding: 8, visibility: constants.shader.COMPUTE, buffer: { type: "storage" } },
      { binding: 9, visibility: constants.shader.COMPUTE, buffer: { type: "storage" } },
      { binding: 10, visibility: constants.shader.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 11, visibility: constants.shader.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 12, visibility: constants.shader.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 13, visibility: constants.shader.COMPUTE, buffer: { type: "storage" } },
    ],
  });
  const denoiseRadianceBindGroupLayout = device.createBindGroupLayout({
    label: "plasius.wavefront.denoiseRadianceBindGroupLayout",
    entries: [
      {
        binding: 5,
        visibility: constants.shader.COMPUTE,
        buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: CONFIG_BUFFER_BYTES },
      },
      {
        binding: 14,
        visibility: constants.shader.COMPUTE,
        texture: { sampleType: "float" },
      },
      {
        binding: 15,
        visibility: constants.shader.COMPUTE,
        storageTexture: { access: "write-only", format: "rgba16float" },
      },
    ],
  });
  const denoiseResolveBindGroupLayout = device.createBindGroupLayout({
    label: "plasius.wavefront.denoiseResolveBindGroupLayout",
    entries: [
      {
        binding: 5,
        visibility: constants.shader.COMPUTE,
        buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: CONFIG_BUFFER_BYTES },
      },
      {
        binding: 17,
        visibility: constants.shader.COMPUTE,
        texture: { sampleType: "float" },
      },
      {
        binding: 18,
        visibility: constants.shader.COMPUTE,
        storageTexture: { access: "write-only", format: "rgba8unorm" },
      },
    ],
  });
  const tracePipelineLayout = device.createPipelineLayout({
    label: "plasius.wavefront.tracePipelineLayout",
    bindGroupLayouts: [traceBindGroupLayout],
  });
  const accelerationPipelineLayout = device.createPipelineLayout({
    label: "plasius.wavefront.accelerationPipelineLayout",
    bindGroupLayouts: [accelerationBindGroupLayout],
  });
  const denoiseRadiancePipelineLayout = device.createPipelineLayout({
    label: "plasius.wavefront.denoiseRadiancePipelineLayout",
    bindGroupLayouts: [denoiseRadianceBindGroupLayout],
  });
  const denoiseResolvePipelineLayout = device.createPipelineLayout({
    label: "plasius.wavefront.denoiseResolvePipelineLayout",
    bindGroupLayouts: [denoiseResolveBindGroupLayout],
  });
  const computeShader = device.createShaderModule({
    label: "plasius.wavefront.computeShader",
    code: WAVEFRONT_COMPUTE_WGSL,
  });
  await assertShaderModuleCompiles(computeShader, "plasius.wavefront.computeShader");

  const pipelines = {
    prepareMeshTrianglesAndLeaves: await createComputePipeline(
      device,
      computeShader,
      accelerationPipelineLayout,
      "prepareMeshTrianglesAndLeaves",
      "plasius.wavefront.prepareMeshTrianglesAndLeaves"
    ),
    sortBvhLeafRefs: await createComputePipeline(
      device,
      computeShader,
      accelerationPipelineLayout,
      "sortBvhLeafRefs",
      "plasius.wavefront.sortBvhLeafRefs"
    ),
    writeSortedBvhLeaves: await createComputePipeline(
      device,
      computeShader,
      accelerationPipelineLayout,
      "writeSortedBvhLeaves",
      "plasius.wavefront.writeSortedBvhLeaves"
    ),
    buildBvhInternalLevel: await createComputePipeline(
      device,
      computeShader,
      accelerationPipelineLayout,
      "buildBvhInternalLevel",
      "plasius.wavefront.buildBvhInternalLevel"
    ),
    generatePrimaryRays: await createComputePipeline(
      device,
      computeShader,
      tracePipelineLayout,
      "generatePrimaryRays",
      "plasius.wavefront.generatePrimaryRays"
    ),
    intersectActiveQueue: await createComputePipeline(
      device,
      computeShader,
      tracePipelineLayout,
      "intersectActiveQueue",
      "plasius.wavefront.intersectActiveQueue"
    ),
    resolveSurfaceRecords: await createComputePipeline(
      device,
      computeShader,
      tracePipelineLayout,
      "resolveSurfaceRecords",
      "plasius.wavefront.resolveSurfaceRecords"
    ),
    compactAndSwapQueues: await createComputePipeline(
      device,
      computeShader,
      tracePipelineLayout,
      "compactAndSwapQueues",
      "plasius.wavefront.compactAndSwapQueues"
    ),
    accumulateTerminalRadiance: await createComputePipeline(
      device,
      computeShader,
      tracePipelineLayout,
      "accumulateTerminalRadiance",
      "plasius.wavefront.accumulateTerminalRadiance"
    ),
    denoiseLinearRadiance: await createComputePipeline(
      device,
      computeShader,
      denoiseRadiancePipelineLayout,
      "denoiseLinearRadiance",
      "plasius.wavefront.denoiseLinearRadiance"
    ),
    resolveDenoisedOutputImage: await createComputePipeline(
      device,
      computeShader,
      denoiseResolvePipelineLayout,
      "resolveDenoisedOutputImage",
      "plasius.wavefront.resolveDenoisedOutputImage"
    ),
  };

  function createTraceBindGroup(activeBuffer, nextBuffer, label, frameConfigBuffer = configBuffer) {
    return device.createBindGroup({
      label,
      layout: traceBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: activeBuffer } },
        { binding: 1, resource: { buffer: nextBuffer } },
        { binding: 2, resource: { buffer: hitBuffer } },
        { binding: 3, resource: { buffer: accumulationBuffer } },
        { binding: 4, resource: { buffer: sceneObjectBuffer } },
        { binding: 5, resource: { buffer: frameConfigBuffer, size: CONFIG_BUFFER_BYTES } },
        { binding: 6, resource: { buffer: counterBuffer } },
        { binding: 7, resource: outputView },
        { binding: 8, resource: { buffer: triangleBuffer } },
        { binding: 9, resource: { buffer: bvhNodeBuffer } },
        { binding: 16, resource: radianceView },
        { binding: 19, resource: { buffer: environmentPortalBuffer } },
        { binding: 20, resource: environmentMapResource.view },
        { binding: 21, resource: environmentMapResource.sampler },
        { binding: 22, resource: { buffer: pathVertexBuffer } },
        { binding: 23, resource: baseColorAtlasResource.view },
        { binding: 24, resource: metallicRoughnessAtlasResource.view },
        { binding: 25, resource: normalAtlasResource.view },
        { binding: 26, resource: occlusionAtlasResource.view },
        { binding: 27, resource: emissiveAtlasResource.view },
        { binding: 28, resource: materialAtlasSampler },
        { binding: 29, resource: brdfLutResource.view },
        { binding: 30, resource: brdfLutResource.sampler },
        { binding: 31, resource: environmentSamplingResource.view },
      ],
    });
  }

  const bindGroups = [
    createTraceBindGroup(activeQueue, nextQueue, "plasius.wavefront.bind.activeNext"),
    createTraceBindGroup(nextQueue, activeQueue, "plasius.wavefront.bind.nextActive"),
  ];
  const bvhBuildBindGroup = device.createBindGroup({
    label: "plasius.wavefront.bind.bvhBuild",
    layout: accelerationBindGroupLayout,
    entries: [
      { binding: 5, resource: { buffer: bvhBuildConfigBuffer, size: CONFIG_BUFFER_BYTES } },
      { binding: 8, resource: { buffer: triangleBuffer } },
      { binding: 9, resource: { buffer: bvhNodeBuffer } },
      { binding: 10, resource: { buffer: meshVertexBuffer } },
      { binding: 11, resource: { buffer: meshIndexBuffer } },
      { binding: 12, resource: { buffer: meshRangeBuffer } },
      { binding: 13, resource: { buffer: bvhLeafRefBuffer } },
    ],
  });
  function createDenoiseRadianceBindGroup(inputView, targetView, label) {
    return device.createBindGroup({
      label,
      layout: denoiseRadianceBindGroupLayout,
      entries: [
        { binding: 5, resource: { buffer: configBuffer, size: CONFIG_BUFFER_BYTES } },
        { binding: 14, resource: inputView },
        { binding: 15, resource: targetView },
      ],
    });
  }

  function createDenoiseResolveBindGroup(inputView, targetView, label) {
    return device.createBindGroup({
      label,
      layout: denoiseResolveBindGroupLayout,
      entries: [
        { binding: 5, resource: { buffer: configBuffer, size: CONFIG_BUFFER_BYTES } },
        { binding: 17, resource: inputView },
        { binding: 18, resource: targetView },
      ],
    });
  }

  const denoiseRadianceBindGroup = createDenoiseRadianceBindGroup(
    radianceView,
    denoiseScratchView,
    "plasius.wavefront.bind.denoise.radianceToScratch"
  );
  const denoiseResolveBindGroup = createDenoiseResolveBindGroup(
    denoiseScratchView,
    outputView,
    "plasius.wavefront.bind.denoise.scratchToOutput"
  );
  const denoiseDirectResolveBindGroup = createDenoiseResolveBindGroup(
    radianceView,
    outputView,
    "plasius.wavefront.bind.denoise.radianceToOutput"
  );

  const presentBindGroupLayout = device.createBindGroupLayout({
    label: "plasius.wavefront.presentBindGroupLayout",
    entries: [
      { binding: 0, visibility: constants.shader.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 1, visibility: constants.shader.FRAGMENT, sampler: { type: "filtering" } },
    ],
  });
  const presentShader = device.createShaderModule({
    label: "plasius.wavefront.presentShader",
    code: PRESENT_WGSL,
  });
  const presentPipeline = await createRenderPipeline(device, {
    label: "plasius.wavefront.presentPipeline",
    layout: device.createPipelineLayout({
      label: "plasius.wavefront.presentPipelineLayout",
      bindGroupLayouts: [presentBindGroupLayout],
    }),
    vertex: { module: presentShader, entryPoint: "vertexMain" },
    fragment: {
      module: presentShader,
      entryPoint: "fragmentMain",
      targets: [{ format }],
    },
    primitive: { topology: "triangle-list" },
  });
  const presentBindGroup = device.createBindGroup({
    label: "plasius.wavefront.presentBindGroup",
    layout: presentBindGroupLayout,
    entries: [
      { binding: 0, resource: outputView },
      { binding: 1, resource: sampler },
    ],
  });

  let frame = 0;
  let accelerationBuilt = !config.gpuAccelerationBuildRequired;
  let accelerationBuildCount = 0;
  let activeCameraOptions = options.camera ?? DEFAULT_CAMERA;
  let lastCompletedFrameTimeMs = null;
  let lastCompletedSamplesPerPixel = Math.max(1, config.samplesPerPixel);
  let lastGpuParallelism = createGpuParallelismDiagnostics(
    gpuAdapterParallelism,
    createGpuParallelismCounters()
  );

  function resolveRenderedSamplesPerPixel(renderOptions = {}, awaitGPUCompletion = true) {
    const targetSamplesPerPixel = clamp(
      readPositiveInteger(
        "samplesPerPixel",
        renderOptions.samplesPerPixel,
        config.samplesPerPixel
      ),
      1,
      config.samplesPerPixel
    );
    const frameTimeBudgetMs = Number.isFinite(renderOptions.frameTimeBudgetMs)
      ? Math.max(0, Number(renderOptions.frameTimeBudgetMs))
      : null;
    const minimumSamplesPerPixel = clamp(
      readPositiveInteger(
        "minimumSamplesPerPixel",
        renderOptions.minimumSamplesPerPixel,
        frameTimeBudgetMs !== null && targetSamplesPerPixel > 1 ? 1 : targetSamplesPerPixel
      ),
      1,
      targetSamplesPerPixel
    );
    if (frameTimeBudgetMs === null || !awaitGPUCompletion || targetSamplesPerPixel <= minimumSamplesPerPixel) {
      return Object.freeze({
        renderedSamplesPerPixel: targetSamplesPerPixel,
        targetSamplesPerPixel,
        minimumSamplesPerPixel,
        frameTimeBudgetMs,
        budgetConstrained: false,
      });
    }
    const estimatedSampleTimeMs =
      Number.isFinite(lastCompletedFrameTimeMs) && lastCompletedFrameTimeMs > 0
        ? lastCompletedFrameTimeMs / Math.max(1, lastCompletedSamplesPerPixel)
        : null;
    if (!Number.isFinite(estimatedSampleTimeMs) || estimatedSampleTimeMs <= 0) {
      return Object.freeze({
        renderedSamplesPerPixel: minimumSamplesPerPixel,
        targetSamplesPerPixel,
        minimumSamplesPerPixel,
        frameTimeBudgetMs,
        budgetConstrained: minimumSamplesPerPixel < targetSamplesPerPixel,
      });
    }
    const budgetLimitedSamples = clamp(
      Math.floor(frameTimeBudgetMs / estimatedSampleTimeMs),
      minimumSamplesPerPixel,
      targetSamplesPerPixel
    );
    return Object.freeze({
      renderedSamplesPerPixel: budgetLimitedSamples,
      targetSamplesPerPixel,
      minimumSamplesPerPixel,
      frameTimeBudgetMs,
      budgetConstrained: budgetLimitedSamples < targetSamplesPerPixel,
    });
  }

  function createFrameStats({
    frameIndex,
    accelerationBuildSubmitted,
    frameSubmissionCount,
    parallelismCounters,
    renderedSamplesPerPixel,
    targetSamplesPerPixel,
    frameTimeBudgetMs,
    budgetConstrained,
  }) {
    lastGpuParallelism = createGpuParallelismDiagnostics(gpuAdapterParallelism, parallelismCounters);
    const commandSubmissions = frameSubmissionCount + (accelerationBuildSubmitted ? 1 : 0);
    return Object.freeze({
      frame,
      frameIndex,
      width: config.width,
      height: config.height,
      maxDepth: config.maxDepth,
      tiles: tiles.length,
      tileSize: config.tileSize,
      samplesPerPixel: targetSamplesPerPixel,
      renderedSamplesPerPixel,
      frameTimeBudgetMs,
      budgetConstrained,
      maxFramePassesPerSubmission: config.maxFramePassesPerSubmission,
      screenRays: config.width * config.height,
      primaryRays: config.width * config.height * renderedSamplesPerPixel,
      sceneObjectCount: config.sceneObjectCount,
      triangleCount: config.triangleCount,
      emissiveTriangleCount: config.emissiveTriangleCount,
      environmentPortalCount: config.environmentPortalCount,
      environmentPortalMode: config.environmentPortalMode,
      environmentMap: createEnvironmentMapSnapshot(config.environmentMap),
      deferredPathResolve: config.deferredPathResolve,
      bvhNodeCount: config.bvhNodeCount,
      displayQuality: config.displayQuality,
      accelerationBuildMode: config.accelerationBuildMode,
      gpuAccelerationBuildRequired: config.gpuAccelerationBuildRequired,
      accelerationBuildSubmitted,
      accelerationBuilt,
      accelerationBuildCount,
      commandSubmissions,
      frameConfigSlots: frameConfigSlotCount,
      gpuParallelism: lastGpuParallelism,
      memory: config.memory,
    });
  }

  function writeFrameConfigSlot(slot, tile, frameIndex, buildRange = {}) {
    if (slot >= frameConfigSlotCount) {
      throw new Error("Wavefront frame config slot capacity exceeded.");
    }
    const offset = slot * configBufferStride;
    device.queue.writeBuffer(
      configBuffer,
      offset,
      createConfigPayload(config, tile, frameIndex, buildRange)
    );
    return offset;
  }

  function createFrameConfigWriter(frameIndex) {
    let slot = 0;
    return (tile, buildRange = {}) => {
      const offset = writeFrameConfigSlot(slot, tile, frameIndex, buildRange);
      slot += 1;
      return offset;
    };
  }

  function dispatchGpuAccelerationBuild(frameIndex, parallelism) {
    if (!config.gpuAccelerationBuildRequired || accelerationBuilt) {
      return false;
    }
    const buildTile = tiles[0] ?? { x: 0, y: 0, width: 1, height: 1 };
    const encoder = device.createCommandEncoder({
      label: `plasius.wavefront.buildAcceleration.${frameIndex}`,
    });
    device.queue.writeBuffer(
      bvhBuildConfigBuffer,
      0,
      createConfigPayload(config, buildTile, frameIndex, {
        sortItemCount: config.bvhLeafSortCapacity,
      })
    );
    config.bvhSortStages.forEach((sortStage, stageIndex) => {
      device.queue.writeBuffer(
        bvhBuildConfigBuffer,
        (stageIndex + 1) * configBufferStride,
        createConfigPayload(config, buildTile, frameIndex, {
          start: sortStage.compareDistance,
          count: sortStage.sequenceSize,
          sortItemCount: config.bvhLeafSortCapacity,
        })
      );
    });
    const buildLevelConfigStart = 1 + config.bvhSortStages.length;
    config.bvhBuildLevels.forEach((buildLevel, levelIndex) => {
      device.queue.writeBuffer(
        bvhBuildConfigBuffer,
        (buildLevelConfigStart + levelIndex) * configBufferStride,
        createConfigPayload(config, buildTile, frameIndex, buildLevel)
      );
    });
    const passEncoder = encoder.beginComputePass({
      label: "plasius.wavefront.buildAccelerationPass",
    });
    passEncoder.setBindGroup(0, bvhBuildBindGroup, [0]);
    passEncoder.setPipeline(pipelines.prepareMeshTrianglesAndLeaves);
    const prepareWorkgroups = Math.ceil(config.bvhLeafSortCapacity / WORKGROUP_SIZE);
    passEncoder.dispatchWorkgroups(prepareWorkgroups);
    recordDirectDispatch(parallelism, [prepareWorkgroups]);
    passEncoder.setPipeline(pipelines.sortBvhLeafRefs);
    for (let stageIndex = 0; stageIndex < config.bvhSortStages.length; stageIndex += 1) {
      passEncoder.setBindGroup(0, bvhBuildBindGroup, [
        (stageIndex + 1) * configBufferStride,
      ]);
      const sortWorkgroups = Math.ceil(config.bvhLeafSortCapacity / WORKGROUP_SIZE);
      passEncoder.dispatchWorkgroups(sortWorkgroups);
      recordDirectDispatch(parallelism, [sortWorkgroups]);
    }
    passEncoder.setBindGroup(0, bvhBuildBindGroup, [0]);
    passEncoder.setPipeline(pipelines.writeSortedBvhLeaves);
    const leafWriteWorkgroups = Math.ceil(config.triangleCount / WORKGROUP_SIZE);
    passEncoder.dispatchWorkgroups(leafWriteWorkgroups);
    recordDirectDispatch(parallelism, [leafWriteWorkgroups]);
    passEncoder.setPipeline(pipelines.buildBvhInternalLevel);
    for (let levelIndex = 0; levelIndex < config.bvhBuildLevels.length; levelIndex += 1) {
      const buildLevel = config.bvhBuildLevels[levelIndex];
      passEncoder.setBindGroup(0, bvhBuildBindGroup, [
        (buildLevelConfigStart + levelIndex) * configBufferStride,
      ]);
      const levelWorkgroups = Math.ceil(buildLevel.count / WORKGROUP_SIZE);
      passEncoder.dispatchWorkgroups(levelWorkgroups);
      recordDirectDispatch(parallelism, [levelWorkgroups]);
    }
    passEncoder.end();
    device.queue.submit([encoder.finish()]);
    accelerationBuilt = true;
    accelerationBuildCount += 1;
    return true;
  }

  function encodeTileSample(encoder, tile, configOffset, parallelism) {
    const generatePass = encoder.beginComputePass({
      label: "plasius.wavefront.generatePrimaryRaysPass",
    });
    const tileWorkgroups = Math.ceil((tile.width * tile.height) / WORKGROUP_SIZE);

    generatePass.setBindGroup(0, bindGroups[0], [configOffset]);
    generatePass.setPipeline(pipelines.generatePrimaryRays);
    generatePass.dispatchWorkgroups(tileWorkgroups);
    recordDirectDispatch(parallelism, [tileWorkgroups]);
    generatePass.end();

    for (let bounceIndex = 0; bounceIndex < config.maxDepth; bounceIndex += 1) {
      encoder.copyBufferToBuffer(
        counterBuffer,
        COUNTER_DISPATCH_ARGS_OFFSET,
        activeDispatchBuffer,
        0,
        INDIRECT_DISPATCH_ARGS_BYTES
      );
      const passEncoder = encoder.beginComputePass({
        label: `plasius.wavefront.bounce.${bounceIndex}`,
      });
      passEncoder.setBindGroup(0, bindGroups[bounceIndex % 2], [configOffset]);
      passEncoder.setPipeline(pipelines.intersectActiveQueue);
      passEncoder.dispatchWorkgroupsIndirect(activeDispatchBuffer, 0);
      recordIndirectDispatch(parallelism, tileWorkgroups);
      passEncoder.setPipeline(pipelines.resolveSurfaceRecords);
      passEncoder.dispatchWorkgroupsIndirect(activeDispatchBuffer, 0);
      recordIndirectDispatch(parallelism, tileWorkgroups);
      passEncoder.setPipeline(pipelines.compactAndSwapQueues);
      passEncoder.dispatchWorkgroups(1);
      recordDirectDispatch(parallelism, [1], 1);
      passEncoder.end();
    }
  }

  function encodeTileOutput(encoder, tile, configOffset, parallelism) {
    const passEncoder = encoder.beginComputePass({
      label: "plasius.wavefront.outputPass",
    });
    const tileWorkgroups = Math.ceil((tile.width * tile.height) / WORKGROUP_SIZE);

    passEncoder.setBindGroup(0, bindGroups[0], [configOffset]);
    passEncoder.setPipeline(pipelines.accumulateTerminalRadiance);
    passEncoder.dispatchWorkgroups(tileWorkgroups);
    recordDirectDispatch(parallelism, [tileWorkgroups]);
    passEncoder.end();
  }

  function encodeDenoise(encoder, configOffset, parallelism, renderedSamplesPerPixel = config.samplesPerPixel) {
    if (!config.denoise) {
      return;
    }
    const denoiseWorkgroupsX = Math.ceil(config.width / 8);
    const denoiseWorkgroupsY = Math.ceil(config.height / 8);
    const useTwoPassDenoise = renderedSamplesPerPixel < 4;
    if (useTwoPassDenoise) {
      const radiancePass = encoder.beginComputePass({
        label: "plasius.wavefront.denoiseRadiancePass",
      });
      radiancePass.setBindGroup(0, denoiseRadianceBindGroup, [configOffset]);
      radiancePass.setPipeline(pipelines.denoiseLinearRadiance);
      radiancePass.dispatchWorkgroups(denoiseWorkgroupsX, denoiseWorkgroupsY);
      recordDirectDispatch(parallelism, [denoiseWorkgroupsX, denoiseWorkgroupsY]);
      radiancePass.end();
    }

    const resolvePass = encoder.beginComputePass({
      label: "plasius.wavefront.denoiseResolvePass",
    });
    resolvePass.setBindGroup(
      0,
      useTwoPassDenoise ? denoiseResolveBindGroup : denoiseDirectResolveBindGroup,
      [configOffset]
    );
    resolvePass.setPipeline(pipelines.resolveDenoisedOutputImage);
    resolvePass.dispatchWorkgroups(denoiseWorkgroupsX, denoiseWorkgroupsY);
    recordDirectDispatch(parallelism, [denoiseWorkgroupsX, denoiseWorkgroupsY]);
    resolvePass.end();
  }

  function encodePresent(encoder) {
    const texture = context.getCurrentTexture();
    const passEncoder = encoder.beginRenderPass({
      label: "plasius.wavefront.presentPass",
      colorAttachments: [
        {
          view: texture.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    passEncoder.setPipeline(presentPipeline);
    passEncoder.setBindGroup(0, presentBindGroup);
    passEncoder.draw(3);
    passEncoder.end();
  }

  function dispatchFrame(frameIndex, parallelism, renderedSamplesPerPixel = config.samplesPerPixel) {
    const writeFrameConfig = createFrameConfigWriter(frameIndex);
    let submissionCount = 0;
    let encodedFramePasses = 0;
    let encoder = device.createCommandEncoder({
      label: `plasius.wavefront.frame.${frameIndex}.batched.${submissionCount + 1}`,
    });

    function submitCurrentEncoder() {
      if (encodedFramePasses <= 0) {
        return;
      }
      device.queue.submit([encoder.finish()]);
      submissionCount += 1;
      encodedFramePasses = 0;
      encoder = device.createCommandEncoder({
        label: `plasius.wavefront.frame.${frameIndex}.batched.${submissionCount + 1}`,
      });
    }

    function reserveEncoder(passCount = 1) {
      if (
        encodedFramePasses > 0 &&
        encodedFramePasses + passCount > config.maxFramePassesPerSubmission
      ) {
        submitCurrentEncoder();
      }
      encodedFramePasses += passCount;
      return encoder;
    }

    for (const tile of tiles) {
      for (let sampleIndex = 0; sampleIndex < renderedSamplesPerPixel; sampleIndex += 1) {
        const configOffset = writeFrameConfig(tile, {
          sampleIndex,
          sampleWeight: 1 / renderedSamplesPerPixel,
        });
        encodeTileSample(
          reserveEncoder(config.maxDepth + 1),
          tile,
          configOffset,
          parallelism
        );
        if (config.deferredPathResolve) {
          encodeTileOutput(reserveEncoder(1), tile, configOffset, parallelism);
        }
      }
      if (!config.deferredPathResolve) {
        const outputConfigOffset = writeFrameConfig(tile, {
          sampleIndex: 0,
          sampleWeight: 1 / renderedSamplesPerPixel,
        });
        encodeTileOutput(reserveEncoder(1), tile, outputConfigOffset, parallelism);
      }
    }
    if (config.denoise) {
      const denoiseConfigOffset = writeFrameConfig(
        { x: 0, y: 0, width: config.width, height: config.height },
        { sampleIndex: 0, sampleWeight: 1 / renderedSamplesPerPixel }
      );
      const denoisePassCount = renderedSamplesPerPixel < 4 ? 2 : 1;
      encodeDenoise(
        reserveEncoder(denoisePassCount),
        denoiseConfigOffset,
        parallelism,
        renderedSamplesPerPixel
      );
    }
    encodePresent(reserveEncoder(1));
    submitCurrentEncoder();
    return submissionCount;
  }

  function renderOnce(renderOptions = {}, resolvedSamplingPlan = null) {
    const frameStartTimeMs = nowMs();
    frame += 1;
    const frameIndex = frame + config.frameIndex;
    const samplingPlan = resolvedSamplingPlan ?? resolveRenderedSamplesPerPixel(renderOptions, false);
    const parallelismCounters = createGpuParallelismCounters();
    const accelerationBuildSubmitted = dispatchGpuAccelerationBuild(frameIndex, parallelismCounters);
    const frameSubmissionCount = dispatchFrame(
      frameIndex,
      parallelismCounters,
      samplingPlan.renderedSamplesPerPixel
    );
    const frameTimeMs = Math.max(0, nowMs() - frameStartTimeMs);
    return Object.freeze({
      ...createFrameStats({
        frameIndex,
        accelerationBuildSubmitted,
        frameSubmissionCount,
        parallelismCounters,
        renderedSamplesPerPixel: samplingPlan.renderedSamplesPerPixel,
        targetSamplesPerPixel: samplingPlan.targetSamplesPerPixel,
        frameTimeBudgetMs: samplingPlan.frameTimeBudgetMs,
        budgetConstrained: samplingPlan.budgetConstrained,
      }),
      gpuWorkerJobs: createGpuWorkerJobDiagnostics(
        lastGpuParallelism,
        frameSubmissionCount + (accelerationBuildSubmitted ? 1 : 0),
        frameTimeMs,
        false
      ),
    });
  }

  async function waitForSubmittedGpuWork(options = {}) {
    if (typeof device.queue.onSubmittedWorkDone !== "function") {
      return true;
    }
    const timeoutMs = Math.max(
      1,
      Number.isFinite(options.timeoutMs)
        ? Number(options.timeoutMs)
        : GPU_SUBMITTED_WORK_TIMEOUT_MS
    );
    const allowTimeout = options.allowTimeout !== false;
    const completionPromise = device.queue.onSubmittedWorkDone().then(
      () => ({ status: "done" }),
      (error) => {
        throw error;
      }
    );
    const lossPromise =
      typeof device.lost?.then === "function"
        ? device.lost.then((info) => {
            throw new Error(
              `WebGPU device lost while waiting for submitted work (${info?.reason ?? "unknown"}).`
            );
          })
        : null;
    let timeoutHandle = null;
    let resolveTimeoutPromise = null;
    let timeoutSettled = false;
    const settleTimeoutPromise = (value) => {
      if (timeoutSettled) {
        return;
      }
      timeoutSettled = true;
      resolveTimeoutPromise?.(value);
    };
    const timeoutPromise = new Promise((resolve) => {
      resolveTimeoutPromise = resolve;
      timeoutHandle = setTimeout(() => settleTimeoutPromise({ status: "timeout" }), timeoutMs);
    });
    let result;
    try {
      result = await Promise.race(
        [completionPromise, timeoutPromise, lossPromise].filter(Boolean)
      );
    } finally {
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
        settleTimeoutPromise({ status: "cancelled" });
      }
    }
    if (result?.status === "timeout") {
      if (!allowTimeout) {
        throw new Error(`Timed out after ${timeoutMs} ms waiting for submitted GPU work.`);
      }
      console.warn(
        `[plasius.wavefront] Submitted GPU work did not report completion within ${timeoutMs} ms; continuing.`
      );
      return false;
    }
    return true;
  }

  function dispatchFrameAwaitingGpu(
    frameIndex,
    parallelism,
    renderedSamplesPerPixel = config.samplesPerPixel
  ) {
    const samplePassesPerSample = config.maxDepth + 1 + (config.deferredPathResolve ? 1 : 0);
    const denoisePassCount = config.denoise ? (renderedSamplesPerPixel < 4 ? 2 : 1) : 0;
    const tailPassCount = denoisePassCount + 1;
    const sampleBatchSize = Math.max(
      1,
      Math.floor(
        Math.max(config.maxFramePassesPerSubmission - tailPassCount, 1) /
          Math.max(samplePassesPerSample, 1)
      )
    );
    let submissionCount = 0;

    function createSubmissionController() {
      let encodedFramePasses = 0;
      let localSubmissions = 0;
      let encoder = device.createCommandEncoder({
        label: `plasius.wavefront.frame.${frameIndex}.batched.${submissionCount + localSubmissions + 1}`,
      });

      return {
        reserve(passCount = 1) {
          if (
            encodedFramePasses > 0 &&
            encodedFramePasses + passCount > config.maxFramePassesPerSubmission
          ) {
            const finished = encoder.finish();
            device.queue.submit([finished]);
            localSubmissions += 1;
            encodedFramePasses = 0;
            encoder = device.createCommandEncoder({
              label: `plasius.wavefront.frame.${frameIndex}.batched.${submissionCount + localSubmissions + 1}`,
            });
          }
          encodedFramePasses += passCount;
          return encoder;
        },
        flush() {
          if (encodedFramePasses <= 0) {
            return 0;
          }
          device.queue.submit([encoder.finish()]);
          localSubmissions += 1;
          encodedFramePasses = 0;
          return localSubmissions;
        },
      };
    }

    for (const tile of tiles) {
      for (
        let sampleStart = 0;
        sampleStart < renderedSamplesPerPixel;
        sampleStart += sampleBatchSize
      ) {
        const sampleEnd = Math.min(renderedSamplesPerPixel, sampleStart + sampleBatchSize);
        const batch = createSubmissionController();
        let slot = 0;
        for (let sampleIndex = sampleStart; sampleIndex < sampleEnd; sampleIndex += 1) {
          const configOffset = writeFrameConfigSlot(slot, tile, frameIndex, {
            sampleIndex,
            sampleWeight: 1 / renderedSamplesPerPixel,
          });
          slot += 1;
          encodeTileSample(
            batch.reserve(config.maxDepth + 1),
            tile,
            configOffset,
            parallelism
          );
          if (config.deferredPathResolve) {
            encodeTileOutput(batch.reserve(1), tile, configOffset, parallelism);
          }
        }
        if (!config.deferredPathResolve && sampleEnd >= renderedSamplesPerPixel) {
          const outputConfigOffset = writeFrameConfigSlot(slot, tile, frameIndex, {
            sampleIndex: 0,
            sampleWeight: 1 / renderedSamplesPerPixel,
          });
          encodeTileOutput(batch.reserve(1), tile, outputConfigOffset, parallelism);
        }
        submissionCount += batch.flush();
      }
    }

    const tail = createSubmissionController();
    if (config.denoise) {
      const denoiseConfigOffset = writeFrameConfigSlot(
        0,
        { x: 0, y: 0, width: config.width, height: config.height },
        frameIndex,
        { sampleIndex: 0, sampleWeight: 1 / renderedSamplesPerPixel }
      );
      encodeDenoise(
        tail.reserve(denoisePassCount),
        denoiseConfigOffset,
        parallelism,
        renderedSamplesPerPixel
      );
    }
    encodePresent(tail.reserve(1));
    submissionCount += tail.flush();
    return submissionCount;
  }

  async function readOutputProbe(optionsForProbe = {}) {
    const mapMode = constants.map;
    if (!mapMode) {
      throw new Error("GPUMapMode.READ is unavailable in this environment.");
    }
    const x = clamp(readNonNegativeInteger("x", optionsForProbe.x, Math.floor(config.width / 2)), 0, config.width - 1);
    const y = clamp(readNonNegativeInteger("y", optionsForProbe.y, Math.floor(config.height / 2)), 0, config.height - 1);
    const readback = device.createBuffer({
      label: "plasius.wavefront.outputProbe",
      size: 256,
      usage: constants.buffer.COPY_DST | constants.buffer.MAP_READ,
    });
    await waitForSubmittedGpuWork({
      timeoutMs: GPU_READBACK_COMPLETION_TIMEOUT_MS,
      allowTimeout: false,
    });
    const encoder = device.createCommandEncoder({
      label: "plasius.wavefront.outputProbe.copy",
    });
    encoder.copyTextureToBuffer(
      { texture: outputTexture, origin: { x, y } },
      { buffer: readback, bytesPerRow: 256, rowsPerImage: 1 },
      { width: 1, height: 1, depthOrArrayLayers: 1 }
    );
    device.queue.submit([encoder.finish()]);
    await waitForSubmittedGpuWork({
      timeoutMs: GPU_READBACK_COMPLETION_TIMEOUT_MS,
      allowTimeout: false,
    });
    await readback.mapAsync(mapMode.READ);
    const bytes = new Uint8Array(readback.getMappedRange()).slice(0, 4);
    readback.unmap();
    readback.destroy?.();
    return Object.freeze({
      x,
      y,
      rgba: Object.freeze(Array.from(bytes)),
      luminance: (0.2126 * bytes[0] + 0.7152 * bytes[1] + 0.0722 * bytes[2]) / 255,
    });
  }

  async function renderFrame(renderOptions = {}) {
    const awaitGPUCompletion = renderOptions.awaitGPUCompletion !== false;
    const samplingPlan = resolveRenderedSamplesPerPixel(renderOptions, awaitGPUCompletion);
    const useThrottledHighSamplePath =
      awaitGPUCompletion && samplingPlan.renderedSamplesPerPixel >= 8;
    const submittedWorkTimeoutMs = estimateSubmittedGpuWorkTimeoutMs(
      { ...config, renderedSamplesPerPixel: samplingPlan.renderedSamplesPerPixel },
      tiles.length,
      renderOptions.submittedWorkTimeoutMs
    );
    const frameStartTimeMs = nowMs();
    const submissionWaitOptions = awaitGPUCompletion
      ? { timeoutMs: submittedWorkTimeoutMs, allowTimeout: false }
      : { timeoutMs: submittedWorkTimeoutMs };
    let frameStats;
    if (useThrottledHighSamplePath) {
      frame += 1;
      const frameIndex = frame + config.frameIndex;
      const parallelismCounters = createGpuParallelismCounters();
      const accelerationBuildSubmitted = dispatchGpuAccelerationBuild(frameIndex, parallelismCounters);
      const frameSubmissionCount = dispatchFrameAwaitingGpu(
        frameIndex,
        parallelismCounters,
        samplingPlan.renderedSamplesPerPixel
      );
      frameStats = createFrameStats({
        frameIndex,
        accelerationBuildSubmitted,
        frameSubmissionCount,
        parallelismCounters,
        renderedSamplesPerPixel: samplingPlan.renderedSamplesPerPixel,
        targetSamplesPerPixel: samplingPlan.targetSamplesPerPixel,
        frameTimeBudgetMs: samplingPlan.frameTimeBudgetMs,
        budgetConstrained: samplingPlan.budgetConstrained,
      });
    } else {
      frameStats = renderOnce(renderOptions, samplingPlan);
    }
    if (awaitGPUCompletion) {
      await waitForSubmittedGpuWork(submissionWaitOptions);
    }
    const frameTimeMs = Math.max(0, nowMs() - frameStartTimeMs);
    if (awaitGPUCompletion) {
      lastCompletedFrameTimeMs = frameTimeMs;
      lastCompletedSamplesPerPixel = frameStats.renderedSamplesPerPixel ?? frameStats.samplesPerPixel;
    }
    frameStats = Object.freeze({
      ...frameStats,
      gpuWorkerJobs: createGpuWorkerJobDiagnostics(
        frameStats.gpuParallelism,
        frameStats.commandSubmissions,
        frameTimeMs,
        awaitGPUCompletion
      ),
    });
    const probe =
      renderOptions.readOutputProbe === false ? null : await readOutputProbe(renderOptions.probe);
    const maxChannel = probe ? Math.max(...probe.rgba.slice(0, 3)) : 0;
    return Object.freeze({
      ...frameStats,
      outputProbe: probe
        ? Object.freeze({
            ...probe,
            sampledPixels: 1,
            nonZeroSamples: maxChannel > 0 ? 1 : 0,
            maxChannel,
          })
        : null,
      bounces: [],
      termination: Object.freeze({
        emissive: 0,
        environment: 0,
        ambientFallback: 0,
        maxDepth: 0,
      }),
      queueOverflow: 0,
    });
  }

  function updateSceneObjects(sceneObjects) {
    const nextPackedScene = packWavefrontSceneObjects(sceneObjects, config.sceneObjectCapacity);
    packedScene = nextPackedScene;
    config = createWavefrontPathTracingComputeConfig({
      ...options,
      canvas,
      width: config.width,
      height: config.height,
      maxDepth: config.maxDepth,
      tileSize: config.tileSize,
      samplesPerPixel: config.samplesPerPixel,
      sceneObjectCapacity: config.sceneObjectCapacity,
      sceneObjects: packedScene.objects,
      camera: activeCameraOptions,
      frameIndex: config.frameIndex,
    });
    device.queue.writeBuffer(sceneObjectBuffer, 0, packedScene.buffer);
    return config;
  }

  function updateCamera(cameraOptions = {}) {
    activeCameraOptions = cameraOptions;
    config = createWavefrontPathTracingComputeConfig({
      ...options,
      canvas,
      width: config.width,
      height: config.height,
      maxDepth: config.maxDepth,
      tileSize: config.tileSize,
      samplesPerPixel: config.samplesPerPixel,
      sceneObjectCapacity: config.sceneObjectCapacity,
      sceneObjects: packedScene.objects,
      camera: activeCameraOptions,
      frameIndex: config.frameIndex,
    });
    return config;
  }

  function getSnapshot() {
    return Object.freeze({
      frame,
      width: config.width,
      height: config.height,
      maxDepth: config.maxDepth,
      tiles: tiles.length,
      tileSize: config.tileSize,
      samplesPerPixel: config.samplesPerPixel,
      maxFramePassesPerSubmission: config.maxFramePassesPerSubmission,
      sceneObjectCount: config.sceneObjectCount,
      triangleCount: config.triangleCount,
      emissiveTriangleCount: config.emissiveTriangleCount,
      environmentPortalCount: config.environmentPortalCount,
      environmentPortalMode: config.environmentPortalMode,
      environmentMap: createEnvironmentMapSnapshot(config.environmentMap),
      deferredPathResolve: config.deferredPathResolve,
      bvhNodeCount: config.bvhNodeCount,
      displayQuality: config.displayQuality,
      accelerationBuildMode: config.accelerationBuildMode,
      gpuAccelerationBuildRequired: config.gpuAccelerationBuildRequired,
      accelerationBuilt,
      accelerationBuildCount,
      frameConfigSlots: frameConfigSlotCount,
      gpuParallelism: lastGpuParallelism,
      memory: config.memory,
    });
  }

  function destroy() {
    activeQueue.destroy?.();
    nextQueue.destroy?.();
    hitBuffer.destroy?.();
    accumulationBuffer.destroy?.();
    pathVertexBuffer.destroy?.();
    sceneObjectBuffer.destroy?.();
    triangleBuffer.destroy?.();
    bvhNodeBuffer.destroy?.();
    meshVertexBuffer.destroy?.();
    meshIndexBuffer.destroy?.();
    meshRangeBuffer.destroy?.();
    environmentPortalBuffer.destroy?.();
    bvhLeafRefBuffer.destroy?.();
    configBuffer.destroy?.();
    bvhBuildConfigBuffer.destroy?.();
    counterBuffer.destroy?.();
    activeDispatchBuffer.destroy?.();
    radianceTexture.destroy?.();
    denoiseScratchTexture.destroy?.();
        outputTexture.destroy?.();
        if (environmentMapResource.ownsTexture) {
          environmentMapResource.texture?.destroy?.();
        }
        if (environmentSamplingResource.ownsTexture) {
          environmentSamplingResource.texture?.destroy?.();
        }
        brdfLutResource.texture?.destroy?.();
        if (baseColorAtlasResource.ownsTexture) {
          baseColorAtlasResource.texture?.destroy?.();
        }
    if (metallicRoughnessAtlasResource.ownsTexture) {
      metallicRoughnessAtlasResource.texture?.destroy?.();
    }
    if (normalAtlasResource.ownsTexture) {
      normalAtlasResource.texture?.destroy?.();
    }
    if (occlusionAtlasResource.ownsTexture) {
      occlusionAtlasResource.texture?.destroy?.();
    }
    if (emissiveAtlasResource.ownsTexture) {
      emissiveAtlasResource.texture?.destroy?.();
    }
    context.unconfigure?.();
  }

  return Object.freeze({
    canvas,
    context,
    device,
    format,
    config,
    renderOnce,
    renderFrame,
    readOutputProbe,
    updateSceneObjects,
    updateCamera,
    getSnapshot,
    destroy,
  });
}

export async function renderWavefrontPathTracingComputeFrame(options = {}) {
  const renderer = await createWavefrontPathTracingComputeRenderer(options);
  try {
    return await renderer.renderFrame(options);
  } finally {
    renderer.destroy();
  }
}

export function createWavefrontPathTracingComputeShaderSource(options = {}) {
  const workgroupSize = readPositiveInteger(
    "workgroupSize",
    options.workgroupSize ?? rendererWavefrontComputeWorkgroupSize,
    rendererWavefrontComputeWorkgroupSize
  );
  if (workgroupSize !== rendererWavefrontComputeWorkgroupSize) {
    throw new Error(`wavefront mesh compute currently requires workgroupSize=${rendererWavefrontComputeWorkgroupSize}.`);
  }
  return WAVEFRONT_COMPUTE_WGSL;
}
