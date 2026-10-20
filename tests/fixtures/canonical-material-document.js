/** Synthetic portable canonical fixture; verification is delegated to the supplied core instance. */
export async function createExtendedCanonicalFixture(core, bindingOptions = {}) {
  const positions = [-1, 0, 0, 1, 0, 0, -1, 2, 0];
  const texcoords = [0, 0, 1, 0, 0, 1];
  const bytes = new Uint8Array(60);
  const view = new DataView(bytes.buffer);
  [...positions, ...texcoords].forEach((n, i) => view.setFloat32(i * 4, n, true));
  const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg=="), c => c.charCodeAt(0));
  const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", value)), n => n.toString(16).padStart(2, "0")).join("");
  const bufferHash = await hash(bytes);
  const imageHash = await hash(png);
  const slots = [["thickness", "thickness"], ["specular", "specular"], ["specularColor", "specular-color"],
    ["iridescence", "iridescence"], ["iridescenceThickness", "iridescence-thickness"], ["anisotropy", "anisotropy"]];
  const textures = slots.map(([slot, usage]) => ({ id: `texture-${slot}`, imageResourceId: "image", mimeType: "image/png", contentHash: imageHash,
    byteLength: png.length, intendedUsage: [usage], colorSpace: slot === "specularColor" ? "srgb" : "linear",
    exportEmbeddingPolicy: "inherit-source", sourceMetadata: {} }));
  const input = {
    schemaVersion: core.GPU_MODEL_DOCUMENT_SCHEMA_VERSION, coordinateSystem: core.CANONICAL_GPU_MODEL_COORDINATE_SYSTEM,
    roots: ["node"], nodes: [{ id: "node", children: [], meshId: "mesh", localMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }],
    resources: [{ id: "buffer", kind: "buffer", byteLength: bytes.length, contentHash: bufferHash, mimeType: "application/octet-stream", payload: new Blob([bytes], { type: "application/octet-stream" }) },
      { id: "image", kind: "image", byteLength: png.length, contentHash: imageHash, mimeType: "image/png", payload: new Blob([png], { type: "image/png" }) }],
    accessors: [{ id: "positions", resourceId: "buffer", byteOffset: 0, count: 3, componentType: "f32", elementType: "vec3", min: [-1, 0, 0], max: [1, 2, 0] },
      { id: "uv", resourceId: "buffer", byteOffset: 36, count: 3, componentType: "f32", elementType: "vec2" }],
    meshes: [{ id: "mesh", primitives: [{ id: "triangle", topology: "triangles", materialId: "surface", attributes: [
      { semantic: "POSITION", accessorId: "positions" }, { semantic: "TEXCOORD_0", accessorId: "uv" }, { semantic: "TEXCOORD_1", accessorId: "uv" }] }] }],
    materials: [{ id: "surface", workflow: "metallic-roughness", alphaMode: "opaque", baseColorFactor: [1, 1, 1, 1],
      textures: Object.fromEntries(textures.map(texture => [texture.id.slice(8), { textureId: texture.id, intendedUsage: texture.intendedUsage[0], colorSpace: texture.colorSpace, texCoordSet: 0, ...bindingOptions }])),
      extensions: { KHR_materials_volume: { thicknessFactor: 0.3 }, KHR_materials_specular: { specularFactor: 0.6 },
        KHR_materials_iridescence: { iridescenceFactor: 0.4 }, KHR_materials_anisotropy: { anisotropyStrength: 0.7 } }, sourceMetadata: {} }],
    textures, skeletons: [], joints: [], skins: [], blendShapes: [], animations: [], analyticGeometry: [],
    bounds: { min: [-1, 0, 0], max: [1, 2, 0] }, provenance: { sourceFormat: "canonical-fixture", sourceContentHash: bufferHash, converterId: "fixture", converterVersion: "1" }, diagnostics: [], metadata: {},
  };
  const port = {
    async digestSha256(chunks) {
      const parts = []; let length = 0;
      for await (const part of chunks) { parts.push(part); length += part.length; }
      const all = new Uint8Array(length); let offset = 0;
      for (const part of parts) { all.set(part, offset); offset += part.length; }
      return hash(all);
    },
    async inspectResource(chunks, context) {
      const expected = context.kind === "image" ? png : bytes;
      let offset = 0; let valid = true;
      for await (const chunk of chunks) for (const n of chunk) { if (n !== expected[offset]) valid = false; offset += 1; }
      return { valid: valid && offset === expected.length, detectedMimeType: context.declaredMimeType, ...(context.kind === "image" ? { width: 1, height: 1 } : {}) };
    },
  };
  const document = await core.createAndVerifyGpuModelDocument(input, port);
  return { document, geometry: [{ primitiveId: "triangle", positions: Float32Array.from(positions), texcoords: Float32Array.from(texcoords) }],
    samples: new Map(textures.map(texture => [texture.id, { width: 1, height: 1, data: new Uint8Array([32, 64, 128, 255]) }])) };
}
