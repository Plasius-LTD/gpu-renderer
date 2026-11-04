# Interaction-responsive progressive sampling

Epic2113 → [Feature2367](https://github.com/Plasius-LTD/plasius-ltd-site/issues/2367)
→ Story2368 → renderer286 / performance51 / lighting110 / shared205 / site2369.
See [ADR0070](../adrs/adr-0070-interaction-progressive-sampling.md).

User direction,4 November2026: cover every pixel with one camera sample first;
spend available performance budget preferentially near view focus during motion;
while stationary, add passes across the whole screen for higher fidelity.
Retain all existing evidence and provisional convergence acceptance. Three.js is
permanently prohibited, including fallback and rollback.

## Scope and reuse

This extends the former within-frame-only adaptive scope with explicitly gated
stationary radiance history. It is separate from classification-only world-sphere
history, reprojection, variance stopping and motion-blur sampling. Those remain
out of scope. Existing motion Story2170 is a dependency, not duplicated work.

Reuse gpu-performance's adaptive policy/governor, gpu-renderer's complete-path
worklist/packed counts/quantised phases and fixed-pattern sequence, and gpu-shared's
existing one-sample preview, camera generation, quiet-period, cancellation and
queue-completion lifecycle. Released renderer main already has uniform progressive
accumulation; its single global count cannot normalize unequal adaptive counts.
Keep that API intact. Add the missing GPU per-pixel sum/count path in its owning
renderer, not a CPU pixel-history implementation in a consumer.

## Contracts

1. Parent disabled: existing fixed/adaptive paths and allocation plans stay exact;
   no progressive resources, pipelines, history reads or loop are created.
2. New view: finish a complete one-SPP sweep before allocating extra camera
   samples. No pixel is omitted to meet a performance target. First-pixel coverage
   remains real jitter/centre-pattern sampling from the canonical sampler.
3. Moving: preselect optional work using the existing performance ceiling and
   configured focus profile. Focus can change allocation without resetting valid
   radiance. Peripheral pixels keep at least one sample. Do not change materials,
   geometry, optical limits, path transport, resolution or exposure to hit time.
4. Stationary: deterministic successive count tiers let lower-count pixels catch
   up across the entire screen, then all pixels refine to the configured total.
   Retain focus-earned samples. No edge remains permanently at one sample.
5. Stable camera/scene/environment/lighting/material/size/sampler epochs are
   required for history. Any integrand/view change resets counts before sampling.
   A focus-only change does not change the integrand. A camera cut, failure,
   overflow, device loss or invalid epoch discards the current generation.
6. Absolute per-pixel ordinals continue from completed counts, never tier/batch
   indices. The sequence period is configured once for the view, not selected
   batch size. Initial total count is bounded1..256 by the existing nine-bit ABI;
   higher/unbounded histories need an explicit later ABI extension.
7. Accumulate unweighted complete-path linear FP32 sums on GPU and resolve by
   each pixel's actual count. Reflection/transmission siblings remain one camera
   sample. Denoising/presentation never feed radiance history. Work selection is
   independent of observed radiance; no variance-based stopping is introduced.
8. Await pending GPU work through a promise; retain one active job and coalesce
   camera changes to the newest generation. Do not enqueue stale full frames.
   Abort between bounded submissions, preserve errors and publish only coherent
   current-generation coverage. Rendering awaits must not block the JS thread.

## Policy ownership and telemetry

gpu-performance owns a pure refinement-plan extension, consuming the negotiated
target/budget and measured cost supplied by existing adapters. It is not another
autonomous governor. Missing cost calibration bootstraps with one sample only.
Predict optional work before drawing it; never describe a deadline as a hard
guarantee for an indivisible GPU submission. If one-SPP coverage itself overruns,
report minimum-coverage over-budget and admit no extra work. Do not report60Hz.
Omitted/zero explicit budget disables reduction, consistent with existing policy.

All thresholds, focus geometry, limits, caps and quiet periods are configurable
with validated defaults. The provider supplies timestamped interaction state;
do not estimate camera velocity using render-job duration. The existing camera/
shared lifecycle supplies changes and stable epochs. Velocity-scaled motion
policy remains owned by its separate existing Task.

Expose requested target, admitted additional work, actual count distribution,
coverage completion, phase/generation, stationary catch-up, reset reason, pending
GPU promise/progress, minimum-budget overrun, allocations, sampling/total timings
and failures. Optional diagnostics stay separate from uninstrumented timing.

## GPU state and bounded memory

Reuse packed requested/completed/flags words and tile-bounded rays/nodes/worklist.
For the progressive variant only, index radiance sums by full-screen pixel rather
than temporary tile slot. Allocate16 bytes/pixel FP32 sum storage, not half-float
feedback, plus existing4-byte pixel state and bounded tile scratch. Count-zero
generation reset makes stale sums unreadable; no huge host clear or pixel upload.
GPU target generation updates counts/targets from small coherent uniform inputs.

Do not silently expand the old128MiB within-frame allocation limit. New opt-in
progressive allocation admission has a separate explicit combined cap, provisional
default192MiB. At4K,20 bytes/pixel consume158.20MiB before bounded tile scratch.
Account for the complete plan and actual device binding limits before allocation;
insufficient cap/device support rejects this mode with a reason. Report history,
adaptive metadata, textures, scene assets, telemetry/staging and known host arrays
separately. Descriptor bytes are not exact physical VRAM residency. No lower
precision, smaller image or lost sample is an automatic fallback.

## Flags and delivery

New Feature parent: `renderer.sampling.progressiveRefinement.enabled`.
Independent controls: existing `renderer.sampling.foveated.enabled`, new
`renderer.sampling.stationaryRefinement.enabled` and
`renderer.sampling.performanceBudget.enabled`. All default disabled and must be
registered through the site's existing remote flag evaluator before runtime
implementation. Existing GPU-demo capability/exposure governs public access;
laboratory opt-in snapshots do not enable production flags. Disable parent to
restore the retained GPU-native path; no Three.js rollback.

Track Epic→Feature→Story→repository Tasks before code; assign active Tasks and
move In Progress. Update README, Unreleased CHANGELOG and ADRs. Consumers adopt
qualified released package versions through approved CD, never local publish.
Local native fixtures may mount source-pinned development contracts explicitly,
recording every source/build hash; this is not released site integration.

## Requirements-first verification

Unit/integration tests: one-SPP-first at any cost; budget admission/default/zero;
focus priority and all-edge stationary catch-up; per-pixel prefix identity through
changing tiers/focus; exact sum/actual-count normalization; generation changes,
stale completion/cancel/failure; admission and cleanup; flags/disabled equivalence.
Final assembled WGSL reflection/compilation and physical GPU tests must include
unequal counts, partial tiles, cross-phase optical/split ownership and resets.

Freeze deterministic equivalence: after all pixels reach the same configured
total, progressive raw HDR/counts/segments must match a single unpartitioned
canonical run with the same sample sequence/scene/settings. Retain native1080p
and4K full assets, independent sampler controls and reset/motion sequences.
Intermediate time-limited prefixes are not a universal unbiasedness or image-
convergence proof. Compare final quality/error/energy and matched-time fidelity;
retain progress/actual-SPP overlays and all failures. No old evidence is replaced.

Run relevant tests,>=80% combined coverage with changed-source LCOV, lint/types,
package/dependency/Zero-Three, physical checks, push/exact-head CI and applicable
approved release gates. Qualify each mechanism separately before combinations.
The known optical/traversal bottleneck still needs separate optimisation; this
scheduler does not itself establish1080p60Hz or predict a numerical speedup.
