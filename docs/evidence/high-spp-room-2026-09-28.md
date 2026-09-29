# Configurable high-SPP room reference — 2026-09-28

Renderer Task #223, lighting Task #104; site Epic #2113 / Feature #2114 /
Story #2256. One physical 4K quality-reference capture, not convergence,
matched-quality performance, material conformance or real-time qualification.

## Configuration and provenance

Native 3840×2160, six bounces, stable sampler, rough splitting at the first two
bounces, same-input guided denoising. Original room, Eames and two supplied
material models: 352,710 triangles. Camera, 52-degree vertical FOV, placements,
1.5 m uniformly scaled seating and materials exactly match the previous capture.
No source models or private captures are published by this document.

SPP is now a validated integer variable (1–256), not a two-preset whitelist.
Tiers derive as max(1, ceil(ceiling / 2^bandIndex)). The existing circular areas
stay 5/10/15/20/25/25%. This requested ceiling gives 256/128/64/32/16/8 SPP,
47.6 mean, with every pixel receiving exactly eight times its previous budget.
The whole image is **not** 256 SPP. Uint16 host budgets prevent 256 wrapping to
zero; default 32 uses the existing Uint8 representation.

Immutable physical source snapshots:

- Renderer: `f71f11c9c0216e62dc4963e7904c700dd2cc83c4`.
- Lighting: `03b6b3b289d442676d39797bd7e324f8a7c109df`.
- Shared: `861005966d3af7dea4613130ae8b96310ec09ead`.
- Site assets: `21d43a9b63722f1ce69175a5a42b53304ee79102`.

Retained local folder under `output/playwright/eames-environments/`:
`room-reference-2026-09-28T20-19-41-031Z-76323bf8-ff82-4cd7-b1b4-e97f9bc8dd7f`.
Native raw/cleaned PNG, linear float HDR chunks and full JSON receipt use stem
`room-eames-3840x2160-stable-pattern-6-bounces-split2-spp256`.
Previous 32-ceiling folder:
`room-reference-2026-09-28T19-57-32-011Z-db4cc265-d4c3-4dbe-976c-ddb82db8c1a0`.

Local `output/verify-high-spp.mjs` independently verifies source/scene identity,
settings, all HDR chunk hashes, finite nonnegative RGB, alpha=1, native PNG
dimensions, histogram, total samples and cleanup. Results are retained in
`output/high-spp-verification.json`; approved access is required for reproduction.

- Raw HDR SHA256: `5a045d7181f4910ca7419528efc647579249774b0a695870bf06c618bee28474`.
- Filtered HDR SHA256: `a17aeb003666b7294b653ad44eaf57ccd86aa1fa481d87fb200a160318b66a9a`.
- Cleaned PNG SHA256: `bb44addd70db91164283f463d7934d9ae8fe48f31f14e89a276b66ae6950d5a8`.

## Physical result

All 510 tiles completed on the physical Apple / metal-3 non-fallback adapter.
Every pixel's completed/requested count matched; overflow/failure checks passed.
Camera samples: 394,813,440 (previously 49,351,680). Actual distribution:

GPU queue telemetry independently counted 394,813,440 primary rays and
2,096,437,428 secondary rays, totalling 2,491,250,868 path segments. The page
was visible at both recorded endpoints.

| SPP | Pixels |
| ---: | ---: |
| 256 | 414,720 |
| 128 | 829,440 |
| 64 | 1,244,160 |
| 32 | 1,658,880 |
| 16 | 2,073,600 |
| 8 | 2,073,600 |

Diagnostic GPU tile intervals summed to **431.411 seconds**; render job including
diagnostic readback was **447.960 seconds** (7 min 28 s), excluding setup and
artifact retention. This is not a production frame-time benchmark. The existing
guided filter plus tone-map median was 15.925 ms over five same-input rounds.
Earlier 32-ceiling values were 54.458 s GPU, 57.808 s diagnostic job and 22.807 ms
filter. Separate single captures do not establish a filter speedup or variance.

Renderer buffer allocations increased 297,484,612 → 355,975,492 bytes; adaptive
buffers 34,304,284 → 34,361,628; cached host budgets 74,649,600 → 82,944,000.
The guided allocation remains 165,889,024 bytes; texture inventory is retained.
SPP-dependent configuration storage grows; queues remain tile-bounded. These
are application-visible allocations, not exact physical VRAM residency.

Visual inspection: the raw image has finer, less conspicuous grain than the
32-ceiling reference, notably in the outer surfaces. Fine grain remains;
material fidelity and convergence are not proven by this screenshot. The
denoiser's sample-count-sensitive filtering means more SPP does not necessarily
produce a smoother filtered patch: it can retain more high-frequency detail.
In the same cloth patch used for prior evidence (x750/y820, 350×80), raw
neighbour-difference RMS fell 0.06414 → 0.03108; filtered RMS rose 0.01121 →
0.02139. These values include texture/shading detail and are **not** error
against converged truth. Full sheen-layer response and texture minification
remain separate work; this capture changes no material transport or filter.

## Validation and delivery

New tests failed before implementation. Renderer: 348 passing tests, 96.15%
line coverage, changed tile planner 100% and included in LCOV. Lighting: 167
passing tests, 81.04% line coverage, both changed reference-policy files 100%
lines and in LCOV. Lint, types/syntax, build, package/privacy, zero-Three and
production dependency audit gates pass. No new dependencies or active flags.

Physical cloth/denoise, UV0/UV1, sidedness/normal probes pass before capture.
No accepted-frame validation error, invalid HDR or cleanup failure. Browser QA
used ordinary controls: arbitrary 127 ceiling, invalid 257 rejection, reset,
4K/256 capture, busy locking and raw/clean reversal. No horizontal overflow at
the existing 1713×1492 viewport; controls readable, image aspect preserved and
save link present. Narrow-screen layout and cancellation were not re-exercised
in this single long capture. The result tab/server remain available locally.

Post-push implementation CI:

- https://github.com/Plasius-LTD/gpu-renderer/actions/runs/36478268664
- https://github.com/Plasius-LTD/gpu-lighting/actions/runs/36478461958

README, Unreleased CHANGELOG and linked design updated in both repositories.
Draft PRs renderer #216 and lighting #99 retain review/release obligations.
No main merge, CD, package publication, white-paper advancement or production
activation. Rollback selects the default ceiling or disables GPU-native
adaptation; Three.js remains prohibited without exception.
