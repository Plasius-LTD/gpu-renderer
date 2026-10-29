# Renderer contract corrections — 20 October 2026

Task [gpu-renderer#234](https://github.com/Plasius-LTD/gpu-renderer/issues/234),
Story site#2291, Feature site#2114. [Approved design](../design/renderer-contract-corrections.md),
[ADR 0063](../adrs/adr-0063-optical-contract-corrections.md).
This report accompanies the correction commit; it is not a release or physical
image/performance qualification. The [original review](renderer-first-principles-2026-10-20.md)
and its captures/hashes remain unchanged. Runtime source before corrections is
retained at [dabe0afab509f3d81d90585169fb4c2bb73a44d6](https://github.com/Plasius-LTD/gpu-renderer/commit/dabe0afab509f3d81d90585169fb4c2bb73a44d6).

## Requirements-first regressions

The new four-contract acceptance test failed before runtime corrections: C1,
C2, T1 and S1 were all reproduced. Frozen functions from the rejected source
remain in `tests/fixtures/rejected-renderer-contracts.js`, imported only by test/
review tooling. The frozen test still reproduces all four, while the current
canonical-WGSL numerical test accepts all four corrections. Software execution
substitutes resource lookups, not the tested geometry/optical function bodies.
It is not physical GPU compilation.

| Contract | Corrected numerical result | Additional regression |
| --- | --- | --- |
| C1 | s=1/.01/.0001 hits at t=s; grazing hit t=1 | Correct +Z normal/facing, backface, degenerate and parallel cases |
| C2 | Exact plane origin z=0 retains next interface at ~5e-7 | Translated zero-error planes retain one-ULP neighbours; sloped ±1/±10000/3.17 positions offset to the intended side |
| T1 | T=.25/.5/1 weights .106666677/.213333353/.426666707 | T=0 and tinted diffuse/reflection/transmission mixture, PDF compensation and smooth selection with rough flag off |
| S1 | Joint quadrants 16259/16263/16372/16642 over 65536 draws | Prior camera words unchanged; per-pixel/bounce/event keys; canonical slab means and frozen rejected bias |

The small-face normal test exposed a further failure during implementation:
the old normalization fallback substituted +Y for a valid tiny +Z face. Scaled
normalization corrected it before acceptance. The C2 estimate occupies the
existing successful-hit error word; invalid-hit diagnostics still distinguish
failure codes. Ordinary nested-off triangle outputs remain checked against the
independent frozen disabled oracle. Complete sample counts and sibling accounting
remain mandatory; no invalid ray, occupancy failure or overflow is accepted.

The assembled dielectric preflight now includes three more cases (26 total):
small triangle/facing/normal, nearest representable translated plane, and T=.25/
.5/1. Tests execute these canonical cases numerically and inject bad/non-finite
outputs into their physical acceptance function. Existing rim/corner/ordering
tolerances are unchanged. The corrected fixed sampler must pass the same optical
slab-mean and sampling-parity gates as the independent comparison mode.

## Local validation

- Full suite: 458 tests passed, none failed/skipped.
- Coverage: 96.42% lines, 83.20% branches. All 12 changed runtime JS files appear
  in combined LCOV, including both new shared shader/sampling helpers.
- Lint, source/type checks, clean packed consumer, ESM/CJS build and public
  package validation passed.
- All nine Zero-Three source/dependency/artifact checks passed; runtime npm audit
  reports zero vulnerabilities.
- `node scripts/review-renderer-contracts.mjs` exits zero; all four current
  defect detectors report false. The baseline characterization still rejects.
- Full shader fingerprints were deliberately updated only after the functional
  corrections passed; canonical SHA-256
  `baa9007c7ff033fcf7d6cc71bd1af9b9e4d27df4ce9405f781bb571895cfd200`.
  Fingerprints are change detectors, not evidence of physical correctness.

## Full-scene verification remains open

The room fixture now has a sequential qualification action for empty glass,
filled glass and the room entrance at both 1920×1080 and 3840×2160. Its validated
default plan uses uniform 32 SPP, 20 bounces, corrected fixed camera/transport,
denoise/splitting off and bounded+nested transport on, with 0.0001 m clearance.
Other geometry/lighting settings retain the initial session values and are
recorded in receipts; the summary records the initial controls. Defaults are
parameters of the plan, not hidden renderer constants.

Each 1080p lane must complete 66,355,200 camera samples; each 4K lane must complete
265,420,800. Missing preflight/HDR/source data, wrong histogram/counts, changed
source commits, fallback adapters, failure or missing cleanup reject the lane.
One lane runs at a time; failure/cancellation stops the sequence without retry.
Separate UUID-bound capture directories preserve all earlier receipts/images.
The aggregate status is `captures-complete-image-review-pending`, never a quality
or speed certificate. Controls are restored and the final preview is marked
stale relative to those restored settings.

This corrected physical batch has **not run**. Browser automation access was
denied during the review; no alternate control path bypass is used. No further
repeated manual capture requests form part of these corrections. The existing
c90e706 radial 1080p receipt is retained as historical evidence, not repurposed
as a current-build uniform/full-scene pass. Source provenance for its unchanged
lighting/shared/site inputs remains in the original review.

Required next evidence: assembled device execution, all six native scene lanes,
denoise-off HDR/energy/silhouette/local-error review against converged references,
empty-versus-filled band inspection, device/timeout/cleanup stability, and only
then new adaptive matched-quality timing. Additional private arithmetic may cost
GPU time; no lower memory, performance gain or eliminated room band is claimed.
The earlier review's broader guided-proposal/PDF and terminal-lighting risks
remain outside these four fixes. Task stays In Progress; no package publication,
main/CD release or white-paper success update follows from the local tests.
