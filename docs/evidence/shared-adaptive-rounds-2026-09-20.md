# Shared-round adaptive scheduler — 20 September 2026

Task [gpu-renderer#169](https://github.com/Plasius-LTD/gpu-renderer/issues/169),
Feature [site#2114](https://github.com/Plasius-LTD/plasius-ltd-site/issues/2114).
Experimental draft PR216, default off; no site integration or release.

## Outcome

The redundant serial-tier scheduling is removed in a separately selectable
internal path. Shared and legacy reduced images are bit-identical. Shared-uniform
and corrected fixed32 images are also bit-identical. The final diagnostic run
reduces diffuse-scene GPU mean from **16.528 to 13.120 ms**, and linear-output job
mean from **27.18 to 21.62 ms**, versus the old adaptive scheduler at identical
budgets. The earlier run saved 5.780 ms GPU / 7.92 ms job; the final run saves
3.408 / 5.56 ms. Both runs are retained, not pooled or selectively discarded.

**This does not establish a 10 ms saving, real-time rendering, matched-quality
adaptive gains, lower memory, or publication readiness.** Timing variance remains
high and the approved confidence gate is not met. The deliberately preassigned
low-SPP bands still fail the frozen quality limits against fixed32/reference256.
Scheduler identity is not evidence that those budgets retain fixed32 quality.

## Structural change

For the measured 128×128, 2/8/32-budget, four-bounce-ceiling fixture:

| Encoded work | Fixed32 | Legacy reduced | Shared reduced |
| --- | ---: | ---: | ---: |
| Sampling rounds | 32 | 42 | 32 |
| Compute passes including final output | 192 | 389 | 206 |
| Compute dispatches | 448 | 725 | 462 |
| Per-frame configuration/state uploads | 32 | 79 | 3 |
| Actual primary rays | 524,288 | 144,680 | 144,680 |
| Actual diffuse-scene path segments | 717,183 | 229,338 | 229,338 |

These are command-trace/source counts and GPU-active-queue measurements, not
inferred GPU invocations or width×height×SPP×maximum-depth ray estimates. The
shared full-frame command trace is unit-tested. Diagnostic timestamp query and
queue-count copies remain enabled in every measurement lane.

The old path schedules independent 2-, 8- and 32-sample tiers. The new path
compacts eligible pixels for ranges [0,2), [2,8), [8,32), so all required pixels
share absolute sample rounds. Prepare only selected roots/camera rays together;
run the unchanged bounce encoder; reduce/commit only selected complete samples
together. Batch immutable configuration uploads. No in-round CPU readback,
transport change, different seed, sample restart or reduced sequence period.
One reflection/transmission camera sample still increments the count once.

This reduces repeated full-tile work, host uploads and GPU passes. It does not
prove which individual saving contributes each millisecond. A ray's cost varies
with traversal, materials and bounces; saved primary rays cannot be converted
linearly into a promised time reduction. Submission, bookkeeping, required
transport passes and partial-queue utilization still have costs.

## Pinned experiment

Final source:
[`765f99d85ab1d5a6afb3c363c4c7b7acf19ab4a6`](https://github.com/Plasius-LTD/gpu-renderer/commit/765f99d85ab1d5a6afb3c363c4c7b7acf19ab4a6).
Lighting scenes/metrics:
[`b23af8d4c79ce23c28c5134886569b84a73c9079`](https://github.com/Plasius-LTD/gpu-lighting/commit/b23af8d4c79ce23c28c5134886569b84a73c9079),
unchanged from the premeasurement protocol at `e0f1389454b22eb8afdd0f5031e1b86ea3c8487e`.
Served immutable Git objects, physical Apple / metal-3 non-fallback adapter, local
in-app browser. Same camera, 128×128 resolution, four-bounce ceiling, seed 7,
denoise off; no motion/frame governor, history or production importance policy.
Fixed128/256 reference convergence, two warmups per mode, ten rotated rounds.

Corrected fixed shader SHA-256:
`c0a78da83cb60ed59a1bc56ead48d7e258c01ce402836d464c5b713b24c38fcb`.
Shared assembled shader SHA-256:
`c72ea75f5da72bcc06dd19f40568e431f331d6f31a1f1cc8aff298f02a147864`.
The fixed baseline includes the separately tracked branch-ownership and primary
MIS corrections; it is not released 0.2.44. No transport code changes here.

GPU interval includes compaction, validation, sampling, completion and texture
output, but excludes configuration uploads. Job time includes host preparation,
uploads and submission through queue completion. Both exclude setup, readback,
preview and canvas presentation. Hence these are not application frame times.

### Final mean times (milliseconds)

| Scene | Fixed32 GPU / job | Shared-uniform32 GPU / job | Legacy reduced GPU / job | Shared reduced GPU / job |
| --- | ---: | ---: | ---: | ---: |
| Smooth environment | 10.945 / 16.88 | 12.295 / 20.54 | 11.777 / 22.63 | 9.555 / 17.92 |
| Diffuse silhouette | 14.077 / 19.97 | 15.827 / 24.08 | 16.528 / 27.18 | 13.120 / 21.62 |

Thus shared reduced is faster on average than legacy reduced, but its diffuse
GPU mean is only 0.957 ms below fixed32 and its job mean is 1.65 ms above fixed32.
There is no achieved ten-millisecond improvement over fixed rendering. Uniform
shared still adds measurable bookkeeping cost when no samples are removed.

Final paired GPU lower-95% improvement bounds (old→new reduced): environment
6.417%, diffuse 4.134%. Required `max(5%, 2×baseline CV)` is 43.978% / 41.871%,
respectively. Both fail that advancement gate. Against fixed32, the corresponding
lower bounds are −2.299% / −11.272%. The method is one minus the upper two-sided
Student-t interval of same-round after/before ratios, not a ratio-of-means claim.
Job timing gates also fail. This is not a qualified production baseline.

Reduced RGB RMSE remains 0.00013355 / 0.08977575, versus fixed32
0.00004601 / 0.02661642. Diffuse energy drift versus reference is +1.77135%.
Same-sequence identity and all repeated image hashes pass, but reduced quality
fails RMSE/local-error limits in both scenes and the energy limit in diffuse.
No threshold was relaxed. Independent sample seeds and broader references remain
necessary; ten repeated timings are not ten independent noise observations.

## Physical safety and allocation

`adaptive-shared-safety.html` exercises 20 frames: black, emissive, metal and
small dielectric at 32 SPP, plus dielectric at 128 SPP; four modes each with an
eight-bounce ceiling. Every analytic maximum error/RMSE and both scheduler
identity errors are zero within the unchanged 1e-5 tolerance. This is not eight
interacting-bounce stress: observed paths terminate by the second segment.

At 128 SPP, glass shared reduced completes 342,056 camera samples and traces
486,230 secondary rays (828,286 total segments), identical to legacy reduced.
The completed per-pixel range is 2–128, not the number of sibling branches. Fixed
and shared-uniform each complete 2,097,152 samples. Normalized output alpha is 1
and is explicitly distinct from completed SPP in the final receipt.

All nine injected faults veto all 16,384 output pixels: stale completed count,
failed-pixel flag, uncovered budget, weighted input, skipped phase, duplicate
ordinal, pending rays, queue overflow and bad lineage. No GPU validation error
is accepted as a valid fault rejection. All owners return zero allocated bytes
on cleanup. No unexpected device loss occurred; deliberate real device-loss,
timeout, full-resolution, motion and long-path qualification remain open.

Final comparison allocations are unchanged: renderer buffers 13,002,004 bytes
(environment) / 13,005,412 (diffuse), adaptive 1,191,452, telemetry 8,256, fixture
staging 524,288. Recorded textures account for 459,396 nominal texel bytes. The
eight-bounce safety lane uses larger renderer/telemetry buffers, all separately
inventoried; 128-SPP adaptive capacity is 1,216,028 bytes. Fault injection adds a
separately disclosed four-byte fixture buffer only where required.

The shared comparison retains old sample/configuration scratch to run both
schedulers. It preallocates the base renderer for reference256 and allocates
adaptive resources even for fixed-control measurements. It therefore establishes
neither minimum fixed32 memory nor public disabled-path allocation equivalence.
These are application-visible allocations/nominal texels, not physical VRAM;
driver padding, query-set storage, canvas backing and residency are not measured.
No buffer shrinks merely because fewer rays run.

## Retained evidence and verification

[Unmodified receipts, linear RGBA arrays and previews](shared-adaptive-rounds-2026-09-20.tar.gz),
SHA-256 `83c08c96ce5a1e074b164badc5c5435944fa606e2b66eff2ff1dd1fa2ce7b475`.
Twelve files from three captures:

- `14-10-48-408Z`, renderer `33427bd44ceb113f0b78bf343b907c9fc8c78c05`:
  first successful two-scene comparison. GPU old→shared reduced means 11.751→9.732
  ms environment and 18.881→13.101 ms diffuse. Identity passes; timing-confidence
  and reduced-quality gates fail. No pooling with final run.
- `14-20-11-528Z`, renderer `11a3657df2dcadfe3bc29e26ba5f74b519f922f9`:
  first successful safety capture. The reused analytic checker labels normalized
  alpha as `actualCountMin/Max: 1`; those fields are **not SPP evidence**. Corrected
  naming and explicit real completed counts were recaptured below.
- `14-21-21-490Z`, renderer `765f99d…`: final safety and paired comparison above.
  Physical shader/runtime are unchanged from the preceding safety capture;
  fixture count reporting is corrected. Twenty analytic frames and nine faults
  pass; two paired scenes each retain forty timed frames and eight warmups.

The [initial rejected capture summary](shared-adaptive-rejected-2026-09-20.json)
retains the writable-storage/indirect binding conflict discovered physically at
`765c7c6…`. It produced no timed frames. Separate binding layouts fixed it, with
a failure-first regression test; no checks were bypassed.

Independent readback verification recalculated all 200 paired frame timestamp
spans (warmups/references included), observed primary counts, twenty stored image
hashes, reduced HDR metrics and old/new paired intervals across both captures.
All spans are positive, monotonic and within their job duration. Final safety
counts, zero-error identities and all fault vetoes were checked separately.
Per-scene uploads retain their original outer `running` status; final browser
receipts report `measured`, two complete scenes and no failures. `Measured` means
capture completed, not that quality/performance gates passed.

Reproduce with the [pinned loopback replay setup](https://github.com/Plasius-LTD/gpu-lighting/blob/b23af8d4c79ce23c28c5134886569b84a73c9079/docs/paired-adaptive-replay.md),
using the final renderer/lighting commits above. Open
`tests/fixtures/adaptive-shared.html` for paired timing or
`tests/fixtures/adaptive-shared-safety.html` for safety. Keep failed attempts,
hashes, warmups, every timed round and original pixels. Do not substitute mutable
worktree source, old shader hashes or wall-clock time for GPU query evidence.

## Local checks and remaining delivery

273 unit tests pass; 95.81% overall line coverage (78.39% branches). All changed
executable source files are in LCOV. New shared host runtime/reflection/constants
have 100% host coverage; shader string coverage is not GPU branch coverage.
Lint, typecheck, clean packed consumer, ESM/CJS build, public package integrity
and all nine package Zero-Three checks pass locally. No dependency change;
the full dependency audit reports zero vulnerabilities.
Review/post-push CI and any applicable approved main/CD gates remain required.

Next: qualify material/edge-protective importance budgets; profile residual
dispatch and partial-queue overhead separately; stable fixed32/noise recapture;
larger scenes/resolutions, independent seeds and the approved matrix; public
renderer/shared/site integration and independently flagged mechanisms. Default
rollback remains fixed GPU-native rendering. Three.js is permanently prohibited.
The canonical white paper and public performance claims remain unchanged.
