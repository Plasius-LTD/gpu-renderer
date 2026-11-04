# Native adaptive host efficiency

Task renderer#169, Story site#2119, Feature site#2114. Three.js is prohibited.

## Execution decision — 3 November 2026

The user explicitly accepts the current convergence provisionally and directs
performance/fidelity/memory optimisation to resume. Preserve the failed3% screen
and all raw evidence; do not relabel it passed or weaken the existing verifier.
This supersedes earlier experiment-pause wording for the current work. It does
not waive invalid paths/counts, overflow/device loss, silent fidelity reductions,
the permanent dependency prohibition or release/publication qualification.

Compare identical native1920x1080/3840x2160 full room/all reference assets,
camera,32-SPP ceiling and prescribed32/16/8/4/2/1 radial budgets,20 ordinary
bounces/2048 optical interfaces, original daylight, fixed-pattern transport,
denoise/splitting/rough/material experiments off. Quality acceptance for these
host-only changes is exact upload and HDR/count/ray identity, independent of
the provisionally accepted reference convergence. Do not reduce fidelity to
make time better. Environment/BSDF/PDF/MIS/collision/roulette/shaders stay intact.

## Two independent experiments

1. Internal `createConfigPayloadBatch`: pack one canonical320-byte frame record
   per tile, copy it into aligned sample slots and update only each absolute
   sample ordinal. Reuse `createConfigPayload`, preserve every other byte and
   stride padding, all optical/telemetry/build metadata and sample weights. Do
   not cache scene/camera state across frames, change uploads or add GPU work.
2. Allocate the native diagnostic's full-screen uniform budget map only when
   uniform mode first needs it. Preserve the initial radial snapshot, plan and
   ordinary fixed mode. Reuse the map thereafter and report its allocation when
   it occurs. Radial-only runs can avoid4 bytes/pixel of host storage:7.91MiB
   at1080p and31.64MiB at4K. This is not GPU memory/physical VRAM savings.

Native fixture controls `hostOptimizations.templateConfigPacking` and
`hostOptimizations.lazyUniformBudget` are independent booleans/default false,
snapshotted before adapter access. They are local experiment selectors, not
product access or production rollout controls. The existing remotely controlled
parent `renderer.sampling.adaptivePerPixel.enabled` remains disabled. Canonical
fixed dispatcher/public renderer behaviour is unchanged; no new governor/API,
shader variant, capability, dependency or competing performance policy.

## Tests and measurements frozen before implementation

Portable requirements-first checks: complete byte equality to the canonical
per-sample serializer at1/2/7/32/128/256 samples, nonzero absolute sample ranges,
partial native edge tiles, different weights, optical on/off and telemetry/build
metadata; all padding; reflected WGSL sample-field offset; invalid stride/count/
range/flags before allocation; independent/default-off selectors and immutable
snapshot; eager/lazy lifetimes and exact known backing bytes, fixed/radial/
uniform transitions; actual native-runner integration and CPU allocation counts.
Existing disabled bytes, transport/counts and error/cancellation tests stay.

Measure native tile configuration workloads on CPU separately from rendering,
with warmed/alternating repeated trials and exact bytes/known allocations. Label
these as CPU packing time, not FPS or GPU time. Reuse existing runner/profiler,
original room loader, radial policy, capture bridge and source manifests for
physical full-scene paired runs. Warm each strategy, alternate timing-only frames
without readbacks/profile wrappers, then collect separate HDR/count/ray/profile
diagnostics. Sequential GPU submissions only. Retain every failure and cleanup.
Expose status/cancel; lock and restore controls; do not add camera panels.

Start at1080p, then4K. Three timed pairs are a short screen, not the approved
confidence matrix or sustained60Hz qualification. Report raw/median job time,
CPU stages, actual samples, rays/segments, dispatches/submissions, allocation
classes and source/device/browser provenance. Identical HDR and counters are
mandatory; fewer allocations are not automatically a frame-time gain. Coexisting
benchmark instances must be disclosed and per-instance/combined memory separate.

README/Unreleased, design/ADR/evidence, full tests/coverage>=80% with every changed
executable in LCOV, lint/types/clean consumer/build/package/Zero-Three/audits,
push/exact-head CI are required. No local publish, production activation or
main/CD release. Rollback turns either local experiment selector off and retains
the GPU-native baseline. No Three.js fallback. Larger lobe-policy/GPU scheduling
changes remain separate experiments after this byte-identical host comparison.
