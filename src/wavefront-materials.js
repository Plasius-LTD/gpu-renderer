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
  return input?.volume ?? input?.material?.volume ?? null;
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
