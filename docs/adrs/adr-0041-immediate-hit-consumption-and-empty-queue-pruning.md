# ADR 0041: Immediate hit consumption and empty-queue pruning

Date: 2026-09-20. Status: experimental; default off, pending broader qualification.
Task gpu-renderer#169; Story site#2119; Feature site#2114.

## Context

The remaining scratch buffers are transient working state, not temporal ray or
radiance caches. Each active ray's intersection writes a 240-byte shader
HitRecord; a second dispatch reads that hit and reloads the ray to shade it.
Ray queues are reused through ping-pong bindings, not copied wholesale at each
bounce. Empty queues currently retain one guarded workgroup through
`max(1, ceil(activeCount / 64))`.

## Decision

Add independently selectable internal `fusedHits` and `zeroEmptyDispatch` options,
both false by default and neither exposed by the public renderer. They inherit
the default-off remote parent `renderer.sampling.adaptivePerPixel.enabled`.
Fixture controls select experiments; they are not a replacement production flag
service or authority to enable the site.

- Keep the canonical intersection and shading bodies single-sourced. A new fused
  entry carries the hit locally into shading, omitting the global hit round-trip
  and the second RayRecord load. Retain real mesh/analytic traversal, material
  texture evaluation, BSDF/PDF/MIS, path ownership, sibling accounting, offsets,
  sampling, medium state, termination and overflow behavior.
- Let the experimental queue-argument writer produce zero groups for an empty
  queue. Preserve queue promotion and all encoded bounce boundaries; do not add
  a CPU readback per bounce. This prunes shader invocations, not every encoded
  dispatch/pass command. The [WGSL compute-grid definition](https://gpuweb.github.io/gpuweb/wgsl/#compute-shader-invocations)
  defines invocations from workgroup size times dispatch size; a zero dimension
  creates no invocations. Physical execution is required in addition to this
  specification-based reasoning.
- Override pipelines only at the internal prepared-continuation seam. The fixed
  command trace and assembled fixed shader stay unchanged. Off factories touch
  no device. Reuse the existing explicit trace layout, resource owners and
  capped buffers; retain old scratch for the paired comparison.

## Trade-offs and acceptance

Fusion may worsen register pressure, occupancy or divergence. Empty dispatches
still incur command-processing overhead, and zero and fused effects need not add
linearly. Hence independently measure baseline, zero-only, fused-only and both,
including identical image/ray/count controls before evaluating time.

No new cache, replay of previous rays, temporal radiance reuse, changed estimator,
multi-bounce in-shader loop or reduced physical bounce ceiling is introduced.
Do not replace jittered samples with cached primary visibility without a separate
correctness contract. Logical record traffic is not measured memory-bus traffic;
unchanged allocations cannot be called a memory saving.

The [design](../design/adaptive-transient-hit-pruning.md) defines requirements-first
tests. The [physical evidence](../evidence/adaptive-pruning-2026-09-20.md) retains
each variant and their combination, failure cases and frozen confidence/quality
gates. Results apply only to measured workloads/device and do not approve a
production importance policy, real-time claim or white-paper advancement.
Rollback is the default fixed GPU-native path. Three.js is prohibited and cannot
be a fallback. No public/site/release activation is performed here.
