# Forest motion throughput with unchanged stationary output

Date: 2026-11-05. Continues the publicly delivered renderer 0.2.62 baseline
(`752207bdf461f9487f1d782cdc4399a41f0f940d`). Parent site Feature1170 / Epic2271;
inherit `gpu-demo.scene-fidelity.enabled` and existing GPU route capabilities.

## User acceptance

Continue measured iterations toward at least 24 camera updates per second,
spending available headroom on additional SPP. Stationary views must return to
the requested full resolution, sample target and bounce depth with unchanged
materials, lighting, geometry and complete-sample accounting. A configuration
target alone is not evidence that this has been achieved.

The fixed-quality reference remains the released renderer, original assets,
camera/sample sequence and full pre-denoise linear HDR plus display pixels.
Reject silent geometry simplification, missing instances, changed transport,
stale camera history, dropped samples and reduced stationary quality. Any proven
reference correctness defect requires its own disclosed regression and acceptance;
it cannot be hidden by widening an image tolerance.

## Investigation sequence

1. Re-profile 0.2.62 on the real 1,000/10,000-of-each forests at 800x500,
   one SPP, six bounces and denoise. Separate warmed CPU submission-through-GPU
   completion from diagnostic stage timestamps. Retain all failures and samples.
2. Screen existing public tile sizes 128/256/384/512 independently, holding
   resolution, samples, geometry, camera and transport fixed. This changes
   scheduling/allocation only. Compare exact moving-frame HDR/display output,
   completed samples, setup, requested allocation and resource disposal. Reject
   a size that exceeds device/admission limits or materially regresses workloads.
3. Use the measured dominant stage and related owned work to choose further
   independent candidates. Renderer291 owns its active SAH/layout/fusion laboratory;
   renderer283/284/285 and287 retain their separate scope. Inspect their public
   evidence but do not modify or merge their active branches. New source work
   requires a linked owned Task and requirements-first regressions.
4. Audit the inspector's camera scheduling and gpu-performance integration.
   Product Studio already supplies targetFrameRate24; the model inspector still
   uses one fixed SPP per new camera generation and 128-pixel tiles. Reuse the
   existing performance package for any new policy, with product-owned figures,
   one pending GPU job, latest-pose coalescing, bounded cancellation and explicit
   overruns. Do not add a parallel governor or activate unqualified adaptive flags.
5. For any motion-only quality adaptation, report the effective settings and
   restore full requested stationary settings after the quiet period. Compare
   stationary results after orbit/reset/rapid reversals against the unchanged
   baseline. Motion configuration and full-quality optimisation results must be
   reported separately; no reduced-work result is a matched-quality speedup.

## Frozen measurements and gates

- One physical device/session at a time; no simultaneous GPU benchmarks.
- At least four warmups and24 alternating paired poses for candidate screening;
  repeat forward/reverse confirmation for gains, with controls before/after.
- Report median/p95/max render-job time and completed camera cadence separately.
  Motion target is41.67ms per completed update; report misses honestly.
- Exact full-frame linear HDR/display and primary-ray accounting at common
  settings, plus stationary64-SPP model/forest and128-SPP Studio denoise on/off.
- GPU allocation, compile/setup, errors, timeout/cancellation and disposal retained.
  Timestamps/readbacks are separate diagnostic runs, never headline timings.
- A rejected candidate stays in immutable evidence. Refine from measured failures;
  do not quietly discard outliers or declare a global optimum after a local plateau.
- Production candidates require unit/integration/reflection/physical tests,
  changed-source LCOV and >=80% coverage, types/lint/build/package/audit/Zero-Three,
  README/Unreleased/ADR/design updates and exact-head CI. Public package release
  precedes consumer adoption; approved main cd.yml/production and public build,
  scene/recovery and backend secretref verification precede closure.

No new production flag activation, local publication, manual Azure deployment,
unrelated dependency refresh or changes to renderer259/site2330 holds. Physical
touch, UHD and cross-device qualification are not inferred from desktop results.

## Second scheduling screen: trace workgroups

The public 512-pixel tile screen reduced the full forest median from about274ms
to68ms with exact moving-frame HDR/display. Stage diagnostics still attribute
most compute time to intersection (~43ms) and surface resolution (~23ms).
Screen32/128-thread workgroups against64 at the same512-pixel tile size using
isolated, archived local builds. Keep CPU direct dispatch, shader indirect counts
and WGSL workgroup declarations consistent; keep8x8 image kernels' telemetry64.
This experiment changes scheduling only, never triangle order, shading, sampling,
ray budgets or transport. Requirements-first transform checks must fail against
the unchanged source and pass the isolated build. Exact image/sample/device
controls and forward/reverse pairs remain mandatory. Rejected builds are evidence,
not release candidates. If a variant survives, implement a maintained source/API
contract with unit/reflection/public types tests before considering publication.
