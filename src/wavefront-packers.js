import {
  BVH_NODE_RECORD_BYTES,
  CONFIG_BUFFER_BYTES,
  COUNTER_DISPATCH_ARGS_OFFSET,
  HIT_TYPE_EMISSIVE,
  HIT_TYPE_SURFACE,
  MESH_RANGE_RECORD_BYTES,
  SCENE_OBJECT_RECORD_BYTES,
  TRIANGLE_RECORD_BYTES,
  clamp,
  readNonNegativeInteger,
  readPositiveInteger,
} from "./wavefront-core.js";
import { writeVec4 } from "./wavefront-binary.js";
import { normalizeSceneObjects } from "./wavefront-scene-data.js";

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
    uintView[u32 + 4] = object.mediumRefId;
    writeVec4(floatView, byteOffset + 32, [...object.center, 0]);
    writeVec4(floatView, byteOffset + 48, [...object.halfExtent, 0]);
    writeVec4(floatView, byteOffset + 64, object.color);
    writeVec4(floatView, byteOffset + 80, object.emission);
    writeVec4(floatView, byteOffset + 96, [
      object.roughness,
      object.metallic,
      object.opacity,
      object.ior,
    ]);
    writeVec4(floatView, byteOffset + 112, [
      object.sheenColor[0] ?? 0,
      object.sheenColor[1] ?? 0,
      object.sheenColor[2] ?? 0,
      object.clearcoat,
    ]);
    writeVec4(floatView, byteOffset + 128, [
      object.clearcoatRoughness,
      object.specular,
      object.transmission,
      object.thickness,
    ]);
    writeVec4(floatView, byteOffset + 144, [
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

export function createConfigPayload(config, tile, frameIndex, buildRange = {}) {
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
  data.setUint32(264, config.samplesPerPixel, true);
  data.setUint32(268, config.transportExperimentFlags ?? 0, true);
  writeVec4(floatView, 272, [
    config.environmentMap.enabled ? 1 : 0,
    config.environmentMap.intensity,
    config.environmentMap.rotationRadians,
    config.environmentMap.ambientStrength,
  ]);
  writeVec4(floatView, 288, [
    config.deferredPathResolve ? 1 : 0,
    config.environmentLighting.sunlitBaseline,
    config.strictPhysicalLowSppLighting ? 1 : 0,
    0,
  ]);
  writeVec4(floatView, 304, [
    config.environmentMap.width ?? 1,
    config.environmentMap.height ?? 1,
    config.environmentMap.mipLevelCount ?? 1,
    config.environmentMap.hasImportanceData ? 1 : 0,
  ]);
  return bytes;
}

export function createTiles(width, height, tileSize) {
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
