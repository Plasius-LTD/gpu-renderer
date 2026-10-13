# Glass lower-band depth isolation — preliminary, not qualified

Epic site#2113 / Feature site#2114 / Story site#2291; Tasks renderer#233/#234,
lighting#105. Default-off Feature/transport controls remain unchanged; Three.js
is prohibited. Private scene images and assets remain local, not published here.

## Source-bound physical observations

Renderer `1c2b393c584055a0ff988eb0803639943ece3e61`, lighting
`7df395306b41a731fa3b3f9f8d02668d9343ab39`, shared
`b68f8682735fa8bffb5179d5e11342521a2f9446`, site asset revision
`21d43a9b63722f1ce69175a5a42b53304ee79102`. User-operated captures, Apple physical
adapter, 1920×1080, fixed-pattern sampler, radial 32 ceiling (5.95 average SPP),
no denoise or rough splitting, bounded branching + nested media on, rough optical
transport off. Filled glass, fill 0.55, original daylight, identical camera/assets.
The records agree on all scene, lighting, material, transport, budget, seed and
camera settings; the compared variable is maximum depth 6 versus 8.

Both completed 12,337,920 camera samples with identical histograms and no reported
validation/failure or cleanup error. All eight HDR chunks and the complete float32
image hashes were independently verified; all channels are finite. Images were
visually inspected. These are **not the requested uniform-32 pair** and do not
establish convergence, optical correctness, performance improvement or 4K quality.

| Capture UTC | Receipt SHA-256 | Full linear HDR SHA-256 |
| --- | --- | --- |
| 08:17:30.311, 6 bounces | `8cc18b91cab77f29e3831caf0bd102599353cd18c24564031ccf372167686356` | `636bcf2f4eb8cb8c02b7300bbcfaa4d630d5cb5f5aa8c4733cb65a6e82a22cae` |
| 08:28:58.128, 8 bounces | `56fdbd47649eec8a580743e01da9184b0bb677621984a35feb72240034f9aca6` | `3f50a0fbe96a1e6a7f187d1768fcc03b9d138cc21e3bfbb019f9eda9b1f8bf7e` |

Linear luminance is `0.2126 R + 0.7152 G + 0.0722 B`, averaged over 41×7 pixels
centred at x=960. These preselected screen patches track the earlier dark-band
review, not a ground-truth error metric or a claim that brightness equals accuracy.

| Patch centre y | Six bounces | Eight bounces |
| --- | ---: | ---: |
| 580 | 0.352502 | 0.421231 |
| 620 | 0.355204 | 0.412916 |
| 660 | 0.135254 | 0.197793 |
| 700 | 0.157486 | 0.196450 |
| 720 | 0.026065 | 0.137374 |
| 740 | 0.012716 | 0.133444 |
| 760 | 0.011952 | 0.105179 |

At y=740 this is 10.49× the former brightness. The lower band brightens but does
not disappear; structured/spoke-like base patterns remain. An eight-bounce empty
capture at 08:31:19.776 also visibly retains the base pattern. This supports depth
truncation as a contributor, not an adequate explanation of every artifact.
Strict termination in `src/wavefront-shader-kernels.js` stops hit paths at the
configured limit. An independent geometric replay suggested longer interface/TIR
chains, but that replay is not full-scene GPU transport evidence.

Diagnostic summed GPU intervals: 9,144.24 / 11,242.90 ms. Readback-inclusive
intervals: 10,479.60 / 12,574.20 ms. Single sequential image captures, not warmup/
rotated timing-only benchmarks. Do not infer steady-state speed or matched quality.

## Remaining controlled checks

The room-only upper bound of eight was introduced on 2026-10-07 in lighting
`1d76fa54d70741172f36fc328eebfd8d1bb65c69` and renderer
`a5898b8df1f08dc2a3b2a0b85d815d0f6c227573`, replacing a fixed-six fixture.
It is not an engine reduction from 20: the core `MAX_PATH_TRACING_DEPTH` remains
32. Rough-bounce splitting separately rejects depths above eight. That experiment
is disabled in these captures. The reviewed fixture history contains no preceding
20-bounce room control; it does not establish which earlier UI the user remembers.
Longer-path diagnostic admission needs its own validated control range and must
preserve the rough-splitting guard and bounded allocations.

1. Uniform 32 SPP at six/eight bounces, fixed camera and all other settings; verify
   66,355,200 completed samples per capture and retained raw HDR/PNG.
2. Eight-bounce matched pair with support clearance zero versus a small explicit
   positive value (for example 0.0001 m). Lower the support only, not optical
   geometry, and record the deliberate floating condition. Never promote this
   diagnostic separation as a contact/transport correction.
3. Separate contact handling and longer-path convergence from sampling correlation
   and unsampled refracted light connections. No transparent-surface collision
   bypass, colour compensation, or shadow removal is authorized by these tests.

Browser Use is policy-blocked for the agent; do not bypass it. User-operated
captures are inspected from retained local files. The source/control regression
suite is separate from pending physical contact-isolation evidence. Tasks remain
open until required physical and exact-head CI gates pass; no release/CD performed.

## Contact diagnostic local validation

Renderer: 417 tests pass. Combined LCOV including the changed fixture controller
and inert-DOM page wiring reports 96.54% lines / 82.82% branches; controller
100% lines/branches, page glue 52.36% lines. The latter is not browser/GPU coverage:
it tests initialization, forwarding, reset, both filename-clearance branches and
failure cleanup with inert adapters. All changed JavaScript files appear in LCOV.
Lighting: 174 tests pass, 81.18% lines; geometry module 100% lines / 96.42% branches.
New tests failed before implementation, then passed. Default scene geometry retains
its pre-change hash; positive clearance leaves camera and optical meshes identical.
Both packages pass lint, type/syntax checks, build, package and Zero-Three gates;
renderer also passes its clean packed-type consumer. No dependencies changed.
Physical clearance capture, browser accessibility/visual QA and post-push CI are
not covered by those results and remain separate gates.
