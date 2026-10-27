# Optical roulette, branch importance and finite tails — 27 October 2026

Status: **image correctness fails; adaptive work remains paused.** This is a
partial transport-variance correction and a traced remaining depth limitation,
not a claim that water banding, native convergence or performance is solved.
Task234 remains In progress; PR216 remains draft/open. No merge/release or local
package publication is performed. All historical failures/references are retained.

## Controlled corrections

The original32-event journals at d97578d preserve all four uninstrumented HDR
hashes exactly. At pixel90374, four of the first eight empty-furnace paths die
in roulette on event3 (glass-bottom entry); surviving paths amplify the .75
source to ~1.74. None of those eight reaches the event limit. These are selected
histories, not an estimated whole-image roulette rate or proof of asymptotic bias.

016e8c1 restricts cumulative, outgoing-IOR-compensated roulette to smooth bounded+
nested optical events. Survival can reach1; reciprocal survival compensation,
absorption and actual radiance weights remain intact. Ordinary/rough/split or
non-nested policies are pinned. No new allocation, pass, queue or ABI is added.

70e02d7 separately removes reversible relative-IOR scaling from bounded nested
transmission *selection importance*. Actual transmission still contains eta
squared and divides by its selected PDF. White lossless interfaces now select
Fresnel reflection on entry and exit; tint/transmission loss and TIR remain
represented. This is an importance-sampling change, not added light or a
different optical BSDF. See [ADR0065](../adrs/adr-0065-optical-roulette.md).

Red canonical numerical regressions preceded both corrections. Reversing only
these intentional changes reconstructs the exact preceding canonical shader
hash `bc1931872d643330a6161e6e07e1b310da95ee21be4de276b63229711f5e51d4`.
The corrected assembled shader hash is
`c276c550b87b16f800f6e4953446b7d1ccc57db95f2281ba5bcd8e88f01844a2`.
The rejected original correlated pattern **and its original estimator** remain
frozen in tests; improved branch importance does not certify that old evidence.

The assembled physical slab probe uses the production selector, weights,
roulette helper and GPU sample dimensions. For incidence cosines1/.5/.1 its
maximum escaped-path weight error is1.19209290e-7 (required<=1e-4); maximum
finite-horizon mean error is1.22940158e-5 (unchanged tolerance.015). All three
pass. Two of65,536 grazing paths still hit the independent19-event probe horizon;
that explicit truncation is not relabelled as roulette or missing samples.

## Retained furnace failures

Same512×288 diagnostic extent, uniform256, original camera/package geometry,
.75 source, bounded+nested on, rough/denoise/splitting off. These are optical
diagnostics, **not1080p/4K or real-time performance evidence**. Frozen acceptance
remains mean error<=2% and worst central row<=5%, with exact counts, finite HDR,
source/chunk hashes and cleanup. A contrast pedestal is attribution, not furnace.

|32-event control | Original | Roulette only | Roulette + branch importance |
|---|---:|---:|---:|
| Filled worst-row error |3.992%|1.203%|1.208% — pass|
| Empty worst-row error |8.040%|6.811%|6.531% — **fail**|
| Index-one worst-row error |7.905%|6.810%|6.531% — **fail**|

The combined20-event controls also fail empty/index-one at6.531%; filled passes
at1.270%. Every lane completes37,748,736 camera samples. Five four-lane batches
retain754,974,720 samples, including the unchanged original journal control.
Read-only verification reconstructs all HDR chunks and preserves nonzero failure
exits. No failed20/32 control is promoted to a baseline or hidden by averaging.

## Remaining localized darkening: actual optical tails

Targeted original samples32/59/88/127/129/159/165/239 at pixel90374 all reach
`MAX_DEPTH_STRICT` at event20, with zero terminal radiance. They are not roulette,
absorption, invalid intersections, unmatched media or incomplete camera samples.
After a glass-bottom Fresnel reflection they remain in glass and repeatedly
undergo total internal reflection between the4mm inner/outer walls.

For sample32, events5–20 retain throughput.444444537 and glass medium2, with
reflection PDF1 on the wall crossings. Direction.y stays.821726322. The ray
ascends from y=-.679725409 to-.591579795, about6mm per crossing; the rim is
near y=-.514084024. At the cutoff it genuinely has not escaped. This demonstrates
why simply suppressing roulette or raising20 to32 cannot clear this row.

The corrected empty furnace's worst row has mean.701019334 against.75. Its
deficit corresponds to535/8192 unit-weight samples (within float roundoff).
All3,552 central pixels lie within2.04e-5 of integer escaped-sample counts after
scaling radiance by256/.75. This supports finite-horizon loss, not a remaining
brightness normalization correction. It does not claim that every room-band
pixel has been independently attributed. The separately retained Cycles64
constant-radiance reference remains the convergence comparison, not a fallback.

No optical event is silently made free or ignored. A separately bounded optical
continuation budget needs explicit design/admission/accounting and regression
qualification; this change does not silently alter the existing20/32 limits or
introduce an unbounded loop. The broad pedestal-reflection region also remains
physically present in independent controls; deleting it is not a valid correction.

## Native recapture and delivery gate

The automated six-lane uniform32/event20 native sequence is running on clean
70e02d7:4K then1080p, empty glass / filled glass / full room. Same354,246-triangle
filled scene, unchanged assets/camera/lighting/flags, no denoise or ray splitting.
The first4K-empty lane independently verifies8,294,400 pixels,265,420,800 camera
samples,32 HDR chunks,510 tiles and all physical preflights. Remaining lanes are
pending; there is **no six-lane completion or band-removal claim** at this point.
Native captures retain provenance, raw linear HDR and PNGs under
`output/playwright/eames-environments/`; private models are not committed.

504 tests pass;96.41% line/83.30% branch coverage. All59 changed executable src
files versus the PR base occur in combined LCOV. Lint, types/clean packed consumer,
build/package checks, package Zero-Three and runtime audit (zero vulnerabilities)
pass. CI40523484281 at exact head70e02d7 succeeds with every job/step successful;
roulette-only CI40522150765 also succeeds. These code gates do not override the
failed image gates. Adaptive performance and white-paper improvement claims
remain paused; no applicable main/CD release was attempted.
