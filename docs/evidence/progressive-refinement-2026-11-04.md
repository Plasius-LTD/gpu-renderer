# Coverage-first progressive refinement: native prefix evidence

Status: experimental correctness milestone, not a performance or release claim.
Feature [2367](https://github.com/Plasius-LTD/plasius-ltd-site/issues/2367),
Story2368, renderer286, performance51, lighting110, shared205 and site2369.
See [ADR0070](../adrs/adr-0070-interaction-progressive-sampling.md), the
[design](../design/interaction-progressive-sampling.md) and the accompanying
[machine-readable evidence](progressive-refinement-2026-11-04.json).

The native prototype first completes one camera sample everywhere, then uses
GPU-generated focus budgets for optional work. Stationary passes catch up the
whole image to its configured total. GPU FP32 sums and packed actual counts
retain absolute sample prefixes; presentation and denoising never feed history.
Focus changes retain earned samples. Camera/integrand changes require reset;
scene assets are immutable for this fixture and scene changes recreate it.
The production consumer lifecycle is not integrated or released by this milestone.

The parent, foveation, stationary and performance-budget controls are independent.
The site's registry defaults remain off. The laboratory explicitly snapshots its
opt-ins; it does not activate production flags. No Three.js implementation or
fallback is permitted. Existing default and fixed-pattern transport shader hashes
remain unchanged.

## Full-scene evidence

Physical Apple/Metal3, non-fallback WebGPU. Native full room, Eames, upholstery
and astronaut assets retain354,246 triangles and original material/texture paths.
The pinned harness configures20 ordinary bounces and2048 optical interfaces,
fixed-pattern sampling, denoise/splitting off, sequence period8 and moving focus
ceiling4. Budget reduction is disabled in this first ownership comparison.

| Native extent | Initial samples | Focus samples | Stationary/canonical samples | HDR differences |
| --- | ---: | ---: | ---: | ---: |
| 1920×1080 | 2,073,600 | 4,373,583 | 16,588,800 each | 0 bits |
| 3840×2160 | 8,294,400 | 17,494,863 | 66,355,200 each | 0 bits |

Focus averages about2.11 SPP. At the final stationary target, every pixel has
exactly8 completed camera samples. The progressively assembled raw linear HDR
image is bitwise identical to an unpartitioned canonical run with the same
sequence period. This proves prefix ownership/normalization for these lanes,
not convergence or acceptable moving-view quality. All200 compressed HDR chunks,
native PNG extents, finite/nonnegative radiance, alpha completion, hashes and
histogram totals were independently verified offline. Cleanup passed.

The original per-phase receipts omitted settings/provenance fields that are in
their immutable parent report. Separate derived verification receipts bind the
unchanged phase bytes and parent hash to the existing strict HDR reader; original
evidence is preserved. New captures record per-lane settings and resolved camera
state directly. The original reset accidentally supplied a resolved camera basis
as authored options, changing the look-at target. Those images prove changed-view
count reset only. The fixture now uses authored camera options, and an independent
actual-transport control verifies identical-view sample-zero equality.

## Independent controls and limits

A129×129 physical arithmetic control verifies GPU tiering, unequal actual-count
normalization, partial tiles, focus retention and epoch reset. A separate128×128
actual-transport control verifies configured total256, moving ceiling17, focus
changes, ordinals0..255, canonical bitwise HDR equality, authored identical-view
reset, changed-view invalidation, one pending GPU promise, mandatory budget
overrun and zero optional admission. Fixed-pattern/no-splitting passed. The
stable-pattern/rough-splitting control passed on retry, including one completed
camera sample per split tree. Its earlier30-second operation timeout is retained
and remains unattributed; cold-start stability is not qualified. Rejected probe
sampler/dimension inputs are also preserved, without weakening admission guards.
Neither small control is native-resolution performance evidence.

An additional native1080p control enables the performance child at16.67ms with
foveation off and a stationary total2. It admits no optional moving samples when
none fit, retains one sample everywhere, then reaches4,147,200 stationary samples
and matches its canonical2-SPP HDR exactly. Authored identical-view reset also
matches the original1-SPP HDR. Mandatory-unit admission/actual diagnostic overruns
are retained; this control does not meet the display deadline. The renderer's GPU-error path resets
coverage before further use, and regression tests preserve original GPU and
observer errors without publishing an invalid generation.

## Allocations and performance boundaries

| Native extent | Progressive adaptive buffers | FP32 history subset |
| --- | ---: | ---: |
| 1080p | 42,330,524 bytes | 33,177,600 bytes |
| 4K | 166,746,524 bytes | 132,710,400 bytes |

These are application-visible descriptor bytes, not exact physical VRAM. History
increases GPU allocation. The explicit192MiB combined progressive cap and actual
device binding limits are checked before allocation; the existing128MiB default
is unchanged. There is no full-screen CPU budget map in the new path. Diagnostic
HDR/count readbacks allocate host arrays and are not a process-memory saving.
Renderer buffers, texture inventory, telemetry and staging are recorded separately.

One-SPP coverage itself took approximately8.28 seconds at1080p and27.21 seconds
at4K in this diagnostic sequence;4K was partially V8-instrumented. These are
single diagnostic batch intervals, not matched-quality GPU benchmarks. They
plainly do not meet1080p60Hz. The scheduler cannot turn mandatory work into a
16.67ms frame: kernel/traversal/optical costs still require optimisation.
Fewer requested samples, earlier partial images and memory classes must not be
reported as measured frame-rate or total-memory improvements.

Before release or white-paper performance claims: complete consumer integration,
actual motion/epoch/scene-change testing, spatial SPP overlays and the approved
32/128-SPP and bounce/device matrix; resolve the retained cold-start timeout;
measure uninstrumented GPU and total-job costs at frozen matched quality; meet
the confidence/stability/CI/CD gates. Earlier failed convergence screens remain
failed under the user's provisional experimentation acceptance.

This milestone exercises focus, performance admission and stationary history.
Distance/environment/classification-history protections are not composed into
this laboratory target generator yet. Combined-classifier qualification and the
live camera lifecycle remain separate delivery gates.
