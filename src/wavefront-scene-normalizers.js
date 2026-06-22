import {
  MATERIAL_EMISSIVE,
  MATERIAL_TRANSPARENT,
  OBJECT_KIND_BOX,
  OBJECT_KIND_SPHERE,
  add,
  asColor,
  asVec3,
  clamp,
  getArrayLikeLength,
  readFiniteNumber,
  readNonNegativeInteger,
  resolveSheenColor,
  scale,
  subtract,
} from "./wavefront-core.js";
import {
  deriveWavefrontTransportMedium,
  normalizeWavefrontThickness,
  readMaterialKind,
} from "./wavefront-materials.js";

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
  const medium = deriveWavefrontTransportMedium(input, index + 1);
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
    mediumRefId: readNonNegativeInteger(
      "mediumRefId",
      input.mediumRefId ?? medium?.id ?? input.medium?.id ?? input.mediumId,
      0
    ),
    medium,
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
    thickness: normalizeWavefrontThickness(input, "thickness"),
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
  const medium = deriveWavefrontTransportMedium(input, meshIndex + 1);
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
      input.mediumRefId ??
        medium?.id ??
        input.medium?.id ??
        input.mediumId ??
        input.material?.mediumId,
      0
    ),
    medium,
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
    thickness: normalizeWavefrontThickness(input, "mesh thickness"),
    transmission,
    baseColorTexture: input.baseColorTexture ?? input.material?.baseColorTexture ?? null,
    metallicRoughnessTexture:
      input.metallicRoughnessTexture ?? input.material?.metallicRoughnessTexture ?? null,
    normalTexture: input.normalTexture ?? input.material?.normalTexture ?? null,
    occlusionTexture: input.occlusionTexture ?? input.material?.occlusionTexture ?? null,
    emissiveTexture: input.emissiveTexture ?? input.material?.emissiveTexture ?? null,
  });
}

export function normalizeSceneObjects(sceneObjects, useDefaultScene = true) {
  const source =
    Array.isArray(sceneObjects) && sceneObjects.length > 0
      ? sceneObjects
      : useDefaultScene
        ? createDefaultWavefrontSceneObjects()
        : [];
  return source.map((object, index) => normalizeWavefrontSceneObject(object, index));
}

export function normalizeWavefrontMeshes(meshes) {
  const source = Array.isArray(meshes) ? meshes : [];
  return source.map((mesh, index) => normalizeWavefrontMesh(mesh, index));
}

export function normalizeMeshes(options = {}) {
  if (Array.isArray(options.meshes)) {
    return normalizeWavefrontMeshes(options.meshes);
  }
  if (options.mesh) {
    return normalizeWavefrontMeshes([options.mesh]);
  }
  return [];
}
