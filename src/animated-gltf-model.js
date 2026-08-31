const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const GLB_JSON_CHUNK = 0x4e4f534a;
const GLB_BIN_CHUNK = 0x004e4942;

const COMPONENT_READERS = Object.freeze({
  5120: { size: 1, read: (view, offset) => view.getInt8(offset), normalizedDivisor: 127 },
  5121: { size: 1, read: (view, offset) => view.getUint8(offset), normalizedDivisor: 255 },
  5122: { size: 2, read: (view, offset) => view.getInt16(offset, true), normalizedDivisor: 32767 },
  5123: { size: 2, read: (view, offset) => view.getUint16(offset, true), normalizedDivisor: 65535 },
  5125: { size: 4, read: (view, offset) => view.getUint32(offset, true), normalizedDivisor: 4294967295 },
  5126: { size: 4, read: (view, offset) => view.getFloat32(offset, true), normalizedDivisor: 1 },
});

const ACCESSOR_COMPONENTS = Object.freeze({
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT4: 16,
});

function identityMatrix() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function multiplyMatrix(a, b) {
  const out = new Array(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] =
        a[0 * 4 + row] * b[column * 4 + 0]
        + a[1 * 4 + row] * b[column * 4 + 1]
        + a[2 * 4 + row] * b[column * 4 + 2]
        + a[3 * 4 + row] * b[column * 4 + 3];
    }
  }
  return out;
}

function transformPoint(matrix, point) {
  const [x, y, z] = point;
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  ];
}

function composeMatrix(translation = [0, 0, 0], rotation = [0, 0, 0, 1], scale = [1, 1, 1]) {
  const [x, y, z, w] = normalizeQuaternion(rotation);
  const [sx, sy, sz] = scale;
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;

  return [
    (1 - (yy + zz)) * sx,
    (xy + wz) * sx,
    (xz - wy) * sx,
    0,
    (xy - wz) * sy,
    (1 - (xx + zz)) * sy,
    (yz + wx) * sy,
    0,
    (xz + wy) * sz,
    (yz - wx) * sz,
    (1 - (xx + yy)) * sz,
    0,
    translation[0] ?? 0,
    translation[1] ?? 0,
    translation[2] ?? 0,
    1,
  ];
}

function normalizeQuaternion(quaternion = [0, 0, 0, 1]) {
  const length = Math.hypot(quaternion[0] ?? 0, quaternion[1] ?? 0, quaternion[2] ?? 0, quaternion[3] ?? 1) || 1;
  return [
    (quaternion[0] ?? 0) / length,
    (quaternion[1] ?? 0) / length,
    (quaternion[2] ?? 0) / length,
    (quaternion[3] ?? 1) / length,
  ];
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpArray(a, b, t) {
  return a.map((value, index) => lerp(value, b[index] ?? value, t));
}

function nlerpQuaternion(a, b, t) {
  let end = b;
  const dot = a.reduce((total, value, index) => total + value * (b[index] ?? 0), 0);
  if (dot < 0) {
    end = b.map((value) => -value);
  }
  return normalizeQuaternion(lerpArray(a, end, t));
}

function parseGlb(buffer) {
  if (!(buffer instanceof ArrayBuffer)) {
    return null;
  }
  const view = new DataView(buffer);
  if (view.byteLength < 20 || view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(4, true) !== GLB_VERSION) {
    return null;
  }

  let offset = 12;
  let json = null;
  let binary = null;
  while (offset + 8 <= view.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = start + length;
    if (end > view.byteLength) {
      return null;
    }
    if (type === GLB_JSON_CHUNK) {
      const text = new TextDecoder().decode(new Uint8Array(buffer, start, length)).trim();
      json = JSON.parse(text);
    } else if (type === GLB_BIN_CHUNK) {
      binary = new Uint8Array(buffer, start, length);
    }
    offset = end;
  }

  if (!json || !binary) {
    return null;
  }
  return { json, binary };
}

function readAccessor(document, accessorIndex) {
  const accessor = document.json.accessors?.[accessorIndex];
  if (!accessor) {
    return [];
  }
  const bufferView = document.json.bufferViews?.[accessor.bufferView];
  const component = COMPONENT_READERS[accessor.componentType];
  const componentCount = ACCESSOR_COMPONENTS[accessor.type] ?? 1;
  if (!bufferView || !component) {
    return [];
  }

  const view = new DataView(
    document.binary.buffer,
    document.binary.byteOffset + (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0),
    bufferView.byteLength ?? 0,
  );
  const stride = bufferView.byteStride ?? component.size * componentCount;
  const values = [];
  for (let index = 0; index < accessor.count; index += 1) {
    const item = [];
    const baseOffset = index * stride;
    for (let componentIndex = 0; componentIndex < componentCount; componentIndex += 1) {
      const raw = component.read(view, baseOffset + componentIndex * component.size);
      item.push(accessor.normalized && accessor.componentType !== 5126 ? raw / component.normalizedDivisor : raw);
    }
    values.push(componentCount === 1 ? item[0] : item);
  }
  return values;
}

function readMatrices(document, accessorIndex) {
  return readAccessor(document, accessorIndex).map((matrix) => Array.from(matrix));
}

function textureImage(document, textureIndex) {
  if (typeof textureIndex !== "number") {
    return null;
  }
  const texture = document.json.textures?.[textureIndex];
  return typeof texture?.source === "number" ? document.json.images?.[texture.source] ?? null : null;
}

function imageHasBuffer(document, image) {
  if (!image) {
    return false;
  }
  if (typeof image.uri === "string" && image.uri.trim().length > 0) {
    return true;
  }
  return typeof image.bufferView === "number" && Boolean(document.json.bufferViews?.[image.bufferView]);
}

function extractMaterialTextureMetadata(document, primitive) {
  const material = document.json.materials?.[primitive?.material];
  const baseColorTextureIndex = material?.pbrMetallicRoughness?.baseColorTexture?.index;
  const normalTextureIndex = material?.normalTexture?.index;
  const missingTextureReferences = [];
  if (typeof baseColorTextureIndex === "number" && !imageHasBuffer(document, textureImage(document, baseColorTextureIndex))) {
    missingTextureReferences.push("baseColorTexture");
  }
  if (typeof normalTextureIndex === "number" && !imageHasBuffer(document, textureImage(document, normalTextureIndex))) {
    missingTextureReferences.push("normalTexture");
  }

  return Object.freeze({
    materialCount: document.json.materials?.length ?? 0,
    textureCount: document.json.textures?.length ?? 0,
    imageCount: document.json.images?.length ?? 0,
    embeddedImageCount: (document.json.images ?? []).filter((image) => typeof image.bufferView === "number").length,
    baseColorTextureCount: typeof baseColorTextureIndex === "number" ? 1 : 0,
    normalTextureCount: typeof normalTextureIndex === "number" ? 1 : 0,
    hasBaseColorTexture: typeof baseColorTextureIndex === "number",
    hasNormalTexture: typeof normalTextureIndex === "number",
    missingTextureReferences: Object.freeze(missingTextureReferences),
    materialName: material?.name ?? "",
  });
}

function nodeLocalMatrix(node, override = {}) {
  if (node.matrix && !override.translation && !override.rotation && !override.scale) {
    return [...node.matrix];
  }
  return composeMatrix(
    override.translation ?? node.translation ?? [0, 0, 0],
    override.rotation ?? node.rotation ?? [0, 0, 0, 1],
    override.scale ?? node.scale ?? [1, 1, 1],
  );
}

function computeWorldMatrices(nodes, overridesByName = new Map()) {
  const parents = new Set();
  for (const node of nodes) {
    for (const child of node.children ?? []) {
      parents.add(child);
    }
  }
  const roots = nodes
    .map((_, index) => index)
    .filter((index) => !parents.has(index));
  const worldMatrices = nodes.map(() => identityMatrix());

  function visit(nodeIndex, parentMatrix) {
    const node = nodes[nodeIndex];
    if (!node) {
      return;
    }
    const worldMatrix = multiplyMatrix(parentMatrix, nodeLocalMatrix(node, overridesByName.get(node.name) ?? {}));
    worldMatrices[nodeIndex] = worldMatrix;
    for (const child of node.children ?? []) {
      visit(child, worldMatrix);
    }
  }

  for (const root of roots) {
    visit(root, identityMatrix());
  }
  return worldMatrices;
}

function normalizeWeights(weights) {
  const total = weights.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) {
    return [1, 0, 0, 0];
  }
  return weights.map((value) => Math.max(0, value) / total);
}

function deriveBounds(vertices) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const vertex of vertices) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], vertex[axis]);
      max[axis] = Math.max(max[axis], vertex[axis]);
    }
  }
  if (!Number.isFinite(min[0])) {
    return { min: [0, 0, 0], max: [0, 1, 0], size: [1, 1, 1] };
  }
  return {
    min,
    max,
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
  };
}

function sampleChannel(channel, sampler, document, timeSeconds) {
  const input = readAccessor(document, sampler.input);
  const output = readAccessor(document, sampler.output);
  if (!input.length || !output.length) {
    return null;
  }
  const duration = input.at(-1) || 0;
  const sampleTime = duration > 0 ? timeSeconds % duration : 0;
  let frame = 0;
  while (frame < input.length - 2 && sampleTime > input[frame + 1]) {
    frame += 1;
  }
  const start = input[frame] ?? 0;
  const end = input[frame + 1] ?? start;
  const t = end > start ? (sampleTime - start) / (end - start) : 0;
  const startValue = Array.isArray(output[frame]) ? output[frame] : [output[frame] ?? 0];
  const endValue = Array.isArray(output[frame + 1]) ? output[frame + 1] : startValue;
  return channel.target.path === "rotation"
    ? nlerpQuaternion(startValue, endValue, t)
    : lerpArray(startValue, endValue, t);
}

function rootTranslationDistance(clipPayload) {
  if (!clipPayload) {
    return 0;
  }
  let distance = 0;
  for (const channel of clipPayload.animation.channels ?? []) {
    if (channel.target?.path !== "translation") {
      continue;
    }
    const nodeName = clipPayload.document.json.nodes?.[channel.target.node]?.name ?? "";
    if (!/(^|:)Hips$/u.test(nodeName) && nodeName !== "mixamorigHips") {
      continue;
    }
    const sampler = clipPayload.animation.samplers?.[channel.sampler];
    const output = sampler ? readAccessor(clipPayload.document, sampler.output) : [];
    if (output.length < 2) {
      continue;
    }
    const start = Array.isArray(output[0]) ? output[0] : [0, 0, 0];
    const end = Array.isArray(output.at(-1)) ? output.at(-1) : start;
    distance = Math.max(distance, Math.hypot((end[0] ?? 0) - (start[0] ?? 0), (end[2] ?? 0) - (start[2] ?? 0)));
  }
  return distance;
}

function createClipPayload(clipRef) {
  const document = parseGlb(clipRef?.asset);
  const animation = document?.json.animations?.[0];
  if (!document || !animation) {
    return null;
  }
  const nodeNames = new Set();
  let durationSeconds = 0;
  for (const channel of animation.channels ?? []) {
    const nodeName = document.json.nodes?.[channel.target?.node]?.name;
    if (nodeName) {
      nodeNames.add(nodeName);
    }
    const sampler = animation.samplers?.[channel.sampler];
    const input = sampler ? readAccessor(document, sampler.input) : [];
    durationSeconds = Math.max(durationSeconds, input.at(-1) ?? 0);
  }
  return {
    id: clipRef.id,
    document,
    animation,
    durationSeconds,
    nodeNames,
  };
}

function sampleClipOverrides(clipPayload, timeSeconds) {
  const overrides = new Map();
  if (!clipPayload) {
    return overrides;
  }
  for (const channel of clipPayload.animation.channels ?? []) {
    const targetNode = clipPayload.document.json.nodes?.[channel.target?.node];
    const sampler = clipPayload.animation.samplers?.[channel.sampler];
    if (!targetNode?.name || !sampler) {
      continue;
    }
    const value = sampleChannel(channel, sampler, clipPayload.document, timeSeconds);
    if (!value) {
      continue;
    }
    const existing = overrides.get(targetNode.name) ?? {};
    overrides.set(targetNode.name, {
      ...existing,
      [channel.target.path]: value,
    });
  }
  return overrides;
}

export function createAnimatedGltfModel(modelAsset, clipRefs = []) {
  const document = parseGlb(modelAsset);
  if (!document) {
    return null;
  }

  const nodes = document.json.nodes ?? [];
  const meshNodeIndex = nodes.findIndex((node) => node.mesh !== undefined && node.skin !== undefined);
  const meshNode = nodes[meshNodeIndex];
  const mesh = document.json.meshes?.[meshNode?.mesh];
  const primitive = mesh?.primitives?.find((candidate) => candidate.attributes?.POSITION !== undefined);
  const skin = document.json.skins?.[meshNode?.skin];
  if (!meshNode || !primitive || !skin) {
    return null;
  }

  const positions = readAccessor(document, primitive.attributes.POSITION);
  const normals = primitive.attributes.NORMAL === undefined
    ? []
    : readAccessor(document, primitive.attributes.NORMAL);
  const texcoords = primitive.attributes.TEXCOORD_0 === undefined
    ? []
    : readAccessor(document, primitive.attributes.TEXCOORD_0);
  const joints = primitive.attributes.JOINTS_0 === undefined
    ? positions.map(() => [0, 0, 0, 0])
    : readAccessor(document, primitive.attributes.JOINTS_0);
  const weights = primitive.attributes.WEIGHTS_0 === undefined
    ? positions.map(() => [1, 0, 0, 0])
    : readAccessor(document, primitive.attributes.WEIGHTS_0).map(normalizeWeights);
  const indices = primitive.indices === undefined
    ? positions.map((_, index) => index)
    : readAccessor(document, primitive.indices);
  const inverseBindMatrices = skin.inverseBindMatrices === undefined
    ? skin.joints.map(() => identityMatrix())
    : readMatrices(document, skin.inverseBindMatrices);
  const clips = clipRefs.map(createClipPayload).filter(Boolean);
  const bindWorldMatrices = computeWorldMatrices(nodes);
  const bindVertices = skinVertices({
    positions,
    joints,
    weights,
    skin,
    inverseBindMatrices,
    worldMatrices: bindWorldMatrices,
  });
  const bounds = deriveBounds(bindVertices);
  const materialTextureMetadata = extractMaterialTextureMetadata(document, primitive);
  const clipRootMotionDistances = new Map(clips.map((clip) => [clip.id, rootTranslationDistance(clip)]));

  return {
    name: mesh.name ?? meshNode.name ?? "skinned-gltf-model",
    vertexCount: positions.length,
    triangleCount: Math.floor(indices.length / 3),
    jointCount: skin.joints.length,
    animatedNodeCount: new Set(clips.flatMap((clip) => [...clip.nodeNames])).size,
    clipCount: clips.length,
    materialTextureMetadata,
    textureCount: materialTextureMetadata.textureCount,
    materialCount: materialTextureMetadata.materialCount,
    hasBaseColorTexture: materialTextureMetadata.hasBaseColorTexture,
    hasNormalTexture: materialTextureMetadata.hasNormalTexture,
    hasUv: texcoords.length === positions.length,
    hasNormals: normals.length === positions.length,
    professionalRenderable:
      materialTextureMetadata.hasBaseColorTexture
      && materialTextureMetadata.hasNormalTexture
      && materialTextureMetadata.missingTextureReferences.length === 0
      && texcoords.length === positions.length
      && normals.length === positions.length
      && skin.joints.length > 0,
    clips,
    sample(activeClipId, clipTimeMs) {
      const clip = clips.find((candidate) => candidate.id === activeClipId) ?? clips[0] ?? null;
      const overrides = sampleClipOverrides(clip, Math.max(0, clipTimeMs) / 1000);
      const worldMatrices = computeWorldMatrices(nodes, overrides);
      const vertices = skinVertices({
        positions,
        joints,
        weights,
        skin,
        inverseBindMatrices,
        worldMatrices,
      });
      return {
        vertices,
        indices,
        bounds: deriveBounds(vertices),
        bindBounds: bounds,
        activeClipRenderable: Boolean(clip),
        activeClipDurationSeconds: clip?.durationSeconds ?? 0,
        activeClipRootTranslationDistance: clipRootMotionDistances.get(clip?.id) ?? 0,
      };
    },
  };
}

function skinVertices({ positions, joints, weights, skin, inverseBindMatrices, worldMatrices }) {
  return positions.map((position, vertexIndex) => {
    const jointIndices = joints[vertexIndex] ?? [0, 0, 0, 0];
    const jointWeights = weights[vertexIndex] ?? [1, 0, 0, 0];
    const skinned = [0, 0, 0];
    for (let influence = 0; influence < 4; influence += 1) {
      const weight = jointWeights[influence] ?? 0;
      if (weight <= 0) {
        continue;
      }
      const jointNodeIndex = skin.joints[jointIndices[influence] ?? 0] ?? skin.joints[0];
      const jointMatrix = multiplyMatrix(worldMatrices[jointNodeIndex] ?? identityMatrix(), inverseBindMatrices[jointIndices[influence] ?? 0] ?? identityMatrix());
      const transformed = transformPoint(jointMatrix, position);
      skinned[0] += transformed[0] * weight;
      skinned[1] += transformed[1] * weight;
      skinned[2] += transformed[2] * weight;
    }
    return skinned;
  });
}
