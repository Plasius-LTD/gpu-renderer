# @plasius/gpu-renderer

[![npm version](https://img.shields.io/npm/v/@plasius/gpu-renderer.svg)](https://www.npmjs.com/package/@plasius/gpu-renderer)
[![Build Status](https://img.shields.io/github/actions/workflow/status/Plasius-LTD/gpu-renderer/ci.yml?branch=main&label=build&style=flat)](https://github.com/Plasius-LTD/gpu-renderer/actions/workflows/ci.yml)
[![coverage](https://img.shields.io/codecov/c/github/Plasius-LTD/gpu-renderer)](https://codecov.io/gh/Plasius-LTD/gpu-renderer)
[![License](https://img.shields.io/github/license/Plasius-LTD/gpu-renderer)](./LICENSE)
[![Code of Conduct](https://img.shields.io/badge/code%20of%20conduct-yes-blue.svg)](./CODE_OF_CONDUCT.md)
[![Security Policy](https://img.shields.io/badge/security%20policy-yes-orange.svg)](./SECURITY.md)
[![Changelog](https://img.shields.io/badge/changelog-md-blue.svg)](./CHANGELOG.md)

Framework-agnostic WebGPU renderer runtime for Plasius projects.
`tests/fixtures/native-adaptive-trace.html` is the opt-in full-frame radial
diagnostic: native 1080p/4K, centred area shares 5/10/15/20/25/25% at
32/16/8/4/2/1 SPP. It reuses shared rounds and canonical material transport, omits
absent tile tiers, retains CPU/GPU/count/HDR traces separately from timing-only
frames, and checks uniform32 identity. Fixed32 is the reference; the real-time
target applies to adaptation. This is not public integration or qualification.
The optional fused-hit variant is disabled for this native trace: its 4K
uniform32 identity control failed while the ordinary adaptive control matched.
The [retained native radial results](https://github.com/Plasius-LTD/gpu-lighting/blob/11730c4203e30ff8ae009a991916a332f5c38920/docs/evidence/native-radial-2026-09-26.md)
verify exact 5.95 mean SPP and 81.40625% fewer primary rays. Timing-only jobs
average 722.93 / 2,996.97 ms at 1080p/4K, versus same-run fixed32
2,281.60 / 8,904.07 ms. Visible reduced-SPP brightness boundaries/noise remain;
these lower-work timings establish neither matched quality nor real-time success.
The minimum real-time acceptance target is native **1920×1080 at sustained 60 Hz
on the M2 Max MacBook Pro**; native **3840×2160 at 60 Hz** is the ideal target.
128×128 fixtures are correctness diagnostics, not full-frame performance evidence.
`tests/fixtures/native-frame-screen.html` measures actual native fixed32 frames
with the existing tiled renderer, including presentation commands. Its short-run
results cannot establish sustained application/display or image-quality success.
The older paired runner remains single-tile by default; the explicit native
diagnostic extends it to full frames. Public tiled adaptive integration and
matched-quality native-resolution qualification remain required.
The [retained M2 Max native screen](https://github.com/Plasius-LTD/gpu-lighting/blob/43c216d0d7f263ed432ae0f44d510b9389778320/docs/evidence/native-resolution-2026-09-26.md)
measured 2,342.07 ms at 1080p and 8,966.80 ms at 4K in the fixed32 simple scene.
The current fixed path fails the real-time target. Each resolution now requests
an independent adapter/device; the failed adapter-reuse attempt is also retained.

This package is intended to replace Three.js-dependent render orchestration with
an explicit WebGPU-first runtime that can be consumed from React, vanilla, or
worker-driven app surfaces.

The package targets Node.js 24, consumes the stable `@plasius/gpu-shared` 1.x
runtime line (`^1.1.1`), and validates its development tooling against the
current ESLint 10 and TypeScript 7 baselines.

Apache-2.0. ESM + CJS builds.

The paired adaptive diagnostic uses an internal opt-in four-query timestamp span
on actual first/final compute work. Normal renderer telemetry retains its existing
two-query descriptors and allocation; unavailable/invalid timestamps never become
GPU performance evidence. See the lighting-owned paired diagnostic protocol.

## CPU attribution diagnostics

Opt in per render without enabling adaptive sampling:

```js
const frame = await renderer.renderFrame({
  cpuProfiling: { enabled: true, userTiming: false },
  readStats: true, // Independent opt-in GPU timestamps/ray readback.
  readOutputProbe: false,
});
console.log(frame.cpuProfile);
```

`cpuProfile` is absent by default. It reports host elapsed packing, upload,
encoding, finish and submission intervals; nested `exclusiveMs` avoids counting
child intervals twice. `gpuWait`, `telemetryReadback` and `outputReadback` are
asynchronous elapsed time, **not CPU busy time**. GPU/job timing boundaries and
rendering commands remain unchanged. Post-job readback commands are excluded
from API counts. Explicit temporary buffer bytes are not total heap allocation,
GC, driver memory, residency or a memory-saving claim. Setup/updateSceneObjects
and browser UI work are outside this per-render profile.

`userTiming: true` emits at most 128 named browser timing spans per frame,
clearing their timeline entries after emission; aggregate counters retain every
call. CPU profiling itself adds overhead; compare on/off before interpreting
numbers. Use a separate browser CPU/GC trace for active CPU attribution.

The source-bound [replay setup](https://github.com/Plasius-LTD/gpu-lighting/blob/b23af8d4c79ce23c28c5134886569b84a73c9079/docs/paired-adaptive-replay.md)
can open `tests/fixtures/adaptive-cpu-profile.html` at the profiling commit.
Choose **Measure CPU breakdown** for alternating off/on fixed/shared/fused runs,
identity checks, raw receipts and median/p95 summaries. These 128×128 experiments
do not activate the GPU tab or qualify adaptive quality/performance.
See the [measurement contract](docs/design/cpu-render-profiling.md).

## Completion-driven frames (opt-in)

`renderFrame()` already returns a GPU-completion promise by default. Waiting on
it yields JavaScript; it is not a busy wait. The optional loop starts the next
frame after that promise and completion observers settle, with a browser-task
yield rather than waiting for an additional display tick:

```js
import { createWavefrontFrameLoop } from "@plasius/gpu-renderer";

const loop = createWavefrontFrameLoop({
  enabled: remoteFlags["renderer.sampling.adaptivePerPixel.enabled"] === true,
  renderFrame: (options) => renderer.renderFrame(options),
  targetFrameTimeMs: 1000 / 60, // Observation only; does not reduce SPP.
  getRenderOptions: () => ({
    samplesPerPixel: budgetAdapter.getCurrentBudget().samplesPerPixel,
    frameTimeBudgetMs: 0, // Explicitly fixed ceiling; no frame-budget reduction.
  }),
  onFrameComplete: (frame, progress) => {
    recordFrameMeasurements(frame, progress); // Feed existing gpu-performance policy.
  },
});
const finished = loop.start(); // Do not await here if independent work should continue.
finished.catch(reportRenderFailure); // Failures stop the loop; never silently restart.

// From a UI/telemetry callback, as often as the application needs:
const progress = loop.getProgress();
// progress.elapsedMs, budgetRatio, overBudgetMs, completedTileFraction

// On shutdown / remote disable, from outside a loop callback:
await loop.stop(); // Drain current frame and readbacks before destroying resources.
renderer.destroy();
```

Only one owner may call/render/update/destroy this renderer. Apply camera/scene
updates at `getRenderOptions`, not during a tile wait. Independent simulation,
input, networking or worker tasks may run while waiting, but long main-thread
tasks can delay GPU completion callbacks. Do not await `stop()` inside the loop's
own callbacks (request stop there; await the run promise outside). Custom render
adapters must genuinely await completion with bounded timeouts; a submit-only
callback is not sufficient. Stop does not cancel already submitted GPU commands.
After a timeout/device failure, do not reuse the failed renderer in another loop;
dispose it and recover through the application's device-recreation path.

Progress is on-demand, with no GPU polling/readbacks. `budgetRatio` is elapsed
wall time divided by the observational target; zero/omitted target returns null.
Elapsed time includes preparation and requested readback, not CPU utilization.
`completedTileFraction` counts queue-confirmed tiles, **not GPU-time completion**;
`gpuCompletionFraction` is always null. Single-tile jobs remain 0 until the queue
completes. The standalone renderer also accepts `onProgress(event)` with stages
and confirmed counts; observer errors reject after draining, not during a wait.

The loop forces GPU completion, defaults diagnostic readbacks off, and applies
new budgets only on the next frame. It changes no transport, budgets, shaders or
GPU allocations. It is disabled by default, inherits the parent remote flag,
and is not enabled in the site. Rollback stops/drains it and resumes the existing
GPU-native caller. The legacy display-paced runtime is unchanged. This throughput
loop is not a guarantee of display pacing, idle CPU capacity or a GPU speedup.

Open `tests/fixtures/frame-loop.html` on the source-bound replay server for
fixed/shared/fused identity and independent-heartbeat verification. See the
[design and acceptance contract](docs/design/completion-driven-frames.md).

## Privacy-Safe Feedback Diagnostics

Approved in-game viewers can explicitly convert a small set of current renderer
health observations into the closed
`@plasius/gpu-shared/feedback-diagnostics` packet:

```js
import { createFeedbackGameDiagnosticSnapshot } from "@plasius/gpu-renderer";

const diagnostics = createFeedbackGameDiagnosticSnapshot({
  featureEnabled,
  capabilityGranted,
  consentConfirmed: true,
  surfaceId: "site.gpu-demo",
  renderer: "webgpu",
  backend: "worker",
  viewportWidth: 1920,
  viewportHeight: 1080,
  frameRate: 59.9,
  frameTimeMs: 16.7,
  featureIds: ["renderer.frame-loop"],
  counters: [{ code: "frame-drop", count: 2 }],
  errorCodes: [],
});
```

The helper returns `null` before reading renderer observations unless the
remotely evaluated `feedback.game-diagnostics.enabled` flag, the
`feedback.game-diagnostics.attach` capability, and explicit consent are all
present. It derives trusted provenance and returns only coarse buckets and
closed codes.

This API is deliberately separate from general renderer snapshots. It accepts
no canvas, user-captured pixels, DOM, player object, URL, filename,
adapter/device detail, coordinate or raw warning, performs no automatic
diagnostic capture or network/storage operation, and never registers
`/player-system`. Disabling the flag preserves ordinary structured-only bug
reporting.

## Adaptive per-pixel implementation status

This experimental integration branch combines the separately tracked split-path
ownership and primary-visibility MIS fixes with adaptive scheduling infrastructure.
Its fixed shader matches PR 214's corrected baseline, **not** the earlier released
shader. The earlier receipts below remain evidence for their stated revisions.
No prerequisite PR, public renderer option or site flag is enabled by this branch.

An internal complete-camera-sample producer now reduces the canonical branch tree
into the existing sample record before selected-tier count commit. Unweighted
radiance is normalized by actual completed samples; sibling branches cannot count
as separate camera samples. Invalid worklists, pending paths, overflow, bad lineage
or stale identities reject completion. It reuses capped buffers without new GPU
storage. Bootstrap uses the 64-byte PathNode ABI and invalidates selected roots;
the shared bounce code owns initialization of every child node.
See [integration design](docs/design/adaptive-complete-sample-integration.md) and
[ADR 0039](docs/adrs/adr-0039-adaptive-complete-camera-sample-integration.md).
The physical probe is `tests/fixtures/adaptive-complete-sample.html`; it connects
real transport with unequal-budget count/resolve, not a synthetic radiance source.
On Apple Metal-3, 14 small-scene/order cases passed, including diffuse same-sample
prefix agreement with the fixed dispatcher, plus 11 fail-closed cases. These are
not matched-quality performance or site qualification. See the
[dated publication-readiness ledger](docs/evidence/adaptive-publication-readiness-2026-09-20.md)
for source-bound receipts, actual sample counts and outstanding claim gates.

The additional `tests/fixtures/adaptive-paired.html` diagnostic connects the same
real pipeline to the lighting-owned paired protocol and image metrics. It compares
fixed32, equal-budget adaptive32 and preassigned 2/8/32 budgets, with 128/256-SPP
references, two warmups, ten rotated timing rounds, native queue/timestamp telemetry
and retained linear pixels/previews. It requires the pinned lighting fixture
modules under `/lighting/` and the existing loopback capture bridge. It is not a
live adaptive importance policy, Eames benchmark, or public site integration.

The internal [shared-round scheduler](docs/design/adaptive-shared-rounds.md) adds
an independently selectable comparison in `tests/fixtures/adaptive-shared.html`.
It shares absolute sampling rounds across tiers, batches immutable uploads, and
prepares/commits only compacted pixels around the unchanged bounce pipeline.
For 2/8/32 budgets at four bounces, rounds fall from 42 to 32 and compute passes
from 389 to 206. `tests/fixtures/adaptive-shared-safety.html` checks analytic
images, split paths, 128 SPP and malformed-state rejection. These are internal
diagnostics, not a public adaptive option. See [ADR 0040](docs/adrs/adr-0040-shared-adaptive-sampling-rounds.md)
and the [source-bound results](docs/evidence/shared-adaptive-rounds-2026-09-20.md)
for measured trade-offs and outstanding quality/confidence gates.

`tests/fixtures/adaptive-pruning.html` independently compares zero-work empty
queues, immediate hit consumption, and both together against the shared-round
baseline. Internal default-off options omit the global hit-record round-trip
and/or guarded empty workgroups; they add no temporal cache and preserve the
fixed shader and command trace. Allocation capacity is retained, so this is not
a memory-saving claim. See [ADR 0041](docs/adrs/adr-0041-immediate-hit-consumption-and-empty-queue-pruning.md)
and [pruning evidence](docs/evidence/adaptive-pruning-2026-09-20.md). Physical image,
ray and count identity passes these bounded scenes; timing confidence and the
preassigned budgets' image-quality gates still do not qualify a public rollout.

Per-pixel adaptive rendering is not yet exposed by the public renderer API.
An internal [primary-worklist stage](docs/design/adaptive-primary-worklist.md)
now compacts preselected tile/tier budgets into dense local pixel IDs and builds
indirect dispatch arguments. Invalid counts, failed pixels and overflow veto the
dispatch. It adds a 16-byte control record and 256 bytes per immutable config
slot to the existing capped allocation owner, only when `primaryWorklist` is
requested internally. It does not change the fixed dispatcher. The physical
`tests/fixtures/adaptive-primary.html` identity/indirect probe passed all 16 cases
on Apple Metal-3; [Task 169 evidence](docs/evidence/task-169-primary-worklist.md)
records its bounded scope separately from outstanding scene qualification.

A separate internal camera-ray bridge consumes those worklists and reuses the
fixed renderer's camera WGSL and maximum-period sampling sequence. Its final
camera-only module is reflected; fixed transport remains byte-identical. Run
`tests/fixtures/adaptive-camera.html` for dense/compacted GPU RayRecord comparisons
(49 cases and 18,594 bitwise-matching rays passed on Apple Metal-3).
It does not initialize bounces, contribute radiance, count completed samples or
enable site adaptation. See [ADR 0034](docs/adrs/adr-0034-shared-compacted-camera-rays.md).

The internal frame encoder also has a prepared-primary entry that reuses the exact
existing bounce command loop without repeating dense primary generation. Its caller
must initialize and validate the queue, counters and path records first.
The fixed dispatcher still uses its existing entry. Command-trace equivalence is
unit-tested; this seam alone does not enable or qualify live adaptive transport.
See [ADR 0036](docs/adrs/adr-0036-shared-continuation-command-encoding.md).

An internal two-pass bootstrap validates compacted worklists, resets counters and
clears only selected pixels' per-sample accumulation/path records before camera
generation. It reuses existing tile buffers and canonical WGSL declarations;
fixed assembled shader bytes remain unchanged. Invalid configuration, storage,
IDs or upstream failures veto the sample. The physical probe is
`tests/fixtures/adaptive-bootstrap.html`; it tests preparation and camera rays,
not completed transport, image quality or speed. Live integration remains off.
See [ADR 0037](docs/adrs/adr-0037-compacted-sample-bootstrap.md).

The internal prepared-sample coordinator orders that bootstrap, compacted camera
generation and the shared bounce encoder, using existing pipelines and storage.
It does not submit, present or commit completed counts. Optional command totals
include preparation overhead and remain invocation upper bounds, not ray counts.
`tests/fixtures/adaptive-prepared-sample.html` compares production mesh-BVH miss
path records with dense dispatch; this is not a complete adaptive image test.
All 11 cases passed on Apple Metal-3: 65 selected paths versus 195 dense paths per
positive case, with bitwise-identical selected deferred records. These controlled
counts demonstrate dispatch selection, not a measured performance improvement.
See [ADR 0038](docs/adrs/adr-0038-prepared-sample-command-coordinator.md).

The internal [metadata foundation](docs/design/adaptive-metadata.md) now provides
reflected requested/completed count storage and lazy, bounded allocation.
`@plasius/gpu-shader` validates the final initialization WGSL in development;
the reflector does not enter browser bundles. The normal `npm test` suite checks
generated byte constants, count packing, allocation admission and cleanup.

An internal [complete-camera-sample boundary](docs/design/adaptive-count-resolve.md)
adds unweighted float32 sums and actual-count resolve. Its producer must finish
and reduce every reflection/transmission sibling before committing one sample;
partial, duplicate, invalid or out-of-order records cannot advance the count.
Tile-local sample/sum/output scratch adds at most 1 MiB, plus bounded immutable
configuration slots, all included in the existing allocation cap. The highest
packed flag bit now marks invalid sample/count evidence.

The version-2 internal resolve ABI adds an exact selected-tier filter, so a
compacted pass cannot count or poison pixels assigned to another tier. Zero
retains the dense internal commit mode. Final resolve still covers the whole
tile. The 48-byte payload fits the same 256-byte slots; allocated memory and
fixed transport are unchanged. See [ADR 0035](docs/adrs/adr-0035-tier-qualified-camera-sample-commit.md).

The earlier metadata/count-resolve foundation did not connect to transport; its
physical execution is recorded in [Task 168 evidence](docs/evidence/task-168-adaptive-count-resolve.md).
The experimental integration described above now connects real transport in a
physical fixture, while the public renderer remains fixed-dispatch only. Its
whole-frame budget policy is unchanged. The separate prerequisite transport fixes,
production adaptive scheduler/presentation, importance controllers and shared/site
integration still require qualification before a site comparison. No fixture here
establishes matched-quality performance, full-scene noise or net memory savings.
See [ADR 0029](docs/adrs/adr-0029-reflected-adaptive-metadata-admission.md) and
[ADR 0030](docs/adrs/adr-0030-complete-camera-sample-resolve.md).

## Install

```sh
npm install @plasius/gpu-renderer
```

## Permanent Zero-Three boundary

This WebGPU renderer and its complete production, development, test, tooling,
peer, optional, and artifact dependency graphs permanently prohibit Three.js,
R3F, TSL, their related packages, and any dependency path reaching them. There
is no compatibility mode, fallback, waiver, or rollback to those renderers.

Run `npm run zero-three:source` before installing dependencies, or run
`npm run build && npm run zero-three` after `npm ci` for the installed graph,
built bundle, actual npm tarball, and generated CycloneDX evidence. The full
command writes digest-bound package/version evidence to
`release-artifacts/zero-three-evidence.json`. CI retains it, and production CD
passes it by immutable artifact ID, verifies it again, attaches it to the
GitHub release, and attests it.

## Usage

```js
import { createGpuRenderer } from "@plasius/gpu-renderer";

const renderer = await createGpuRenderer({
  canvas: document.querySelector("#scene"),
  clearColor: "#102035",
});

renderer.resize(window.innerWidth, window.innerHeight);
renderer.start();
```

## Adaptive Frame Hooks

`@plasius/gpu-renderer` now exposes frame lifecycle hooks so the app can pass
negotiated frame targets from `@plasius/gpu-performance` and opt into renderer
frame sampling for `@plasius/gpu-debug`.

```js
import { createGpuRenderer, createRendererDebugHooks } from "@plasius/gpu-renderer";

const rendererDebugHooks = createRendererDebugHooks({
  debugSession,
  getTargetFrameTimeMs: () => governor.getSnapshot().targetFrameTimeMs,
});

const renderer = await createGpuRenderer({
  canvas: "#scene",
  frameIdFactory: ({ frame, xrActive }) => `scene.${xrActive ? "xr" : "flat"}.${frame}`,
  ...rendererDebugHooks,
});
```

## Worker DAG Manifests

The renderer also publishes worker-facing frame-stage manifests so
`@plasius/gpu-performance` and `@plasius/gpu-worker` can reason about renderer
work as a multi-root DAG instead of a flat queue.

```js
import { getRendererWorkerManifest } from "@plasius/gpu-renderer";

const realtimeManifest = getRendererWorkerManifest();
const xrManifest = getRendererWorkerManifest("xr");

console.log(realtimeManifest.jobs.map((job) => job.worker.jobType));
console.log(xrManifest.jobs.find((job) => job.key === "lateLatch"));
```

- `realtime` publishes `acquire`, `visibility`, `mainEncode`, `postProcess`,
  and `submit`.
- `xr` publishes `acquire`, `visibility`, `lateLatch`, `mainEncode`, and
  `submit`.
- Jobs include queue class, priority, dependencies, adaptive budget levels, and
  debug metadata such as allocation tags.

## Ray-Tracing-First Planning

The renderer now publishes a stable-snapshot render plan for the premium
ray-tracing-first frame model.

```js
import { createRayTracingRenderPlan } from "@plasius/gpu-renderer";

const plan = createRayTracingRenderPlan({
  snapshotId: "visual-snapshot-42",
});

console.log(plan.inputBoundary);
console.log(plan.renderStages.map((stage) => stage.key));
console.log(plan.representationBands);
console.log(plan.wavefront.queueLayout.strategy);
```

## Authored Material Transport

Wavefront materials support authored `KHR_materials_*` factors and extension
textures, bounded nested media, Beer-Lambert attenuation, and reference
transport helpers for reflected/transmitted branching and spectral dispersion.
GPU rays carry up to four nested media and enqueue at most two dielectric
continuations per hit; deeper nesting and full spectral rendering remain
bounded by those explicit limits.

```js
import {
  createMediumStack,
  createTransportBranches,
  createSpectralSamples,
} from "@plasius/gpu-renderer";

const stack = createMediumStack([1, 4]);
const branches = createTransportBranches({
  mediumStack: stack,
  mediumId: 7,
  transmission: 1,
  ior: 1.5,
});
const wavelengths = createSpectralSamples({ ior: 1.5, dispersion: 0.2 });
```

The plan makes the stable visual snapshot boundary explicit, publishes the
required RT-first stage ordering, and exposes representation-band plus
acceleration-structure update policy metadata for downstream lighting and
performance packages. It now also exposes the renderer-owned wavefront queue
model, versioned ray/hit/surface/material/medium/accumulation contracts, and
the termination policy for emissive/environment path completion.

## WebGPU Wavefront Compute Renderer

The package also exposes an executable WebGPU wavefront renderer for active-ray
debug validation scenes. It is compute-driven, tiled, and breadth-first by
bounce depth, so queue buffers are bounded by tile size instead of presentation
resolution. Renderer-owned GPU record sizes are part of the public compute
limits so ray, hit, triangle, BVH, and accumulation buffers stay aligned with
their WGSL layouts. Frame submission batching and dispatch diagnostics are kept
in dedicated runtime helpers so performance-facing integrations can consume
stable frame stats without inheriting the renderer's shader and pipeline
assembly internals.

## Animated Scene Renderer

`createAnimatedSceneRenderer` provides the renderer-owned v1 surface for the
GPU animation adventure demo. It accepts scripted beats, route points, props,
and a backward-compatible `lagged-follow` camera rig that now resolves through
the shared `@plasius/gpu-camera` editor, spectator, third-person, and
first-person rig primitives. The renderer exposes `start`, `resize`,
`getSnapshot`, `setCamera`, `setCameraViewMode`, `applyCameraControl`, and
`destroy` for host packages. Third-person distance is clamped by camera
constraints, first-person resolves from the head anchor, and head-look is
reported as transient post-animation intent instead of mutating clip data. It
is implemented inside `gpu-renderer` and does not route animation playback
through Three.js. When hosts provide
`modelAsset` and `clipAssets`, the v1 canvas renderer parses the Peasant Girl
GLB mesh, skin, inverse-bind matrices, and Mixamo-compatible clip channels,
then CPU-skins the active clip and draws model-derived geometry into the
adventure canvas. Snapshots expose `modelRenderable`, `fallbackProxyActive`,
`skinnedVertexCount`, `skinnedJointCount`, `activeClipRenderable`,
`cameraViewMode`, `cameraTransform`, `targetDistance`, `headLook`,
`characterVisible`, `characterGroundY`, and `propGroundAnchors` so hosts can
catch camera, scene grounding, and model-renderability regressions.
When hosts provide beat `movementRequirement` fields and clip
`movementProfile` metadata, character displacement is resolved per beat:
travel/jump beats move between route anchors, while stationary action beats
hold their current anchor unless the profile explicitly allows authored root
translation. Snapshots expose movement validation diagnostics so hosts can
detect mismatched animation motion before accepting playback.

`createProfessionalAnimatedSceneRenderer` is the fail-closed WebGPU entrypoint
for the professional Animation Adventure path. It requires a WebGPU canvas,
skinned GLB character metadata with UVs, normals, diffuse and normal textures,
and root-authored movement profiles for travel beats. It rejects the legacy
2D proxy path instead of silently falling back, renders through WebGPU, and
exposes `renderMode: "webgpu-pbr"`, texture counts, normal-map readiness,
root-motion policy, character position, camera position, and active clip
diagnostics for host validation. Repeated travel beats accumulate root-motion
distance from the clip duration and loop count, capped by the declared movement
requirement and route segment. The current surface establishes the WebGPU
lifecycle and validation boundary for the PBR animation path; shader-level
textured character and environment drawing builds on this boundary.

The physical material functions are shared by both resolve modes. Transport
rollout controls do not permit the former sibling-address race to return:
rollback requires a separately qualified GPU-native release.
Low-SPP physical lighting hardening is separately controlled by the boolean
`renderer.transport.strictPhysicalLowSppLighting` flag, passed either as
`strictPhysicalLowSppLighting: true` or through `featureFlags`. When enabled,
the renderer disables terminal ambient rescue for max-depth/null-throughput
termination, samples procedural sunlight as an explicit shadow-tested
directional source, samples procedural sky over the visible hemisphere, and
selects emissive triangles by area-weighted emission power with matching MIS
PDFs. Use `denoise: false` when validating this strict path so remaining
variance is measured in the transport rather than hidden by filtering.
Strict validation can also enable the Product Studio transport experiment
matrix through independent boolean feature flags. The flags are composable:
none, one, several, or all may be requested at once. Flags that depend on strict
physical transport report as requested but no-op effectively when
`renderer.transport.strictPhysicalLowSppLighting` is disabled.

- `renderer.transport.stableSampleRouting.enabled`
- `renderer.transport.strictZeroOverflow.enabled`
- `renderer.transport.deferLowSppRussianRoulette.enabled`
- `renderer.transport.deterministicDirectLighting.enabled`
- `renderer.transport.sourceStableDirectLighting.enabled`
- `renderer.transport.deterministicLowSppIndirect.enabled`
- `renderer.environment.productStudioImportance.enabled`
- `renderer.diagnostics.productTransportTelemetry.enabled`

Renderer config, frame stats, and snapshots expose both the structured
`transportExperiments` state and the packed `transportExperimentFlags` bitfield
so Product Studio diagnostics can record the exact active set for each render.
`renderer.transport.sourceStableDirectLighting.enabled` is intended for
denoise-off Product Studio validation: in strict physical mode it enables the
deterministic direct-light path and removes direct-light sample dependence on
adjacent pixel ids and frame index so low-SPP source routing is stable without
adding ambient fill. Multi-bounce continuation rays that terminate on emissive
geometry are MIS-weighted against that direct emissive estimator, so rare
softbox hits remain physically valid without adding full unbalanced source
radiance as isolated stippled pixels.
`renderer.transport.deterministicLowSppIndirect.enabled` is also strict-mode
only. The flag remains in the public experiment matrix so Product Studio can
keep reporting requested and effective rollout state, but the strict shader path
does not inject cached indirect radiance or suppress physical continuation. Any
future low-SPP indirect stabilizer must be introduced as an auditable transport
source with measured PDFs, visibility, and validation against high-SPP reference
renders before it contributes radiance. Until then,
`transportContributions.cachedIndirectLuminance` should remain zero and
multi-bounce energy should come from direct explicit lighting, true terminal
emissive/environment hits, or stochastic BSDF continuation.
Set `presentationOutput: "linear"` for linear presented validation captures, or
omit it to keep the default tone-mapped presentation.

```js
import {
  createWavefrontPathTracingComputeRenderer,
} from "@plasius/gpu-renderer";

const renderer = await createWavefrontPathTracingComputeRenderer({
  canvas: document.querySelector("#product-render"),
  width: 1280,
  height: 720,
  maxDepth: 6,
  samplesPerPixel: 8,
  displayQuality: true,
  meshes: [
    {
      id: 1,
      positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
      indices: [0, 1, 2],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
      emission: [8, 7, 5, 1],
    },
  ],
});

renderer.renderOnce();
```

Existing consumers that still call `renderFrame(...)` or
`renderWavefrontPathTracingComputeFrame(...)` remain supported as compatibility
wrappers around the canonical mesh renderer.

Analytic scene objects remain available for debug fixtures:

```js
const debugRenderer = await createWavefrontPathTracingComputeRenderer({
  canvas: document.querySelector("#debug-render"),
  width: 1280,
  height: 720,
  maxDepth: 6,
  sceneObjects: [
    {
      type: "sphere",
      center: [0, 1.8, -0.5],
      radius: 0.35,
      emission: [8, 7, 5, 1],
      materialKind: "emissive",
    },
  ],
});

debugRenderer.renderOnce();
```

Scene objects currently support analytic `sphere` and axis-aligned `box`
records with colour, emission, roughness, metallic, opacity, IOR, clearcoat,
sheen colour, specular colour, and transmission fields.
These records are debug fixtures only. Product Studio visual rendering requires
the mesh BVH path described in
`docs/adrs/adr-0007-triangle-mesh-wavefront-path-tracing.md`. This is a
project-wide display-quality baseline for path-traced rendering, not a
Product-Studio-only requirement.

Mesh inputs are normalized into triangle records, packed into GPU buffers, and
uploaded as source buffers for tracing. Vertex normals are preserved for smooth
shading; when normals are absent the triangle geometric normal is used. The
display-quality path now defaults to `accelerationBuildMode: "cpu-upload"` so
CPU-built BVH nodes and triangle records are uploaded once and then reused by
the GPU tracing passes. Set `accelerationBuildMode: "gpu"` only when you
explicitly want the experimental GPU-side BVH assembly path for validation or
development. The `createWavefrontMeshAcceleration(...)` helper is therefore no
longer debug-only; it is the stable display-quality acceleration builder,
whereas GPU BVH construction remains available behind the explicit mode switch.
CPU-upload records still preserve the raw material factors plus atlas rects and
texture settings expected by the GPU hit-time samplers; they are not meant to
replace exact UV-driven sampling with CPU-baked triangle averages.
The GPU BVH path still uses Morton-style centroid keys to sort leaf references
before sorted leaves and level-concurrent internal nodes are materialized.
When mesh inputs also carry UVs plus decoded base-colour,
metallic-roughness, normal, occlusion, or emissive maps, the display-quality
path now packs them into GPU texture atlases and samples them at the resolved
hit UV inside the wavefront trace pass. Generic glTF-style material factors
such as clearcoat, sheen colour, specular colour, transmission, and IOR are
also preserved through the GPU records so demo validation does not need
model-name overrides. CPU-side texture work is limited to load-time decode and
atlas packing; per-hit shading stays on the GPU. Direct and terminal glossy
response now also samples reflection-aligned environment radiance so leather,
chrome, and other polished authored materials can read from the active
environment map or procedural sky instead of relying mostly on a sun-direction
proxy.
Authored participating-media inputs can also enter through the same mesh path.
A mesh may provide an explicit `medium` block or a glTF-style `material.volume`
block with `thickness`, `attenuationColor`, and `attenuationDistance`; the
renderer derives the medium-table entry, carries the active medium id on the
GPU ray, and applies Beer-Lambert transmittance to travelled segments on the
GPU. Thickness is now preserved in material packing for later shell-volume
work, but the current renderer still tracks only one active medium id per ray
and does not yet implement nested media, spectral dispersion, or a branching
reflection/refraction tree. Invalid medium ids fall back to the current ray
medium, and entering a second medium while one is already active preserves the
existing medium id until dedicated stack support is implemented.

`samplesPerPixel` controls how many GPU primary-ray samples are accumulated per
screen pixel within a single render. This multiplies dispatch work but does not
increase the tile queue memory footprint, so 720p/1080p/4K targets remain
bounded by `tileSize`. `maxDepth` is bounded at 32 for offline/reference
renders, allowing 20-bounce quality checks while keeping path-vertex memory
explicit and predictable. When `denoise` is enabled the renderer writes raw
linear radiance to an `rgba16float` texture first, then runs a two-stage
full-frame GPU denoise through an `rgba16float` scratch texture before final
tone mapping into the presented `rgba8unorm` output. Filtering in linear
radiance space lets the denoise pass cross tile boundaries without compressing
energy/detail before the final resolve. High-SPP wavefront sampling now routes
camera jitter, BSDF continuation, emissive-light selection, and environment
selection through named sample dimensions in
`src/wavefront-sampling-dimensions.js`, using low-discrepancy 2D pairs where
they improve convergence without adding CPU-side sample tables. The companion
`src/wavefront-denoise-validation.js` acceptance helper keeps denoise-off
validation explicit with structural-artifact, invalid-sample, baseline-noise,
and sheen/chrome/wood detail-retention thresholds so the
`renderer.denoise.highSppIndependence` rollout can stay reviewable and
rollbackable. The renderer also stores compact
emissive-triangle metadata in the existing BVH buffer tail and uses it to guide
diffuse continuation rays toward finite mesh light geometry. This is not a
separate shadow/direct-light pass: the active ray still has to hit emissive
geometry or miss into the environment before radiance is committed. Guided
emissive hits carry a bounded estimator weight so finite light guidance does not
over-expose low-sample renders before full material PDFs/MIS are implemented.
Both resolve modes now retain branch-owned direct and terminal radiance in
64-byte, tile/depth-bounded path nodes. After the bounce passes, one root
invocation reduces the complete sibling tree and commits one weighted camera
sample. Fixed rendering still uses a weight of `1 / renderedSamplesPerPixel`;
this is not yet per-pixel adaptive normalization. The
`deferredPathResolve: false` comparison retains its terminal-policy differences,
but no longer performs unsafe concurrent writes to pixel accumulation.

`renderFrame({ readStats: true })` reports `pathCompletionValid`: `true` for
complete lineage, `false` when any sample failed, and `null` when integrity was
not read back. Reject false/unknown results for qualification. Overflow or
invalid lineage is sticky for the frame; affected pixels carry invalid alpha
and a magenta diagnostic, including through denoise. A new frame resets the
failure state. Full-screen refractive scenes can still exceed bounded queue
capacity and are rejected, not silently rendered with missing siblings.

At a 128 × 128 tile and depth eight, the actual node allocation is 9 MiB
(eight usable depth levels plus the retained guard level), versus 2.25 MiB for
the former shared-chain storage. This is allocated buffer memory, not physical
VRAM residency. The [ownership design](docs/design/split-path-ownership.md) and
[evidence ledger](docs/evidence/task-210-path-ownership.md) distinguish focused
physical checks from the outstanding image, variance, stress and release gates.

Primary camera visibility of environment and emissive sources now bypasses
terminal MIS: no competing next-event sample exists at bounce zero. Non-delta
secondary rays retain the existing PDF/weight calculation; delta paths retain
unit MIS weight. This narrow fixed-renderer correction adds no buffers or
dispatches. The [Task 212 design](docs/design/primary-terminal-mis.md) and
[evidence status](docs/evidence/task-212-primary-terminal-mis.md) separate local
checks from bounded physical evidence and outstanding full-scene qualification.
All 24 controlled 1/32/128-SPP lanes passed on Apple Metal-3 on 2026-09-14.
Serve the repository's `src/` and
`tests/fixtures/` paths on loopback and open
`tests/fixtures/primary-terminal-mis.html` to run the focused linear-HDR probes.
This does not enable adaptive sampling or establish a new quality baseline.

When an `environmentMap` is provided, the wavefront trace shader samples it as
an equirectangular radiance source for environment misses and uses the same
mapped radiance for terminal residuals before falling back to static ambient.
The procedural horizon/zenith/sun model remains the fallback for callers that
have not supplied an HDRI/radiance texture. `environmentLighting.sunlitBaseline`
adds a time-of-day daylight floor to terminal and direct environment estimates,
so bright presets retain colour at the last collision without returning to a
whitewashed global ambient term. Extremely dark recorded bounce responses are
also remapped to a small scene-brightness-driven luminance floor so bright
low-sample scenes do not produce isolated black speckles when a valid terminal
source was already found. Awaited `renderFrame({ readStats: true })` results now
keep linear accumulation unclamped, sanitize only invalid or half-float-
overflow samples before presentation, and expose
`terminalRadiance.totalLuminance`,
`terminalRadiance.ambientResidualLuminance`, and
`terminalRadiance.ambientResidualShare` so validation harnesses can track how
much of the final resolved image came from terminal ambient residuals.
The same stats also expose `radianceDiagnostics.invalidSamples` and
`radianceDiagnostics.legacyClampEquivalentSamples`, so hardening scenes can
measure NaN/Inf cleanup and legacy-4.0-equivalent fireflies without
re-introducing a hidden estimator clamp.
When `strictPhysicalLowSppLighting` is enabled, termination stats also separate
`absorptionNull`, `russianRoulette`, and `strictMaxDepth` so validation can
distinguish physically explainable dark samples from legacy ambient fallback.
For static mesh scenes, the GPU acceleration build is submitted once and then
reused by subsequent frames. Per-frame tracing writes one dynamic uniform slot
per tile/sample or post-process pass and batches tile tracing, tile output,
optional denoise, and presentation into bounded command submissions controlled
by `maxFramePassesPerSubmission` to keep 4K/high-spp command buffers from
becoming oversized. `updateCamera(...)` can update the per-frame camera uniforms
without rebuilding scene buffers. `renderFrame(...)` also accepts an optional
`frameTimeBudgetMs` plus `minimumSamplesPerPixel`: when present, configured
`samplesPerPixel` becomes a ceiling instead of a hard requirement, the renderer
guarantees at least the minimum full-screen pass, and frame stats report both
configured `samplesPerPixel` and actual `renderedSamplesPerPixel` so realtime
callers can budget motion frames without overstating delivered quality.
Before requesting a WebGPU device, the renderer derives the largest scene
storage binding from the normalized scene, mesh, and BVH records. It requests
the smallest sufficient `maxStorageBufferBindingSize` (and `maxBufferSize` only
when the WebGPU default is also exceeded), preserves stricter caller limits,
and rejects unsupported adapters before device creation. Default-sized scenes
do not elevate either size limit. `config.memory` and snapshot memory telemetry
describe the actual persistent GPU buffer descriptors: placeholder records,
combined BVH/emissive storage, mesh source buffers, aligned frame/build uniform
buffers, counters, and dispatch arguments are each counted exactly once;
`materialTableBytes` is zero because material data is packed into mesh and
triangle records rather than a standalone GPU buffer.
For consumers that want to hand wavefront SPP adaptation to
`@plasius/gpu-performance`, `createWavefrontAdaptiveSamplingLevels(...)` exposes
a bounded low-to-high ladder of per-frame `samplesPerPixel`,
`frameTimeBudgetMs`, and `minimumSamplesPerPixel` configs that stay aligned
with the renderer's supported adaptive-sampling surface. Frame stats and
snapshots expose
`gpuParallelism` diagnostics with adapter compute limits, configured workgroup
size, direct compute dispatches, known workgroups/invocations, indirect dispatch
counts, and upper-bound indirect work estimates. WebGPU does not expose physical
GPU core counts, so `physicalCoreCount` remains `null`; use
`exposesMultiWorkgroupParallelism`, `largestDirectWorkgroupsPerDispatch`, and
`largestEstimatedIndirectWorkgroupsPerDispatch` to confirm the renderer is
issuing multi-workgroup GPU work. Awaited frame results also expose a
`transportGuardrails` summary with jobs/frame, jobs/s, jobs/submission, command
submissions, queue-overflow count, radiance diagnostics, total tracked memory
bytes, and device-loss status so validation harnesses can gate transport work
without scraping ad hoc metrics from multiple fields. Treat any sustained >10%
drop in jobs/submission or jobs/s versus the approved baseline as a
release-validation failure unless a linked ticket explicitly approves the
regression; `submission-batching` warns when the renderer falls back to roughly
one GPU job per submission despite a higher pass ceiling.

Awaited fixed-SPP renders can opt into exact ray and timing evidence:

```js
const frame = await renderer.renderFrame({
  readStats: true,
  readOutputProbe: false,
});

console.log({
  primaryRays: frame.primaryRays,
  secondaryRays: frame.secondaryRays,
  totalPathSegments: frame.totalPathSegments,
  bounceHistogram: frame.rayCounts.bounceHistogram,
  gpuTimeMs: frame.timings.totalGpuTimeMs,
  renderJobTimeMs: frame.timings.totalRenderJobTimeMs,
  timingSource: frame.timings.source,
});
```

`primaryRays` is the exact number of camera samples. `secondaryRays` is the
sum of active continuation records intersected after bounce zero, including
bounded reflection/transmission branches, and `totalPathSegments` is their sum.
The renderer copies the existing active-queue counter once per bounce into a
lazily allocated telemetry buffer; it does not add diagnostic shader atomics or
change WGSL transport. `rayCounts.status` distinguishes available,
unavailable, failed, and not-requested evidence. A mismatch between scheduled
and observed primary rays fails the `ray-count-telemetry` transport guardrail.
Ray-count reduction uses constant call-stack space, including the supported
4K/eight-bounce/128-SPP stress envelope where hundreds of thousands of
tile/sample/depth records collapse into a small per-bounce histogram.

When the adapter exposes `timestamp-query`, the device requests it
opportunistically and two timestamps measure the GPU span from the first
primary pass through presentation. Set `gpuTimestamps: false` at renderer
creation to prevent that optional feature request. Where timestamp queries are
not exposed or fail, `timings` reports `source: "queue-completion"`, leaves
`totalGpuTimeMs` null, and retains the awaited
`totalRenderJobTimeMs`. Classification, compaction, and sampling sub-pass times
remain null until the corresponding adaptive passes exist. Without
`readStats: true`, and for `renderOnce()`, the fixed dispatcher creates no
telemetry buffers, query sets, readbacks, or timestamped pass descriptors.

After each
primary-ray or compaction pass, the GPU writes the active-ray workgroup count
into the counter buffer and the encoder copies it into an indirect-dispatch
argument buffer. Intersection and surface-resolution passes therefore scale
with active continuation rays instead of the maximum tile capacity, while still
avoiding CPU readback between bounces. WebGPU
still preserves ordering between dependent bounce passes, but the renderer
keeps CPU queue submissions bounded rather than forcing one submission per
tile/sample. Awaited higher-SPP submission slicing remains tile-major because
the accumulation buffer is tile-local; changing that order to sample-major
would mix samples across tiles and corrupt the resolved image.
Environment-light portals can additionally guide and gate sky/HDRI contribution
through rectangular openings such as windows. `environmentPortalMode: "guide"`
biases diffuse continuation rays toward configured openings, while
`"guide-and-gate"` requires an environment miss to pass through a portal before
it receives sky radiance; misses outside a portal fall back to the ambient
residual. This keeps interior rooms from treating the whole sky as visible from
every bounce.
Texture sampling, dynamic TLAS updates, higher-grade LBVH/SAH construction,
runtime execution behind the `@plasius/gpu-worker` lock-free queue, and broader
material lookup remain follow-up work.

## XR integration

```js
import { createXrManager } from "@plasius/gpu-xr";
import { createGpuRenderer } from "@plasius/gpu-renderer";

const renderer = await createGpuRenderer({ canvas: "#scene" });
const xr = createXrManager();

renderer.bindXrManager(xr, {
  onSessionStart: () => console.log("XR active"),
  onSessionEnd: () => console.log("XR inactive"),
});
```

## API

- `supportsWebGpu(options)`
- `createGpuRenderer(options)`
- `createRendererDebugHooks(options)`
- `getRendererWorkerProfile(name?)`
- `getRendererWorkerManifest(name?)`
- `createRayTracingRenderPlan(options)`
- `createWavefrontPathTracingComputeRenderer(options)`
- `createWavefrontPathTracingComputeConfig(options)`
- `createWavefrontPathTracingComputeShaderSource(options?)`
- `renderWavefrontPathTracingComputeFrame(options)`
- `createWavefrontReferenceRay(config, options?)`
- `intersectWavefrontReferenceTriangle(ray, triangle, options?)`
- `traceWavefrontReferenceTriangles(config, ray, triangles, options?)`
- `normalizeWavefrontMesh(input)`
- `createWavefrontGpuMeshSource(meshes)`
- `createWavefrontBvhSortStages(itemCount)`
- `createWavefrontBvhBuildLevels(triangleCount)`
- `createWavefrontMeshAcceleration(meshes)`
- `normalizeWavefrontSceneObject(input)`
- `packWavefrontSceneObjects(sceneObjects, capacity?)`
- `packWavefrontTriangles(triangles, capacity?)`
- `packWavefrontBvhNodes(nodes, capacity?)`
- `rendererWavefrontComputeMode`
- `rendererWavefrontComputeWorkgroupSize`
- `rendererWavefrontComputeStatsStride`
- `bindRendererToXrManager(renderer, xrManager, options)`
- `defaultRendererClearColor`
- `rendererDebugOwner`
- `rendererWorkerQueueClass`
- `defaultRendererWorkerProfile`
- `rendererWorkerProfiles`
- `rendererWorkerProfileNames`
- `rendererWorkerManifests`

The reference helpers mirror the renderer WGSL camera and triangle-hit math in
deterministic JavaScript so tests and downstream tooling can validate primary
ray generation, barycentrics, nearest-hit selection, and environment misses
without standing up a WebGPU device.

## Demo

Run the demo server from the repo root:

```sh
cd gpu-renderer
npm run demo
```

Then open `http://localhost:8000/gpu-renderer/demo/`.

The demo now mounts the mesh BVH WebGPU wavefront renderer directly and passes a
`@plasius/gpu-lighting` environment preset into the render. It reports the
active wavefront depth, tile count, triangle/BVH counts, lighting preset, probe
luminance, and hot buffer memory so it is clear whether the renderer is tracing
mesh paths rather than only showing planning metadata.

## Development Checks

```sh
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npm run pack:check
```

## Files

- `src/index.js`: public package facade for renderer runtime, render-plan, and
  wavefront exports.
- `src/renderer-*.js`: framework-agnostic renderer constants, validation,
  worker manifests, wavefront render plans, and WebGPU runtime/XR binding
  helpers.
- `src/wavefront-compute.js`: canonical WebGPU mesh BVH wavefront renderer
  lifecycle, live state, and public renderer instance methods.
- `src/wavefront-acceleration-builder.js`, `src/wavefront-frame-encoder.js`,
  `src/wavefront-frame-dispatcher.js`, and `src/wavefront-frame-stats.js`:
  purpose-specific acceleration build, pass encoding, tile/sample dispatch, and
  frame-stat policy helpers.
- `src/wavefront-bind-groups.js`, `src/wavefront-pipelines.js`,
  `src/wavefront-gpu-synchronization.js`, and `src/wavefront-readbacks.js`:
  WebGPU bind-group construction, pipeline construction, queue synchronization,
  and readback/probe helpers.
- `src/wavefront-config.js`: wavefront camera, environment, portal, memory, and
  scene-source configuration.
- `src/wavefront-scene-data.js`: compatibility facade for wavefront scene data
  helpers.
- `src/wavefront-materials.js`, `src/wavefront-scene-normalizers.js`, and
  `src/wavefront-mesh-sources.js`: material/medium normalization, scene/mesh
  normalization, texture-atlas creation, BVH source generation, and GPU mesh
  source packing.
- `src/wavefront-shaders.js` and `src/wavefront-shader-*.js`: WGSL assembly
  and purpose-specific shader source sections for layout, materials, lighting,
  BVH/intersection, and render kernels.
- `src/wavefront-gpu-resources.js`, `src/wavefront-packers.js`, and
  `src/wavefront-runtime-support.js`: GPU resources, binary record packers, and
  WebGPU runtime/pipeline support.
- `src/wavefront-reference.js` and `src/wavefront-sampling.js`: deterministic
  reference transport and sampling helpers used by validation tests.
- `src/index.d.ts`: public API typings.
- `scripts/check-source-syntax.cjs`: syntax-checks every JavaScript source file
  included under `src/`.
- `tests/package.test.js`: unit tests for renderer lifecycle behavior.
- `docs/design/worker-manifest-integration.md`: renderer frame-stage DAG model.
- `docs/adrs/*`: architecture decisions for renderer runtime design.
- `docs/tdrs/*`: technical direction for frame hook integration.

<!-- BEGIN PLASIUS RELEASE INTEGRITY -->
## Release integrity

CI keeps the administrative contributor registry outside Git and npm package
artifacts using exact, case-normalised path checks. CI runs only for pushes to
repository-owned branches on explicit `[self-hosted, Linux, X64]` runners.
External fork pull requests trigger no CI execution; a maintainer must review
and move a contribution to a repository-owned branch to produce required checks.
Before branch CI starts, an authorised maintainer reviews the exact commit and
locks its repository branch as read-only, enforcing the lock for administrators
and disabling force pushes, deletion, and fork syncing. After reading back the
lock and commit SHA, admit only that branch's fully qualified workflow ref for
`gpu-renderer/.github/workflows/ci.yml` in `Public CI - Quarantined`. Top-level
push jobs identify their workflow by branch ref; SHA-only admission did not
schedule the reviewed job. Remove the temporary workflow entry and verify its
removal before unlocking or updating the branch, and after delivery. Preserve all
other group restrictions. Never admit mutable branch or PR refs. See
[ADR-0028](docs/adrs/adr-0028-locked-branch-runner-admission.md) for the procedure.
The trusted admission, build-test, and artifact-integrity checks keep their
existing names for branch protection. Scheduled dependency validation also uses
bounded self-hosted capacity and accepts only `main`. Release preparation and
publication use a two-run exact-main protocol on GitHub-hosted Node.js 24.18.0
LTS. A read-only job seals the package tarball and SBOM before a dependency-free
production job publishes that exact artifact through npm OIDC with provenance;
there is no npm write-token fallback. CD remains disabled until the npm trusted
publisher binding and protected-branch-only production environment are
independently verified.
<!-- END PLASIUS RELEASE INTEGRITY -->
