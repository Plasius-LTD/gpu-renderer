# @plasius/gpu-renderer

[![npm version](https://img.shields.io/npm/v/@plasius/gpu-renderer.svg)](https://www.npmjs.com/package/@plasius/gpu-renderer)
[![Build Status](https://img.shields.io/github/actions/workflow/status/Plasius-LTD/gpu-renderer/ci.yml?branch=main&label=build&style=flat)](https://github.com/Plasius-LTD/gpu-renderer/actions/workflows/ci.yml)
[![coverage](https://img.shields.io/codecov/c/github/Plasius-LTD/gpu-renderer)](https://codecov.io/gh/Plasius-LTD/gpu-renderer)
[![License](https://img.shields.io/github/license/Plasius-LTD/gpu-renderer)](./LICENSE)
[![Code of Conduct](https://img.shields.io/badge/code%20of%20conduct-yes-blue.svg)](./CODE_OF_CONDUCT.md)
[![Security Policy](https://img.shields.io/badge/security%20policy-yes-orange.svg)](./SECURITY.md)
[![Changelog](https://img.shields.io/badge/changelog-md-blue.svg)](./CHANGELOG.md)

Framework-independent WebGPU rendering for browser applications. Render triangle
meshes with the wavefront path tracer, draw native raster surfaces, or use the
frame lifecycle and XR integration APIs in your own rendering pipeline.

The APIs expose GPU resource ownership, render passes and sample accumulation
directly. Use them from JavaScript or TypeScript when you want explicit control
over your application's WebGPU pipeline.

Apache-2.0 · ESM and CommonJS · TypeScript declarations included.

## Install

```sh
npm install @plasius/gpu-renderer
```

Use Node.js 24 or later for package tooling and a WebGPU-capable browser over
HTTPS or localhost for rendering. This is a browser GPU runtime; installing it
in Node does not provide a GPU device. A bundler resolves the package imports.
Initialization rejects when WebGPU or the requested resources are unavailable;
your application should present that error and an appropriate retry/fallback UI.

## Quick start: render a mesh

Add a canvas to your page:

```html
<canvas id="scene" width="640" height="360" aria-label="Rendered triangle"></canvas>
```

The following browser module renders a single emissive triangle:

```js
import { createWavefrontPathTracingComputeRenderer } from "@plasius/gpu-renderer";

const renderer = await createWavefrontPathTracingComputeRenderer({
  canvas: "#scene",
  width: 640,
  height: 360,
  maxDepth: 2,
  samplesPerPixel: 1,
  meshes: [{
    id: 1,
    positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
    indices: [0, 1, 2],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
    emission: [8, 7, 5, 1],
  }],
});

await renderer.renderFrame();

// Call this from your route or component cleanup.
export function dispose() {
  renderer.destroy();
}
```

`destroy()` is idempotent and releases both renderer resources and its dedicated
GPU device. Await any reference frame you intend to keep before disposal; the
device cannot be reused afterward. The factory requests its own device and does
not accept a borrowed device.

Supply decoded triangle geometry and material/texture data through `meshes`.
The renderer does not fetch glTF files: use a loader such as
[`@plasius/gpu-shared`](https://www.npmjs.com/package/@plasius/gpu-shared), or adapt
canonical decoded assets with `createCanonicalWavefrontMeshInputs`.
The canonical adapter maps the core 0.5 material texture slots; it currently
accepts UV0 and identity texture transforms. Other selections/transforms fail
explicitly so authored appearance is not silently changed. See the
[canonical integration contract](docs/guides/integration.md#canonical-model-ingestion).
Canonical blend materials multiply authored factor alpha by texture alpha once;
opaque materials ignore both alpha channels. Direct `WavefrontMeshInput` callers
can select `alphaMode: "opaque" | "blend"`; omitting it preserves legacy opacity
composition. Alpha masks remain unsupported by the canonical adapter.
Referenced canonical unlit workflows and declared `KHR_materials_unlit`/`unlit`
extension markers are unsupported and fail explicitly. Keep those assets on an
unlit-capable rendering path; do not drop their markers or reinterpret them as lit.
For an interactive model viewer with loading, integrity checks, camera gestures
and quality controls, use the shared package's `model-inspection` entry.

## Repeat geometry with instances

Pass each mesh once and reference its ID from `instances`. This shares geometry,
material textures and each mesh's acceleration structure across placements:

```js
import { createWavefrontPathTracingComputeRenderer } from "@plasius/gpu-renderer";

const renderer = await createWavefrontPathTracingComputeRenderer({
  canvas: "#scene",
  meshes: [{
    id: 1,
    positions: [-0.4, 0, 0, 0.4, 0, 0, 0, 0.8, 0],
    indices: [0, 1, 2],
    color: [0.3, 0.6, 0.4, 1],
  }],
  instances: Array.from({ length: 100 }, (_, index) => ({
    id: index + 1,
    meshId: 1,
    transform: [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      (index % 10) - 4.5, 0, Math.floor(index / 10) - 4.5, 1,
    ],
  })),
  camera: { position: [12, 10, 16], target: [0, 0, 0] },
  memoryBudgetBytes: 512 * 1024 * 1024,
});
await renderer.renderFrame();
console.log(renderer.getSnapshot().allocations);
renderer.destroy();
```

Transforms are invertible column-major affine matrices, including nonuniform
scale and reflection. Every supplied mesh needs an instance; IDs must be unique
within their respective mesh/instance lists. The initial instance path supports
static non-emissive meshes with CPU acceleration construction. Unsupported
emissive instances or GPU acceleration requests fail explicitly.

`memoryBudgetBytes` limits renderer-owned resource storage. Admission also checks
individual device limits. `getSnapshot().allocations` reports current/peak bytes
and individual buffers/textures, including refinement and denoising resources.
These are requested allocation sizes, not a measurement of free VRAM or driver
residency. A larger instance count adds transforms and scene-index nodes without
multiplying the underlying geometry. Large buffer uploads use bounded sequential
staging to reduce temporary upload pressure. Recreate the runtime to replace instances.

Instance records pack across both texture dimensions, so the texture height is
not an instance-count ceiling. The granted device texture dimensions, buffer
binding limits and `memoryBudgetBytes` determine admission. The memory snapshot
reports logical `instanceBytes` and padded `instanceTextureBytes`; allocation
diagnostics include the actual requested texture size and TLAS buffer. Instance
texture uploads also use sequential chunks no larger than 8 MiB. More instances
still require ray traversal and shading work: qualify performance at your target
resolution, sampling and material complexity.

Closest-hit traversal visits the nearer instance-tree child first, then prunes
bounds beyond the nearest accepted hit. Geometry trees retain their canonical
right-first order.
Inverse ray directions and pending instance bounds distances are reused. Equal-distance
hits retain the original right-first leaf and within-leaf triangle ordering for
both CPU-built and GPU-built geometry trees; this does not change sample counts, bounces,
materials or triangle intersection arithmetic. See the
[traversal design](docs/design/forest-traversal-throughput.md) for qualification
and the rejected deferred-shading experiment. Frame-rate targets still belong
to the application's performance governor and require device-specific validation.

## Choose a rendering API

| API | Purpose |
| --- | --- |
| `createWavefrontPathTracingComputeRenderer` | Tiled, mesh-BVH path tracing with material transport, environment lighting and optional progressive accumulation |
| `createNativeSceneRenderer` | Native raster triangles, authored surface maps, shadows and optional animated water |
| `createGpuRenderer` | Device/canvas setup, clear pass, frame hooks and XR binding for a host-owned pipeline |
| `createProfessionalAnimatedSceneRenderer` | The validated WebGPU animation scene path with skinned assets and root-motion requirements |
| `createAnimatedSceneRenderer` | The existing canvas animation-adventure surface |
| `createRayTracingRenderPlan` | Rendering plan metadata; it does not draw a scene |

All factories are exported from `@plasius/gpu-renderer`. Keep the import and GPU
initialization inside the route that needs them. The host owns loading/error UI,
visibility policy, accessible controls, and disposal when leaving the view.

## Progressive rendering

Set `progressive: true` when creating the wavefront renderer. Its creation-time
`samplesPerPixel` sets batch capacity; each `renderFrame({ samplesPerPixel })`
may submit a smaller batch. Await batches serially and stop scheduling when your
sample target is reached or the view is hidden. `renderFrame()` waits for GPU
completion by default.

For a motion preview, pass `renderScale: 0.64` to `renderFrame`. The active
resolution shrinks within the original scene/texture allocations; the full canvas
and camera projection remain stable. Omit the option (or pass1) when input stops
to restore full-resolution refinement. Resolution changes discard progressive
history, so preview samples never contaminate a full-quality reference. Scale
must be finite and greater than zero and at most one. Host performance policy
owns the scale/sample decision; a reduced preview is not a completed reference.
Frame statistics report active `width`/`height` and `renderScale`, separately from
`allocationWidth`/`allocationHeight`. Await each frame before another submission;
a second submission while `renderFrame` is pending rejects explicitly.

Camera and scene changes reset accumulated radiance. `updateCamera()` preserves
the loaded meshes, materials and acceleration resources; do not call it between
refinement passes if the view has not changed. `resetAccumulation()` discards
history explicitly. Denoising runs after accumulation.

`getSnapshot().accumulatedSamplesPerPixel` counts **submitted** samples. If you
use synchronous `renderOnce()`, await `renderer.device.queue.onSubmittedWorkDone()`
before labelling that work complete. Public sampling is fixed per frame;
experimental per-pixel adaptive metadata does not enable adaptive rendering.
See the [wavefront guide](https://github.com/Plasius-LTD/gpu-renderer/blob/main/docs/guides/wavefront.md)
for memory, timing, transport flags and progressive behavior.

## Frame lifecycle without a scene

Use `createGpuRenderer` when your application owns the rendering pipeline. This
example clears the canvas and runs the frame lifecycle; it does not load or draw
3D models:

```js
import { createGpuRenderer } from "@plasius/gpu-renderer";

const renderer = await createGpuRenderer({
  canvas: "#scene",
  clearColor: "#102035",
});
renderer.resize(640, 360);
renderer.start();

export function dispose() {
  renderer.destroy();
}
```

## API and integration guides

- [Wavefront path tracing, materials and progressive refinement](https://github.com/Plasius-LTD/gpu-renderer/blob/main/docs/guides/wavefront.md).
- [Native surfaces, texture maps and clearcoat](https://github.com/Plasius-LTD/gpu-renderer/blob/main/docs/guides/native-surfaces.md).
- [Canonical ingestion, frame hooks, worker manifests, XR and diagnostics](https://github.com/Plasius-LTD/gpu-renderer/blob/main/docs/guides/integration.md). Snippets in this reference use host-provided decoded assets and services.
- [Animation scene contracts](https://github.com/Plasius-LTD/gpu-renderer/blob/main/docs/guides/animation.md).
- [Complete public TypeScript declarations](https://github.com/Plasius-LTD/gpu-renderer/blob/main/src/index.d.ts).
- [Crate material-study implementation notes](https://github.com/Plasius-LTD/gpu-renderer/blob/main/docs/guides/material-study-internals.md). Fixture helpers are internal; mount the study through `@plasius/gpu-shared/material-study`.

Experimental transport switches use the `featureFlags` options described in the
wavefront guide. The package consumes supplied decisions; it does not connect to
an account or remote flag service. Plasius production consumers also apply their
route capabilities and rollout policy before mounting a scene.

## Development

For checkout setup and required validation, start with the
[development guide](https://github.com/Plasius-LTD/gpu-renderer/blob/main/docs/guides/development.md).

`npm run demo` requires Python 3 and serves the parent workspace. With the checkout
named `gpu-renderer`, visit `http://localhost:8000/gpu-renderer/demo/`.
The development guide also describes the source layout. See
[CONTRIBUTING.md](https://github.com/Plasius-LTD/gpu-renderer/blob/main/CONTRIBUTING.md).

<!-- BEGIN PLASIUS RELEASE INTEGRITY -->
## Release integrity

CI keeps the administrative contributor registry outside Git and npm package
artifacts using exact, case-normalised path checks. CI runs only for pushes to
repository-owned branches in `Public CI - Quarantined` with literal
`[self-hosted, Linux, X64]` labels. The explicit group prevents the Default
group from accepting matching jobs. See [ADR-0051](docs/adrs/adr-0051-select-quarantine-runner-group.md).
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
the same bounded runner group and accepts only `main`. Release preparation and
publication use a two-run exact-main protocol on GitHub-hosted Node.js 24.18.0
LTS. A read-only job seals the package tarball and SBOM before a dependency-free
production job publishes that exact artifact through npm OIDC with provenance;
there is no npm write-token fallback. CD remains disabled until the npm trusted
publisher binding and protected-branch-only production environment are
independently verified.
<!-- END PLASIUS RELEASE INTEGRITY -->

Release CI discovery queries the exact main commit and validates the returned
run's branch, push event, completion and success locally. It does not rely on
GitHub's remote status index. See [release CI discovery](docs/design/release-ci-discovery.md)
for the failure mode and unchanged publication gates.


### Inspecting an animated canvas scene

The canvas animation preview supports an optional inspection pose. Camera
orientation and vertical field of view affect projected skinned vertices and
scene anchors. Input bindings remain the host's responsibility.

```js
import { createAnimatedSceneRenderer } from '@plasius/gpu-renderer';

const canvas = document.createElement('canvas');
document.body.append(canvas);
const animationRenderer = createAnimatedSceneRenderer({
  canvas, route: [{ id: 'origin', position: [0, 0, 0], arriveMs: 0 }],
});
animationRenderer.resize(800, 500);
animationRenderer.renderOnce(0);
animationRenderer.setInspectionCamera({
  position: [3, 2, 5], target: [0, 1, 0], fovYDegrees: 45,
});
// Resume the existing follow rig without restarting the animation timeline.
animationRenderer.setInspectionCamera(null);
animationRenderer.start();
// Keep the displayed pose while inspecting or respecting reduced motion.
animationRenderer.stop();
// Resume from the displayed time, excluding time spent paused.
animationRenderer.start();
animationRenderer.destroy();
```

Positions and targets must be finite three-component arrays with distinct
positions; vertical field of view is 12–90 degrees. This additive API belongs to
`createAnimatedSceneRenderer` (the canvas preview). It does not change the
separate professional WebGPU animation API.

`stop()` cancels automatic frame scheduling without destroying the scene. Camera
inspection still redraws the paused pose. `start()` and `stop()` are idempotent;
resuming excludes paused wall time, and a destroyed renderer cannot restart.
Hosts can call `stop()` immediately after mounting when reduced motion is requested.
