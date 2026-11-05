import assert from "node:assert/strict";
import test from "node:test";
import { WAVEFRONT_COMPUTE_WGSL } from "../src/wavefront-shaders.js";

test("primary terminal MIS is excluded by one shared assembled predicate", () => {
  assert.match(WAVEFRONT_COMPUTE_WGSL, /fn terminal_mis_enabled\(ray: RayRecord\) -> bool \{\s*return ray\.bounce > 0u && \(ray\.flags & RAY_FLAG_DELTA_SAMPLE\) == 0u;\s*\}/);
  const terminals = WAVEFRONT_COMPUTE_WGSL.slice(
    WAVEFRONT_COMPUTE_WGSL.indexOf("fn resolveSurfaceRecords"),
    WAVEFRONT_COMPUTE_WGSL.indexOf("let shouldEstimateDirectLight"));
  assert.equal(terminals.match(/if \(terminal_mis_enabled\(ray\)\)/g)?.length, 2);
  assert.match(terminals, /let lightPdf = terminal_emissive_light_pdf\(ray, hit\);/);
  assert.match(terminals, /let lightPdf = environment_direction_pdf\(ray.direction.xyz\);/);
  assert.equal(terminals.match(/power_heuristic\(bsdfPdf, lightPdf\)/g)?.length, 2);
});
