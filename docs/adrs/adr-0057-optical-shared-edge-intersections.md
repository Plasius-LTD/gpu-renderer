# ADR 0057: Consistent shared-edge tests for nested optical triangles

Status: Accepted for experimental implementation; physical qualification pending.
Date: 2026-10-14. Task: #234; parent Feature: plasius-ltd-site#2114.

## Evidence and decision

The canonical journal at `808583e1566d2accdaa9eafc1b3212d0112e1a92`
reproduces pixel 2862715 / sample 198: outer glass entry 353209, followed by
incorrect far-side entry 353689. The near inner-wall exit is about 0.0040711 m
along the retained ray, at the shared edge of triangles 353593/353594. The
legacy independent barycentric tests are rounding-sensitive at shared edges.
A nearby binary32 stress ray also rejects both adjoining outer-wall faces despite
a positive double-precision reference intersection. Neither is a sample-budget
or bounce-limit correction; invalid occupancy must continue to reject the frame.

Use ray-aligned projected edge functions in nested-media mode. Evaluate each
shared projected edge in one deterministic endpoint order, negating for reverse
order, so adjoining triangles cannot independently reject opposite sides of the
same edge through inconsistent arithmetic. Preserve backface/medium-exit policy,
strict positive distance/cursor, material evaluation, physical transport and
sample identity. Do not expand barycentric tolerance, reset occupancy, add a
gap or accept a failed sample. Flag-off retains the legacy intersection path.

The broad-phase BVH interval must also be conservative: the captured inner edge
produces adjacent slab endpoints differing by roughly 0.93 nanometres in ray
distance under binary32 arithmetic. In nested mode, expand the far/nearest
interval checks by the standard `2 * gamma(3)` round-off allowance. This admits
triangle testing, not a surface hit; the exact projected-edge predicate remains
authoritative. The allowance derives from binary32 precision, not a scene gap or
user-selected geometry tolerance. General scale/parallel-ray qualification is
still required.

The existing `renderer.transport.nestedMediaRefraction.enabled` flag controls
this correction; no separate budget/governor or entitlement is introduced.
Three.js is prohibited and cannot be a fallback. No ABI, queue capacity or new
runtime allocation is required. Triangle arithmetic cost may increase in nested
mode and needs measurement; do not claim a performance improvement.

## Validation and limits

Require numerical shared-edge, vertex, winding, near-miss, positive-distance,
cursor and axis-permutation tests, assembled WGSL reflection, and physical
near/far-wall regression probes. Retain the canonical journal until the original
4K/256-SPP/20-bounce case and new six-bounce capture complete. Empty/filled glass,
HDR energy and performance qualification remain mandatory. Conservative BVH
bounds and corner-origin error remain separate concerns; this decision alone
does not claim fully robust traversal at every scene scale.

Reference: [PBRT triangle intersection](https://pbr-book.org/4ed/Shapes/Triangle_Meshes#IntersectionTests).
Interval reference: [PBRT ray–bounds rounding allowance](https://pbr-book.org/4ed/Shapes/Basic_Shape_Interface#RayBoundingBoxIntersections).
The implementation is an independently written WGSL adaptation of ray-aligned
edge testing, not a claim of PBRT's full double-precision fallback/error bounds.
