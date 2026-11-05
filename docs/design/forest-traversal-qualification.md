# Closest-hit traversal qualification — 2026-11-05

Local release-candidate evidence for site Story2482 / renderer Task292. Public deployment is a separate remaining gate.

Baseline: public renderer0.2.61, exact source `2094047610d6ea4a3bd424a2dd4becd45ebfbdb9`. Candidate: near-first TLAS ordering and cached TLAS/BLAS inverse directions, with canonical BLAS ordering and unchanged triangle reconstruction. Apple / Metal 3 through real WebGPU. Public shared1.9.0 and viewer0.6.0 supply the unchanged forest/model assets.

## Fixed-quality results

GPU-completed wall time, warmed alternating baseline/candidate order. Forest and synthetic scenes use 800×500, 1 SPP, six bounces and denoise; Product Studio uses 640×360, 128 SPP and two bounces. Every passing run compares full displayed RGBA and linear HDR frames at the initial pose and after every timed camera change. Quality and optical tolerances are unchanged.

| Scene | Pairs | Baseline median ms | Candidate median ms | Time reduction |
| --- | ---: | ---: | ---: | ---: |
| forest 10000 / bounded / 1 SPP | 20 | 369.80 | 274.35 | 25.8% |
| forest 1000 / bounded / 1 SPP | 12 | 308.15 | 262.20 | 14.9% |
| synthetic 1 / bounded / 1 SPP | 10 | 18.65 | 18.40 | 1.3% |
| synthetic 1 / visible-grid / 1 SPP | 10 | 18.60 | 19.00 | -2.2% |
| synthetic 1000 / bounded / 1 SPP | 10 | 22.55 | 22.40 | 0.7% |
| synthetic 1000 / visible-grid / 1 SPP | 10 | 43.15 | 35.35 | 18.1% |
| synthetic 10000 / bounded / 1 SPP | 10 | 23.25 | 23.75 | -2.2% |
| synthetic 10000 / visible-grid / 1 SPP | 10 | 49.80 | 32.50 | 34.7% |
| synthetic 100000 / bounded / 1 SPP | 10 | 23.70 | 20.90 | 11.8% |
| synthetic 100000 / visible-grid / 1 SPP | 10 | 78.40 | 35.85 | 54.3% |
| synthetic 1000000 / bounded / 1 SPP | 10 | 34.35 | 21.10 | 38.6% |
| synthetic 1000000 / visible-grid / 1 SPP | 10 | 131.35 | 34.10 | 74.0% |
| gpu-build 3 / bounded / 1 SPP | 3 | 21.00 | 20.90 | 0.5% |
| gpu-build 5 / bounded / 1 SPP | 3 | 18.70 | 18.80 | -0.5% |
| gpu-build 11 / bounded / 1 SPP | 3 | 19.80 | 24.60 | -24.2% |
| studio 1 / denoised / 128 SPP | 2 | 4156.65 | 4134.95 | 0.5% |
| studio 1 / raw / 128 SPP | 2 | 4144.85 | 4127.20 | 0.4% |
| model 1 / bronze_whale_statue / 1 SPP | 6 | 38.55 | 37.75 | 2.1% |
| gpu-build 11 / bounded / 1 SPP | 24 | 20.80 | 20.50 | 1.4% |
| model 1 / bronze_whale_statue / 64 SPP | 2 | 2236.35 | 2231.10 | 0.2% |

All 20 completed passing candidate runs have exact image/HDR identity (177 moving-frame comparisons), finite HDR values, no uncaptured GPU errors, zero tracked allocated bytes after disposal and a destroyed owned device. Tracked allocation sizes are unchanged; driver memory/register usage is not exposed by these counters.

The 24-pair repeat resolves a noisy three-pair GPU-build/11 timing sample: 20.8 ms baseline versus 20.5 ms candidate. Small-scene differences are sub-millisecond in the larger samples; the forest10000 result is 369.8 → 274.35 ms (25.8% less time). The dense synthetic million-instance result is 131.35 → 34.1 ms. This does not qualify the real forest at 24 FPS: its fixed-quality frame still exceeds the 41.7 ms target.

Full Product Studio references retain 29,491,200 primary rays each; 64-SPP model references accumulate sixteen four-SPP batches, totaling 25,600,000 observed primary rays per reference. This follows the released model runtime’s progressive capacity rather than claiming a single 64-SPP dispatch.

## Rejected candidates and retained failures

- Deferred triangle shading reconstruction: CPU hit equivalence passed, physical first-frame output changed 156 colour channels, max 19/255. Excluded.
- Combined near-first TLAS/BLAS ordering: initial images matched, but a later moving forest pose changed one displayed channel by 1/255 and three HDR channels (max 0.00103759765625). BLAS-only ordering reproduces it; baseline-vs-baseline passes all twelve poses. The low-level numeric cause is not proven. Excluded.
- Conservative bound expansion: failed later moving-frame equivalence. Excluded; no tolerance was widened.
- Harness-only failures retained in raw receipts: missing mock-device disposal method; evidence filename sanitizer rejecting an underscore; treating the progressive model’s four-SPP capacity as a single 64-SPP dispatch. Each was corrected without renderer or gate changes, and the corresponding required checks passed.
- The optional MosquitoInAmber scene-composition attempt stopped at the existing 128 MiB decoded-texture admission limit before GPU creation. It is not qualified by this delivery. Renderer259 optical/UHD holds remain open; no new UHD or physical-touch claim.

## Package validation

505 unit tests pass; 95.98% combined line coverage, with both changed shader source files present at 100% in LCOV. Actual-WGSL red-first tests demonstrate reciprocal calls reduced from 93 to 3 for a layered ray and BLAS visits reduced from 64 to 1 in the TLAS occlusion case. Strict limits, degenerate/parallel/edge rays, exact ties, GPU heap layouts, mirrored/nonuniform instances and seeded varied rays retain complete canonical candidate records. Lint, type checks (including clean packed consumer), build, public-package admission, runtime audit (zero vulnerabilities) and Zero-Three gates pass.

## Evidence and release boundaries

The evidence bundle is `output/forest-optimization-2026-11-05`: raw `comparison-receipts.ndjson`, per-run `qualification-summary.json`, complete HDR `.f32` captures and hashes, `model-64-comparison.png`, test logs and the reproducible qualification harness including rejected variants. The fixture imports installed registry packages for the baseline and a separately built candidate; it does not edit installed package files. Diagnostic readbacks occur outside timed frame work.

Approved renderer CI/CD and public artifact verification, site adoption with its own gates, and actual production qualification remain required before closing the Story or Tasks. No dependency refresh, rollout control, pipeline or unrelated hold is changed.
