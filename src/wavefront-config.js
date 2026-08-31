import {
  ACCUMULATION_RECORD_BYTES,
  BVH_LEAF_REF_RECORD_BYTES,
  BVH_NODE_RECORD_BYTES,
  CONFIG_BUFFER_BYTES,
  COUNTER_BUFFER_BYTES,
  DEFAULT_AMBIENT_COLOR,
  DEFAULT_CAMERA,
  DEFAULT_ENVIRONMENT_COLOR,
  DEFAULT_ENVIRONMENT_LIGHTING,
  DEFAULT_ENVIRONMENT_PORTAL_CAPACITY,
  DEFAULT_HEIGHT,
  DEFAULT_MAX_DEPTH,
  DEFAULT_MAX_FRAME_PASSES_PER_SUBMISSION,
  DEFAULT_SAMPLES_PER_PIXEL,
  DEFAULT_SCENE_OBJECT_CAPACITY,
  DEFAULT_TILE_SIZE,
  DEFAULT_WIDTH,
  EMISSIVE_TRIANGLE_INDEX_BYTES,
  EMPTY_TERMINATION_METRICS,
  ENVIRONMENT_PORTAL_RECORD_BYTES,
  HIT_RECORD_BYTES,
  INDIRECT_DISPATCH_ARGS_BYTES,
  MAX_PATH_TRACING_DEPTH,
  MAX_SAMPLES_PER_PIXEL,
  MESH_RANGE_RECORD_BYTES,
  MESH_VERTEX_RECORD_BYTES,
  PATH_VERTEX_RECORD_BYTES,
  RAY_RECORD_BYTES,
  SCENE_OBJECT_RECORD_BYTES,
  TRIANGLE_RECORD_BYTES,
  WORKGROUP_SIZE,
  add,
  asColor,
  asUnitVec3,
  asVec3,
  assertAnalyticDisplayQualityPolicy,
  clamp,
  cross,
  dot,
  normalize,
  readFiniteNumber,
  readNonNegativeInteger,
  readPositiveInteger,
  rendererWavefrontComputeMode,
  resolveDeferredPathResolve,
  resolveEnvironmentMap,
  resolveStrictPhysicalLowSppLighting,
  resolveTransportExperiments,
  resolveWavefrontPresentationOutput,
  scale,
  subtract,
} from "./wavefront-core.js";
import { writeVec4 } from "./wavefront-binary.js";
import {
  collectWavefrontMediums,
  createWavefrontEmissiveTriangleIndexSource,
  createWavefrontBvhBuildLevels,
  createWavefrontBvhSortStages,
  createWavefrontGpuMaterialSource,
  createWavefrontGpuMeshSource,
  createWavefrontMeshAcceleration,
  estimateBinaryBvhNodeCapacity,
  estimateBvhLeafSortCapacity,
  estimateMeshSourceShape,
  normalizeMeshes,
  normalizeSceneObjects,
  resolveAccelerationBuildMode,
} from "./wavefront-scene-data.js";

const WEBGPU_DEFAULT_MIN_UNIFORM_BUFFER_OFFSET_ALIGNMENT = 256;

function allocatedRecordBytes(count, recordBytes) {
  return Math.max(1, count) * recordBytes;
}

function alignByteSize(value, alignment) {
  return Math.ceil(value / alignment) * alignment;
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

export function packEnvironmentPortals(portals, capacity) {
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
  const width = readPositiveInteger("width", options.width, DEFAULT_WIDTH);
  const height = readPositiveInteger("height", options.height, DEFAULT_HEIGHT);
  const tileSize = readPositiveInteger("tileSize", options.tileSize, DEFAULT_TILE_SIZE);
  const samplesPerPixel = clamp(
    readPositiveInteger(
      "samplesPerPixel",
      options.samplesPerPixel,
      DEFAULT_SAMPLES_PER_PIXEL
    ),
    1,
    MAX_SAMPLES_PER_PIXEL
  );
  const tilePixelCapacity = readPositiveInteger(
    "tilePixelCapacity",
    options.tilePixelCapacity,
    DEFAULT_TILE_SIZE * DEFAULT_TILE_SIZE
  );
  const maxDepth = clamp(
    readPositiveInteger("maxDepth", options.maxDepth, DEFAULT_MAX_DEPTH),
    1,
    MAX_PATH_TRACING_DEPTH
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
  readNonNegativeInteger("materialCapacity", options.materialCapacity, 0);
  const meshVertexCount = readNonNegativeInteger(
    "meshVertexCount",
    options.meshVertexCount,
    0
  );
  const meshIndexCount = readNonNegativeInteger(
    "meshIndexCount",
    options.meshIndexCount,
    0
  );
  const meshRangeCount = readNonNegativeInteger(
    "meshRangeCount",
    options.meshRangeCount,
    0
  );
  const bvhSortStageCount = readNonNegativeInteger(
    "bvhSortStageCount",
    options.bvhSortStageCount,
    0
  );
  const bvhBuildLevelCount = readNonNegativeInteger(
    "bvhBuildLevelCount",
    options.bvhBuildLevelCount,
    0
  );
  const minUniformBufferOffsetAlignment = readPositiveInteger(
    "minUniformBufferOffsetAlignment",
    options.minUniformBufferOffsetAlignment,
    WEBGPU_DEFAULT_MIN_UNIFORM_BUFFER_OFFSET_ALIGNMENT
  );
  const denoise = options.denoise !== false;
  const deferredPathResolve = options.deferredPathResolve !== false;
  const queueBytes = tilePixelCapacity * RAY_RECORD_BYTES;
  const hitBytes = tilePixelCapacity * HIT_RECORD_BYTES;
  const accumulationBytes = tilePixelCapacity * ACCUMULATION_RECORD_BYTES;
  const pathVertexBytes = tilePixelCapacity * (maxDepth + 1) * PATH_VERTEX_RECORD_BYTES;
  const sceneObjectBytes = sceneObjectCapacity * SCENE_OBJECT_RECORD_BYTES;
  const triangleBytes = allocatedRecordBytes(triangleCapacity, TRIANGLE_RECORD_BYTES);
  const materialTableBytes = 0;
  const bvhNodeBytes = bvhNodeCapacity * BVH_NODE_RECORD_BYTES;
  const bvhLeafReferenceBytes = allocatedRecordBytes(
    bvhLeafSortCapacity,
    BVH_LEAF_REF_RECORD_BYTES
  );
  const emissiveTriangleMetadataBytes =
    emissiveTriangleCapacity * BVH_NODE_RECORD_BYTES;
  const bvhCombinedBytes = allocatedRecordBytes(
    bvhNodeCapacity + emissiveTriangleCapacity,
    BVH_NODE_RECORD_BYTES
  );
  const meshVertexBytes = allocatedRecordBytes(meshVertexCount, MESH_VERTEX_RECORD_BYTES);
  const meshIndexBytes = allocatedRecordBytes(meshIndexCount, 4);
  const meshRangeBytes = allocatedRecordBytes(meshRangeCount, MESH_RANGE_RECORD_BYTES);
  const environmentPortalBytes = allocatedRecordBytes(
    environmentPortalCapacity,
    ENVIRONMENT_PORTAL_RECORD_BYTES
  );
  const tileCount = Math.ceil(width / tileSize) * Math.ceil(height / tileSize);
  const outputConfigSlotCount = deferredPathResolve ? 0 : tileCount;
  const frameConfigSlotCount = Math.max(
    1,
    tileCount * samplesPerPixel + outputConfigSlotCount + (denoise ? 1 : 0)
  );
  const configBufferStride = alignByteSize(
    CONFIG_BUFFER_BYTES,
    minUniformBufferOffsetAlignment
  );
  const frameConfigBytes = frameConfigSlotCount * configBufferStride;
  const bvhBuildConfigBytes = Math.max(
    1,
    1 + bvhSortStageCount + bvhBuildLevelCount
  ) * configBufferStride;
  const sceneStorageBufferBindingBytes = Math.max(
    sceneObjectBytes,
    triangleBytes,
    bvhCombinedBytes,
    meshVertexBytes,
    meshIndexBytes,
    meshRangeBytes,
    environmentPortalBytes,
    bvhLeafReferenceBytes
  );
  const totalHotBufferBytes =
    queueBytes * 2 +
    hitBytes +
    accumulationBytes +
    pathVertexBytes +
    sceneObjectBytes +
    triangleBytes +
    bvhCombinedBytes +
    meshVertexBytes +
    meshIndexBytes +
    meshRangeBytes +
    bvhLeafReferenceBytes +
    environmentPortalBytes +
    frameConfigBytes +
    bvhBuildConfigBytes +
    COUNTER_BUFFER_BYTES +
    INDIRECT_DISPATCH_ARGS_BYTES;

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
    bvhCombinedBytes,
    bvhLeafReferenceBytes,
    emissiveTriangleMetadataBytes,
    meshVertexBytes,
    meshIndexBytes,
    meshRangeBytes,
    environmentPortalBytes,
    configBytes: CONFIG_BUFFER_BYTES,
    configBufferStride,
    frameConfigBytes,
    bvhBuildConfigBytes,
    counterBytes: COUNTER_BUFFER_BYTES,
    indirectDispatchBytes: INDIRECT_DISPATCH_ARGS_BYTES,
    sceneStorageBufferBindingBytes,
    totalHotBufferBytes,
  });
}

export function estimateWavefrontPathTracingMemoryForConfig(config, limits = {}) {
  return estimateWavefrontPathTracingMemory({
    width: config.width,
    height: config.height,
    tileSize: config.tileSize,
    samplesPerPixel: config.samplesPerPixel,
    tilePixelCapacity: config.tilePixelCapacity,
    maxDepth: config.maxDepth,
    sceneObjectCapacity: config.sceneObjectCapacity,
    triangleCapacity: config.triangleCapacity,
    bvhNodeCapacity: config.bvhNodeCapacity,
    bvhLeafSortCapacity: config.bvhLeafSortCapacity,
    emissiveTriangleCapacity: config.emissiveTriangleCapacity,
    environmentPortalCapacity: config.environmentPortalCapacity,
    meshVertexCount: config.gpuMeshSource.vertices.count,
    meshIndexCount: config.gpuMeshSource.indices.count,
    meshRangeCount: config.gpuMeshSource.meshes.count,
    bvhSortStageCount: config.bvhSortStages.length,
    bvhBuildLevelCount: config.bvhBuildLevels.length,
    denoise: config.denoise,
    deferredPathResolve: config.deferredPathResolve,
    minUniformBufferOffsetAlignment:
      limits.minUniformBufferOffsetAlignment ??
      WEBGPU_DEFAULT_MIN_UNIFORM_BUFFER_OFFSET_ALIGNMENT,
  });
}

export function createWavefrontPathTracingComputeConfig(options = {}) {
  assertAnalyticDisplayQualityPolicy(options);
  const accelerationBuildMode = resolveAccelerationBuildMode(options);
  const canvas = options.canvas;
  const width = readPositiveInteger("width", options.width, getCanvasDimension(canvas, "width", DEFAULT_WIDTH));
  const height = readPositiveInteger("height", options.height, getCanvasDimension(canvas, "height", DEFAULT_HEIGHT));
  const maxDepth = clamp(
    readPositiveInteger("maxDepth", options.maxDepth, DEFAULT_MAX_DEPTH),
    1,
    MAX_PATH_TRACING_DEPTH
  );
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
    accelerationBuildMode === "cpu-upload"
      ? createWavefrontMeshAcceleration(meshes, gpuMaterialSource)
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
  const mediums = collectWavefrontMediums(options, meshes, sceneObjects);
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
  const strictPhysicalLowSppLighting = resolveStrictPhysicalLowSppLighting(options);
  const transportExperiments = resolveTransportExperiments(options, strictPhysicalLowSppLighting);

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
    mediums,
    mediumCount: mediums.length,
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
    strictPhysicalLowSppLighting,
    transportExperiments,
    transportExperimentFlags: transportExperiments.bitmask,
    presentationOutput: resolveWavefrontPresentationOutput(options.presentationOutput),
    displayQuality: options.displayQuality === true,
    requiresMeshBvhForDisplayQuality: true,
    denoise: options.denoise !== false,
    frameIndex: readNonNegativeInteger("frameIndex", options.frameIndex, 0),
    memory: estimateWavefrontPathTracingMemory({
      width,
      height,
      tileSize,
      samplesPerPixel,
      tilePixelCapacity,
      maxDepth,
      sceneObjectCapacity,
      triangleCapacity,
      bvhNodeCapacity,
      bvhLeafSortCapacity,
      emissiveTriangleCapacity: emissiveTriangleIndices.capacity,
      environmentPortalCapacity,
      meshVertexCount: gpuMeshSource.vertices.count,
      meshIndexCount: gpuMeshSource.indices.count,
      meshRangeCount: gpuMeshSource.meshes.count,
      bvhSortStageCount: bvhSortStages.length,
      bvhBuildLevelCount: bvhBuildLevels.length,
      denoise: options.denoise !== false,
      deferredPathResolve,
    }),
  });
}

export function supportsWavefrontPathTracingCompute(options = {}) {
  const navigatorRef = options.navigator ?? globalThis.navigator;
  return typeof navigatorRef?.gpu?.requestAdapter === "function";
}
