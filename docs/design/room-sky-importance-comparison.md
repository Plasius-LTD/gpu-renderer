# Fixed-SPP sky-importance attribution

Task renderer#234 / Story site#2291 / Feature site#2114. Adaptive performance
remains paused. This is a fixed-SPP correctness/variance experiment, not a new
sampler or permission to change transport to satisfy a paper.

## Evidence and selected experiment — 2 November 2026

The retained full-room1080p controls pass energy screens but fail the frozen
reference-convergence screen. Before changing a renderer algorithm, compare the
existing `renderer.environment.productStudioImportance.enabled` flag. It is
already registered in the site's remote flag registry and renderer public
contract, defaults false, and changes only procedural-sky next-event direction
sampling and its matching PDF. The current native fixture never forwards it.
No new package, budget governor, shader, material, light, camera or policy is
needed. Three.js remains prohibited, including tooling and rollback.

Reuse the existing native room runner, explicit reference transport keys,
gpu-lighting image metrics, analytic MIS preflight, count validation, lossless
HDR retention and independent source checks. Add a laboratory-only button, not
more camera controls. Normal rendering, scene qualification and convergence
remain flag-off by default. Production remote state is not modified.

## Controls and invariants fixed before measurements

Four sequential native1920x1080, uniform32-SPP captures: uniform-sky/key7,
cosine-sky/key7, cosine-sky/key19, uniform-sky/key19. An explicit native4K
diagnostic query may select3840x2160; never substitute a small resolution.
Use the original room/all three references, ordinary20/optical2048, daylight,
clearance0.0001m, denoise/splitting/rough-optics off and authored materials.
Only the existing importance bit16 may differ between modes. Require the same
camera/assets/scene/sources/reference-shader hashes and valid physical probes.
Record actual resolved renderer bits, not just the requested UI boolean.
All camera/BSDF sample identities and completed counts remain unchanged.
Require exact primary/secondary/path-segment count equality between modes for
each seed: only direct-light shadow directions should change. These counters do
not include all shadow/BVH queries, so equality is not equal total work or time.

Retain every lane and checkpoint separately. Stop on failure/cancellation or
changed controls; restore user settings, preserve failed attempts and never
overwrite older evidence. Cold construction and measured sampling are distinct;
the existing30-second bound is not increased or bypassed.

## Analysis and advancement boundaries

First attribute retained32/128/256 seed-to-seed differences, their sample-count
scaling, spatial distribution and outlier concentration. Two replicates provide
descriptive differences, not confidence bounds or a proof of unbiasedness.

For the four new captures, compare within-mode seed-pair RGB MSE and local errors
using gpu-lighting's existing `compareLinearImages`. Report candidate/control
pair-MSE ratio and mean energy differences. Ratio<1 is only a descriptive
variance-reduction screen; retain failures too. The existing1% energy and3%
reference-convergence limits remain unchanged, and mean parity cannot override
local/transport errors. Without converged references the result cannot admit
adaptive performance, production quality or publication claims. Do not claim
GPU time or memory improvements from these instrumented diagnostic captures.

Requirements-first portable tests: bounded plan/query/default-off, exact flag
forwarding/resolved bit, receipt/mode identity, same-seed ray-count equality,
source/camera/asset changes, missing probes, failure/cancellation/checkpoints and
UI restoration. Cover both modes and disabled normal controls. Add docs,
README/Unreleased, full coverage/changed-file LCOV, lint/types/build/package/
Zero-Three/audits and exact-head CI. No main/CD, local publishing or release.

Rollback is simply leaving the laboratory comparison or disabling the existing
importance flag; it is always GPU-native and does not alter sampling defaults.
