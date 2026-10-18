# Amber bounded continuation correction

Task gpu-renderer#245; Story site#2303; Feature site#1170; Epic site#2271.
Existing remote host gate: gpu-demo.scene-fidelity.enabled (enabled/100% verified
18 October 2026). This is a correction of the published fixed renderer, isolated
from the active adaptive/nested-media work in Task234.

The released shadeSurface appends an unconditional dielectric sibling into a
queue bounded at tilePixelCount. That can discard both sibling and later primary
continuations. Siblings share the same accumulation and deferred-path identity;
concurrent writes also race. Delta metal reflections incorrectly enter the same
sibling emission block. The resulting image depends on queue occupancy.

Retain one selected continuation per incoming ray and weight a selected dielectric
lobe by its selection probability. Total internal reflection emits one reflection
with unit throughput; it must never emit a refracted sibling. Metal retains its
single Fresnel-weighted reflection. No extra allocation, queue enlargement, scene
material override, increased depth, or disabled validation is permitted.

Derive shader contract regressions before correction. Compare unchanged Amber,
released versus candidate, same camera/lighting/count/depth with denoising off/on;
check opaque/metal fixtures too. Record completion and physical GPU errors.
A better image alone is not full optical qualification: rough dielectric BSDF,
nested media and adaptive sampling remain separately tracked. Require local
suite/coverage/lint/types/build/package/Zero-Three and approved main CI/CD before
consuming the correction. Source material and hashes remain unchanged. Rollback
through the host stored gate or prior approved deployment.

## Local evidence — 18 October 2026

At matched 800x282, 256 completed samples, six bounces, denoising disabled and
unchanged camera/lighting/source files, the published control is nearly black.
The candidate reveals the enclosed insect and translucent shell. Browser GPU
error log is empty. The 239-test suite passes; measured line coverage is 95.49%,
and both changed shader source modules appear in LCOV. Lint, types, build,
package and Zero-Three checks pass. Further fixtures and release gates remain
required; these images alone do not establish full optical correctness.
