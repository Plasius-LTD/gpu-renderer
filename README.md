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
their WGSL layouts.

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
uploaded as source buffers for GPU triangle assembly and GPU BVH construction.
Vertex normals are preserved for smooth shading; when normals are absent the
triangle geometric normal is used. The display-quality path uses
`accelerationBuildMode: "gpu"` and rejects CPU-built acceleration. The
`createWavefrontMeshAcceleration(...)` helper remains available only for debug
fixtures and deterministic layout tests. GPU BVH construction now uses
Morton-style centroid keys to sort leaf references before sorted leaves and
level-concurrent internal nodes are materialized. The current mesh path is the
GPU runtime baseline under active hardening.
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

`samplesPerPixel` controls how many GPU primary-ray samples are accumulated per
screen pixel within a single render. This multiplies dispatch work but does not
increase the tile queue memory footprint, so 720p/1080p/4K targets remain
bounded by `tileSize`. When `denoise` is enabled the renderer writes raw
linear radiance to an `rgba16float` texture first, then runs a two-stage
full-frame GPU denoise through an `rgba16float` scratch texture before final
tone mapping into the presented `rgba8unorm` output. Filtering in linear
radiance space lets the denoise pass cross tile boundaries without compressing
energy/detail before the final resolve. The renderer also stores compact
emissive-triangle metadata in the existing BVH buffer tail and uses it to guide
diffuse continuation rays toward finite mesh light geometry. This is not a
separate shadow/direct-light pass: the active ray still has to hit emissive
geometry or miss into the environment before radiance is committed. Guided
emissive hits carry a bounded estimator weight so finite light guidance does not
over-expose low-sample renders before full material PDFs/MIS are implemented.
High-energy samples are clamped in linear radiance space to keep low-sample
preview output stable while production sampling, temporal accumulation, and
better material PDFs are hardened. By default, `deferredPathResolve` records
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
source was already found.
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
submitting work that can occupy more than one GPU execution unit. After each
primary-ray or compaction pass, the GPU writes the active-ray workgroup count
into the counter buffer and the encoder copies it into an indirect-dispatch
argument buffer. Intersection and surface-resolution passes therefore scale
with active continuation rays instead of the maximum tile capacity, while still
avoiding CPU readback between bounces. WebGPU
still preserves ordering between dependent bounce passes, but the renderer
keeps CPU queue submissions bounded rather than forcing one submission per
tile/sample.
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

- `src/index.js`: WebGPU renderer runtime and XR binding helper.
- `src/wavefront-compute.js`: Canonical WebGPU mesh BVH wavefront renderer,
  debug scene-object fixtures, and deterministic reference helpers.
- `src/index.d.ts`: public API typings.
- `tests/package.test.js`: unit tests for renderer lifecycle behavior.
- `docs/design/worker-manifest-integration.md`: renderer frame-stage DAG model.
- `docs/adrs/*`: architecture decisions for renderer runtime design.
- `docs/tdrs/*`: technical direction for frame hook integration.
