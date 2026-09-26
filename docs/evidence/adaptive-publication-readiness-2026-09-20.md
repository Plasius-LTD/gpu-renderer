# Adaptive pixel implementation and publication readiness — 20 September 2026

Task [gpu-renderer#169](https://github.com/Plasius-LTD/gpu-renderer/issues/169),
Feature [site#2114](https://github.com/Plasius-LTD/plasius-ltd-site/issues/2114).
This is internal engineering evidence, not a replacement edition of the canonical
site white paper and not approval to publish performance claims.

## Subsequent paired measurement (same date)

The [26 September native radial trace](https://github.com/Plasius-LTD/gpu-lighting/blob/11730c4203e30ff8ae009a991916a332f5c38920/docs/evidence/native-radial-2026-09-26.md)
now executes full 1080p/4K adaptation with exact centred area shares of
5/10/15/20/25/25% at 32/16/8/4/2/1 SPP. GPU readback verifies 5.95 mean SPP:
12,337,920 / 49,351,680 primary rays, 81.40625% below fixed32. Ordinary uniform32
is bit-identical at both sizes. Timing-only means fall from 2,281.60 to 722.93 ms
and 8,904.07 to 2,996.97 ms; this is not near 60 Hz or matched-quality proof.
Radial images have visible diffuse brightness boundaries and noise: global
energy difference is about +0.97%, masking +4.46% in the 16-SPP ring. The native
fused uniform control differs in four pixels (maximum 0.0868074); fusion stays
off in the final native trace and needs diagnosis. Complete raw native HDR,
exact failed-image delta, timestamps, CPU spans, counts and allocations are
retained. The following older captures keep their original source/scope.

The [26 September native-resolution screen](https://github.com/Plasius-LTD/gpu-lighting/blob/43c216d0d7f263ed432ae0f44d510b9389778320/docs/evidence/native-resolution-2026-09-26.md)
supersedes any interpretation of the small probes as real-time evidence. The
required minimum is now explicitly native 1080p/60 Hz on the M2 Max, with native
4K/60 Hz the ideal target. Fixed32/four-bounce means in a simple scene are
2,342.07 ms and 8,966.80 ms respectively: both fail the frame budget. The adapter
reuse bug was fixed and both resolutions rerun. This is a full-frame fixed-path
shortfall screen, not a native adaptive comparison or quality qualification.

The [26 September CPU-attribution capture](cpu-attribution-2026-09-26.md) adds
opt-in renderer/fixture host stages, separate waits/readback and command/known
allocation counts. 144 physical on/off frames retain exact image/count/ray
identity. Fused geometry's synthetic budget calculation/packing averages 1.50 ms
versus 0.31 ms command encoding; the remaining wait cannot be called CPU work.
Signed observer deltas are noisy, not a speedup or proof of negligible overhead.
No transport, scheduling, site activation or publication qualification changes.

The subsequent [early-pruning experiment](adaptive-pruning-2026-09-20.md) removes
one-use global hit scratch traffic and independently permits zero-work empty
queues. Fixed shader bytes, same-budget pixels and ray counts remain unchanged.
Immediate-hit geometry means improve 11.954→9.667 ms GPU / 20.40→16.58 ms job
against same-run ordinary shared scheduling. Empty-only and combined effects are
not uniformly better. All confidence gates and reduced-budget quality gates
remain unpassed; these are internal efficiency observations, not publication
approval or temporal cache/memory-saving claims.

Later scheduler refinement: the [shared-round report](shared-adaptive-rounds-2026-09-20.md)
retains two new paired captures and physical safety tests. Rounds fall 42→32 and
compute passes 389→206, with bit-identical fixed/shared-uniform and legacy/shared
reduced images. Final diffuse GPU means improve from 16.528→13.120 ms versus the
old scheduler (job 27.18→21.62 ms), but shared reduced remains noisier than fixed32
and fails the approved timing-confidence gate. This advances internal scheduler
efficiency, not real-time, memory or matched-quality publication claims. The
older measurement and small-probe sections below keep their source-bound scope.

The lighting-owned [before/after report](https://github.com/Plasius-LTD/gpu-lighting/blob/b23af8d4c79ce23c28c5134886569b84a73c9079/docs/evidence/paired-adaptive-2026-09-20.md)
retains two 128×128 physical scenes, fixed32/adaptive32 identity controls and
preassigned 2/8/32 budgets with fixed128/256 references. Renderer capture commit
`c6d490a7bc8a04122a784f8146cb6e547d0c3902` leaves the corrected fixed shader unchanged.
Equal-budget images match bit-for-bit; reduced primary rays fall by 72.4045%.
However, reduced diffuse RGB RMSE increases 3.37× and energy differs by +1.77%.
GPU mean time is 14.031 ms fixed versus 17.013 ms reduced; environment is 9.634
versus 13.068 ms. Both reduced quality and timing gates fail. The report retains
high variance, confidence bounds, all raw images/queries and failed instrumentation
attempts. Fewer rays have not established matched-quality speed or memory savings.
This does not diagnose the site's Eames noise or qualify production controllers.

The older small-probe sections below retain their original scope; their statements
about no timing refer only to those fixtures, not the subsequent paired probe.

## Implemented and physically exercised

The isolated integration combines the still-unapproved prerequisites from PRs
213/214/215. Commit
[`9c9e330989cbac35a18d5a8d0c8c57a915449828`](https://github.com/Plasius-LTD/gpu-renderer/commit/9c9e330989cbac35a18d5a8d0c8c57a915449828)
connects GPU worklist compaction, bootstrap, shared camera sampling, real mesh-BVH
transport, canonical branch-tree reduction, complete-sample commit and float32
sum/actual-count resolve. The producer is internal/default-off and adds no storage
beyond the existing capped allocation owner. No public API or site flag is enabled.

The corrected fixed shader hash is
`c0a78da83cb60ed59a1bc56ead48d7e258c01ce402836d464c5b713b24c38fcb`, identical to PR214's
retained fixed baseline. It is **not** the earlier released transport. Previous
16-byte path-chain receipts remain valid only for their original source commits;
this integration uses the canonical 64-byte branch-owned PathNode ABI.

All captures used the physical Apple Metal-3 adapter in the local in-app browser,
immutable Git-object serving, denoise disabled and linear float32 readback. Shader
and fixture hashes, device identity, counts, memory categories and failures are
retained in the following receipts:

- [Bootstrap recapture](task-169-bootstrap-physical-webgpu-2026-09-20.json): 41 cases,
  17,489 generated camera rays, full 16,384-pixel tile, edge tiles, empty tiers,
  ordinals, malformed inputs and selected-only state preservation.
- [Prepared continuation recapture](task-169-prepared-physical-webgpu-2026-09-20.json):
  11 cases; each positive lane has 195 dense versus 65 compacted primary-miss
  terminations, with bitwise-identical selected path records. Depth ceilings 1/4/8
  and ordinals 0/31/127 are exercised; primary misses do not exercise eight actual
  material interactions.
- [Initial complete-sample capture](task-169-complete-samples-physical-webgpu-2026-09-20.json):
  12 scene/order cases and 11 failure-injection cases at commit `9c9e330`.
- [Extended diffuse-prefix capture](task-169-diffuse-prefix-physical-webgpu-2026-09-20.json):
  14 scene/order cases and the same 11 failures at commit
  [`88df724dd5c5e47c0af2f48038a56709e5a69e64`](https://github.com/Plasius-LTD/gpu-renderer/commit/88df724dd5c5e47c0af2f48038a56709e5a69e64).
  Constant environment, black, emissive, ideal metal and small dielectric scenes
  match their analytic targets. Diffuse shading under a nonuniform environment
  matches each pixel's corresponding prefix from the independent fixed dispatcher
  and fixed output stage. Both ascending and descending tier orders pass. All
  observed maximum absolute errors and RGB RMSE values are zero, within the
  pre-existing `1e-5` tolerance. This is **same-sequence agreement, not convergence**.

There were no observed WebGPU validation errors or unexpected device losses in
these captures. All adaptive owners reported zero retained bytes after cleanup.
Pending rays, overflow, bad/stale lineage, invalid worklist/configuration, weighted
input, duplicate and skipped samples failed closed. The glass case completed
2,944 camera samples despite 3,292 terminal branches, verifying that siblings do
not inflate the normalization denominator.

## What the sample reduction means

These are deliberately preassigned synthetic budgets, selected before sampling,
not decisions made by a qualified foveation/distance/environment controller.
Testing a low-budget glass pixel validates accounting; it does not approve
reducing budgets on risky materials in the final policy.

| Probe ceiling | Preassigned tiers, 64 pixels each | Completed camera samples | Fixed full-ceiling reference | Reduction in primary samples |
| --- | --- | ---: | ---: | ---: |
| 32 SPP | 2 / 4 / 8 / 32 | 2,944 (11.5 average SPP) | 8,192 theoretical | 64.0625% |
| 128 SPP | 2 / 8 / 32 / 128 | 10,880 (42.5 average SPP) | 32,768 theoretical | 66.796875% |

No GPU or total-job timing was measured by this fixture. The percentages are not
speedups, not total path-segment reductions, and not evidence that a noisy complex
scene can retain quality at those budgets. The diffuse test separately executes
8,192 fixed reference camera samples to compare identical estimator prefixes;
its staging/submission work is qualification overhead, not a renderer benchmark.
The current fixture encodes 46 tier-sample iterations at the 32-SPP ceiling
(versus 32 dense iterations), or 170 at the 128-SPP ceiling (versus 128). Per-tier
reduction in active pixels therefore coexists with extra dispatch/iteration
overhead; fewer rays alone cannot establish lower GPU time.

## Memory interpretation

The 16x16 32-SPP fixture allocates 31,516 adaptive buffer bytes, 307,864–308,596
renderer buffer bytes depending on scene, and 17,136 fixture readback bytes. The
128-SPP environment fixture allocates 63,260 adaptive, 357,016 renderer buffer and
19,120 fixture readback bytes. The immutable configuration slots grow with the
sum of scheduled tiers. Sample/sum/output and path scratch remain tile-bounded.

These are application-visible **buffer allocations**, not total graphics memory
or exact physical VRAM residency. Texture and environment-asset totals are not
measured by this probe. Fewer executed samples do not reduce these allocations.
The existing 128 MiB adaptive admission cap is not a total-renderer memory cap.

## Claim dispositions and remaining gates

| Claim | Current disposition |
| --- | --- |
| Compacted primary work preserves camera/sample identity | Supported in the retained bounded camera/continuation lanes |
| Unequal budgets can produce complete, unweighted, count-normalized radiance | Supported by the small real-transport integration probes |
| Reflection/transmission siblings count once | Supported in the controlled small-glass lane; broad split-path stress remains open |
| Disabled public rendering uses no adaptive stages | Public integration remains absent; disabled internal no-touch tests pass |
| Final adaptive policy protects geometry/material/environment detail | Not implemented/qualified by these probes |
| Adaptive pixels are usable in the site GPU tab | Not yet; fixture-only integration is not public renderer/shared/site integration |
| Fixed 32-SPP noise is resolved across reference scenes | Not established; baseline/noise and provenance-bound recapture remain open |
| Adaptive rendering is faster at matched quality | Unqualified; no timing or matched-quality benchmark in these receipts |
| Adaptive rendering reduces total memory | Unsupported; bounded extra buffers are measured instead |
| Motion, sphere-history and expanded environments are qualified together | Not established by this milestone |
| 4K / eight interacting bounces / 128 SPP are fully qualified | Not established; current complete images are 16x16 with simple paths |

Next required delivery: review/CI and broader image qualification of prerequisite
transport fixes; fixed-32 baseline/noise recapture; production tier scheduling and
presentation with fail-closed frame completion; independently flagged importance,
motion/history/environment mechanisms; shared/site forwarding and controls; frozen
image tolerances; measured-device/workload benchmark matrix with all overhead.
Maintain the approved lower-95%-confidence threshold
`max(5%, 2 × baseline coefficient of variation)` before making performance claims.

The site paper, PDF/DOCX/ZIP and public article must remain unadvanced until their
own claim audit, physical and release gates are satisfied. No schema-1 rejected
benchmark is rehabilitated by these receipts. No local package publishing,
production rollout or remote flag change was performed. Three.js remains
permanently prohibited internally; this policy discussion need not be included
in the public white paper.

## Local validation and reproduction

At the captured integration source, 264 unit tests pass with 95.74% overall line
coverage. Every changed executable source file is present in LCOV and exceeds
80% lines; the new completion modules have 100% host/source execution coverage.
String coverage is not shader branch coverage: the physical probes provide that
separate, bounded behavioral evidence. Declaration changes inherited from the
prerequisites are checked by TypeScript and the clean packed-package consumer,
not executable LCOV. Lint, type checks, ESM/CJS build, package inventory, public
artifact integrity, all nine package Zero-Three checks, and the full dependency
audit pass locally (zero reported vulnerabilities).

To reproduce, use the exact `sourceCommit` from the selected receipt, serve its
`src/` and `tests/fixtures/` files without bundling/transformation, and open the
named HTML fixture on localhost in a browser with a physical WebGPU adapter.
Click its verification button and retain the visible JSON receipt. Confirm the
fixture and assembled shader hashes against the retained evidence, not just a
green status. Never reinterpret an old receipt as evidence for edited sources.
The complete-sample fixture has a 120-second timeout, records failure rather than
accepting incomplete results, and releases its device/buffers on completion.

Local results do not substitute for post-push CI, review or approved main/CD gates.
Task and Feature completion remain open until those and the broader gates above
succeed.

The [completion-driven loop verification](completion-driven-frames-2026-09-26.md)
confirms independent CPU work during waits and unchanged images/counts/commands.
It is scheduling evidence only; it does not advance adaptive performance or
matched-quality claims.
