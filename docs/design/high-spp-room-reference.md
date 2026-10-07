# High-SPP room screenshot reference

Parent site Epic #2113 / Feature #2114 / Story #2256. User-requested single
native 4K screenshot experiment; not production rollout or an ultimate-quality
convergence claim. Existing adaptive and guided flags remain default-off;
the local fixture explicitly selects them for testing. Three.js is prohibited
and cannot be a fallback.

The current room fixture hard-codes 32 SPP in renderer setup, config packing,
fixed-path weights and admission; tile planning accepts only Uint8 and <=32.
Lighting's prescribed radial plan uses Uint8 (256 would wrap to zero). Reuse
the current renderer transport, adaptive completion/count packing, tile planning,
and lighting reference composition. Do not implement a second scheduler.

Add a numeric local SPP ceiling (integer 1 through the packed-ABI limit 256).
Default 32 retains existing bytes, scene, materials and capture behavior.
Derive each tier as max(1, ceil(ceiling / 2^bandIndex)); no preset whitelist.
Round fractional budgets upwards; aggregate equal-tier counts for low ceilings.
The requested ceiling of 256 uses 256/128/64/32/16/8
for the same 5/10/15/20/25/25 percent circular areas: exactly eight times the
old per-pixel budgets, 47.6 mean SPP, 394,813,440 camera samples at native 4K.
Keep current 52-degree FOV, original room plus three reference models, six
bounces, stable sampler, split-depth two and optional same-input guided filter.
Retain both raw and cleaned PNG/HDR for inspection; no exposure/BSDF/PDF change.

Lighting task: bounded variable ceiling and count/settings admission, Uint16 only
when the configured ceiling exceeds Uint8 capacity, exact boundaries/ratios,
unchanged default snapshots. Renderer
task: accept bounded Uint16 budgets up to 256; propagate ceiling through native
creation/sequence/config allocation/weights/dispatch/count verification; label
UI and evidence accurately, distinguish filenames, reset to 32 and keep the
existing splitting benchmark explicitly 32 SPP. No new public renderer API.

Tests first: 4K exact band histogram/total and eightfold per-pixel identity,
256 packing/no overflow, invalid type/ceiling rejection, old default behavior,
tile primary-ray accounting and ranges up to 256, ceiling propagation through
fixture and accessible numeric control/reset, arbitrary integer ceilings and
collapsed low-ceiling histograms. Run full tests/coverage/changed-source
LCOV, lint, types, build, package/zero-Three checks and post-push CI. README and
Unreleased CHANGELOG required. Existing adaptive metadata/count ABI ADRs remain
applicable; this bounded diagnostic extension makes no architectural change.

Physical screenshot: compile/execute existing probes then complete all 510 tiles
at 3840x2160. Verify every actual count equals the budget, nonnegative finite
HDR/alpha, no overflow/device loss, cleanup and provenance. Capture timings and
application allocations honestly; eightfold work can take minutes and config/
host budget storage can grow, while queues stay tile-bounded. Keep cancellation
and existing per-operation timeout; never accept a partial render as success.

QA: select high ceiling and 4K using normal controls; inspect displayed tier
labels, capture status, raw/clean reversal, image detail and save PNG. Verify
default/reset and invalid inputs independently without triggering extra full
captures. Check visible control wrapping and final image. No scene changes,
benchmark target claims, private model publication, main/CD or local release.
Rollback selects the 32 preset or disables GPU-native adaptation; no legacy path.
