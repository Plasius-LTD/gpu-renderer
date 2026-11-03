# Native host preparation experiment — 3 November 2026

This is a provisional performance investigation, not a release, sustained frame
rate or image-convergence qualification. The user accepts the existing convergence
for experiments; failed reference screens remain failed and all evidence stays.
Three.js remains permanently prohibited, including rollback.

## Implementation and method

Captured renderer: `7066b5eca6615c3f1977e0b1653c47039241880e`.
Lighting: `bac0d5c0aeda57ef29878eb2f92c60ff0775a8ce`;
shared: `b68f8682735fa8bffb5179d5e11342521a2f9446`;
site assets: `21d43a9b63722f1ce69175a5a42b53304ee79102`.
Physical adapter reports Apple/Metal3, non-fallback; Chrome156/macOS.

Use the original full filled room, Eames, sofa and astronaut:354,246 triangles,
authored textures/materials, original camera/daylight, prescribed radial
32/16/8/4/2/1 SPP,20 ordinary/2048 optical, fixed-pattern sampling, denoise and
splitting off. No geometry/material/depth/sample reduction. Two independent
renderer instances coexist; shared budget input is identified and allocation
classes are per instance. The laboratory selectors default false and are not
production rollout flags. See [the protocol](../design/native-host-performance.md).

Compare legacy per-sample packing/eager uniform map with one canonical template
per tile/lazy uniform map. Each mechanism is independently selectable and tested;
the physical screen compares both together. One warmup per strategy precedes
three alternating timing pairs, without profiling/readback instrumentation. Then
separate diagnostics retain linear HDR, native PNG, complete counts, rays, GPU
timestamps and CPU profile. Do not use diagnostic elapsed time as frame time.

The source diff changes only the internal packer and laboratory coordination;
canonical fixed dispatch and transport are unchanged. Default assembled shader
SHA256 remains `b50d988d92d0af5867fc3355cadad89ad8b1affe9c88bf051298df2c8acaf7b4`;
fixed-pattern source is `1ced104009b807c8329a4dd539643483976db3c0ab6547e79be84aef54e70a94`.

## Retained measurements

All20 full-scene jobs completed automatically: one warmup per strategy,
three alternating timing pairs and two diagnostic captures at each resolution.
Both native resolutions pass exact image/count/ray/command identity and cleanup.
Independent offline lossless reconstruction confirms the retained images.
The [machine-readable ledger](native-host-performance-2026-11-03.json) retains
all measurements, statistics, allocation classes, source and image hashes.

| Native resolution | Legacy median job | Template/lazy median job | Result |
| --- | ---: | ---: | --- |
| 1920×1080 | 66,129.2 ms | 66,321.7 ms | No meaningful gain; candidate0.29% slower |
| 3840×2160 | 193,913.3 ms | 194,304.8 ms | No meaningful gain; candidate0.20% higher median |

1080p raw legacy jobs:66,129.2/65,813.6/66,250.7 ms. Candidate:
66,321.7/66,212.9/66,337.3 ms. Three pairs are exploratory, not the approved
confidence matrix. Retain every measurement; do not select faster observations.
4K raw legacy jobs:190,101.4/194,562.7/193,913.3 ms. Candidate:
194,440.6/193,860.2/194,304.8 ms. These small median differences are not proof of
a regression either; the experiment establishes no useful whole-job speedup.

| Resolution | Eager known budget host bytes | Lazy known budget host bytes | Avoided host bytes |
| --- | ---: | ---: | ---: |
| 1080p | 18,662,400 | 10,368,000 | 8,294,400 (7.91MiB) |
| 4K | 74,649,600 | 41,472,000 | 33,177,600 (31.64MiB) |

Allocation inventory verifies identical renderer/adaptive/telemetry/staging GPU
buffers and texture descriptors. Saved host backing storage is not saved GPU
memory or physical VRAM. Lazy uniform use allocates the map on first use; this
saving applies to radial-only use. The timing variants upload the same bytes and
encode the same commands. Physical diagnostic known temporary backing allocations
at1080p decrease1,294→405; this excludes untracked JS objects/driver allocations.
At4K the count decreases4,602→1,530. Host image/asset arrays and JS/driver caches
are outside the known-budget-array component; these are not total RAM figures.

1080p lossless reconstruction verifies2,073,600 pixels/8 HDR chunks per image;
both HDR SHA256 values are
`d9bc30338fd23c4860c569b56d4c4be243e3fdfc0257e754cadce80b379cc8e5`.
All12,337,920 camera samples,19,314,442 secondary segments and31,652,362 total
segments match exactly, as do GPU command inventories. This proves A/B identity
for this workload, not convergence or absence of noise in the shared image.
Segment counters cover camera/continuation transport, including streamed optical
segments; they exclude shadow-visibility queries and BVH node/triangle tests.
An any-hit optimisation can reduce traversal work without reducing these counts.

4K reconstruction verifies8,294,400 pixels/32 chunks per image and common HDR
SHA256 `f5b481efddf66bfef3e91b27c83735de6374baf2204e0016891a7b3ddd9a6b7a`.
Both variants complete49,351,680 camera samples and126,617,035 path segments,
including2,864,734 additional optical segments. Commands and GPU resource
inventories remain identical.

The reproducible CPU-only tile workload, repeated after GPU captures finished,
has median packing times1.176→0.248 ms at1080p and3.410→0.774 ms at4K over20
alternating repetitions. These values describe canonical representative config
packing, not rendering models, GPU speed or FPS. Earlier/noisier and instrumented
coverage-only workloads remain retained; none replaces native timing evidence.

## Dominant cost and follow-on work

The1080p legacy diagnostic sums64,635.47 ms of tile GPU timestamps, compared with
15.5 ms exclusive configuration packing and154.6 ms command encoding. Host
intervals include instrumentation overhead and are not CPU utilisation or the
uninstrumented timing results. Timestamps exclude full-frame presentation and
describe the diagnostic GPU workload.

Four tiles account for45.26% of this GPU time,11.15% of path segments and96.72%
of extra optical segments. This localises a hotspot but does not establish that
all its time is optical or identify divergence/register pressure as the cause.
The existing prepared triangle allocation is204,045,696 bytes of576-byte records.
See the [measurement-led priorities](../design/native-gpu-performance-priorities.md)
and [Story2362](https://github.com/Plasius-LTD/plasius-ltd-site/issues/2362).

The next candidates are independently flagged optical workload isolation,
shadow any-hit traversal, geometry/material storage separation and material-energy
proposal sampling. They are planned Tasks, not implemented/proven improvements.
Do not lower optical limits, discard valid tails, alter physical material energy
or weaken image gates to obtain a speed result.

## Provenance, validation and limits

Raw directory under the workspace:
`output/playwright/eames-environments/room-reference-2026-11-03T09-35-52-927Z-1d4aa91a-3111-4d2e-9383-f20a68f1fedc/`.
It retains checkpoints, diagnostic receipts, lossless HDR chunks and native PNGs.
Analysis, immutable partial checkpoint, CSV/tile-cost plot and commands live in
`output/playwright/performance-resume-2026-11-03-jgK7HO/`.
Private reference assets/screenshots are local and not published by this report.

595 tests, lint, types/clean packed consumer, build, package integrity and all9
Zero-Three checks pass. Combined source-current Node and byte-identical physical
coverage is81.42% lines/90.03% branches, with the full declaration/fixture
denominator and all163 changed executable/declaration paths in LCOV.
[Exact-head CI41612236134](https://github.com/Plasius-LTD/gpu-renderer/actions/runs/41612236134)
passes for7066b5e. New documentation has its own subsequent CI requirement.

No production flags are enabled, package is published locally, main/CD release
is performed or white-paper performance improvement claimed. Release, cold-start,
local/silhouette/temporal image and full confidence-matrix gates remain open.
