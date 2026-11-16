# Million-instance motion qualification

Date: 2026-11-15

## Outcome and boundaries

Continue Feature Plasius-LTD/plasius-ltd-site#1170 under Epic #2271. The
existing `gpu-demo.scene-fidelity.enabled` rollout and route capabilities remain
unchanged. The product requests at least 24 completed camera frames per second,
with additional samples whenever its `@plasius/gpu-performance` budget permits.
Stationary rendering must restore the complete requested resolution, samples,
bounces, materials and geometry. Preserve dependency hold #2330, renderer #259
optical/UHD holds and the disabled professional animation rollout.

## Measurement before changes

Freeze exact source, installed dependencies, device/browser, scene seed, camera
trajectory and quality settings. Test 1, 1,000, 10,000, 100,000 and 1,000,000
actual retained instances; distinguish objects, instances, unique geometry and
logical triangles. A small repeated primitive capacity test is not forest
qualification. Keep historical failures and raw frame intervals.

Record scene preparation time and peak/resident CPU memory separately from
camera motion. Record GPU allocation admission, instance/TLAS/BLAS sizes,
unprofiled completed-frame intervals, minimum rolling-second FPS, median/p95/p99,
maximum and counts above 41.667 ms. Report startup/adaptation separately without
silently discarding spikes. Retain diagnostics separately because timestamp
readback or profiling may change timing. Run one GPU benchmark at a time in a
coordinated window, with bounded test duration and deterministic disposal.

## Candidate investigation

Inspect CPU instance preparation, BVH construction and transient allocations;
verify camera updates never rebuild scene acceleration or upload instances.
Inspect traversal locality, overlapping bounds, shader dispatch, queue waits,
completion scheduling and UI progress. Reuse the existing performance governor
for product targets; do not create a second adaptive policy. Change only a
measured or reproducible bottleneck with a requirements-derived regression.

Repeated submitted-work waits must keep a bounded number of device-loss
observers. One device-level observer fans out only to currently active waits;
completion, rejection and timeout detach their callbacks. Preserve prompt loss
failure for simultaneous and later waits. This lifetime repair is independently
testable and does not establish the cause of an isolated timing outlier.

Do not claim constant ray cost from object count alone: screen coverage,
occlusion, material depth and acceleration quality are independent variables.
Keep dense/overlapping and spatially distributed cases explicit. Any resource
limit or unmet frame target is a failure to report, not permission to omit
objects, replace assets, lower stationary quality or loosen release gates.

## Correctness and release gates

Before implementation add failing regressions where practical. Validate stable
instance identities, conservative transformed bounds, every-instance coverage,
deterministic hierarchy, ray-hit equivalence and unchanged fixed rendering.
Compare baseline/candidate stationary HDR and displayed image at matched seed,
camera, resolution and sample count, with tolerances fixed before candidate
runs. Include repeated motion/rest transitions, cancellation and cleanup.

Run package tests/coverage (>=80%, every changed source in LCOV), lint, types,
build, pack/dependency/source boundaries and relevant consumer tests. Update
README, Unreleased CHANGELOG and ADRs for changed architectural contracts.
Deliver package changes through exact-main approved `cd.yml`; verify registry
integrity/provenance before site adoption. Exact site CI, actual production CD,
public build identity, sensitive-environment secretref evidence and public GPU
qualification precede closure. No local publishing or alternative deployment.
