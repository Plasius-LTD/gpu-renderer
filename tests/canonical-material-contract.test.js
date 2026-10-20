import assert from "node:assert/strict";
import test from "node:test";
import { createCanonicalWavefrontMeshInputs } from "../src/canonical-wavefront-meshes.js";
import { normalizeWavefrontMesh } from "../src/wavefront-scene-normalizers.js";
import { createWavefrontGpuMaterialSource } from "../src/wavefront-mesh-sources.js";
import * as core from "@plasius/gpu-model-core";
import { createExtendedCanonicalFixture } from "./fixtures/canonical-material-document.js";

const slots = [
  ["thickness", "volume", "thicknessTexture"],
  ["specular", "specular", "specularTexture"],
  ["specularColor", "specular", "specularColorTexture"],
  ["iridescence", "iridescence", "iridescenceTexture"],
  ["iridescenceThickness", "iridescence", "iridescenceThicknessTexture"],
  ["anisotropy", "anisotropy", "anisotropyTexture"],
];
const sample = { width: 1, height: 1, data: new Uint8Array([32, 64, 128, 255]) };
function options(slot, binding = {}) {
  return {
    document: {
      meshes: [{ id: "mesh", primitives: [{ id: "triangle", topology: "triangles", materialId: "surface" }] }],
      materials: [{ id: "surface", workflow: "metallic-roughness", alphaMode: "opaque", baseColorFactor: [1, 1, 1, 1],
        textures: { [slot]: { textureId: "image", texCoordSet: 0, ...binding } },
        extensions: { KHR_materials_volume: { thicknessFactor: 0.2 }, KHR_materials_specular: { specularFactor: 0.7 },
          KHR_materials_iridescence: { iridescenceFactor: 0.5 }, KHR_materials_anisotropy: { anisotropyStrength: 0.6 } } }],
    },
    geometry: [{ primitiveId: "triangle", positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], texcoords: [0, 0, 1, 0, 0, 1] }],
    textures: new Map([["image", sample]]),
  };
}

for (const [slot, extension, key] of slots) {
  test(`maps canonical ${slot} into the existing ${extension} texture channel`, () => {
    const input = options(slot);
    const original = structuredClone(input.document);
    const [mesh] = createCanonicalWavefrontMeshInputs(input);
    const mapped = mesh.extensions[`KHR_materials_${extension}`][key];
    assert.equal(mapped.data, sample.data);
    assert.equal(mapped.texCoord, 0);
    const normalized = normalizeWavefrontMesh(mesh);
    assert.equal(normalized.materialExtensions.textures[slot].data, sample.data);
    assert.deepEqual(input.document, original);
    assert.equal(normalized.materialExtensions.specular, 0.7);
    // Exercise the existing material packing path, not just retained metadata.
    const source = createWavefrontGpuMaterialSource([mesh]);
    assert.equal(source.records[0].extensionTextures[slot].data, sample.data);
    assert.ok(source.extensionAtlases[slot].data.some(value => value === 32), "authored pixels must reach the packed channel atlas");
  });

  test(`rejects missing decoded ${slot} resources`, () => {
    const input = options(slot); input.textures.clear();
    assert.throws(() => createCanonicalWavefrontMeshInputs(input), /Missing decoded texture sample/);
  });
}

for (const slot of ["baseColor", ...slots.map(([name]) => name)]) {
  for (const transform of [
    { offset: [0.25, 0] }, { scale: [2, 1] }, { rotationRadians: Math.PI / 2 },
    { offset: [NaN, 0] }, { scale: [1] }, { scale: new Array(2) }, { rotationRadians: Infinity }, null, [], { rotation: 1 },
  ]) {
    test(`refuses unsupported or malformed ${slot} transform ${JSON.stringify(transform)}`, () => {
      assert.throws(() => createCanonicalWavefrontMeshInputs(options(slot, { transform })), /Canonical texture transforms require upstream application/);
    });
  }
  for (const texCoordSet of [1, 2, -1, 0.5, NaN, null]) {
    test(`refuses ${slot} UV selection ${texCoordSet} instead of sampling UV0`, () => {
      assert.throws(() => createCanonicalWavefrontMeshInputs(options(slot, { texCoordSet })), /Canonical texture sampling supports only UV set 0/);
    });
  }
  test(`accepts explicit identity ${slot} transforms without changing samples`, () => {
    const input = options(slot, { transform: { offset: [0, 0], scale: [1, 1], rotationRadians: 0 } });
    assert.doesNotThrow(() => createCanonicalWavefrontMeshInputs(input));
    input.document.materials[0].textures[slot].transform = {};
    assert.doesNotThrow(() => createCanonicalWavefrontMeshInputs(input));
  });
}

test("rejects sample-level UV overrides and preserves input after failed conversion", () => {
  const input = options("thickness");
  input.textures.set("image", { ...sample, texCoord: 1 });
  const original = structuredClone(input.document);
  assert.throws(() => createCanonicalWavefrontMeshInputs(input), /Canonical texture sampling supports only UV set 0/);
  assert.deepEqual(input.document, original);
  input.textures.set("image", sample);
  assert.equal(createCanonicalWavefrontMeshInputs(input).length, 1);
});

test("maps a real verified core0.5 document without mutating factors or image identity", async () => {
  const fixture = await createExtendedCanonicalFixture(core);
  assert.equal(core.isGpuModelDocument(fixture.document), true);
  const [mesh] = createCanonicalWavefrontMeshInputs({ ...fixture, textures: fixture.samples });
  const normalized = normalizeWavefrontMesh(mesh);
  for (const [slot] of slots) assert.equal(normalized.materialExtensions.textures[slot].data, fixture.samples.get(`texture-${slot}`).data);
  assert.equal(fixture.document.textures.length, 6);
  assert.ok(fixture.document.textures.every(texture => texture.contentHash === fixture.document.resources[1].contentHash));
  assert.equal(normalized.materialExtensions.specular, 0.6);
  assert.equal(normalized.materialExtensions.iridescence, 0.4);
  assert.equal(normalized.materialExtensions.anisotropy, 0.7);
  const transformed = await createExtendedCanonicalFixture(core, { transform: { offset: [0.25, 0] } });
  assert.throws(() => createCanonicalWavefrontMeshInputs({ ...transformed, textures: transformed.samples }), /require upstream application/);
  const uv1 = await createExtendedCanonicalFixture(core, { texCoordSet: 1 });
  assert.throws(() => createCanonicalWavefrontMeshInputs({ ...uv1, textures: uv1.samples }), /supports only UV set 0/);
});
