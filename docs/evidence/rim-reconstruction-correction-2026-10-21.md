# Rim reconstruction correction — 21 October 2026

Task gpu-renderer#234 / site Story#2291 / Feature#2114. The user approved fixing
the [retained 4K failure](room-qualification-2026-10-21.md) and automatically
rerunning native 1080p/4K qualification. All original receipts, private assets,
lossless HDR/PNG and rejected attempts remain preserved. Adaptive performance
work stays paused; no band-removal or quality/performance claim follows from
software tests alone.

## Requirement and rejected result

The [frozen original parametric case](room-rim-reconstruction-2026-10-21.json)
has positive barycentric weights, but the former reconstruction places its point
outside the admitted rim: projected first weight -0.000006256196961396436.
Independent geometry from the original ray point finds the nearby wall exit;
the stored point misses it. The new requirements-first regression fails on the
previous runtime, before implementation. This is an empty-glass bounce-1 defect,
not missing SPP, exhausted bounce depth or proof of every visible band's cause.

## Correction and limits

Compute `(v1-v0)*b1 + (v2-v0)*b2` before adding `v0` once. An explicit fma forms
the small edge sum; the last large addition avoids the extra rounding between
edge contributions. This follows the reconstruction ordering discussed in
[NVIDIA's hit-point analysis](https://developer.nvidia.com/blog/solving-self-intersection-artifacts-in-directx-raytracing/),
not its hardware-specific constants or HLSL precise contract. Existing projected
normal-error estimates, representable interior-bound treatment, strict hit/cursor
tests, medium state, count gates, BSDF, sampling, ABI and allocation sizes stay
unchanged. No triangle tolerance or arbitrary scene offset is added.

The exact frozen barycentrics and 36 sign/axis/vertex-order variants retain
positive projected interior weights and a distinct next exit with both fused
and explicitly non-fused edge interpolation. Existing edge/vertex, planar-axis,
bottom-corner, origin, ordering and ordinary disabled collision tests remain.
The 28th assembled dielectric device case checks both a newly intersected camera
ray and the captured barycentrics through canonical reconstruction, origin and
inner-wall collision. Rejected base-first reconstruction and injected lost/wrong
exits fail the probe. No claim covers arbitrary-scale indistinguishable geometry
or unmeasured devices/compiler arithmetic.

## Qualification status

Local full suite: 463 tests pass, 96.42% lines / 83.20% branches; the sole changed
runtime module is present in LCOV at 100%. Lint, types/clean packed consumer,
build, package integrity, all nine Zero-Three gates and runtime audit (zero
vulnerabilities) pass. The canonical shader SHA256 is
`0870dd03fd8f7561a13da66a00e8be84c9f168994d392215edaea093d950478a`.
Five existing whole-shader fingerprints are deliberately re-pinned after the
independent functional regressions; their behavioral checks remain unchanged.

Immutable source pin, exact-head CI and physical rerun results
will be recorded after execution. Until then the prior uniform-32-SPP 1080p
water band remains unresolved and no complete 4K image is qualified. The browser
uses the normal working connector; no permission/sandbox changes are required.

## Stronger near-edge refinement

The retained 48-case sweep on the same rim has a counterexample to base-last
alone: weights `[5.960464477539063e-8,0.699999988079071,0.2999999523162842]`
reconstruct to `(2.895268440246582,-0.5140840411186218,-0.07656029611825943)`;
its projected first weight is `-0.000015778221665617126`. The added test fails
before the projected guard. Source `0f550fb` is an intermediate correction, not
a universal interior guarantee. Its automatically completed three 1080p controls
are retained; the operator cancels its 4K preparation after this counterexample
is established. This cancellation is not a successful 4K result or device loss.

For nested volume hits with positive barycentrics, certify projected interior
using an arithmetic error filter and the existing exact integer edge predicate.
If necessary choose the nearest certified point among the eight adjacent binary32
neighbours in the two non-dominant-normal coordinates. Keep the dominant normal
coordinate and the existing normal-error estimate. Genuine zero-barycentric
edges/vertices, non-volume and ordinary hits bypass the guard. No triangle
coverage tolerance, medium reset, additional sampling or persistent allocation.

An unresolved result becomes hit type 5/reason 8 and returns before nested overlap
recovery. Tests cover 384 near-edge sign/axis/vertex-order cases, exact dyadic
orientation parity (including cancellation/exponent extremes), safe identity,
nearest-neighbour selection, genuinely unresolvable faces and reason/occupancy/
sample-identity preservation. The 29th physical case checks the corrected next
exit and unresolved rejection. Private shader arithmetic/occupancy cost remains
unmeasured. The final immutable six-lane capture and separate image review remain
required; adaptive performance work stays paused.

Local refinement gates: 469 tests pass, 96.43% lines / 83.20% branches; all three
changed runtime modules appear in LCOV at 100%. Lint, types/clean consumer, build,
package, all nine Zero-Three gates and runtime audit pass. Canonical shader SHA256:
`baa70b7b73c807c8b1cfc18000ca22e593fb305febfe1f57242ce5cae5b609be`.
Whole-shader fingerprints are re-pinned only after the independent functional
tests pass; no behavioral check or threshold is removed. Exact-head CI and the
new native matrix are still required before physical qualification.

### Physical compilation correction

Source `5b51ea6` fails its first assembled dielectric preflight before any scene
work: `line 3050:35 value inf cannot be represented as f32`. Constant evaluation
rejects the initial infinity sentinel used for nearest-candidate distance.
Preserve that failed capture and zero-lane aggregate. Add a red regression for
the rejected construct, then initialize the best distance to finite zero: the
existing independent valid bit already selects the first valid candidate, so
selection, topology, hit thresholds and memory policy do not change. Physical
rerun on the new immutable source remains mandatory.

Finite-initializer local gates: 470 tests pass, 96.43% lines / 83.20% branches;
changed-runtime LCOV 100%, lint/types/build/package/Zero-Three/runtime audit pass.
Canonical shader SHA256:
`47431e5b839b539a367cd29cab14bd4610a844d0bb5010317f5920a0ce6e26dd`.

### Preserved native shared-diagonal rejection

The e2a0922 batch passes all 29 physical preflights and completes all three native
1080p uniform32/20-depth lanes with 66,355,200 samples each. Independently retained
HDR/PNG/hash/count/cleanup checks pass; the horizontal band remains visible.
The 4K empty-glass lane passes old tile165 but rejects tile319, pixel5178795,
sample1/bounce4, reason8: `primary-ray-count-mismatch:32768/524288`.
Receipt `room-reference-2026-10-21T09-29-40-752Z-690bdda7-0ea5-49de-8283-972ae3bae68e/failed-room-reference.json`,
SHA256 `8fbd14f9dfb8074674c10b4a026f9289c045da6834bca9949551452537b95125`.
Remaining 4K lanes do not run. This is not a complete 4K image or a success.

The [frozen original procedural geometry](rim-shared-diagonal-2026-10-21.json)
places the point strictly inside353222 across353223's internal diagonal. A red
test reproduces missing certification before implementation. The unresolved-only
bounded BVH lookup now checks exact shared-edge topology/ownership and a 24-term
integer coplanarity determinant. Search only the same original/eight neighbours;
retain the closest certified point and fail reason8 if none exists. Genuine
one-ULP creases, endpoints, disconnected/changed surfaces and malformed traversals
remain rejected. No scene epsilon, medium repair, count acceptance or new GPU
buffer/ABI/pass. The private arithmetic cost is unmeasured.

The normal automated matrix may use validated `qualificationOrder=4k-first`
during development; this reorders but does not remove any of the six required
lanes. Final immutable-source physical and image gates remain open. Adaptive
performance stays paused. An attempted independent Blender CPU supporting control
crashed without an image (exit139, exact crash point unknown); its script/log/input
are retained locally and are not reference-image evidence or a renderer fallback.

Shared-face local gates: 476 tests pass, 96.45% lines / 83.20% branches; changed
runtime shader modules are present in combined LCOV at 100%. Lint, types/clean
consumer, build, public package, all nine Zero-Three gates and runtime audit
(zero vulnerabilities) pass. Canonical assembled shader SHA256:
`998cbc8590e7c19fde02466697c549e2b83de23966330bd54b0f8a9520d34e14`.
Source-pinned CI and native/image results are still required. Shader fingerprints
are updated after independent functional tests, not substituted for those tests.

### Successful-sample diagnostic preparation

Add bounded explicit `opticalJournal=u,v,sample;…` selections to the local fixture
for mechanism analysis of count-complete uniform captures. The default has no
journal allocation/replay. Selected successful samples reuse the original compiled
camera/bounce pipelines in the retained phase, never fake a failure or commit
sample/radiance output. Reject unavailable modes/ordinals, validate selection
identity, restore diagnostic mode and destroy private buffers on failure.
Retained timings include diagnostic replay and cannot qualify performance.

Requirements-first selection tests initially fail on the absent module. Unit
selection, actual page pre-GPU rejection, canonical replay reuse, successful versus
failure-only behavior, mode restoration and cleanup pass. Full local suite:
478 tests; 96.45% lines / 83.20% branches. Lint, types/clean consumer, build,
package, all nine Zero-Three gates and runtime audit pass. No runtime shader change
or new physical/banding result is part of this diagnostic-only change. The running
immutable 665e2bd matrix continues unaffected; preserve its source identity.

The selected-success diagnostic now additionally reads original PathNodes after
surface shading/before queue swap, retaining direct/terminal radiance, termination
kind and original sample identity. It reuses existing resources and a bounded
64-byte-per-depth private tail (1,280 bytes at depth20); it does not re-evaluate
lighting. Missing/failed/non-finite/incorrect-identity records fail the diagnostic.
Original failure-only sizes/API remain unchanged. New shader/decoder/dispatch-order
requirements fail before implementation and pass afterward. Additional shared-face
tests cover108 axis/sign/cyclic/reversed-face variants without runtime changes.
Full suite481 passes,96.45% lines/83.20% branches; lint, types/clean consumer,
build/package/Zero-Three/audit pass. All59 changed executable src files relative
to the PR base appear in combined LCOV; the non-executable index.d.ts contract is
checked by typecheck/clean consumer, not reported as executable line coverage.
The running immutable full matrix and subsequent selected-ray physical execution
remain separate evidence gates. Runtime shader bytes remain unchanged.
