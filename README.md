# @plasius/gpu-renderer

[![npm version](https://img.shields.io/npm/v/@plasius/gpu-renderer.svg)](https://www.npmjs.com/package/@plasius/gpu-renderer)
[![Build Status](https://img.shields.io/github/actions/workflow/status/Plasius-LTD/gpu-renderer/ci.yml?branch=main&label=build&style=flat)](https://github.com/Plasius-LTD/gpu-renderer/actions/workflows/ci.yml)
[![coverage](https://img.shields.io/codecov/c/github/Plasius-LTD/gpu-renderer)](https://codecov.io/gh/Plasius-LTD/gpu-renderer)
[![License](https://img.shields.io/github/license/Plasius-LTD/gpu-renderer)](./LICENSE)
[![Code of Conduct](https://img.shields.io/badge/code%20of%20conduct-yes-blue.svg)](./CODE_OF_CONDUCT.md)
[![Security Policy](https://img.shields.io/badge/security%20policy-yes-orange.svg)](./SECURITY.md)
[![Changelog](https://img.shields.io/badge/changelog-md-blue.svg)](./CHANGELOG.md)

[![license](https://img.shields.io/github/license/Plasius-LTD/gpu-renderer)](./LICENSE)

Framework-agnostic WebGPU renderer runtime for Plasius projects.
This package is intended to replace Three.js-dependent render orchestration with
an explicit WebGPU-first runtime that can be consumed from React, vanilla, or
worker-driven app surfaces.

Apache-2.0. ESM + CJS builds.

## Install

```sh
npm install @plasius/gpu-renderer
```

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

The production transport rollout remains gated by
`renderer.transport.physicalEstimator`. With the flag enabled, deferred
continuation vertices carry sanitized physical throughput segments instead of a
heuristic material-response tint, while the older fallback path remains the
rollback route during validation.
Low-SPP physical lighting hardening is separately controlled by the boolean
`renderer.transport.strictPhysicalLowSppLighting` flag, passed either as
`strictPhysicalLowSppLighting: true` or through `featureFlags`. When enabled,
the renderer disables terminal ambient rescue for max-depth/null-throughput
termination, samples procedural sunlight as an explicit shadow-tested
directional source, samples procedural sky over the visible hemisphere, and
selects emissive triangles by area-weighted emission power with matching MIS
PDFs. Use `denoise: false` when validating this strict path so remaining
variance is measured in the transport rather than hidden by filtering.

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
By default, `deferredPathResolve` records
per-bounce material responses in a tile-bounded path buffer and records the
terminal emissive/HDRI/environment source in the final path slot. The output
pass then resolves that recorded path backward and adds the weighted sample to
the pixel accumulation, so unresolved continuation light is still deferred until
a terminal source is known. Surface resolution may still add a small
shadow-tested direct-light term immediately when it has an explicit source and
visibility result, which keeps true occlusion shadows possible without falling
back to broad per-bounce ambient fill. Set `deferredPathResolve: false` only
for legacy forward-accumulation comparison.
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
submitting work that can occupy more than one GPU execution unit. After each
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
