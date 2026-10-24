import assert from "node:assert/strict";
import test from "node:test";
import * as api from "../src/index.js";
import { canonicalAlphaCases, canonicalAlphaInput } from "./fixtures/canonical-alpha.js";

function near(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: ${actual} != ${expected}`);
}

for (const { name, mesh, expected } of canonicalAlphaCases(api)) {
  test(`packs canonical and legacy alpha without semantic loss: ${name}`, () => {
    const material = api.createWavefrontGpuMaterialSource([mesh]);
    const acceleration = api.createWavefrontMeshAcceleration([mesh], material);
    const triangle = new Float32Array(api.packWavefrontTriangles(acceleration.triangles).buffer);
    const packedMaterial = new Float32Array(material.buffer);
    const gpuMesh = new Float32Array(api.createWavefrontGpuMeshSource([mesh], material).meshes.buffer);
    // Read actual ABI bytes for both CPU-upload and GPU-build paths.
    const ignoreAlpha = name.startsWith("opaque/") || name.startsWith("direct-opaque/") ? 1 : 0;
    assert.equal(triangle[87], ignoreAlpha, "triangle textureSettings.w");
    assert.equal(packedMaterial[47], ignoreAlpha, "material textureSettings.w");
    assert.equal(gpuMesh[59], ignoreAlpha, "GPU mesh textureSettings.w");
    near(triangle[42], 0.4, "authored RGB blue remains unchanged");
    near(triangle[50], ignoreAlpha ? 1 : mesh.opacity ?? (mesh.alphaMode === "blend" ? 1 : mesh.baseColor[3]), "opacity ABI");
    near(triangle[51], 1.45, "IOR");
    const [x, y] = material.baseColorAtlas.resolveRect(mesh.baseColorTexture);
    const atlasAlpha = material.baseColorAtlas.data[(Math.round(y * material.baseColorAtlas.height) * material.baseColorAtlas.width
      + Math.round(x * material.baseColorAtlas.width)) * 4 + 3] / 255;
    const alpha = ignoreAlpha ? 1 : triangle[50] * triangle[43] * atlasAlpha;
    near(alpha, expected, "packed factor × opacity × texture alpha");
    near(packedMaterial[10], triangle[50], "material/triangle opacity agreement");
    near(gpuMesh[22], triangle[50], "GPU mesh/triangle opacity agreement");
    if (!name.startsWith("legacy/") && !name.startsWith("direct-")) near(triangle[58], 0.3, "transmission");
  });
}

test("alpha mode admission is explicit, preserves legacy defaults, and does not mutate inputs", () => {
  const input = canonicalAlphaInput("opaque", 0.5, 64);
  const before = structuredClone(input);
  const [mesh] = api.createCanonicalWavefrontMeshInputs(input);
  assert.equal(mesh.alphaMode, "opaque");
  assert.deepEqual(input, before);
  for (const alphaMode of ["mask", "unknown", null, 1, {}]) {
    assert.throws(() => api.normalizeWavefrontMesh({ ...mesh, alphaMode }), /mesh alphaMode must be opaque or blend/);
  }
  assert.equal(api.normalizeWavefrontMesh({ ...mesh, alphaMode: undefined }).alphaMode, undefined);
  assert.equal(api.normalizeWavefrontMesh({ ...mesh, alphaMode: "blend" }).alphaMode, "blend");
  assert.equal(api.normalizeWavefrontMesh({ ...mesh, alphaMode: "blend", opacity: undefined }).opacity, 1);
  assert.equal(api.normalizeWavefrontMesh({ ...mesh, opacity: 0 }).opacity, 1);
  assert.equal(api.normalizeWavefrontMesh({ ...mesh, alphaMode: "blend", opacity: 0.25 }).opacity, 0.25);
});
