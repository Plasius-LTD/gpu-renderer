# Worker Manifest Integration

## Overview

`@plasius/gpu-renderer` publishes renderer frame stages as worker-manifest DAGs
so the shared scheduling and performance packages can coordinate render work
without reverse-engineering the render loop.

## Profiles

### Realtime

- Roots: `acquire`, `visibility`
- Critical path: `acquire` + `visibility` -> `mainEncode` -> `postProcess` ->
  `submit`
- Purpose: flat/mobile/desktop rendering where post-processing remains a
  degradable visual stage

### XR

- Roots: `acquire`, `visibility`
- Critical path: `acquire` -> `lateLatch`
- Join point: `visibility` + `lateLatch` -> `mainEncode` -> `submit`
- Purpose: headset rendering where late pose alignment is explicit and
  post-processing is intentionally omitted from the base critical path

## Integration Contract

- `getRendererWorkerProfile(name?)` exposes stable profile names and stage lists.
- `getRendererWorkerManifest(name?)` exposes the full worker-ready manifest.
- `queueClass` is always `render`.
- `authority` is always `visual`.
- `schedulerMode` is always `dag`.

## Why The Renderer Owns This

The renderer is the authoritative owner of frame-stage ordering. Publishing the
manifest here keeps worker coordination honest:

- `@plasius/gpu-worker` can schedule the same stage topology the renderer
  expects.
- `@plasius/gpu-performance` can map renderer stages into adaptive worker
  budgets.
- `@plasius/gpu-debug` can correlate queue and allocation diagnostics using the
  manifest debug metadata.
