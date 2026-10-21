# ADR 0063: Optical geometry, partial transmission and sampling contracts

Status: Accepted for experimental implementation; physical qualification pending.
Date: 2026-10-20. Task gpu-renderer#234; Story site#2291; Feature site#2114.

## Context

The [preserved review](../evidence/renderer-first-principles-2026-10-20.md)
at c90e706/dabe0af reproduces four independent failures. A fixed determinant
floor rejects valid small/grazing hits before robust coordinates; a minimum
origin displacement skips representable neighbouring geometry; smooth partial
transmission omits its fraction; fixed transport dimensions have a degenerate
joint distribution. The last retained physical control is radial 1080p, not a
uniform or full-scene qualification. None of these counterexamples proves the
cause of every water band.

## Decision

For the existing nested-media branch, let robust coordinates admit the hit
before culling. Normalize the area normal after scaling its largest component,
so a small valid face does not receive an unrelated fallback normal. Preserve
single-sided faces, explicitly double-sided faces, occupied-volume exits,
exclusive cursors and degenerate/parallel rejection. The disabled ordinary
intersection branch retains its frozen behavior.

Reconstruct mesh positions from barycentrics in both staged and fused kernels.
Compute a normal-projected binary32 operation-error estimate, with gamma bounds
for reconstruction/bounding and projection; constant axes reconstruct exactly
and contribute zero error. Analytic hits use a ray-evaluation error estimate.
Carry the scalar in successful `HitRecord.pad2`; invalid type-5 hits still use
that word for their failure code. Continuation, split-child and visibility rays
offset past this error and round displaced components outward. Exact zero-error
planes keep their point. No fixed scene-distance floor displaces these origins;
the previous epsilon remains only in bounded duplicate-entry recovery. Keep
strict positive hit/cursor tests. Geometry inside an unresolved error interval
is not guaranteed distinguishable. These tests are not a proof of arbitrary
scale robustness or all permitted WGSL arithmetic on every device.

Smooth transmitted radiance weight is `(1-F)*T*color*eta²`. Reuse the existing
dielectric mixture for tracked partial surfaces to retain the diffuse remainder
and matching PDF/probability compensation. Keep rough sampling selected only by
its existing flag. Apply the mixture's metallic/coat/alpha admission constraints
to newly active smooth partial surfaces. Full-transmission smooth and ordinary
flag-off transport retain their prior selection. Do not simulate alpha coverage
or participating translucency.

Correct the existing opt-in fixed sampler by reusing the independent transport
implementation. Share one helper for exact prior camera coordinates, preserving
centre first sample, absolute ordinals and frame/budget stability. Pixel/event/
bounce/ordinal keys separate lighting and transport dimensions. Keep the rejected
fixed transport functions only in frozen test fixtures and immutable history,
not a biased runtime alternative. This deliberately changes the experimental
fixed transport sequence, not the camera or default-off legacy sequence.

## Controls, resources and rollout

Existing remote source-of-truth snapshots select
`renderer.transport.nestedMediaRefraction.enabled`,
`renderer.transport.boundedDielectricBranching.enabled`,
`renderer.transport.roughDielectricTransport.enabled`, and
`renderer.sampling.fixedPattern.enabled`; all remain default off. The inherited
Feature flag is `renderer.sampling.adaptivePerPixel.enabled`. These corrections
do not expose a new production capability, override remote policy or create a
governor. Disable the relevant experimental child to restore the corresponding
GPU-native path, not a claim that legacy optical quality is qualified. The rejected
correlated sampler is not a rollback target. Three.js is prohibited permanently.

No new ray/hit ABI size, renderer buffer, texture, pass or readback is introduced.
Additional shader arithmetic/private temporaries and changed sampling may affect
GPU time, occupancy and convergence; measure them. Unchanged allocated sizes do
not establish lower physical VRAM or a speedup.

## Tests and acceptance

Keep rejected implementations as executable characterization fixtures. Test the
current four contracts independently, plus small-face normals, scale/incidence,
winding/backfaces/degeneracy, translated/sloped origins, one-ULP neighbours,
entry/exit Fresnel/eta/TIR, T=0/.25/.5/1 and tinted mixtures, matched PDFs, camera
identity, joint dimensions and finite-horizon slab means. Retain existing
edge/rim/corner/order/cursor, complete-sample/sibling and disabled-path tests.
Extend final assembled physical preflight with small-hit, thin-neighbour and
fractional-transmission cases; do not relax frozen thresholds.

The sequential scene-capture plan validates actual uniform counts, transport
controls, all preflights, source identity, physical adapter, retained HDR and
cleanup, with cancellation and no automatic retries. Capture success is separate
from image-convergence/energy and performance acceptance. Physical 1080p/4K
empty/filled/full-room results, final HDR/visual review and stability remain
required before adaptive performance work resumes. Software execution and final
shader fingerprints cannot substitute for those gates. Existing private assets
and evidence are not overwritten or added to the public package.

## Physical follow-up — 21 October 2026

The normal browser connector now works without permission changes. Build cdfecb0
passes preflight but fails its first uniform32/20-depth empty-glass lane. At an
interior wall point one y-ULP above the bottom, the normal's ~1.2e-10 y component
causes per-component outward rounding to step y down onto the bottom. The lost
exit leaves the pedestal hit inside glass, causing a later duplicate-entry failure.
Keep this failed receipt and its canonical journal; software tests had missed it.

Refine the error displacement to the largest-absolute normal axis k:
`delta[k] = side * projectedError / n[k]`; other components remain zero. Its normal
projection still clears the same signed error. Round only that axis outward.
This avoids gratuitous one-ULP changes on tiny other normal components without
shrinking the error estimate or changing any hit/medium/count threshold. Exact
zero-error points, flags, ABI, resources, BSDF and sampling remain unchanged.
Dominant-axis ties are deterministic; finite nonzero geometric normals remain
the caller contract. Geometry inside unresolved error intervals is still not
guaranteed distinguishable. Additional shader cost remains unmeasured.

The exact captured-origin/next-bottom test fails on cdfecb0 and passes this
refinement. Signed/permuted normals and translated points verify one changed
coordinate and at least the required normal projection; old corner/rim/order
and disabled tests remain. Add the exact case to assembled physical preflight
and repeat all native scene lanes on the corrected immutable build before
claiming scene quality, band removal or adaptive performance qualification.

## Tangential rim reconstruction follow-up — 21 October 2026

The first corrected native batch completes its three 1080p controls, then fails
4K empty glass at pixel 2747573/sample 14. The exact constant-y rim has zero
normal-projected error, but inserting the large base between two edge products
rounds x ~140 nm outside the incident triangle. A nearby inner-wall exit is lost.
The [frozen evidence](../evidence/room-rim-reconstruction-2026-10-21.json) retains
original binary32 geometry and the independent next-exit comparison.

Interpolate small edge offsets before adding the base once. Use explicit fma for
the edge sum, but test the non-fused alternative too; WGSL does not inherit HLSL
precise guarantees. Existing AABB/interior-coordinate handling and normal-error
offset remain. The exact case, both signs, cyclic axes and all six vertex orders
must reconstruct inside the triangle and retain the distinct next exit. The
canonical device probe tests camera-derived and captured barycentrics, and
rejects the old base-first reconstruction. No new buffers, passes, ABI fields,
threshold, occupancy repair, sampling sequence or BSDF policy is introduced.
Ordinary collision admission remains covered by its frozen disabled oracle.

This arithmetic correction is not a universal representable-topology guarantee.
The full native matrix and separate image/convergence review remain mandatory;
banding is not cleared by numerical tests. Preserve all earlier failures and
keep adaptive performance and publication gains gated. Three.js cannot be used.

### Certified projected interior

The broader 48-case sweep demonstrates that base-last interpolation alone cannot
guarantee an interior representable point, even on this rim. Preserve its red
counterexample. For nested triangles with a volume identity and strictly positive
barycentrics, test projected interior along the dominant-normal axis. An arithmetic
error filter includes translated subtraction and products; uncertain signs use
the existing integer exact edge predicate, not a coverage tolerance.

If the point is not strictly interior, test its eight adjacent binary32 neighbours
in the other two axes and choose the nearest certified interior point, with fixed
iteration/tie order. Leave the dominant normal coordinate untouched. A single
step per other coordinate is covered by the existing 12-operation reconstruction
bound; normal displacement still uses the dominant axis. This is a bounded local
representation correction, not a mesh modification or triangle expansion.

Return explicit unresolved status when no candidate exists. Raw and staged hit
assembly turn it into type-5 failure/reason 8, and nested traversal returns it
before overlap recovery or occupancy changes. No accepted image/count can hide
an unresolved point. Exact barycentric edges/vertices, non-volume hits and the
ordinary/default branch do not invoke the guard. No new persistent GPU allocation
or record layout; additional shader arithmetic/private storage has unmeasured
occupancy/time cost and must not be presented as a speed improvement.

Retain sweep/sign/axis/winding, exact BigInt-sign parity, closest valid neighbour,
safe-point identity, unresolved narrow-face and failure propagation tests. The
29th physical preflight case requires a repaired nearby exit and a rejected
unresolvable face. Repeat all native scenes on the final immutable source; the
intermediate base-last captures cannot certify this stronger contract.

### Connected coplanar optical faces

Native 4K source e2a0922 passes the initial rim but its representable guard rejects
a point across a wall's internal triangle diagonal. Preserve that exact pair and
ray journal. Only when the incident triangle's eight-neighbour guard is unresolved,
query the existing BVH in that same projected neighbourhood. The bounded traversal
must reject invalid indices/ranges, stack overflow or exhausted node visits.

Certify a reverse directed shared edge, identical mesh/medium/material/flags,
consistent nonzero orientation, and exact original-binary32 coplanarity. Expand
the determinant into 24 triple products in the existing 864-bit integer accumulator
before subtraction; rounded plane tolerances cannot distinguish a one-ULP crease.
Accept the nearest point inside the adjacent triangle or on the open internal
edge, never its endpoints/exterior edges. Preserve the dominant coordinate and
normal-error bound, without persistent resources or ABI changes. Creases and
disconnected or differently owned surfaces cannot substitute for a missing exit.

The 30th assembled physical preflight checks the captured shared face and rejects
a one-ULP fold and changed medium. Independent exact-determinant/topology/BVH tests
precede native six-lane qualification. Extra private shader cost is unmeasured;
this is a correctness refinement, not adaptive performance evidence.

## Absent normal-map identity follow-up — 21 October 2026

The selected successful-sample physical journals expose a separate packing defect:
an absent normal texture uses the RGBA8 [128,128,255] fallback at scale one. Since
128/255 is not 0.5, its decoded x/y components are nonzero. Glass, water and the
pedestal therefore receive an unauthored normal tilt. This does not by itself
establish the cause of the broad band.

Set the existing normal scale to zero for omitted/null textures in CPU triangle,
GPU material and GPU mesh packing. Retain authored images and their scales,
including explicit zero; do not reinterpret byte 128 in real maps. The shader,
ABI, resources, BSDF/PDF/MIS and medium contracts do not change. This intentionally
corrects no-map behavior under existing controls rather than preserving a broken
fallback behind a new flag. Require portable packing regressions, assembled
physical absent/authored/zero-scale normal checks and matched native captures.
Preserve previous source-bound images and do not infer convergence, band removal
or adaptive-performance qualification from the packing fix.
