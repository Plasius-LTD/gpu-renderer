import test from "node:test";
import assert from "node:assert/strict";
import { WAVEFRONT_SHADER_KERNELS_WGSL as kernels } from "../src/wavefront-shader-kernels.js";
import { WAVEFRONT_SHADER_LIGHTING_WGSL as lighting } from "../src/wavefront-shader-lighting.js";

test("one primary path cannot append an untracked dielectric sibling", () => {
  assert.doesNotMatch(kernels, /let secondaryIndex = atomicAdd/);
  assert.equal((kernels.match(/nextQueue\[nextIndex\] = RayRecord/g) ?? []).length, 1);
});

test("selected dielectric lobes carry their probability for unbiased continuation", () => {
  assert.match(kernels, /select\(transmissionReflectChance, 1\.0, cannotRefract\)/);
  assert.match(kernels, /1\.0 - transmissionReflectChance,[\s\S]*?SCATTER_LOBE_DELTA_TRANSMISSION/);
  assert.match(lighting, /surface_delta_transmission_throughput\(hit, viewDirection\) \/ scatter\.pdf/);
  assert.match(lighting, /surface_delta_reflection_throughput\(hit, viewDirection\) \/ scatter\.pdf/);
});

test("total internal reflection retains all energy without transmitting", () => {
  assert.match(lighting, /if \(cannotRefract\) \{\s*return vec3<f32>\(1\.0\);/);
});
