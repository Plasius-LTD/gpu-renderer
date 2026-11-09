# Renderer development

## Demo

From the repo root, install from the lockfile, build, and start the demo server:

```sh
npm run zero-three:source
npm ci --legacy-peer-deps
npm run build
npm run demo
```

Open `http://127.0.0.1:8000/demo/`. The Python 3 server binds to loopback and
serves the current checkout. Pass a port with `npm run demo -- 8080` if needed.

The harbor uses the public renderer and shared showcase entries. The demo's
HTML import map points those package names and the ESM dependencies they need
at their local published exports. This keeps lazy showcase modules and assets
at their original paths. When dependency exports change, update the map and
run `node --test tests/demo-imports.test.js` after building.

## Setup and validation

Use the repository's Node.js version. Run source admission before installing
dependencies, then validate the installed and built package:

```sh
npm run zero-three:source
npm ci --legacy-peer-deps
npm run lint
npm run typecheck
npm run build
npm run test:coverage
npm run pack:check
npm run zero-three
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

## Renderer dependency boundary

This implementation owns its WebGPU pipeline. Repository validation keeps its
production, development, test, tooling, peer, optional and artifact dependency
graphs independent of Three.js, R3F, TSL and their related packages, including
transitive dependencies. This is a constraint on this renderer's implementation,
not a judgement about those projects. The existing dependency checks remain
required for every contribution and release.

Run `npm run zero-three:source` before installing dependencies, or run
`npm run build && npm run zero-three` after `npm ci` for the installed graph,
built bundle, actual npm tarball, and generated CycloneDX evidence. The full
command writes digest-bound package/version evidence to
`release-artifacts/zero-three-evidence.json`. CI retains it, and production CD
passes it by immutable artifact ID, verifies it again, attaches it to the
GitHub release, and attests it.
