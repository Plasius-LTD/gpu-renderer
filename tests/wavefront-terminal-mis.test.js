import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { WAVEFRONT_COMPUTE_WGSL } from "../src/wavefront-shaders.js";

test("primary terminal MIS is excluded by one shared assembled predicate", () => {
  assert.match(WAVEFRONT_COMPUTE_WGSL, /fn terminal_mis_enabled\(ray: RayRecord\) -> bool \{\s*return ray\.bounce > 0u && \(ray\.flags & \(RAY_FLAG_DELTA_SAMPLE \| RAY_FLAG_NO_COMPETING_NEE\)\) == 0u;\s*\}/);
  const terminals = WAVEFRONT_COMPUTE_WGSL.slice(
    WAVEFRONT_COMPUTE_WGSL.indexOf("fn resolveSurfaceRecords"),
    WAVEFRONT_COMPUTE_WGSL.indexOf("let shouldEstimateDirectLight"));
  assert.equal(terminals.match(/if \(terminal_mis_enabled\(ray\)\)/g)?.length, 1);
  assert.match(terminals, /let lightPdf = terminal_emissive_light_pdf\(ray, hit\);/);
  assert.match(terminals, /terminal_environment_source\(ray, sourceRadiance\)/);
  assert.match(WAVEFRONT_COMPUTE_WGSL, /if \(!terminal_mis_enabled\(ray\) \|\| ray.direction.w <= 0.0\) \{ return radiance; \}/);
  assert.equal(terminals.match(/power_heuristic\(bsdfPdf, lightPdf\)/g)?.length, 1);
});

test("MIS eligibility remains pinned alongside the Task 232 opt-in coating correction", () => {
  const prior = WAVEFRONT_COMPUTE_WGSL.replace(
    "// Camera visibility has no competing next-event sample. Preserve the existing\n// terminal MIS only for non-delta secondary rays.\nfn terminal_mis_enabled(ray: RayRecord) -> bool {\n  return ray.bounce > 0u && (ray.flags & (RAY_FLAG_DELTA_SAMPLE | RAY_FLAG_NO_COMPETING_NEE)) == 0u;\n}\n\n", "")
    .replaceAll("if (terminal_mis_enabled(ray)) {", "if ((ray.flags & RAY_FLAG_DELTA_SAMPLE) == 0u) {")
    // Reverse the colour-floor/MIS corrections; the re-pinned Task 232 hash
    // includes its intentional coating changes. Clearcoat behavior is checked
    // independently by analytic and assembled physical probes, not by this hash.
    .replace(/(fn evaluate_surface_bsdf\([\s\S]*?let surfaceColor = )clamp\(hit.color.xyz,/, '$1clamp(max(hit.color.xyz, config.ambientColor.xyz * 0.35),')
    .replace(/(fn terminal_surface_environment_source\([\s\S]*?let surfaceColor = )clamp\(hit.color.xyz,/, '$1clamp(max(hit.color.xyz, config.ambientColor.xyz * 0.35),')
    .replace('let surfaceColor = max(hit.color.xyz, vec3<f32>(0.0));','let surfaceColor = max(hit.color.xyz, config.ambientColor.xyz);');
  assert.equal(createHash("sha256").update(prior).digest("hex"),
    "5df07107da332c7efc2df9df7ec9073a19df51be7aedf4e925bc7a99d1eaab02"); // Includes the separately tested optical allowance, not a MIS change.
});
