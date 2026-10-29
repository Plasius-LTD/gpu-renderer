# ADR 0061: Refine cancellation-sensitive optical edge predicates

Status: Accepted for experimental implementation; physical qualification pending.
Date: 2026-10-18. Task: #234; parent Feature: plasius-ltd-site#2114.

Update 2026-10-18: the paired-float implementation below is superseded by
[ADR 0062](adr-0062-integer-optical-edge-predicates.md) after build `021d27c`
rejected the valid neighbouring ray on the physical device. The original
decision is retained as history, not active implementation guidance.

## Evidence

The `fbf9616` independent-transport physical capture passes sampling parity and
the multi-interface mean probe but rejects tile 162 at ordinal 93. Canonical
pixel 2574458 first hits rim 353436, then reports duplicate glass entry 353647
at bounce one. The primary ray against original binary32 parametric geometry
has first barycentric coordinate -2.79209435e-7 in an independent double-precision
calculation: it is outside the rim. The projected physical test instead returns
+1.438851996e-6. The false entry corrupts occupancy before any water crossing.
The numerical WGSL executor independently reproduces false admission.

This is distinct from ADR 0060's admitted interior hit-position rounding. It
cannot be repaired by a larger origin offset or by resetting the medium stack.

## Decision

Retain ray-aligned projected edge evaluation as the common path. An arithmetic
uncertainty filter includes translation, shear and edge-product magnitude. If
any edge lies near cancellation, recompute all three oriented edge determinants
from original ray and vertex values using paired high/low scalar arithmetic.
The filter only selects evaluation precision; strict mixed-sign rejection and
zero-determinant rejection still define coverage. It never dilates a triangle.

Heads truncate twelve low significand bits through integer bit operations;
low remainders survive separate or contracted products. Canonical endpoint
ordering gives both users of a shared edge the same operation sequence and
opposite sign. Original-plane distance, exclusive traversal cursors, culling,
material interpolation and existing interior-position handling remain shared.
No new API, queue, buffer, allocation or dispatch; additional arithmetic and
register/divergence cost require measurement, especially distant small geometry.

Only `renderer.transport.nestedMediaRefraction.enabled` selects this path;
the flag defaults off. Disabling it restores the unchanged GPU-native legacy
collision branch, not a claim that legacy glass is qualified. The existing
bounded branching and sampling controls remain independent. No occupancy reset,
discarded camera samples, extra bounce allowance or change to BSDF/PDF/MIS.
Three.js is prohibited and cannot be a fallback.

## Qualification and limitations

Require the frozen outside ray to miss the rim and reach the genuine far-wall
front face, while a one-ULP direction neighbour remains inside. Cover cyclic
axes, winding, explicit contracted arithmetic, independent double reference,
shared edges/vertices, earlier corner/order/cursor cases and flag-off equivalence.
Physical assembled-WGSL preflight uses the same canonical predicates before
the room workload. Inject wrong admission, lost neighbours and event identity
errors to prove fail-closed acceptance remains effective.

[WGSL floating-point evaluation](https://www.w3.org/TR/WGSL/#floating-point-evaluation)
permits relaxed evaluation and does not promise portable double-precision
semantics from paired floats. This refinement is neither arbitrary-scale exact
geometry nor proof for every near-degenerate configuration. The device preflight,
full high-SPP captures, HDR comparisons, stability and cost measurements remain
required. No band-removal, performance, release or white-paper claim follows
from local numerical tests alone. Private reference assets remain local.
