# ADR 0006: WebGPU Wavefront Scene-Object Renderer

## Status

Accepted for analytic debug fixtures. Superseded for all display-quality
path-traced rendering by ADR 0007.

## Context

The renderer package had a wavefront path-tracing plan and buffer contract, but
no executable WebGPU path-tracing runtime. The renderer needed a small
screen-driven active-ray fixture without returning to CPU canvas tracing, and it
must avoid full-screen ray queues that exceed browser storage-buffer limits at
720p, 1080p, and future 4K targets.

## Decision

`@plasius/gpu-renderer` owns a framework-agnostic WebGPU compute wavefront
renderer that:

- generates primary rays per tile from the active camera;
- uses ping-pong ray queues and hit buffers on the GPU;
- evaluates all active rays breadth-first by bounce depth;
- terminates paths on emissive or environment hits;
- uses configurable ambient residual radiance for expired paths;
- writes a storage texture and presents it through a WebGPU render pass;
- accepts bounded analytic scene objects (`sphere` and `box`) as a debug-only
  scene-submission shape.

The renderer uses tiled queues rather than one full-screen queue. Tile size is
clamped against device storage-buffer limits, keeping 4K presentation possible
without allocating 4K-sized ray queues per bounce.

## Consequences

- Positive: demos can validate active-ray execution through a package API
  instead of private viewer code.
- Positive: queue memory now scales with tile size, not presentation resolution.
- Positive: downstream packages can build scene adapters without owning WebGPU
  shader orchestration.
- Neutral: this is an analytic debug path, not a display-quality renderer.
- Negative: direct light sampling remains intentionally absent; paths must hit
  emissive geometry or the environment to contribute significant radiance.
- Negative: no user-visible renderer can use this path for visual acceptance
  because it does not preserve triangle silhouettes, per-vertex normals, UVs,
  textures, or mesh material identity.

## Follow-On Work

- Add triangle mesh buffers and a BVH/BLAS/TLAS acceleration structure before
  any path-traced output is considered display quality.
- Add temporal accumulation history and a stronger denoise pass.
- Add richer material and texture binding tables once mesh intersections are in
  place.
