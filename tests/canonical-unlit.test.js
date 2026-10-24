import assert from "node:assert/strict";
import test from "node:test";
import * as api from "../src/index.js";
import { canonicalAlphaInput } from "./fixtures/canonical-alpha.js";

const diagnostic = "Canonical unlit materials are unsupported by WavefrontMeshInput; retain an unlit-capable rendering path.";

for (const textureAlpha of [undefined, 0, 128, 255]) {
  for (const alphaMode of ["opaque", "blend"]) {
    test(`refuses canonical unlit workflow before texture resolution: ${alphaMode}/${textureAlpha}`, () => {
      const input = canonicalAlphaInput(alphaMode, 0.5, textureAlpha);
      input.document.materials[0].workflow = "unlit";
      const before = structuredClone(input);
      let lookups = 0;
      const textures = { get() { lookups++; throw new Error("Texture lookup must not run."); } };
      assert.throws(() => api.createCanonicalWavefrontMeshInputs({ ...input, textures }), { name: "Error", message: diagnostic });
      assert.equal(lookups, 0);
      assert.deepEqual(input, before);
    });
  }
}

for (const alias of ["KHR_materials_unlit", "unlit"]) {
  for (const value of [{}, { enabled: true }, { enabled: false }, null, [], false, "authored-data"]) {
    test(`refuses a declared ${alias} marker instead of advertising marker-only support: ${JSON.stringify(value)}`, () => {
      const input = canonicalAlphaInput("opaque", 0.5, 128);
      input.document.materials[0].extensions[alias] = value;
      const before = structuredClone(input);
      assert.throws(() => api.createCanonicalWavefrontMeshInputs(input), { name: "Error", message: diagnostic });
      assert.deepEqual(input, before);
    });
  }
}

test("a later unlit primitive cannot publish a partial replacement for the current model", () => {
  const input = canonicalAlphaInput("opaque", 0.5, 128);
  input.document.materials.push({ ...input.document.materials[0], id: "unlit-surface", workflow: "unlit" });
  input.document.meshes[0].primitives.push({ id: "second", topology: "triangles", materialId: "unlit-surface" });
  input.geometry.push({ ...input.geometry[0], primitiveId: "second" });
  const before = structuredClone(input);
  const currentModel = Object.freeze({ path: "unlit-capable" });
  let replacement = currentModel;
  assert.throws(() => { replacement = api.createCanonicalWavefrontMeshInputs(input); }, { message: diagnostic });
  assert.equal(replacement, currentModel);
  assert.deepEqual(input, before);
});

test("supported metallic-roughness still reaches material packing with alpha and extensions intact", () => {
  const input = canonicalAlphaInput("blend", 0.5, 128);
  input.document.materials[0].clearcoatFactor = 0.4;
  const meshes = api.createCanonicalWavefrontMeshInputs(input);
  const source = api.createWavefrontGpuMaterialSource(meshes);
  const acceleration = api.createWavefrontMeshAcceleration(meshes, source);
  assert.equal(source.records[0].materialExtensions.unlit, false);
  assert.equal(source.records[0].materialExtensions.clearcoat, 0.4);
  assert.equal(acceleration.triangles[0].color[3], 0.5);
  assert.equal(acceleration.triangles[0].material[2], 1);
  assert.equal(acceleration.triangles[0].material[3], 1.45);
  assert.equal(source.records[0].baseColorTexture.data[3], 128);
});

for (const [change, expected] of [
  [input => { input.document.materials[0].workflow = "custom"; }, /Unsupported canonical material workflow: custom/],
  [input => { input.document.materials[0].alphaMode = "mask"; }, /alphaMode mask is unsupported/],
  [input => { input.document.meshes[0].primitives[0].topology = "lines"; }, /Unsupported canonical primitive topology: lines/],
]) {
  test(`retains the existing explicit support boundary: ${expected}`, () => {
    const input = canonicalAlphaInput("opaque", 0.5, 128);
    change(input);
    assert.throws(() => api.createCanonicalWavefrontMeshInputs(input), expected);
  });
}
