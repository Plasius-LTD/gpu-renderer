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
- `bindRendererToXrManager(renderer, xrManager, options)`
- `defaultRendererClearColor`

## Demo

Run the demo server from the repo root:

```sh
cd gpu-renderer
npm run demo
```

Then open `http://localhost:8000/gpu-renderer/demo/`.

## Files

- `src/index.js`: WebGPU renderer runtime and XR binding helper.
- `src/index.d.ts`: public API typings.
- `tests/package.test.js`: unit tests for renderer lifecycle behavior.
- `docs/adrs/*`: architecture decisions for renderer runtime design.
