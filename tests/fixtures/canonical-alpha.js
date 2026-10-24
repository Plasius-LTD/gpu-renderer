export function canonicalAlphaInput(alphaMode, alpha, textureAlpha) {
  const sample = { width: 1, height: 1, data: new Uint8Array([255, 128, 64, textureAlpha ?? 255]) };
  return {
    document: {
      meshes: [{ id: "mesh", primitives: [{ id: "triangle", topology: "triangles", materialId: "surface" }] }],
      materials: [{ id: "surface", workflow: "metallic-roughness", alphaMode,
        baseColorFactor: [0.8, 0.6, 0.4, alpha], roughnessFactor: 0.5, metallicFactor: 0.25,
        transmissionFactor: 0.3, extensions: { KHR_materials_ior: { ior: 1.45 } },
        textures: textureAlpha === undefined ? {} : { baseColor: { textureId: "image" } } }],
    },
    geometry: [{ primitiveId: "triangle", positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], texcoords: [0, 0, 1, 0, 0, 1] }],
    textures: new Map([["image", sample]]),
  };
}

export function canonicalAlphaCases(api) {
  const cases = [];
  for (const mode of ["blend", "opaque"]) {
    for (const alpha of [0, 0.25, 0.5, 1]) {
      for (const textureAlpha of [undefined, 0, 64, 128, 255]) {
        const input = canonicalAlphaInput(mode, alpha, textureAlpha);
        cases.push({ name: `${mode}/${alpha}/${textureAlpha ?? "untextured"}`,
          mesh: api.createCanonicalWavefrontMeshInputs(input)[0],
          expected: mode === "opaque" ? 1 : alpha * (textureAlpha === undefined ? 1 : textureAlpha / 255) });
      }
    }
  }
  for (const alpha of [0, 0.25, 0.5, 1]) {
    for (const opacity of [undefined, 0.5, 1]) {
      const mesh = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], baseColor: [0.8, 0.6, 0.4, alpha],
        baseColorTexture: { width: 1, height: 1, data: new Uint8Array([255, 128, 64, 128]) },
        ...(opacity === undefined ? {} : { opacity }) };
      cases.push({ name: `legacy/${alpha}/${opacity ?? "default"}`, mesh, expected: (opacity ?? alpha) * alpha * 128 / 255 });
    }
  }
  for (const alphaMode of ["blend", "opaque"]) {
    for (const opacity of [undefined, 0.25]) {
      const mesh = { ...cases[cases.length - 1].mesh, alphaMode, baseColor: [0.8, 0.6, 0.4, 0.5], opacity };
      cases.push({ name: `direct-${alphaMode}/${opacity ?? "default"}`, mesh,
        expected: alphaMode === "opaque" ? 1 : (opacity ?? 1) * 0.5 * 128 / 255 });
    }
  }
  return cases;
}
