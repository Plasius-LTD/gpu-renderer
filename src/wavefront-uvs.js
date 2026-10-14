// Bit order is part of the mesh/material semantic ABI (textureSettings.w).
export const CORE_UV_TEXTURES = Object.freeze(['baseColor', 'metallicRoughness', 'normal', 'occlusion', 'emissive']);
export const EXTENSION_UV_TEXTURES = Object.freeze(['clearcoat', 'clearcoatRoughness', 'clearcoatNormal', 'transmission', 'thickness', 'sheenColor', 'sheenRoughness', 'specular', 'specularColor', 'iridescence', 'iridescenceThickness', 'anisotropy']);

export function normalizeSecondaryUvs(input, vertexCount, extensionTextures) {
  const uvs1 = input.uvs1 == null ? null : Array.from(input.uvs1);
  if (uvs1 && (uvs1.length !== vertexCount * 2 || !uvs1.every(Number.isFinite))) {
    throw new Error('Mesh UV1 must contain one finite pair per vertex.');
  }
  const textures = [
    ...CORE_UV_TEXTURES.map(name => input[name + 'Texture'] ?? input.material?.[name + 'Texture']),
    ...EXTENSION_UV_TEXTURES.map(name => extensionTextures?.[name]),
  ];
  let textureUvMask = 0;
  textures.forEach((texture, slot) => {
    const set = texture?.texCoord ?? 0;
    if (set !== 0 && set !== 1) throw new Error('Texture texCoord must select UV set 0 or 1.');
    if (set === 1) {
      if (!uvs1) throw new Error('Texture texCoord 1 requires mesh UV1.');
      textureUvMask |= 1 << slot;
    }
  });
  return {uvs1: uvs1 ? Object.freeze(uvs1) : null, textureUvMask};
}
