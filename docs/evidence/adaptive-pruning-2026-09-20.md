# Early pruning and transient-hit traffic — 20 September 2026

Task [gpu-renderer#169](https://github.com/Plasius-LTD/gpu-renderer/issues/169),
Feature [site#2114](https://github.com/Plasius-LTD/plasius-ltd-site/issues/2114),
experimental PR216. No public/site/release activation.

## Findings and changes

The renderer has tile-bounded, reusable 96-byte RayRecord queues and 64-byte
branch-owned PathNodes. These are transient working storage, not a cache of
previous-frame rays or radiance. Queue promotion changes ping-pong bindings; it
does not copy the entire ray queue. Two avoidable costs were identified:

1. Intersection writes a shader HitRecord (240 bytes; host capacity budgeted at
   256 bytes/ray), then shading reads it and loads the RayRecord again. The new
   `fusedHits` variant passes that hit directly to canonical shading within one
   invocation. Reflection confirms the executed fused entry does not reference
   the global hits binding. This removes a scratch dependency and one dispatch
   per encoded bounce, not a material calculation or a required ray.
2. The existing argument writer clamps empty queues to one workgroup. The
   `zeroEmptyDispatch` variant allows zero groups. Necessary queue promotion and
   encoded bounce commands remain, but dead queues launch no intersection/shading
   invocations. No CPU round-trip is added to discover empty queues.

Both are independent, internal/default-off options. Intersection and shading
bodies are single-sourced; the fixed assembled WGSL hash is unchanged. Samples,
BSDF/PDF/MIS, energy transport, offsets, medium state, path ownership, sibling
counts and termination rules are not intentionally changed. No ray/radiance
reuse across samples or frames, new classifier, or adaptive importance policy.

For shared 2/8/32 at a four-bounce ceiling, fused/combined dispatches are 334
versus 462 for ordinary shared (one rather than two transport dispatches per
bounce). Compute passes remain 206, sample rounds 32, and uploads 3. Zero-only
does not reduce encoded dispatch/pass counts. These are command-structure facts,
not GPU hardware counters or a claim that all empty-command overhead disappears.

## Controls and provenance

Renderer executable capture commit
[`31e8fa0102fe3272cf00b38ce490cad2a8a1a0b2`](https://github.com/Plasius-LTD/gpu-renderer/commit/31e8fa0102fe3272cf00b38ce490cad2a8a1a0b2).
Lighting source `b23af8d4c79ce23c28c5134886569b84a73c9079`, using scenes/metrics
unchanged from the previously frozen `e0f1389454b22eb8afdd0f5031e1b86ea3c8487e`
[protocol](https://github.com/Plasius-LTD/gpu-lighting/blob/b23af8d4c79ce23c28c5134886569b84a73c9079/docs/paired-adaptive-probe.md).
Immutable Git-object serving, physical Apple / metal-3 non-fallback adapter,
local in-app browser. One measured device/runtime, not cross-device evidence.

Same 128×128 stationary-camera scenes, seed 7, four-bounce ceiling, 32-SPP sequence
period, preassigned 2/8/32 budgets. Denoise, motion governors, temporal reuse and
production importance controllers absent. Fixed128/256 reference convergence;
two warmups per mode then ten rotated rounds of fixed32, ordinary shared reduced,
zero-only, fused-only and combined. All variants compiled during excluded setup.

Fixed shader SHA-256:
`c0a78da83cb60ed59a1bc56ead48d7e258c01ce402836d464c5b713b24c38fcb`.
Zero-only: `8e1e28f4d4defa4c91792794b14f142e5dbd8fbff9986c80c594c5b0e3a80d37`.
Fused-only: `1d84855cc43d73ca1d42e64723feca75a8a5d047443a67d7f735217e452edd1a`.
Combined: `bdf19969d60e764a22cfa488f81689789ae7bcd73f2d6d82d360974e9aba03e6`.
This fixed baseline contains the separately tracked transport corrections, not
the older released shader; their review/qualification gates remain open.

GPU timing brackets compute work including compaction, validation, transport,
commit/resolve and texture output. Configuration uploads are outside GPU spans
but within job time (host preparation through queue completion). Setup, readback,
preview and canvas presentation are excluded. Diagnostic queue counter copies
remain enabled. Job time is not full application frame time.

## Measured results

Means in milliseconds; compare within this capture, not across previous sessions.

| Mode | Environment GPU / job | Geometry GPU / job |
| --- | ---: | ---: |
| Corrected fixed32 | 12.163 / 17.71 | 14.398 / 20.48 |
| Ordinary shared reduced | 10.512 / 19.02 | 11.954 / 20.40 |
| Zero-empty only | 8.631 / 17.08 | 12.144 / 20.52 |
| Immediate-hit only | 8.743 / 15.20 | 9.667 / 16.58 |
| Both | 8.297 / 15.24 | 10.269 / 17.11 |

Immediate-hit geometry means save 2.287 ms GPU and 3.82 ms job versus ordinary
shared, without fewer actual rays or changed pixels. Zero-only does not improve
the geometry mean in this capture. Combining both is not uniformly fastest.
This supports keeping independent controls and investigating workload/compiler
effects; it does not establish a hardware cache-bandwidth or register-pressure
root cause. No hardware bandwidth/cache-hit/occupancy counters were measured.

All variants match ordinary shared RGB **bit-for-bit**, with unchanged completed
counts and bounce histograms. Actual primary rays remain 144,680 versus fixed32's
524,288. Environment segments remain 144,680 and geometry segments 229,338
([144680,84658,0,0]), versus fixed geometry's 717,183. Ray telemetry counts active
wavefront paths, not every internal BVH or shadow-visibility test.

The deliberately preassigned low budgets still fail the frozen quality gates:
environment RMSE/local error and geometry RMSE/local error/energy. Geometry RGB
RMSE remains 0.08977575 versus fixed32 0.02661642; energy drift versus reference
is +1.77135%. Faster unchanged adaptive noise is not a matched-quality success.
These timings do not qualify real-time full-resolution/site rendering.

### Confidence gate

The same required lower-95% improvement bound remains
`max(5%, 2 × baseline coefficient of variation)`. Baseline here is ordinary shared,
not rejected historical schema-1 evidence. Required GPU improvement is 50.451%
(environment) / 37.670% (geometry). Observed lower bounds:

| Variant | Environment | Geometry |
| --- | ---: | ---: |
| Zero-empty | +7.622% | −16.497% |
| Immediate-hit | −0.668% | +5.071% |
| Both | +4.731% | −4.818% |

All fail the approved advancement gate; job-time gates also fail. The paired
method uses a Student-t interval on same-round after/before ratios. High timing
variance is retained, no samples discarded, no tolerances relaxed and no result
selected as universally optimal. Repeated deterministic frames are not independent
sampling-error realizations. Full-resolution stable-baseline and multi-seed work
remain necessary before publishing performance claims.

## Safety and memory

Thirty additional physical frames cover black, emissive, metal and small glass
at 32 SPP plus glass at 128 SPP, each at an eight-bounce ceiling: fixed, combined
uniform, ordinary reduced, zero-only reduced, fused-only reduced and combined
reduced. Analytic maximum errors/RMSE are zero, all scheduler identities pass,
and corresponding bounce histograms/counts agree. The simple scenes do not
exercise eight actual material interactions or full material-texture coverage.

Nine combined-path fault cases veto all 16,384 pixels: stale count, failed-pixel
flag, uncovered budget, weighted input, skipped phase, duplicate ordinal, pending
rays, overflow and bad lineage. No WebGPU validation failure is accepted as a
successful veto. All adaptive owners return zero retained bytes on cleanup; no
unexpected device loss occurred. Real device-loss, timeout, dynamic-scene, broad
texture/material and large-resolution qualification remain open.

No GPU buffers are added or shrunk. Comparison allocations remain renderer
13,002,004 / 13,005,412 bytes, adaptive 1,191,452, telemetry 8,256, fixture staging
524,288, plus the recorded textures (459,396 nominal texel bytes). Safety lanes
record their larger eight-bounce/128-SPP capacities separately. Scratch stays
allocated to permit same-run controls; this is not lower allocated memory.

Eliminated source-level record writes/reads are not exact memory-bus bytes: the
compiler may remove unused fields or spill temporaries, and device caches affect
traffic. These inventories are application-visible allocations, not VRAM
residency, and exclude driver padding/query-set storage/canvas backing. No
additional history cache or classification allocation exists in this experiment.

## Evidence, replay and checks

[Raw receipts, HDR arrays and previews](adaptive-pruning-2026-09-20.tar.gz),
SHA-256 `fd4ecd3792bdf2406e8c0d61f4ac8f6c8d099038011c7d0b1d7834007fb23d28`.
Six files in `paired-adaptive-2026-09-20T14-39-31-486Z`: two per-scene JSON/PNG
pairs and the final full receipt/summary PNG. Per-scene receipts retain their
original `running` status; the final receipt is `measured`, with two complete
scenes, five safety cases, nine faults and no failures. This means the experiment
completed, not that confidence/quality gates passed. There were no rejected
physical attempts for this source revision.

Independent verification recalculated 124 raw timestamp spans including
warmups/references, twelve stored image hashes, HDR errors and paired intervals.
All spans are positive, monotonic and within job durations; observed primary
counts agree. Thirty analytic frames' completed-count ranges and corresponding
ray histograms agree, and all nine fault vetoes pass. No timing data from the
preceding shared-round captures is pooled into this report.

Use the [pinned replay setup](https://github.com/Plasius-LTD/gpu-lighting/blob/b23af8d4c79ce23c28c5134886569b84a73c9079/docs/paired-adaptive-replay.md)
with the renderer/lighting commits above and open
`tests/fixtures/adaptive-pruning.html`. Click Measure pruning variants. Retain
all source hashes, original arrays, raw query pairs, failures and timing rounds.
The existing local capture bridge confines evidence to its output directory.

279 tests pass; overall line coverage 95.83%, branches 78.51%. New variant host
module has 100% coverage; shared encoder 98.85%; canonical shader module 100%
string execution. All changed executable source is in LCOV. Shader string
coverage is not shader branch coverage. Lint, types/clean packed consumer,
ESM/CJS build, package integrity and all nine Zero-Three checks pass locally.
No dependencies changed; the full dependency audit reports zero vulnerabilities.
Post-push CI/review and applicable main/CD gates remain
required; no release attempted. README, CHANGELOG, design, ADR0041 and the
internal publication ledger are updated, not the public white paper.

Next scope: protect material/edge/noise-sensitive budgets, measure residual
command/queue and path-state costs at larger workloads, and qualify full-scene
fixed32/reference quality. Do not remove required traversal, material bounces or
sample completeness merely to approach a timing target. Three.js is prohibited;
the rollback remains fixed GPU-native rendering.
