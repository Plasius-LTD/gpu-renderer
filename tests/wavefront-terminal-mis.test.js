import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
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

test("MIS eligibility remains pinned alongside the Task 224 material correction", () => {
  const prior = WAVEFRONT_COMPUTE_WGSL.replace(
    "// Camera visibility has no competing next-event sample. Preserve the existing\n// terminal MIS only for non-delta secondary rays.\nfn terminal_mis_enabled(ray: RayRecord) -> bool {\n  return ray.bounce > 0u && (ray.flags & RAY_FLAG_DELTA_SAMPLE) == 0u;\n}\n\n", "")
    .replaceAll("if (terminal_mis_enabled(ray)) {", "if ((ray.flags & RAY_FLAG_DELTA_SAMPLE) == 0u) {");
  assert.equal(createHash("sha256").update(prior).digest("hex"),
    "f69fb070d663fc35953038cfe3e8ba0a5334e23087955a3743f49585ad64c755");
});
