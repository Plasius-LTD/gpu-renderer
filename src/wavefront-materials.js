import {
  DEFAULT_MEDIUM_PHASE_MODEL,
  MATERIAL_DIELECTRIC,
  MATERIAL_DIFFUSE,
  MATERIAL_EMISSIVE,
  MATERIAL_METAL,
  MATERIAL_TRANSPARENT,
  asColor,
  asVec3,
  clamp,
  readFiniteNumber,
  readNonNegativeInteger,
} from "./wavefront-core.js";

export function readMaterialKind(value) {
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

function deriveBeerLambertAbsorptionFromAttenuationColor(
  attenuationColor,
  attenuationDistance,
  density = 1
) {
  const distance = Number(attenuationDistance);
  const densityScale = Math.max(0, Number(density) || 0);
  if (!Number.isFinite(distance) || distance <= 0 || densityScale <= 0) {
    return [0, 0, 0];
  }
  return attenuationColor.slice(0, 3).map((channel) => {
    const clamped = clamp(Number(channel) || 0, 0.0001, 1);
    return Math.max(0, (-Math.log(clamped) / distance) * densityScale);
  });
}

function readMediumPhaseModel(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  switch (String(value ?? "").trim().toLowerCase()) {
    case "isotropic":
    default:
      return DEFAULT_MEDIUM_PHASE_MODEL;
  }
}

function resolveWavefrontVolumeInput(input) {
  if (input?.volume ?? input?.material?.volume) {
    return input.volume ?? input.material.volume;
  }
  const extension = resolveExtension(input, "volume");
  return Object.keys(extension).length > 0 ? extension : null;
}

function resolveMaterialExtensions(input) {
  return input?.extensions ?? input?.material?.extensions ?? input?.materialExtensions ?? {};
}

function resolveExtension(input, name) {
  const extensions = resolveMaterialExtensions(input);
  return extensions[name] ?? extensions[`KHR_materials_${name}`] ?? {};
}

function readExtensionNumber(input, extensionName, key, fallback) {
  const extension = resolveExtension(input, extensionName);
  return readFiniteNumber(
    `KHR_materials_${extensionName}.${key}`,
    extension[key],
    fallback
  );
}

function resolveExtensionTexture(input, extensionName, key) {
  const extension = resolveExtension(input, extensionName);
  return extension[key] ?? null;
}

export function normalizeWavefrontMaterialExtensions(input = {}) {
  const clearcoat = resolveExtension(input, "clearcoat");
  const ior = resolveExtension(input, "ior");
  const transmission = resolveExtension(input, "transmission");
  const volume = resolveExtension(input, "volume");
  const sheen = resolveExtension(input, "sheen");
  const specular = resolveExtension(input, "specular");
  const iridescence = resolveExtension(input, "iridescence");
  const anisotropy = resolveExtension(input, "anisotropy");
  const unlit = resolveExtension(input, "unlit");
  return Object.freeze({
    clearcoat: clamp(readFiniteNumber("clearcoat", clearcoat.clearcoatFactor, input.clearcoat ?? input.material?.clearcoat ?? 0), 0, 1),
    clearcoatRoughness: clamp(readFiniteNumber("clearcoatRoughness", clearcoat.clearcoatRoughnessFactor, input.clearcoatRoughness ?? input.material?.clearcoatRoughness ?? 0.08), 0, 1),
    ior: clamp(readFiniteNumber("ior", ior.ior, input.ior ?? input.material?.ior ?? 1.45), 1, 3),
    transmission: clamp(readFiniteNumber("transmission", transmission.transmissionFactor, input.transmission ?? input.material?.transmission ?? 0), 0, 1),
    volumeThickness: Math.max(0, readFiniteNumber("volume.thicknessFactor", volume.thicknessFactor, input.thickness ?? input.material?.thickness ?? 0)),
    sheenColor: Object.freeze(asColor(sheen.sheenColorFactor ?? input.sheenColor ?? input.material?.sheenColor, [0, 0, 0, 1])),
    sheenRoughness: clamp(readFiniteNumber("sheenRoughness", sheen.sheenRoughnessFactor, 0), 0, 1),
    specular: clamp(readFiniteNumber("specular", specular.specularFactor, input.specular ?? input.material?.specular ?? 1), 0, 1),
    specularColor: Object.freeze(asColor(specular.specularColorFactor ?? input.specularColor ?? input.material?.specularColor, [1, 1, 1, 1])),
    iridescence: clamp(readFiniteNumber("iridescence", iridescence.iridescenceFactor, 0), 0, 1),
    iridescenceIor: clamp(readFiniteNumber("iridescenceIor", iridescence.iridescenceIor, 1.3), 1, 3),
    iridescenceThicknessMinimum: Math.max(0, readFiniteNumber("iridescenceThicknessMinimum", iridescence.iridescenceThicknessMinimum, 100)),
    iridescenceThicknessMaximum: Math.max(0, readFiniteNumber("iridescenceThicknessMaximum", iridescence.iridescenceThicknessMaximum, 400)),
    dispersion: clamp(readExtensionNumber(input, "dispersion", "dispersion", 0), 0, 2),
    anisotropy: clamp(readFiniteNumber("anisotropy", anisotropy.anisotropyStrength, 0), 0, 1),
    anisotropyRotation: readFiniteNumber("anisotropyRotation", anisotropy.anisotropyRotation, 0),
    unlit: Object.keys(unlit).length > 0,
    textures: Object.freeze({
      clearcoat: resolveExtensionTexture(input, "clearcoat", "clearcoatTexture"),
      clearcoatRoughness: resolveExtensionTexture(input, "clearcoat", "clearcoatRoughnessTexture"),
      clearcoatNormal: resolveExtensionTexture(input, "clearcoat", "clearcoatNormalTexture"),
      transmission: resolveExtensionTexture(input, "transmission", "transmissionTexture"),
      thickness: resolveExtensionTexture(input, "volume", "thicknessTexture"),
      sheenColor: resolveExtensionTexture(input, "sheen", "sheenColorTexture"),
      sheenRoughness: resolveExtensionTexture(input, "sheen", "sheenRoughnessTexture"),
      specular: resolveExtensionTexture(input, "specular", "specularTexture"),
      specularColor: resolveExtensionTexture(input, "specular", "specularColorTexture"),
      iridescence: resolveExtensionTexture(input, "iridescence", "iridescenceTexture"),
      iridescenceThickness: resolveExtensionTexture(input, "iridescence", "iridescenceThicknessTexture"),
      anisotropy: resolveExtensionTexture(input, "anisotropy", "anisotropyTexture"),
    }),
  });
}

export function normalizeWavefrontThickness(input, label) {
  const volume = resolveWavefrontVolumeInput(input);
  return Math.max(
    0,
    readFiniteNumber(
      label,
      input?.thickness ?? volume?.thickness ?? input?.material?.thickness,
      0
    )
  );
}

function resolveWavefrontMediumId(input, fallbackId = 1) {
  return (
    input?.mediumRefId ??
    input?.mediumId ??
    input?.material?.mediumId ??
    input?.materialRefId ??
    input?.material?.id ??
    input?.materialId ??
    input?.id ??
    fallbackId
  );
}

export function deriveWavefrontTransportMedium(input, fallbackId = 1) {
  const resolvedId = resolveWavefrontMediumId(input, fallbackId);
  if (input?.medium) {
    return normalizeWavefrontMedium(
      {
        ...input.medium,
      id: input.medium.id ?? input.medium.mediumId ?? resolvedId,
      },
      fallbackId
    );
  }
  const volume = resolveWavefrontVolumeInput(input);
  if (!volume) {
    return null;
  }
  return normalizeWavefrontMedium(
    {
      id: resolvedId,
      phaseModel: volume.phaseModel,
      density: volume.density,
      attenuationColor: volume.attenuationColor,
      attenuationDistance: volume.attenuationDistance,
      absorption: volume.absorption,
      scattering: volume.scattering,
    },
    fallbackId
  );
}

function normalizeWavefrontMedium(input = {}, index = 0) {
  const id = readNonNegativeInteger("medium id", input.id ?? input.mediumId, index);
  const density = Math.max(0, readFiniteNumber("medium density", input.density, 1));
  const attenuationColor = asColor(
    input.attenuationColor ?? input.color ?? input.medium?.attenuationColor,
    [1, 1, 1, 1]
  );
  const attenuationDistance = readFiniteNumber(
    "medium attenuationDistance",
    input.attenuationDistance ?? input.distance ?? input.medium?.attenuationDistance,
    0
  );
  const absorption =
    Array.isArray(input.absorption) || Array.isArray(input.medium?.absorption)
      ? asVec3(input.absorption ?? input.medium?.absorption, [0, 0, 0]).map((value) =>
          Math.max(0, Number(value) || 0)
        )
      : deriveBeerLambertAbsorptionFromAttenuationColor(
          attenuationColor,
          attenuationDistance,
          density
        );
  const scattering = asVec3(
    input.scattering ?? input.medium?.scattering,
    [0, 0, 0]
  ).map((value) => Math.max(0, Number(value) || 0));
  return Object.freeze({
    id,
    phaseModel: readMediumPhaseModel(input.phaseModel ?? input.medium?.phaseModel),
    density,
    attenuationColor: Object.freeze(attenuationColor),
    attenuationDistance,
    absorption: Object.freeze(absorption),
    scattering: Object.freeze(scattering),
  });
}

export function collectWavefrontMediums(options, meshes, sceneObjects = []) {
  const mediumsById = new Map();
  mediumsById.set(
    0,
    Object.freeze({
      id: 0,
      phaseModel: DEFAULT_MEDIUM_PHASE_MODEL,
      density: 0,
      attenuationColor: Object.freeze([1, 1, 1, 1]),
      attenuationDistance: 0,
      absorption: Object.freeze([0, 0, 0]),
      scattering: Object.freeze([0, 0, 0]),
    })
  );

  const register = (input, fallbackId = mediumsById.size) => {
    if (!input) {
      return;
    }
    const normalized = normalizeWavefrontMedium(
      typeof input === "object" ? { id: fallbackId, ...input } : { id: fallbackId },
      fallbackId
    );
    const existing = mediumsById.get(normalized.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(normalized)) {
      throw new Error(`Medium id ${normalized.id} is defined more than once with different values.`);
    }
    mediumsById.set(normalized.id, normalized);
  };

  for (const medium of options.mediums ?? []) {
    register(medium);
  }
  for (const mesh of meshes) {
    register(mesh.medium, mesh.mediumRefId ?? mesh.medium?.id ?? 0);
  }
  for (const mesh of meshes) {
    if ((mesh.mediumRefId ?? 0) > 0 && !mediumsById.has(mesh.mediumRefId)) {
      register({ id: mesh.mediumRefId });
    }
  }
  for (const object of sceneObjects) {
    register(object.medium, object.mediumRefId ?? object.medium?.id ?? 0);
  }
  for (const object of sceneObjects) {
    if ((object.mediumRefId ?? 0) > 0 && !mediumsById.has(object.mediumRefId)) {
      register({ id: object.mediumRefId });
    }
  }

  return Object.freeze(
    Array.from(mediumsById.values()).sort((left, right) => left.id - right.id)
  );
}
