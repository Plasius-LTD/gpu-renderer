import { CORE_UV_TEXTURES, EXTENSION_UV_TEXTURES } from './wavefront-uvs.js';

const TEXTURES = [...CORE_UV_TEXTURES, ...EXTENSION_UV_TEXTURES];
// One header, then two affine rows and an atlas rectangle per texture slot.
export const MATERIAL_TEXTURE_METADATA_WIDTH = 1 + TEXTURES.length * 3;

function pair(value, fallback) {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite)) {
    throw new Error('Texture transform requires finite two-component offset/scale.');
  }
  return value;
}
function wrapMode(value) {
  const index = [10497, 33071, 33648].indexOf(value ?? 10497);
  if (index < 0) throw new Error('Unsupported texture wrap mode.');
  return index;
}

export function texturePaddingIndex(index, size, texture, axis) {
  const transform = texture?.transform;
  const transformed = transform && ((transform.rotation ?? 0) !== 0 ||
    transform.offset?.some(v => v !== 0) || transform.scale?.some(v => v !== 1));
  const mode = axis === 0 ? texture?.wrapS : texture?.wrapT;
  // Keep legacy identity padding unchanged; transformed samplers use glTF wraps.
  if (!transformed && mode === undefined) return Math.min(size - 1, Math.max(0, index));
  if ((mode ?? 10497) === 10497) return ((index % size) + size) % size;
  return Math.min(size - 1, Math.max(0, index)); // clamp and mirrored seam duplicate the edge
}

export function createMaterialTextureMetadata(meshes, atlases = {}) {
  const width = MATERIAL_TEXTURE_METADATA_WIDTH, height = Math.max(1, meshes.length);
  const data = new Float32Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    const mesh = meshes[row] ?? {}, header = row * width * 4;
    data[header + 1] = mesh.materialExtensions?.sheenRoughness ?? 0;
    const coatNormal = mesh.extensionTextures?.clearcoatNormal;
    const coatNormalScale = coatNormal?.scale ?? 1;
    if (!Number.isFinite(coatNormalScale) || coatNormalScale < 0 || !Number.isFinite(Math.fround(coatNormalScale))) {
      throw new Error('Clearcoat normal scale must be finite, non-negative and representable on the GPU.');
    }
    data[header + 2] = coatNormalScale;
    data[header + 3] = coatNormal ? 1 : 0;
    TEXTURES.forEach((name, slot) => {
      const texture = slot < CORE_UV_TEXTURES.length ? mesh[name + 'Texture'] : mesh.extensionTextures?.[name];
      const transform = texture?.transform ?? {};
      const offset = pair(transform.offset, [0, 0]), scale = pair(transform.scale, [1, 1]);
      const rotation = transform.rotation ?? 0;
      if (!Number.isFinite(rotation)) throw new Error('Texture transform rotation must be finite.');
      const s = wrapMode(texture?.wrapS), t = wrapMode(texture?.wrapT);
      const c = Math.cos(rotation), n = Math.sin(rotation), start = header + (1 + slot * 3) * 4;
      const affine = [c * scale[0], -n * scale[1], offset[0], s, n * scale[0], c * scale[1], offset[1], t];
      if (!affine.every(value => Number.isFinite(Math.fround(value)))) throw new Error('Texture transform exceeds GPU float range.');
      data.set(affine, start);
      data.set(atlases[name]?.resolveRect(texture) ?? [0, 0, 1, 1], start + 8);
      if (offset.some(v => v !== 0) || scale.some(v => v !== 1) || rotation !== 0 || s || t) {
        data[header] = (data[header] | (1 << slot));
      }
    });
  }
  return Object.freeze({ width, height, data });
}

export function createMaterialTextureResource(device, constants, metadata) {
  const limit = device.limits?.maxTextureDimension2D ?? 8192;
  if (metadata.width > limit || metadata.height > limit) throw new Error('Material texture metadata exceeds device dimension limit.');
  const texture = device.createTexture({
    label: 'plasius.wavefront.materialTextureMetadata',
    size: {width: metadata.width, height: metadata.height}, format: 'rgba32float',
    usage: constants.texture.TEXTURE_BINDING | constants.texture.COPY_DST,
  });
  try {
    device.queue.writeTexture({texture}, metadata.data,
      {bytesPerRow: metadata.width * 16, rowsPerImage: metadata.height},
      {width: metadata.width, height: metadata.height, depthOrArrayLayers: 1});
    return Object.freeze({texture, view: texture.createView(), allocatedBytes: metadata.data.byteLength});
  } catch (error) {
    texture.destroy();
    throw error;
  }
}
