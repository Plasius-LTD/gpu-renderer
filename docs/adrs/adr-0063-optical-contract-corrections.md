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
