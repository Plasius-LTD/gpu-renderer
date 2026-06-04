import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const demoSource = readFileSync(
  path.resolve("demo", "main.js"),
  "utf8"
);

test("renderer demo mounts the wavefront compute renderer directly", () => {
  assert.match(demoSource, /createWavefrontPathTracingComputeRenderer/);
  assert.match(demoSource, /createWavefrontEnvironmentLightingOptions/);
  assert.match(demoSource, /displayQuality: true/);
  assert.match(demoSource, /meshes: createDemoMeshes\(\)/);
  assert.match(demoSource, /surface: "gpu-renderer-wavefront-demo"/);
  assert.match(demoSource, /geometryMode: "mesh-bvh-display-quality"/);
  assert.match(demoSource, /requiresMeshBvhForDisplayQuality: true/);
  assert.match(demoSource, /requiresTriangleMeshForProductStudio: true/);
  assert.doesNotMatch(demoSource, /mountGpuShowcase/);
  assert.doesNotMatch(demoSource, /createDefaultWavefrontSceneObjects/);
});
