const STANDARD_TEXTURE_BINDINGS = Object.freeze([
  ["baseColor", "baseColorTexture"],
  ["metallicRoughness", "metallicRoughnessTexture"],
  ["normal", "normalTexture"],
  ["occlusion", "occlusionTexture"],
  ["emissive", "emissiveTexture"],
]);

const EXTENSION_TEXTURE_BINDINGS = Object.freeze([
  ["clearcoat", "clearcoat", "clearcoatTexture"],
  ["clearcoatRoughness", "clearcoat", "clearcoatRoughnessTexture"],
  ["clearcoatNormal", "clearcoat", "clearcoatNormalTexture"],
  ["transmission", "transmission", "transmissionTexture"],
  ["sheenColor", "sheen", "sheenColorTexture"],
  ["sheenRoughness", "sheen", "sheenRoughnessTexture"],
  ["thickness", "volume", "thicknessTexture"],
  ["specular", "specular", "specularTexture"],
  ["specularColor", "specular", "specularColorTexture"],
  ["iridescence", "iridescence", "iridescenceTexture"],
  ["iridescenceThickness", "iridescence", "iridescenceThicknessTexture"],
  ["anisotropy", "anisotropy", "anisotropyTexture"],
]);

function requireArray(value, label) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array.`);
  }
  return value;
}

function requireMap(value, label) {
  if (!value || typeof value !== "object" || typeof value.get !== "function") {
    throw new TypeError(`${label} must provide a ReadonlyMap-compatible get method.`);
  }
  return value;
}

function textureSample(binding, textures, label, extra = {}) {
  if (binding === undefined || binding === null) {
    return undefined;
  }

  const sample = textures.get(binding.textureId);
  if (!sample) {
    throw new Error(`Missing decoded texture sample ${binding.textureId} for ${label}.`);
  }
  // This boundary supplies only UV0 geometry and has no transform evaluator.
  // Refuse authored interpretations that would otherwise be silently ignored.
  if ((binding.texCoordSet !== undefined && binding.texCoordSet !== 0)
    || (sample.texCoord !== undefined && sample.texCoord !== 0)) {
    throw new Error("Canonical texture sampling supports only UV set 0.");
  }
  const transform = binding.transform;
  if (transform !== undefined) {
    const identityPair = (value, expected) => value === undefined
      || (Array.isArray(value) && value.length === 2 && value[0] === expected && value[1] === expected);
    if (!transform || typeof transform !== "object" || Array.isArray(transform)
      || Object.keys(transform).some(key => !["offset", "scale", "rotationRadians"].includes(key))
      || !identityPair(transform.offset, 0) || !identityPair(transform.scale, 1)
      || (transform.rotationRadians !== undefined && transform.rotationRadians !== 0)) {
      throw new Error("Canonical texture transforms require upstream application and identity bindings.");
    }
  }
  const width = Number(sample.width);
  const height = Number(sample.height);
  const data = sample.data;
  const dataLength = data && typeof data.length === "number" ? data.length : -1;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new TypeError(`Decoded texture sample ${binding.textureId} has invalid dimensions.`);
  }
  if (width > 4_096 || height > 4_096 || width * height > 4_096 * 4_096) {
    throw new RangeError(`Decoded texture sample ${binding.textureId} exceeds the 4096-pixel resource limit.`);
  }
  if (!(Array.isArray(data) || ArrayBuffer.isView(data)) || dataLength < width * height * 4) {
    throw new TypeError(`Decoded texture sample ${binding.textureId} must contain width × height × 4 RGBA values.`);
  }

  return Object.freeze({
    ...sample,
    ...(binding.texCoordSet === undefined ? {} : { texCoord: binding.texCoordSet }),
    ...extra,
  });
}

function cloneMaterialExtensions(material, textures) {
  const extensions = { ...(material.extensions ?? {}) };
  for (const [bindingName, extensionName, textureKey] of EXTENSION_TEXTURE_BINDINGS) {
    const binding = material.textures?.[bindingName];
    if (!binding) {
      continue;
    }

    const extensionKey = `KHR_materials_${extensionName}`;
    const extensionValue = extensions[extensionKey] ?? extensions[extensionName] ?? {};
    if (typeof extensionValue !== "object" || extensionValue === null || Array.isArray(extensionValue)) {
      throw new TypeError(`Canonical material extension ${extensionKey} must be an object.`);
    }
    extensions[extensionKey] = {
      ...extensionValue,
      [textureKey]: textureSample(binding, textures, `${extensionKey}.${textureKey}`),
    };
  }
  return extensions;
}

function mapMaterial(material, materialRefId, textures) {
  if (!material) {
    return { materialRefId };
  }
  if (material.alphaMode === "mask") {
    throw new Error("Canonical alphaMode mask is unsupported by WavefrontMeshInput.");
  }
  if (material.workflow === "unlit"
    || Object.hasOwn(material.extensions ?? {}, "KHR_materials_unlit")
    || Object.hasOwn(material.extensions ?? {}, "unlit")) {
    throw new Error("Canonical unlit materials are unsupported by WavefrontMeshInput; retain an unlit-capable rendering path.");
  }
  if (material.workflow !== "metallic-roughness") {
    throw new Error(`Unsupported canonical material workflow: ${material.workflow}.`);
  }

  const mapped = {
    materialRefId,
    alphaMode: material.alphaMode,
    ...(material.alphaMode === "blend" ? { materialKind: "transparent" } : {}),
    baseColor: material.baseColorFactor,
    emission: material.emissiveFactor
      ? [...material.emissiveFactor, 1]
      : [0, 0, 0, 1],
    roughness: material.roughnessFactor,
    metallic: material.metallicFactor,
    // The authored factor remains in baseColor.a; do not multiply it twice.
    opacity: 1,
    clearcoat: material.clearcoatFactor,
    clearcoatRoughness: material.clearcoatRoughnessFactor,
    transmission: material.transmissionFactor,
    sheenColor: material.sheenColorFactor,
    extensions: cloneMaterialExtensions(material, textures),
  };

  for (const [bindingName, inputName] of STANDARD_TEXTURE_BINDINGS) {
    const binding = material.textures?.[bindingName];
    if (!binding) {
      continue;
    }
    const extra = bindingName === "normal" && material.normalScale !== undefined
      ? { scale: material.normalScale }
      : bindingName === "occlusion" && material.occlusionStrength !== undefined
        ? { strength: material.occlusionStrength }
        : {};
    mapped[inputName] = textureSample(binding, textures, inputName, extra);
  }

  return mapped;
}

/**
 * Maps decoded canonical mesh primitives into the renderer's existing Wavefront
 * input contract. Geometry and image decoding remain upstream responsibilities.
 * Referenced unlit workflows or extension markers are rejected until an explicit
 * unlit shading path exists; callers must retain an unlit-capable rendering path.
 */
export function createCanonicalWavefrontMeshInputs({ document, geometry, textures = new Map() } = {}) {
  if (!document || typeof document !== "object") {
    throw new TypeError("Canonical model document is required.");
  }
  const meshes = requireArray(document.meshes, "Canonical model meshes");
  const materials = requireArray(document.materials, "Canonical model materials");
  const geometryInputs = requireArray(geometry, "Renderer-ready geometry");
  const textureSamples = requireMap(textures, "Decoded texture samples");

  const geometryByPrimitiveId = new Map();
  for (const entry of geometryInputs) {
    if (!entry || typeof entry.primitiveId !== "string" || entry.primitiveId.length === 0) {
      throw new TypeError("Renderer-ready geometry requires a non-empty primitiveId.");
    }
    if (geometryByPrimitiveId.has(entry.primitiveId)) {
      throw new Error(`Duplicate renderer-ready geometry for primitive ${entry.primitiveId}.`);
    }
    geometryByPrimitiveId.set(entry.primitiveId, entry);
  }

  const materialsById = new Map();
  const materialRefIds = new Map();
  materials.forEach((material, index) => {
    if (!material || typeof material.id !== "string" || material.id.length === 0) {
      throw new TypeError("Canonical materials require a non-empty id.");
    }
    if (materialsById.has(material.id)) {
      throw new Error(`Duplicate canonical material ${material.id}.`);
    }
    materialsById.set(material.id, material);
    materialRefIds.set(material.id, index + 1);
  });

  const output = [];
  const consumedPrimitiveIds = new Set();
  const canonicalPrimitiveIds = new Set();
  for (const mesh of meshes) {
    if (!mesh || typeof mesh.id !== "string") {
      throw new TypeError("Canonical meshes require a string id.");
    }
    for (const primitive of requireArray(mesh.primitives, `Primitives for mesh ${mesh.id}`)) {
      if (!primitive || typeof primitive.id !== "string" || primitive.id.length === 0) {
        throw new TypeError(`Canonical mesh ${mesh.id} contains a primitive without an id.`);
      }
      if (canonicalPrimitiveIds.has(primitive.id)) {
        throw new Error(`Duplicate canonical primitive ${primitive.id}.`);
      }
      canonicalPrimitiveIds.add(primitive.id);
      if (primitive.topology !== "triangles") {
        throw new Error(`Unsupported canonical primitive topology: ${primitive.topology}.`);
      }
      const source = geometryByPrimitiveId.get(primitive.id);
      if (!source) {
        throw new Error(`Missing renderer-ready geometry for primitive ${primitive.id}.`);
      }
      consumedPrimitiveIds.add(primitive.id);

      let material = null;
      let materialRefId = 0;
      if (primitive.materialId !== undefined) {
        material = materialsById.get(primitive.materialId);
        if (!material) {
          throw new Error(`Missing canonical material ${primitive.materialId} for primitive ${primitive.id}.`);
        }
        materialRefId = materialRefIds.get(primitive.materialId);
      }

      output.push(Object.freeze({
        id: output.length + 1,
        positions: source.positions,
        ...(source.indices === undefined ? {} : { indices: source.indices }),
        ...(source.normals === undefined ? {} : { normals: source.normals }),
        ...((source.texcoords ?? source.uvs) === undefined
          ? {}
          : { uvs: source.texcoords ?? source.uvs }),
        ...mapMaterial(material, materialRefId, textureSamples),
      }));
    }
  }

  for (const primitiveId of geometryByPrimitiveId.keys()) {
    if (!consumedPrimitiveIds.has(primitiveId)) {
      throw new Error(`Renderer-ready geometry references unknown primitive ${primitiveId}.`);
    }
  }

  return Object.freeze(output);
}
