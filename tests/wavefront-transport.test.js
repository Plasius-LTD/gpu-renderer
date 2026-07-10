import assert from "node:assert/strict";
import test from "node:test";
import {
  beerLambertTransmittance,
  createMediumStack,
  createWavefrontGpuMaterialSource,
  createWavefrontMeshAcceleration,
  createSpectralSamples,
  createTransportBranches,
  currentMediumId,
  enterMediumStack,
  exitMediumStack,
  normalizeWavefrontMaterialExtensions,
  resolveSpectralIor,
  transitionMediumStack,
} from "../src/index.js";

test("bounded medium stacks preserve nested entry and matching exit transitions", () => {
  const outer = enterMediumStack(createMediumStack(), 2);
  const inner = enterMediumStack(outer.stack, 7);
  assert.deepEqual(inner.stack, [2, 7]);
  assert.equal(currentMediumId(inner.stack), 7);

  const exited = exitMediumStack(inner.stack, 7);
  assert.deepEqual(exited.stack, [2]);
  assert.equal(exited.mediumId, 2);
  assert.equal(exited.matched, true);

  const unmatched = transitionMediumStack(exited.stack, 99, false);
  assert.deepEqual(unmatched.stack, [2]);
  assert.equal(unmatched.matched, false);
});

test("medium stack depth is bounded and reports overflow without losing the newest medium", () => {
  const result = enterMediumStack([1, 2, 3, 4], 5, 4);
  assert.equal(result.overflowed, true);
  assert.deepEqual(result.stack, [2, 3, 4, 5]);
  assert.equal(result.mediumId, 5);
});

test("Beer-Lambert attenuation is distance-aware and channel-specific", () => {
  assert.deepEqual(
    beerLambertTransmittance({ absorption: [1, 2, 0] }, 0),
    [1, 1, 1]
  );
  const transmittance = beerLambertTransmittance({ absorption: [1, 2, 0] }, 1);
  assert.ok(Math.abs(transmittance[0] - Math.exp(-1)) < 0.000001);
  assert.ok(Math.abs(transmittance[1] - Math.exp(-2)) < 0.000001);
  assert.equal(transmittance[2], 1);
});

test("spectral dispersion produces wavelength-separated refractive indices", () => {
  assert.ok(resolveSpectralIor(1.5, 0.2, 460) > resolveSpectralIor(1.5, 0.2, 610));
  const samples = createSpectralSamples({ ior: 1.5, dispersion: 0.2 });
  assert.equal(samples.length, 3);
  assert.equal(samples.reduce((sum, sample) => sum + sample.weight, 0), 1);
});

test("transport branches retain reflection and transmission with independent medium transitions", () => {
  const branches = createTransportBranches({
    incidentDirection: [0, -1, 0],
    normal: [0, 1, 0],
    frontFace: true,
    ior: 1.5,
    dispersion: 0.1,
    transmission: 1,
    mediumStack: [],
    mediumId: 4,
  });
  assert.deepEqual(branches.map((branch) => branch.kind), ["reflection", "transmission"]);
  assert.equal(branches[0].mediumId, 0);
  assert.equal(branches[1].mediumId, 4);
  assert.ok(branches[0].weight > 0);
  assert.ok(branches[1].weight > 0);
});

test("KHR_materials extension normalization preserves factors and extension textures", () => {
  const texture = { width: 1, height: 1, data: [255, 255, 255, 255] };
  const normalized = normalizeWavefrontMaterialExtensions({
    extensions: {
      KHR_materials_ior: { ior: 1.52 },
      KHR_materials_transmission: { transmissionFactor: 0.8, transmissionTexture: texture },
      KHR_materials_volume: { thicknessFactor: 0.4, attenuationDistance: 2 },
      KHR_materials_dispersion: { dispersion: 0.2 },
      KHR_materials_clearcoat: { clearcoatFactor: 0.7, clearcoatTexture: texture },
      KHR_materials_iridescence: { iridescenceFactor: 0.6, iridescenceTexture: texture },
    },
  });
  assert.equal(normalized.ior, 1.52);
  assert.equal(normalized.transmission, 0.8);
  assert.equal(normalized.volumeThickness, 0.4);
  assert.equal(normalized.dispersion, 0.2);
  assert.equal(normalized.clearcoat, 0.7);
  assert.equal(normalized.iridescence, 0.6);
  assert.equal(normalized.textures.transmission, texture);
  assert.equal(normalized.textures.clearcoat, texture);
});

test("KHR_materials extension textures survive atlas and triangle packing", () => {
  const texture = { width: 1, height: 1, data: [32, 128, 255, 255] };
  const mesh = {
    positions: [-1, 0, 0, 1, 0, 0, 0, 1, 0],
    indices: [0, 1, 2],
    extensions: {
      KHR_materials_transmission: { transmissionFactor: 0.9, transmissionTexture: texture },
      KHR_materials_clearcoat: { clearcoatFactor: 0.6, clearcoatTexture: texture },
    },
  };
  const materialSource = createWavefrontGpuMaterialSource([mesh]);
  const acceleration = createWavefrontMeshAcceleration([mesh], materialSource);
  assert.ok(materialSource.extensionAtlases.transmission.data.length > 0);
  assert.ok(materialSource.extensionAtlases.clearcoat.data.length > 0);
  assert.notDeepEqual(acceleration.triangles[0].extensionTextures.transmission, [0, 0, 1, 1]);
  assert.equal(acceleration.triangles[0].materialExtension[2], 0.9);
});
