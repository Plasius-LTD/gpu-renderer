import {
  EMISSIVE_TRIANGLE_INDEX_BYTES,
  GPU_MATERIAL_RECORD_BYTES,
  MATERIAL_EMISSIVE,
  MESH_RANGE_RECORD_BYTES,
  MESH_VERTEX_RECORD_BYTES,
  boundsCentroid,
  clamp,
  cross,
  emissionPower,
  mergeBounds,
  normalize,
  readNonNegativeInteger,
  readVector,
  readVector2,
  subtract,
  triangleBounds,
} from "./wavefront-core.js";
import { writeVec4 } from "./wavefront-binary.js";
import { normalizeWavefrontMesh } from "./wavefront-scene-normalizers.js";

function clampUnit(value) {
  return clamp(Number(value) || 0, 0, 1);
}

function createMeshTriangleRecords(meshes, gpuMaterialSource = null) {
  const source = Array.isArray(meshes) ? meshes : [];
  const resolvedMaterialSource = gpuMaterialSource ?? createWavefrontGpuMaterialSource(source);
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
          materialSlot: meshIndex,
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
          material: Object.freeze([
            mesh.roughness,
            mesh.metallic,
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
            mesh.thickness,
          ]),
          specularColor: Object.freeze([
            mesh.specularColor[0] ?? 1,
            mesh.specularColor[1] ?? 1,
            mesh.specularColor[2] ?? 1,
            1,
          ]),
          baseColorAtlas: Object.freeze(
            resolvedMaterialSource.baseColorAtlas.resolveRect(mesh.baseColorTexture)
          ),
          metallicRoughnessAtlas: Object.freeze(
            resolvedMaterialSource.metallicRoughnessAtlas.resolveRect(mesh.metallicRoughnessTexture)
          ),
          normalAtlas: Object.freeze(
            resolvedMaterialSource.normalAtlas.resolveRect(mesh.normalTexture)
          ),
          occlusionAtlas: Object.freeze(
            resolvedMaterialSource.occlusionAtlas.resolveRect(mesh.occlusionTexture)
          ),
          emissiveAtlas: Object.freeze(
            resolvedMaterialSource.emissiveAtlas.resolveRect(mesh.emissiveTexture)
          ),
          textureSettings: Object.freeze([
            clampUnit(mesh.normalTexture?.scale ?? mesh.normalTexture?.strength ?? 1),
            clampUnit(mesh.occlusionTexture?.strength ?? 1),
            clampUnit(mesh.emissiveTexture?.strength ?? 1),
            0,
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

export function createWavefrontMeshAcceleration(meshes = [], gpuMaterialSource = null) {
  const source = Array.isArray(meshes) ? meshes : [meshes];
  const resolvedMaterialSource = gpuMaterialSource ?? createWavefrontGpuMaterialSource(source);
  const triangles = createMeshTriangleRecords(source, resolvedMaterialSource);
  return buildBvh(triangles);
}

export function estimateMeshSourceShape(meshes) {
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

export function estimateBinaryBvhNodeCapacity(triangleCount) {
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
      mesh.thickness,
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

export function estimateBvhLeafSortCapacity(triangleCount) {
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

export function resolveAccelerationBuildMode(options = {}) {
  const requestedMode =
    options.accelerationBuildMode ?? (options.displayQuality === true ? "cpu-upload" : "cpu-debug");
  const mode = requestedMode === "cpu-debug" ? "cpu-upload" : requestedMode;
  if (mode !== "gpu" && mode !== "cpu-upload") {
    throw new Error(
      "accelerationBuildMode must be either \"gpu\", \"cpu-upload\", or the legacy alias \"cpu-debug\"."
    );
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
      mesh.thickness,
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
