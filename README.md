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
```

The plan makes the stable visual snapshot boundary explicit, publishes the
required RT-first stage ordering, and exposes representation-band plus
acceleration-structure update policy metadata for downstream lighting and
performance packages.

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
- `bindRendererToXrManager(renderer, xrManager, options)`
- `defaultRendererClearColor`
- `rendererDebugOwner`
- `rendererWorkerQueueClass`
- `defaultRendererWorkerProfile`
- `rendererWorkerProfiles`
- `rendererWorkerProfileNames`
- `rendererWorkerManifests`

## Demo

Run the demo server from the repo root:

```sh
cd gpu-renderer
npm run demo
```

Then open `http://localhost:8000/gpu-renderer/demo/`.

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
- `src/index.d.ts`: public API typings.
- `tests/package.test.js`: unit tests for renderer lifecycle behavior.
- `docs/design/worker-manifest-integration.md`: renderer frame-stage DAG model.
- `docs/adrs/*`: architecture decisions for renderer runtime design.
- `docs/tdrs/*`: technical direction for frame hook integration.
