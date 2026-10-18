# ADR 0062: Integer fallback for cancellation-sensitive optical edges

Status: Accepted for experimental implementation; physical qualification pending.
Date: 2026-10-18. Task: #234; parent Feature: plasius-ltd-site#2114.
Supersedes the paired-float implementation in ADR 0061, not its strict coverage
requirements, original-plane distance or flag-off contract.

## Evidence

Physical build `021d27c` returns `[-1,-1,0,0,0,1,1,0.4340140223503113]`
for the retained rim probe with bounded branching off and nested media on.
Both the outside ray and its valid one-ULP inside neighbour are rejected.
Reassociating `(head-high)+tail` as `(head+tail)-high` reproduces the rejection
locally before this correction. The original fused/non-fused tests missed it.
[WGSL floating-point evaluation](https://www.w3.org/TR/WGSL/#floating-point-evaluation)
permits this reassociation: split-float residuals are not a portable exact sign
predicate. Neither a relaxed preflight nor a wider triangle tolerance is valid.

## Decision

Keep the existing projected-edge common path and arithmetic uncertainty filter.
Only its fallback changes. Expand `cross(a-origin,b-origin).direction` into
18 signed triple products of the original finite binary32 values, so translated
vertices are not rounded before evaluation. Each float is an integer significand
times a power of two. Multiply significands with portable u32/16-bit halves,
align products to units of `2^-447`, and accumulate in 27 u32 words using exact
carry/borrow arithmetic. Eighteen finite products need at most 837 signed bits;
the 864-bit accumulator bounds all carries. This word count follows the binary32
domain, not a scene-tuned tolerance or configurable quality level.

Reject mixed exact signs before conversion. Retain each magnitude's leading
24 bits and exponent, scale all three together, then use the existing f32
barycentric interpolation. An underflowed tiny magnitude cannot erase a negative
admission sign. Shared edges have opposite exact determinant signs without
depending on floating-point operation order. Original plane distance, traversal
cursor, culling, media, sample accounting and BSDF/PDF/MIS remain unchanged.

The fallback introduces bounded per-invocation private scratch (108 bytes for
one accumulator, plus small locals), arithmetic, and possible register/spill and
divergence costs. Compiler allocation is not claimed to equal physical residency.
No renderer buffer, texture, dispatch, readback, public API or GPU/CPU boundary
changes. Measure the cost in full captures; fewer invalid collisions do not by
themselves prove faster rendering or lower memory use.

Only the existing default-off
`renderer.transport.nestedMediaRefraction.enabled` selects this path. Disable it
to recover the unchanged GPU-native collision branch, not to claim qualified
legacy glass. Bounded branching and sampling flags remain independent. Three.js
is prohibited and cannot be a fallback.

## Tests and qualification

- Preserve frozen outside/inside/far-wall geometry and exact event identities;
  cover axes, winding, shared edges, corner/order/cursor regressions and flag-off
  equivalence. No acceptance threshold is widened.
- Retain a paired-float reassociation counterexample, not just a source snapshot.
- Compare every accumulator word and determinant sign/leading magnitude against
  independent JavaScript BigInt evaluation, including cancellation, opposite
  signs, exponent extremes and degenerate zero.
- The installed software WGSL executor rounds generic unsigned vectors through
  floats and sign-extends unsigned shifts. A test-only adapter corrects those
  semantics, with separate full-width multiply/shift litmus tests. This does not
  modify GPU source or substitute for physical evidence.
- Compile the final assembled WGSL and run the unchanged physical preflight,
  then the complete 4K/256-SPP-ceiling/20-bounce capture with independent transport.
  Retain exact source provenance, counts, failure state, images and timing.

Only the fallback determinant on finite input bits is exact. The uncertainty
filter, plane distance, hit reconstruction, interpolation and whole collision
pipeline are not thereby arbitrary-scale exact geometry. Physical device
stability, full-frame completion, banding, HDR comparisons and incremental GPU
cost remain open. No visual-success, speedup, publication or release claim follows
from software numerical tests alone. Private reference assets remain local.
