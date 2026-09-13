import assert from "node:assert/strict";
import test from "node:test";
import { primaryMisCase, PRIMARY_MIS_SPP, PRIMARY_MIS_TOLERANCE, verifyPrimaryMisPixels } from "./fixtures/primary-terminal-mis-cases.js";

test("primary MIS fixture freezes linear references and actual count lanes", () => {
  assert.deepEqual(PRIMARY_MIS_SPP, [1, 32, 128]);
  assert.equal(PRIMARY_MIS_TOLERANCE, 0.00001);
  for (const name of ["environment", "emissive", "metal", "dielectric"]) {
    const { expected, scene } = primaryMisCase(name);
    assert.deepEqual(expected, name === "emissive" ? [4, 2, 1] : [1, 1, 1]);
    assert.ok(scene.meshes || scene.sceneObjects);
    for (const spp of PRIMARY_MIS_SPP) {
      assert.equal(verifyPrimaryMisPixels(new Float32Array([...expected, spp]), spp, expected).rgbRmse, 0);
    }
  }
  assert.throws(() => primaryMisCase("unknown"), /Unknown/);
});

test("linear evidence rejects the observed attenuation, missing counts and nonfinite output", () => {
  for (const values of [
    [0.993707537651062, 0.993707537651062, 0.993707537651062, 32],
    [1, 1, 1, 1], [1, 1, 1, -1], [NaN, 1, 1, 32], [Infinity, 1, 1, 32],
  ]) assert.throws(() => verifyPrimaryMisPixels(new Float32Array(values), 32, [1, 1, 1]));
  assert.throws(() => verifyPrimaryMisPixels(new Float32Array(), 32, [1, 1, 1]));
  assert.throws(() => verifyPrimaryMisPixels([1, 1, 1, 32], 32, [1, 1, 1]));
  const metrics = verifyPrimaryMisPixels(new Float32Array([1.000001, 1, 1, 32]), 32, [1, 1, 1]);
  assert.ok(metrics.rgbRmse > 0 && metrics.relativeEnergyDrift > 0);
});
