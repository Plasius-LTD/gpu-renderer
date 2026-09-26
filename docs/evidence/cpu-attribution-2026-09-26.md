# CPU attribution and observer overhead — 26 September 2026

Task [gpu-renderer#169](https://github.com/Plasius-LTD/gpu-renderer/issues/169),
Story site#2119, Feature site#2114, draft PR216. Measurement implementation, not
an optimization or a release. No site activation or white-paper advancement.

## Provenance and scope

Renderer executable source
`2baca3cdc8a7b26d5445cf95b08656bcc1bc5067`; lighting
`b23af8d4c79ce23c28c5134886569b84a73c9079`. Immutable Git-object loopback server,
physical Apple / metal-3 non-fallback adapter, Codex in-app browser. Open
`tests/fixtures/adaptive-cpu-profile.html` using the existing
[pinned replay setup](https://github.com/Plasius-LTD/gpu-lighting/blob/b23af8d4c79ce23c28c5134886569b84a73c9079/docs/paired-adaptive-replay.md)
with the renderer commit above. User Timing markers off for this capture.

Two 128×128 stationary synthetic scenes, 32-SPP maximum/sequence period, four
bounces, seed 7, denoise off. Fixed32, shared reduced 2/8/32 and fused reduced;
two warmups and ten measured rounds per mode/profile setting. Mode order rotates,
profiling off/on order alternates. 24 warmup + 120 measured renders. One physical
run, no discarded frames. All on/off images/counts/ray histograms agree exactly;
shared/fused reduced images also agree. This does not repeat higher-SPP reference
convergence or supersede the existing reduced-budget quality failures.

GPU timestamps bracket compute, excluding uploads. Job time starts before budget
preparation and ends after queue completion; profile construction and facade
setup are before that boundary, snapshot construction and readbacks after it.
Reported on/off job deltas therefore measure in-job observer effects, not total
profiler API overhead. Setup, UI, image hashing, retention and presentation are
excluded. Readback elapsed spans are reported separately. Diagnostic queue copies
remain on in both controls; no telemetry-on/off comparison or CPU/GC flamegraph
was captured. The public renderer's multi-tile integration is unit-tested; this
physical fixture submits one tile once, not the site's frame loop.

## Measured host intervals

Means in milliseconds, profiling enabled. Synchronous rows use exclusive time;
do not add GPU timestamp time to the GPU-completion wait. The latter includes
GPU work and unclassified queue/browser/notification delays, not CPU busy time.

| Geometry scene stage | Fixed32 | Shared reduced | Fused reduced |
| --- | ---: | ---: | ---: |
| Synthetic budget calculation | 0.00 | 0.92 | 0.84 |
| Packed pixel-budget generation | absent | 0.70 | 0.66 |
| Configuration packing | 0.06 | 0.09 | 0.05 |
| Upload API calls | 0.01 | 0.01 | 0.06 |
| Command encoding | 0.32 | 0.38 | 0.31 |
| Finish / submit | 0.00 / 0.00 | 0.00 / 0.00 | 0.00 / 0.00 |
| GPU-completion wait (async) | 17.79 | 18.23 | 15.07 |
| Telemetry readback (post-job) | 1.08 | 1.04 | 0.69 |
| Image/count readback (post-job) | 0.41 | 0.87 | 0.59 |
| Total job | 18.20 | 20.46 | 17.14 |
| GPU timestamp interval | 12.419 | 12.203 | 10.669 |

Zero-duration API spans reflect browser clock granularity, not zero-cost calls.
Raw receipts retain mean/median/p95/min/max. For fused geometry, budget calculation
median/p95 is 0.85/0.90 ms, packing 0.65/0.80 ms, command encoding 0.30/0.40 ms,
and GPU wait 13.85/20.40 ms. The 1.50 ms budget preparation is a concrete target
in this synthetic CPU fixture; it does not establish the cost of a production
GPU importance classifier or permit extrapolating 128×128 results to 4K.

Fused geometry's measured synchronous stages total 1.92 ms. The job-minus-GPU
difference is about 6.47 ms, while the completion wait itself exceeds the GPU
interval by about 4.40 ms. These residuals are **unclassified elapsed time**,
not additional measured CPU work or proof of a driver bottleneck. A correlated
browser/GPU trace is needed to attribute them. No scheduling changes made.

## Commands and known allocation churn

Per measured frame, counts identical across scenes and profile-on repetitions:

| Counter | Fixed32 | Shared reduced | Fused reduced |
| --- | ---: | ---: | ---: |
| Compute passes | 192 | 206 | 206 |
| Direct + indirect dispatches | 448 | 462 | 334 |
| Buffer copies / logical bytes | 256 / 2,048 | 256 / 2,048 | 256 / 2,048 |
| Clears / logical bytes | 0 / 0 | 32 / 4,096 | 32 / 4,096 |
| Upload calls / bytes | 32 / 10,240 | 3 / 82,688 | 3 / 82,688 |
| Submissions | 1 | 1 | 1 |
| Known temporary buffers / bytes | 32 / 10,240 | 40 / 224,096 | 40 / 224,096 |

The adaptive fixture rebuilds two budget arrays, packed words and configuration
staging. Known bytes count explicitly recorded temporary backing stores, not
all JS objects, peak/live heap, GC or GPU residency. GPU allocation inventory is
unchanged; no memory reduction claimed. Counts are host API operations, not
physical bus transactions or CPU thread utilization. Actual primary rays remain
524,288 fixed / 144,680 reduced; geometry path segments 717,183 / 229,338.

## In-job observer effects

Signed mean profiling-on minus profiling-off job time:

| Scene | Fixed32 | Shared | Fused |
| --- | ---: | ---: | ---: |
| Environment | +0.04 ms | −0.06 ms | +0.34 ms |
| Geometry | −1.24 ms | −0.88 ms | −0.14 ms |

The negative values reflect unresolved timing variability; instrumentation is
not an optimization. This run does not precisely isolate profiler overhead or
prove it negligible. Retain all raw pairs, rerun unprofiled for performance
decisions, and do not subtract a guessed correction. No confidence/quality
threshold has been relaxed or declared passed from these diagnostic numbers.

## Validation and next targets

285 unit tests pass, 95.85% total line coverage. Changed executable source is in
LCOV: wavefront-compute 97.11%, profiler 99.23%. Types and clean packed consumer,
lint, build, package integrity and all nine Zero-Three checks pass; dependency
audit reports zero vulnerabilities. Fixed shader checksum remains unchanged.
Deterministic-clock tests cover nested/exclusive spans, failures, typed-array
byte units, native forwarding, opt-out and bounded/cleaned timing entries.
Renderer tests cover fixed command/count/upload equivalence, one/two-tile waits,
stats/readback and non-awaited operation. Physical image/count/ray identity and
144 raw timestamp intervals, six HDR hashes, five source hashes and summary
recomputation were independently verified. No physical render failure occurred.

Next: remove redundant budget rebuilding only with correct invalidation, retain
an on/off identity control, and capture real site/full-resolution CPU/GC and GPU
queue timelines before changing tile synchronization or moving work to a worker.
Exact per-tile GPU idle time, dynamic scenes, GC/whole-application costs, optional
User Timing physical capture and production-site integration remain unmeasured.
CI/review and applicable approved main/CD gates remain required; Task169 stays
In progress. Three.js remains prohibited; rollback is fixed GPU-native rendering.

[Raw JSON/HDR/query receipt and summary PNG](cpu-attribution-2026-09-26.tar.gz)
(2.5 MiB), SHA-256:
`63ff607f242565d74a04c10e75b9eee7428c3c77fdcf2f048ae8065761cdc2df`.
