# Fixed relative sampling experiment

Tasks renderer#169 / lighting#87; Stories site#2119/#2125, Feature site#2114.
User requests fixed relative points for all sampling, not only camera jitter.

## Candidate and boundaries

Add default-off remote snapshot `renderer.sampling.fixedPattern.enabled`,
mutually exclusive with Owen–Sobol and independent-random. Renderer creation
selects source; disabling all sampler flags restores exact historical source.
No new buffers, textures, passes, CPU sample generation or package dependencies.

Reuse the existing two-dimensional Sobol direction generator, without random
scrambling. Apply fixed digital shifts per event/bounce/component, identical
for all pixels and frames. Event key is dimension-1 + 64*bounce; shifts are
0x80000000 XOR key*0x9e3779b9 / key*0x7546dc55 (wrapping u32). The camera key
is zero, so sample zero is exactly (0.5,0.5), the pixel centre. Later ordinals
follow the same prefix regardless of budget. All 1D selectors use the first
component for their distinct event dimension. No pixel, frame or seed enters
any sample. Directions remain relative to the local surface/light frame;
different geometry need not produce identical world-space rays.

This deliberately tests spatially and temporally shared deterministic points.
It is not a general high-dimensional Sobol estimator or an unbiasedness claim.
Cross-event correlation, coherent missed lighting, aliasing, tier discontinuity,
and fixed-pattern error are risks. BSDF/PDF/MIS, radiance/count normalization,
transport, scene and budgets remain unchanged. This explicitly opts out of the
earlier jittered-camera policy only inside this experimental flag.

## Requirements-first checks and physical protocol

Unit: centre first camera sample; all events stable across pixel/frame/seed;
bounce/event separation; half-open bounds and power-of-two 2D occupancy;
absolute ordinal and budget invariance; flag conflict/off/remote forms; exact
disabled shader; all pipeline families and ABI/allocation identity. Physical
WGSL probe must match CPU words for all events/bounces before image capture.

Native 1080p original Eames/room/textures, four bounces, no denoise, ceiling32,
unchanged 5/10/15/20/25/25 percent circular tiers32/16/8/4/2/1. Compare current
independent-random and fixed-pattern, one warmup and three alternating timing
frames per mode; diagnostic readbacks excluded from timings. Capture fixed32,
radial and uniform32; uniform must be bit-identical to its fixed reference.
Repeat radial with seeds7/19/43: fixed-pattern images must be bit-identical;
that proves static repeatability, not accuracy or motion stability.

Report linear HDR global and per-tier signed energy, RMSE and error tails against
both the same-sampler fixed32 and a COMMON mean of independent-random fixed32
seeds7/19/43. The common reference is 96 samples, not declared converged. Keep
the existing <=1% per-ring brightness diagnostic; never relax after inspection.
Retain native images and float HDR, actual counts/rays/segments, raw job timings,
GPU diagnostics, source/device/browser provenance, memory and failures. Run the
same static screen at4K if physical execution permits. No moving-camera,
converged quality, sustained60Hz or publication qualification is inferred.

UI checks: run/cancel/re-run, visible progress and error result, native preview;
invalid sampler and simultaneous flags fail closed. Quality failures are retained
as results, not suppressed. Tests/coverage/changed-source LCOV, lint/types/build,
package/Zero-Three, docs/README/Unreleased CHANGELOG, push and CI required.
No release or production enablement. Three.js is prohibited, including rollback.
