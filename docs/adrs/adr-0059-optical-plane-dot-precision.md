# ADR 0059: Preserve the remainder in grazing optical plane dot products

Status: Accepted for experimental implementation; physical qualification pending.
Date: 2026-10-14. Task: #234; parent Feature: plasius-ltd-site#2114.

## Evidence

ADR 0058's original-plane distance restores the ordering in the retained GPU
preflight, but renderer `e4d2ed847d8166e7087330bb55564c87686db45a` fails
the unchanged 20 nm entry-distance gate: 0.030732138082385063 m instead of
0.030732102132163742 m. The full render never starts. Binary32 dot evaluation
with last-component multiply/add contraction reproduces this exact value.
The software executor's built-in dot uses wider intermediate arithmetic and
therefore missed the error. This is not a new ray-budget or bounce-limit failure.

## Decision

Retain the plane equation, shared-edge admission, original geometry and strict
cursor. Only its two nested-path dot products use split-product accumulation:

1. Compute the rounded three component products.
2. Clear their twelve low significand bits to form high parts (retaining sign
   and exponent). This is a binary32 arithmetic constant, not configurable scene
   policy and not an intersection tolerance.
3. Compute each low remainder as `fma(left, right, -high)`.
4. Sum high parts and low parts separately, then combine.

Splitting the product through integer bit operations prevents the high sum from
simply contracting back into the original cancellation-sensitive dot. At similar
product magnitudes the high parts leave headroom for the three-term sum. A fused
remainder recovers product bits lost to ordinary rounding. WGSL permits non-fused
`fma`; that case retains rounded-product remainders and must also pass the retained
regression. Neither arbitrary reassociation nor extreme exponent ranges acquire
an exact-arithmetic guarantee from this method.

Only default-off `renderer.transport.nestedMediaRefraction.enabled` selects this
path. No public API, ABI, buffer, pass, CPU traversal, medium recovery, BSDF,
sample-count, bounce-depth or flag-off arithmetic changes. Additional arithmetic
on accepted nested triangles requires physical timing measurement; it is not
claimed free or faster. Three.js remains prohibited, including rollback.

## Acceptance and limitations

The new explicit contracted-dot regression must fail with the physical value
before the correction, then pass with fused and non-fused remainder arithmetic.
Keep the existing 20 nm tolerance, axis/winding, cursor, nearest-hit, seam and
flag-off regressions. The physical preflight retains both complete ordering
records on rejection, so a future failure preserves distance and event evidence.

Require assembled-WGSL checks and physical preflight, followed by the original
4K/256-SPP/20-bounce filled-glass capture and empty controls. Full linear-HDR,
energy, device stability and GPU/job timing qualification remain pending. Do not
infer cross-device correctness or completed-image quality from software arithmetic
tests. The original plane normal and input differences remain finite-precision;
arbitrarily close/ill-conditioned geometry is not qualified.

Reference: [WGSL floating-point accuracy and expression transformations](https://www.w3.org/TR/WGSL/#floating-point-accuracy).
