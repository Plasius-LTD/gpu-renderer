# Environment MIS correction and native rerun — 21 October 2026

Result: the proposal/PDF correction passes portable and assembled physical controls;
all six native captures pass independent integrity checks. **The filled-glass
horizontal band remains at both1080p and4K. Image correctness is not cleared.**
Adaptive performance and white-paper improvement claims remain paused. Task234
stays In progress and PR216 stays draft/open; no merge, release or local publication.

The [machine ledger](environment-mis-correction-2026-10-21.json) retains exact
receipt/PNG/HDR/chunk provenance, ray totals, matched before-controls and gate states.
It does not replace the original private assets or full local PNG/HDR receipts.
All previous normal/rim/selected-path controls and rejected evidence remain intact.

## Source and correction

Runtime correction: `70977ea761f43681ba003e030c56986c35763ad1`.
Capture source: `419561858b40b92d11e17cac45bec54aeba2e023` (test-input correction only;
runtime src is identical). Lighting `bac0d5c0aeda57ef29878eb2f92c60ff0775a8ce`, shared
`b68f8682735fa8bffb5179d5e11342521a2f9446`, site
`21d43a9b63722f1ce69175a5a42b53304ee79102` are unchanged.
Canonical shader SHA256:
`bc1931872d643330a6161e6e07e1b310da95ee21be4de276b63229711f5e51d4`.

The [shared proposal/class PDF](https://github.com/Plasius-LTD/gpu-renderer/blob/70977ea761f43681ba003e030c56986c35763ad1/src/wavefront-shader-lighting.js#L947)
includes actual hemisphere support, uniform/cosine mode, map importance and
light-class probability. Deterministic two-estimator sampling uses probability1;
mixed selection uses.5; an emissive-only source-stable strategy has no environment
competitor. A texture without importance data samples the texture, not procedural sky.

[Continuations](https://github.com/Plasius-LTD/gpu-renderer/blob/70977ea761f43681ba003e030c56986c35763ad1/src/wavefront-shader-kernels.js#L1037)
carry the previous surface's actual environment NEE solid-angle PDF in previously
unused `direction.w`. The 96-byte ray record, offsets, xyz direction, BSDF PDF,
camera sequence, queues, counts and persistent allocations stay unchanged. Each
rough child has its own density; primary/delta/no-competing paths remain unweighted.
Staged/fused bodies share the correction. This is not new per-frame CPU work.

[Terminal evaluation](https://github.com/Plasius-LTD/gpu-renderer/blob/70977ea761f43681ba003e030c56986c35763ad1/src/wavefront-shader-lighting.js#L972)
weights only sampled sky in strict procedural mode, retaining unsampled finite
sun glow and portal-blocked ambient fallback. Direct sky uses the same portal
scaling/gating. Explicit directional sunlight remains separate; no transparent-
shadow bypass, refracted-light connection, BSDF/IOR/collision or bounce change.
See [ADR0064](../adrs/adr-0064-previous-vertex-environment-mis.md).

## Regression and physical estimator controls

Requirements/design were recorded on Task234 before implementation. New portable
tests failed first, and the rejected sphere-versus-hemisphere scalar control is
retained: unit Lambertian means1.2252836441 (uniform) and1.3229229323 (cosine),
not room error figures. Corrected canonical functions pass matched-mean, support,
class-mixture, primary/delta/no-NEE, component, split-child and assembled contracts.

The first new native attempt stopped before rendering: its probe accidentally
authored transmission.5 on an ordinary-diffuse control, correctly producing no
competing NEE density. An assembled numerical regression reproduced the exact
zero-PDF rejection before correcting only that test input to transmission0.
Optical controls retain transmission.5. No tolerance or runtime change concealed
the rejection; the failed receipt and aggregate hashes are in the machine ledger.

All13 assembled GPU modes pass in every completed capture. They cover proposals,
class mixtures, texture importance, portal fallback and optical proposal eligibility;
this is not certification of a complete rough-optical BSDF or room integrator.
Maximum PDF/component error1.2841276653130507e-8 at frozen1e-6 tolerance;
maximum analytic sky+unsampled-source mean error3.934119149562321e-6 at frozen2e-5.
The existing heuristic's1e-6 denominator floor is retained and accounted for;
these results are not a claim of mathematically zero estimator bias everywhere.

Local validation:489 tests,96.46% line/83.27% branch coverage; all59 changed
executable src files relative to the PR base appear in combined LCOV. Lint,
types/clean packed consumer, build/package, all nine package Zero-Three checks and
runtime dependency audit (zero vulnerabilities) pass. Runtime CI39639221692 and
capture-source CI39640372238 succeeded, every job and step. Final evidence-head CI
is recorded in the delivery comment. No main/CD release gate was applicable.

## Native scene controls

Normal Playwright automation ran the actual UI's sequential qualification action,
with no permission/sandbox workaround or manual render request. All lanes use
uniform32, depth20, fixed camera/independent transport, denoise/splitting off,
bounded+nested on, rough transport off, original daylight1, unchanged camera/assets
and support clearance0.0001m. No adaptive performance comparison is run.

| Native extent | View | Camera samples | Secondary segments |
| --- | --- | ---: | ---: |
| 3840×2160 | Empty close-up | 265,420,800 | 656,133,197 |
| 3840×2160 | Filled close-up | 265,420,800 | 670,634,932 |
| 3840×2160 | Full room | 265,420,800 | 591,654,343 |
| 1920×1080 | Empty close-up | 66,355,200 | 164,062,162 |
| 1920×1080 | Filled close-up | 66,355,200 | 167,688,635 |
| 1920×1080 | Full room | 66,355,200 | 147,914,179 |

Independent verification reconstructs and hashes all120 HDR chunks and checks
31,104,000 finite/nonnegative native pixels, alpha1, exact32-SPP histograms,
995,328,000 completed camera samples, all tiles/primary and per-bounce ray totals,
transport controls, existing preflights, normal identity, new MIS/component values,
source pins and cleanup. Total path segments3,393,415,448. All six PNGs were
inspected. Controls restore; browser errors/warnings0. Local GPU inventory is
Apple M2 Max38 cores; browser reports Apple/Metal-3 non-fallback, not the chip name.

Aggregate `room-qualification-4eee5f4b-6720-45a0-ab46-af733284ffdf/summary.json`,
SHA256 `5ba6925f7760e4c88777fbfb9354a2ab7fd05815d082b357d990b89efac60c8a`,
has six lanes, no failures and status `captures-complete-image-review-pending`.
That status is deliberately not an image-accuracy certificate.

## Before/after and remaining gate

Matched d53ced3 before-controls remain unchanged and are not ground truth.
Every lane has exactly the same primary and secondary ray totals before/after.
Mean HDR luminance decreases about7.65–7.66% in close-ups and8.81% in full-room
views; this measures changed weighting, not reduced work or an accuracy score.
The bright/dark water band remains in both resolutions and the frozen band regions.
The PDF mismatch therefore was real but not the whole explanation of that band.

Still required: independent converged optical/scene reference and source-isolated
sky/sun/indirect/transmitted-light attribution, including the existing straight-
visibility/directional-sun and caustic limitations. The remaining cause must be
demonstrated before another transport correction; do not infer it from contrast
alone, relax thresholds, fill shadows or ignore glass collisions. Existing selected
histories support mechanism investigation, not full-band truth.

No new256-SPP stress, physical adaptive-disabled equivalence, other-device,
room-convergence/energy or matched-quality performance pass is inferred. Shader
private arithmetic cost and physical VRAM residency are unmeasured; unchanged
allocations are not a memory saving. Keep adaptive work/publication paused until
image correctness and banding are resolved. Three.js remains prohibited.
