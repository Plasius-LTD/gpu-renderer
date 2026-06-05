const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;
const DEFAULT_MAX_DEPTH = 6;
const DEFAULT_TILE_SIZE = 128;
const DEFAULT_SAMPLES_PER_PIXEL = 1;
const DEFAULT_SCENE_OBJECT_CAPACITY = 128;
const DEFAULT_ENVIRONMENT_PORTAL_CAPACITY = 32;
const WORKGROUP_SIZE = 64;
const RAY_RECORD_BYTES = 80;
const HIT_RECORD_BYTES = 208;
const SCENE_OBJECT_RECORD_BYTES = 96;
const MESH_VERTEX_RECORD_BYTES = 48;
const MESH_RANGE_RECORD_BYTES = 96;
const TRIANGLE_RECORD_BYTES = 208;
const BVH_NODE_RECORD_BYTES = 48;
const BVH_LEAF_REF_RECORD_BYTES = 16;
const EMISSIVE_TRIANGLE_INDEX_BYTES = 4;
const ENVIRONMENT_PORTAL_RECORD_BYTES = 96;
const ACCUMULATION_RECORD_BYTES = 16;
const CONFIG_BUFFER_BYTES = 272;
const COUNTER_BUFFER_BYTES = 16;
const TRACE_STORAGE_BUFFER_BINDINGS = 9;
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
  bvhNodeRecordBytes: BVH_NODE_RECORD_BYTES,
  bvhLeafReferenceRecordBytes: BVH_LEAF_REF_RECORD_BYTES,
  emissiveTriangleIndexBytes: EMISSIVE_TRIANGLE_INDEX_BYTES,
  emissiveTriangleMetadataRecordBytes: BVH_NODE_RECORD_BYTES,
  environmentPortalRecordBytes: ENVIRONMENT_PORTAL_RECORD_BYTES,
  accumulationRecordBytes: ACCUMULATION_RECORD_BYTES,
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
  const materialKind = readMaterialKind(input.materialKind ?? input.material?.kind);
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

  return Object.freeze({
    id: readNonNegativeInteger("id", input.id, index + 1),
    kind,
    materialKind:
      emission[0] > 0 || emission[1] > 0 || emission[2] > 0
        ? MATERIAL_EMISSIVE
        : materialKind,
    flags: readNonNegativeInteger("flags", input.flags, 0),
    center: Object.freeze(center),
    halfExtent: Object.freeze(halfExtent),
    color: Object.freeze(color),
    emission: Object.freeze(emission),
    roughness: clamp(readFiniteNumber("roughness", input.roughness ?? input.material?.roughness, 0.72), 0, 1),
    metallic: clamp(readFiniteNumber("metallic", input.metallic ?? input.material?.metallic, 0), 0, 1),
    opacity: clamp(readFiniteNumber("opacity", input.opacity ?? input.material?.opacity, color[3] ?? 1), 0, 1),
    ior: clamp(readFiniteNumber("ior", input.ior ?? input.material?.ior, 1.45), 1, 3),
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
  const materialKind = readMaterialKind(input.materialKind ?? input.material?.kind);
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

  return Object.freeze({
    id: readNonNegativeInteger("mesh id", input.id, meshIndex + 1),
    positions: Object.freeze(Array.from(positions, (value) => readFiniteNumber("mesh position", value, 0))),
    indices: Object.freeze(indices),
    normals: normals ? Object.freeze(normals) : null,
    uvs: uvs ? Object.freeze(uvs) : null,
    materialKind:
      emission[0] > 0 || emission[1] > 0 || emission[2] > 0
        ? MATERIAL_EMISSIVE
        : materialKind,
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
    opacity: clamp(readFiniteNumber("opacity", input.opacity ?? input.material?.opacity, color[3] ?? 1), 0, 1),
    ior: clamp(readFiniteNumber("ior", input.ior ?? input.material?.ior, 1.45), 1, 3),
  });
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
      const bounds = triangleBounds(v0, v1, v2);

      triangles.push(
        Object.freeze({
          triangleId: nextTriangleId,
          meshId: mesh.id,
          materialKind: mesh.materialKind,
          flags: mesh.flags,
          materialRefId: mesh.materialRefId,
          mediumRefId: mesh.mediumRefId,
          v0: Object.freeze(v0),
          v1: Object.freeze(v1),
          v2: Object.freeze(v2),
          n0: Object.freeze(n0),
          n1: Object.freeze(n1),
          n2: Object.freeze(n2),
          uv0: Object.freeze(uv0),
          uv1: Object.freeze(uv1),
          uv2: Object.freeze(uv2),
          color: mesh.color,
          emission: mesh.emission,
          material: Object.freeze([mesh.roughness, mesh.metallic, mesh.opacity, mesh.ior]),
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

export function createWavefrontGpuMeshSource(meshes = []) {
  const source = Array.isArray(meshes) ? meshes : [meshes];
  const normalized = source.map((meshInput, meshIndex) => normalizeWavefrontMesh(meshInput, meshIndex));
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
    meshUints[meshOffset + 11] = 0;
    const floatOffset = meshOffset;
    writeVec4(meshFloats, floatOffset * 4 + 48, mesh.color);
    writeVec4(meshFloats, floatOffset * 4 + 64, mesh.emission);
    writeVec4(meshFloats, floatOffset * 4 + 80, [
      mesh.roughness,
      mesh.metallic,
      mesh.opacity,
      mesh.ior,
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
  const queueBytes = tilePixelCapacity * RAY_RECORD_BYTES;
  const hitBytes = tilePixelCapacity * HIT_RECORD_BYTES;
  const accumulationBytes = tilePixelCapacity * ACCUMULATION_RECORD_BYTES;
  const sceneObjectBytes = sceneObjectCapacity * SCENE_OBJECT_RECORD_BYTES;
  const triangleBytes = triangleCapacity * TRIANGLE_RECORD_BYTES;
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
    sceneObjectBytes,
    triangleBytes,
    bvhNodeBytes,
    bvhLeafReferenceBytes,
    emissiveTriangleMetadataBytes,
    environmentPortalBytes,
    configBytes: CONFIG_BUFFER_BYTES,
    counterBytes: COUNTER_BUFFER_BYTES,
    totalHotBufferBytes:
      queueBytes * 2 +
      hitBytes +
      accumulationBytes +
      sceneObjectBytes +
      triangleBytes +
      bvhNodeBytes +
      bvhLeafReferenceBytes +
      emissiveTriangleMetadataBytes +
      environmentPortalBytes +
      CONFIG_BUFFER_BYTES +
      COUNTER_BUFFER_BYTES,
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
    64
  );
  const tilePixelCapacity = readPositiveInteger(
    "tilePixelCapacity",
    options.tilePixelCapacity,
    tileSize * tileSize
  );
  const meshes = normalizeMeshes(options);
  const meshSourceShape = estimateMeshSourceShape(meshes);
  const gpuMeshSource =
    meshes.length > 0
      ? createWavefrontGpuMeshSource(meshes)
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

  return Object.freeze({
    width,
    height,
    maxDepth,
    tileSize,
    samplesPerPixel,
    tilePixelCapacity,
    sceneObjects,
    sceneObjectCount: sceneObjects.length,
    sceneObjectCapacity,
    accelerationBuildMode,
    gpuAccelerationBuildRequired: accelerationBuildMode === "gpu" && triangleCount > 0,
    gpuMeshSource,
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
    displayQuality: options.displayQuality === true,
    requiresMeshBvhForDisplayQuality: true,
    denoise: options.denoise !== false,
    frameIndex: readNonNegativeInteger("frameIndex", options.frameIndex, 0),
    memory: estimateWavefrontPathTracingMemory({
      tilePixelCapacity,
      sceneObjectCapacity,
      triangleCapacity,
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
    uintView[u32 + 6] = 0;
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

async function createRenderPipeline(device, descriptor) {
  if (typeof device.createRenderPipelineAsync === "function") {
    return device.createRenderPipelineAsync(descriptor);
  }
  return device.createRenderPipeline(descriptor);
}

const WAVEFRONT_COMPUTE_WGSL = `
const RAY_FLAG_GUIDED_EMISSIVE: u32 = 1u;

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
  pad0: u32,
  pad1: u32,
  pad2: u32,
  distance: f32,
  pad3: vec3<f32>,
  position: vec4<f32>,
  geometricNormal: vec4<f32>,
  shadingNormal: vec4<f32>,
  barycentric: vec4<f32>,
  uv: vec4<f32>,
  color: vec4<f32>,
  emission: vec4<f32>,
  material: vec4<f32>,
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
};

struct TriangleRecord {
  triangleId: u32,
  meshId: u32,
  materialKind: u32,
  flags: u32,
  materialRefId: u32,
  mediumRefId: u32,
  pad0: u32,
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
  flags: u32,
  pad0: u32,
  pad1: u32,
  pad2: u32,
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
  pad0: u32,
  color: vec4<f32>,
  emission: vec4<f32>,
  material: vec4<f32>,
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
};

struct Counters {
  activeCount: atomic<u32>,
  nextCount: atomic<u32>,
  terminatedCount: atomic<u32>,
  hitCount: atomic<u32>,
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

fn saturate(value: f32) -> f32 {
  return clamp(value, 0.0, 1.0);
}

fn max_component(value: vec3<f32>) -> f32 {
  return max(max(value.x, value.y), value.z);
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
  let upFactor = saturate(rayDirection.y * 0.5 + 0.5);
  let sunDirection = safe_normalize(
    config.environmentSunDirectionIntensity.xyz,
    vec3<f32>(0.0, 1.0, 0.0)
  );
  let sunGlow = pow(saturate(dot(rayDirection, sunDirection)), 192.0);
  let gradient =
    config.environmentHorizonColor.xyz * (1.0 - upFactor) +
    config.environmentZenithColor.xyz * upFactor;
  let portalScale = environment_portal_radiance_scale(origin, rayDirection);
  let portalHit = max_component(portalScale) > 0.0001;
  return (
    gradient +
    config.environmentSunColor.xyz * sunGlow
  ) *
    max(config.environmentSunDirectionIntensity.w, 0.0001) *
    select(vec3<f32>(1.0), portalScale, portalHit);
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
    vec4<f32>(0.72, 0.0, 1.0, 1.45)
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
    0u,
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
    mesh.material
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
    vec3<f32>(0.0),
    vec4<f32>(ray.origin.xyz + ray.direction.xyz * 1000.0, 1.0),
    vec4<f32>(-ray.direction.xyz, 0.0),
    vec4<f32>(-ray.direction.xyz, 0.0),
    vec4<f32>(0.0),
    vec4<f32>(0.0),
    vec4<f32>(radiance, 1.0),
    vec4<f32>(0.0),
    vec4<f32>(1.0, 0.0, 1.0, 1.0)
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

fn denoise_range_space(value: vec3<f32>) -> vec3<f32> {
  return value / (vec3<f32>(1.0) + value);
}

@compute @workgroup_size(64)
fn generatePrimaryRays(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let index = globalId.x;
  if (index == 0u) {
    atomicStore(&counters.activeCount, config.tilePixelCount);
    atomicStore(&counters.nextCount, 0u);
    atomicStore(&counters.terminatedCount, 0u);
    atomicStore(&counters.hitCount, 0u);
  }
  if (index >= config.tilePixelCount) {
    return;
  }
  activeQueue[index] = make_ray(index);
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
    vec4<f32>(1.0, 0.0, 1.0, 1.0)
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
    vec4<f32>(1.0, 0.0, 1.0, 1.0)
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
  let hitColor = select(hitObject.color, hitTriangle.color, candidate.triangleIndex != 0xffffffffu);
  let hitEmission = select(hitObject.emission, hitTriangle.emission, candidate.triangleIndex != 0xffffffffu);
  let hitMaterial = select(hitObject.material, hitTriangle.material, candidate.triangleIndex != 0xffffffffu);
  let hitPrimitiveId = select(candidate.primitiveId, hitTriangle.triangleId, candidate.triangleIndex != 0xffffffffu);
  let hitMaterialRefId = select(candidate.materialRefId, hitTriangle.materialRefId, candidate.triangleIndex != 0xffffffffu);
  let hitMediumRefId = select(candidate.mediumRefId, hitTriangle.mediumRefId, candidate.triangleIndex != 0xffffffffu);
  var hitType = 0u;
  if (hitMaterialKind == 4u || emission_power(hitEmission) > 0.0001) {
    hitType = 1u;
  } else if (hitMaterialKind == 3u || hitMaterial.z < 0.999) {
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
    0u,
    0u,
    0u,
    candidate.distance,
    vec3<f32>(0.0),
    vec4<f32>(position, 1.0),
    vec4<f32>(candidate.geometricNormal, 0.0),
    vec4<f32>(candidate.shadingNormal, 0.0),
    vec4<f32>(candidate.barycentric, 0.0),
    vec4<f32>(candidate.uv, 0.0, 0.0),
    hitColor,
    hitEmission,
    hitMaterial
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
  let roughness = clamp(hit.material.x, 0.0, 1.0);
  if (hit.materialKind == 1u) {
    return ScatterResult(
      vec4<f32>(
        safe_normalize(
          reflect(ray.direction.xyz, hit.shadingNormal.xyz) + random_unit_vector(seed) * roughness,
          hit.shadingNormal.xyz
        ),
        0.0
      ),
      0u,
      0u,
      0u,
      0u
    );
  }

  if (hit.materialKind == 2u || hit.materialKind == 3u) {
    let ior = max(hit.material.w, 1.01);
    let etaRatio = select(ior, 1.0 / ior, hit.frontFace == 1u);
    let cosTheta = min(dot(-ray.direction.xyz, hit.shadingNormal.xyz), 1.0);
    let sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));
    let cannotRefract = etaRatio * sinTheta > 1.0;
    let reflectChance = schlick(cosTheta, etaRatio);
    if (cannotRefract || random01(seed + 23u) < reflectChance) {
      return ScatterResult(vec4<f32>(reflect(ray.direction.xyz, hit.shadingNormal.xyz), 0.0), 0u, 0u, 0u, 0u);
    }
    return ScatterResult(vec4<f32>(refract_direction(ray.direction.xyz, hit.shadingNormal.xyz, etaRatio), 0.0), 0u, 0u, 0u, 0u);
  }

  let randomDiffuse = safe_normalize(
    hit.shadingNormal.xyz + random_unit_vector(seed),
    hit.shadingNormal.xyz
  );
  let guidedLight = sample_emissive_triangle_direction(hit, seed, randomDiffuse);
  let canSampleLight = dot(hit.shadingNormal.xyz, guidedLight) > -0.04;
  let guideProbability = select(0.38, 0.72, ray.bounce == 0u);
  let useGuidedLight = canSampleLight && random01(seed + 37u) < guideProbability;
  let guidedPortal = sample_environment_portal_direction(hit, seed, randomDiffuse);
  let canSamplePortal = dot(hit.shadingNormal.xyz, guidedPortal) > -0.04;
  let useGuidedPortal =
    !useGuidedLight &&
    canSamplePortal &&
    config.environmentPortalCount > 0u &&
    config.environmentPortalMode > 0u &&
    random01(seed + 89u) < 0.58;
  let guidedDirection = select(randomDiffuse, guidedPortal, useGuidedPortal);
  return ScatterResult(
    vec4<f32>(select(guidedDirection, guidedLight, useGuidedLight), 0.0),
    select(0u, RAY_FLAG_GUIDED_EMISSIVE, useGuidedLight),
    0u,
    0u,
    0u
  );
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
    contribution = clamp_sample_radiance(
      ray.throughput.xyz * max(hit.emission.xyz, hit.color.xyz) * guidedLightWeight
    );
    accumulation[ray.rayId] =
      accumulation[ray.rayId] + vec4<f32>(contribution * sample_weight(), 1.0);
    atomicAdd(&counters.terminatedCount, 1u);
    return;
  }

  if (hit.hitType == 2u) {
    contribution = clamp_sample_radiance(ray.throughput.xyz * max(hit.color.xyz, config.ambientColor.xyz));
    accumulation[ray.rayId] =
      accumulation[ray.rayId] + vec4<f32>(contribution * sample_weight(), 1.0);
    atomicAdd(&counters.terminatedCount, 1u);
    return;
  }

  if (ray.bounce + 1u >= config.maxDepth) {
    accumulation[ray.rayId] =
      accumulation[ray.rayId] +
      vec4<f32>(ray.throughput.xyz * config.ambientColor.xyz * sample_weight(), 1.0);
    atomicAdd(&counters.terminatedCount, 1u);
    return;
  }

  let seed = mix_seed(ray.sourcePixelId, ray.sampleId, ray.bounce, config.frameIndex, 11u);
  let scatter = scatter_direction(ray, hit, seed);
  let nextIndex = atomicAdd(&counters.nextCount, 1u);
  if (nextIndex >= config.tilePixelCount) {
    return;
  }
  let color = clamp(hit.color.xyz, vec3<f32>(0.0), vec3<f32>(1.0));
  let opacity = clamp(hit.material.z, 0.0, 1.0);
  let materialEnergy = select(0.68, 0.92, hit.materialKind == 1u || hit.materialKind == 2u);
  let transparentEnergy = select(materialEnergy, 0.9, hit.hitType == 3u);
  let throughput = ray.throughput.xyz * mix(vec3<f32>(1.0), color, max(opacity, 0.18)) * transparentEnergy;
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
    vec4<f32>(throughput, ray.throughput.w)
  );
}

@compute @workgroup_size(1)
fn compactAndSwapQueues(@builtin(global_invocation_id) globalId: vec3<u32>) {
  if (globalId.x > 0u) {
    return;
  }
  let nextCount = atomicLoad(&counters.nextCount);
  atomicStore(&counters.activeCount, min(nextCount, config.tilePixelCount));
  atomicStore(&counters.nextCount, 0u);
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
  let radiance = max(accumulation[index].xyz, vec3<f32>(0.0));

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
  var sum = center * 1.4;
  var totalWeight = 1.4;
  let centerRange = denoise_range_space(center);

  for (var oy = -2i; oy <= 2i; oy = oy + 1i) {
    for (var ox = -2i; ox <= 2i; ox = ox + 1i) {
      if (ox == 0i && oy == 0i) {
        continue;
      }
      let sx = clamp(i32(x) + ox, 0i, i32(config.canvasWidth) - 1i);
      let sy = clamp(i32(y) + oy, 0i, i32(config.canvasHeight) - 1i);
      let sampleColor = textureLoad(denoiseInputRadiance, vec2<i32>(sx, sy), 0).xyz;
      let colorDistance = length(denoise_range_space(sampleColor) - centerRange);
      let rangeWeight = 1.0 / (1.0 + colorDistance * 7.0);
      let distanceWeight = 1.0 / (1.0 + f32(ox * ox + oy * oy) * 0.24);
      let diagonalWeight = select(1.0, 0.78, abs(ox) + abs(oy) > 2i);
      let weight = rangeWeight * diagonalWeight * distanceWeight;
      sum = sum + sampleColor * weight;
      totalWeight = totalWeight + weight;
    }
  }

  let filtered = sum / max(totalWeight, 0.0001);
  let outlier = saturate(length(denoise_range_space(center) - denoise_range_space(filtered)) * 2.4);
  let color = min(mix(center, filtered, 0.52 + outlier * 0.18), vec3<f32>(16.0));
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
  var sum = center * 1.25;
  var totalWeight = 1.25;
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
      let rangeWeight = 1.0 / (1.0 + colorDistance * 9.0);
      let distanceWeight = 1.0 / (1.0 + f32(ox * ox + oy * oy) * 0.4);
      let weight = rangeWeight * distanceWeight;
      sum = sum + sampleColor * weight;
      totalWeight = totalWeight + weight;
    }
  }

  let filtered = sum / max(totalWeight, 0.0001);
  let outlier = saturate(length(denoise_range_space(center) - denoise_range_space(filtered)) * 2.8);
  let radiance = min(mix(center, filtered, 0.28 + outlier * 0.12), vec3<f32>(16.0));
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
  const activeQueue = createBuffer(device, bufferUsage, rayQueueBytes, "plasius.wavefront.activeQueue");
  const nextQueue = createBuffer(device, bufferUsage, rayQueueBytes, "plasius.wavefront.nextQueue");
  const hitBuffer = createBuffer(device, bufferUsage, hitBytes, "plasius.wavefront.hitBuffer");
  const accumulationBuffer = createBuffer(
    device,
    bufferUsage,
    accumulationBytes,
    "plasius.wavefront.accumulation"
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
  const frameConfigSlotCount = Math.max(
    1,
    tiles.length * config.samplesPerPixel + tiles.length + (config.denoise ? 1 : 0)
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
    constants.buffer.STORAGE | constants.buffer.COPY_DST,
    COUNTER_BUFFER_BYTES,
    "plasius.wavefront.counters"
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

  function createFrameConfigWriter(frameIndex) {
    let slot = 0;
    return (tile, buildRange = {}) => {
      if (slot >= frameConfigSlotCount) {
        throw new Error("Wavefront frame config slot capacity exceeded.");
      }
      const offset = slot * configBufferStride;
      slot += 1;
      device.queue.writeBuffer(
        configBuffer,
        offset,
        createConfigPayload(config, tile, frameIndex, buildRange)
      );
      return offset;
    };
  }

  function dispatchGpuAccelerationBuild(frameIndex) {
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
    passEncoder.dispatchWorkgroups(Math.ceil(config.bvhLeafSortCapacity / WORKGROUP_SIZE));
    passEncoder.setPipeline(pipelines.sortBvhLeafRefs);
    for (let stageIndex = 0; stageIndex < config.bvhSortStages.length; stageIndex += 1) {
      passEncoder.setBindGroup(0, bvhBuildBindGroup, [
        (stageIndex + 1) * configBufferStride,
      ]);
      passEncoder.dispatchWorkgroups(Math.ceil(config.bvhLeafSortCapacity / WORKGROUP_SIZE));
    }
    passEncoder.setBindGroup(0, bvhBuildBindGroup, [0]);
    passEncoder.setPipeline(pipelines.writeSortedBvhLeaves);
    passEncoder.dispatchWorkgroups(Math.ceil(config.triangleCount / WORKGROUP_SIZE));
    passEncoder.setPipeline(pipelines.buildBvhInternalLevel);
    for (let levelIndex = 0; levelIndex < config.bvhBuildLevels.length; levelIndex += 1) {
      const buildLevel = config.bvhBuildLevels[levelIndex];
      passEncoder.setBindGroup(0, bvhBuildBindGroup, [
        (buildLevelConfigStart + levelIndex) * configBufferStride,
      ]);
      passEncoder.dispatchWorkgroups(Math.ceil(buildLevel.count / WORKGROUP_SIZE));
    }
    passEncoder.end();
    device.queue.submit([encoder.finish()]);
    accelerationBuilt = true;
    accelerationBuildCount += 1;
    return true;
  }

  function encodeTileSample(encoder, tile, configOffset) {
    const passEncoder = encoder.beginComputePass({
      label: "plasius.wavefront.computePass",
    });
    const tileWorkgroups = Math.ceil((tile.width * tile.height) / WORKGROUP_SIZE);
    const capacityWorkgroups = Math.ceil(config.tilePixelCapacity / WORKGROUP_SIZE);

    passEncoder.setBindGroup(0, bindGroups[0], [configOffset]);
    passEncoder.setPipeline(pipelines.generatePrimaryRays);
    passEncoder.dispatchWorkgroups(tileWorkgroups);

    for (let bounceIndex = 0; bounceIndex < config.maxDepth; bounceIndex += 1) {
      passEncoder.setBindGroup(0, bindGroups[bounceIndex % 2], [configOffset]);
      passEncoder.setPipeline(pipelines.intersectActiveQueue);
      passEncoder.dispatchWorkgroups(capacityWorkgroups);
      passEncoder.setPipeline(pipelines.resolveSurfaceRecords);
      passEncoder.dispatchWorkgroups(capacityWorkgroups);
      passEncoder.setPipeline(pipelines.compactAndSwapQueues);
      passEncoder.dispatchWorkgroups(1);
    }

    passEncoder.end();
  }

  function encodeTileOutput(encoder, tile, configOffset) {
    const passEncoder = encoder.beginComputePass({
      label: "plasius.wavefront.outputPass",
    });
    const tileWorkgroups = Math.ceil((tile.width * tile.height) / WORKGROUP_SIZE);

    passEncoder.setBindGroup(0, bindGroups[0], [configOffset]);
    passEncoder.setPipeline(pipelines.accumulateTerminalRadiance);
    passEncoder.dispatchWorkgroups(tileWorkgroups);
    passEncoder.end();
  }

  function encodeDenoise(encoder, configOffset) {
    if (!config.denoise) {
      return;
    }
    const radiancePass = encoder.beginComputePass({
      label: "plasius.wavefront.denoiseRadiancePass",
    });
    radiancePass.setBindGroup(0, denoiseRadianceBindGroup, [configOffset]);
    radiancePass.setPipeline(pipelines.denoiseLinearRadiance);
    radiancePass.dispatchWorkgroups(Math.ceil(config.width / 8), Math.ceil(config.height / 8));
    radiancePass.end();

    const resolvePass = encoder.beginComputePass({
      label: "plasius.wavefront.denoiseResolvePass",
    });
    resolvePass.setBindGroup(0, denoiseResolveBindGroup, [configOffset]);
    resolvePass.setPipeline(pipelines.resolveDenoisedOutputImage);
    resolvePass.dispatchWorkgroups(Math.ceil(config.width / 8), Math.ceil(config.height / 8));
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

  function dispatchFrame(frameIndex) {
    const writeFrameConfig = createFrameConfigWriter(frameIndex);
    const encoder = device.createCommandEncoder({
      label: `plasius.wavefront.frame.${frameIndex}.batched`,
    });
    for (const tile of tiles) {
      for (let sampleIndex = 0; sampleIndex < config.samplesPerPixel; sampleIndex += 1) {
        const configOffset = writeFrameConfig(tile, {
          sampleIndex,
          sampleWeight: 1 / config.samplesPerPixel,
        });
        encodeTileSample(encoder, tile, configOffset);
      }
      const outputConfigOffset = writeFrameConfig(tile, {
        sampleIndex: 0,
        sampleWeight: 1 / config.samplesPerPixel,
      });
      encodeTileOutput(encoder, tile, outputConfigOffset);
    }
    if (config.denoise) {
      const denoiseConfigOffset = writeFrameConfig(
        { x: 0, y: 0, width: config.width, height: config.height },
        { sampleIndex: 0, sampleWeight: 1 / config.samplesPerPixel }
      );
      encodeDenoise(encoder, denoiseConfigOffset);
    }
    encodePresent(encoder);
    device.queue.submit([encoder.finish()]);
    return 1;
  }

  function renderOnce() {
    frame += 1;
    const frameIndex = frame + config.frameIndex;
    const accelerationBuildSubmitted = dispatchGpuAccelerationBuild(frameIndex);
    const frameSubmissionCount = dispatchFrame(frameIndex);
    return Object.freeze({
      frame,
      width: config.width,
      height: config.height,
      maxDepth: config.maxDepth,
      tiles: tiles.length,
      tileSize: config.tileSize,
      samplesPerPixel: config.samplesPerPixel,
      screenRays: config.width * config.height,
      primaryRays: config.width * config.height * config.samplesPerPixel,
      sceneObjectCount: config.sceneObjectCount,
      triangleCount: config.triangleCount,
      emissiveTriangleCount: config.emissiveTriangleCount,
      environmentPortalCount: config.environmentPortalCount,
      environmentPortalMode: config.environmentPortalMode,
      bvhNodeCount: config.bvhNodeCount,
      displayQuality: config.displayQuality,
      accelerationBuildMode: config.accelerationBuildMode,
      gpuAccelerationBuildRequired: config.gpuAccelerationBuildRequired,
      accelerationBuildSubmitted,
      accelerationBuilt,
      accelerationBuildCount,
      commandSubmissions: frameSubmissionCount + (accelerationBuildSubmitted ? 1 : 0),
      frameConfigSlots: frameConfigSlotCount,
      memory: config.memory,
    });
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
    const encoder = device.createCommandEncoder({
      label: "plasius.wavefront.outputProbe.copy",
    });
    encoder.copyTextureToBuffer(
      { texture: outputTexture, origin: { x, y } },
      { buffer: readback, bytesPerRow: 256, rowsPerImage: 1 },
      { width: 1, height: 1, depthOrArrayLayers: 1 }
    );
    device.queue.submit([encoder.finish()]);
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
      frameIndex: config.frameIndex,
    });
    device.queue.writeBuffer(sceneObjectBuffer, 0, packedScene.buffer);
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
      sceneObjectCount: config.sceneObjectCount,
      triangleCount: config.triangleCount,
      emissiveTriangleCount: config.emissiveTriangleCount,
      environmentPortalCount: config.environmentPortalCount,
      environmentPortalMode: config.environmentPortalMode,
      bvhNodeCount: config.bvhNodeCount,
      displayQuality: config.displayQuality,
      accelerationBuildMode: config.accelerationBuildMode,
      gpuAccelerationBuildRequired: config.gpuAccelerationBuildRequired,
      accelerationBuilt,
      accelerationBuildCount,
      frameConfigSlots: frameConfigSlotCount,
      memory: config.memory,
    });
  }

  function destroy() {
    activeQueue.destroy?.();
    nextQueue.destroy?.();
    hitBuffer.destroy?.();
    accumulationBuffer.destroy?.();
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
    radianceTexture.destroy?.();
    denoiseScratchTexture.destroy?.();
    outputTexture.destroy?.();
    context.unconfigure?.();
  }

  return Object.freeze({
    canvas,
    context,
    device,
    format,
    config,
    renderOnce,
    readOutputProbe,
    updateSceneObjects,
    getSnapshot,
    destroy,
  });
}
