# ADR 0005: Ray-Tracing-First Hybrid Render Graph

## Status

Accepted

## Context

The next renderer direction is no longer a generic raster-first frame pipeline.
The architecture now targets a premium, ray-tracing-first hybrid renderer that
still uses efficient visibility and assist paths to control cost.

`@plasius/gpu-renderer` already exposes frame hooks and worker-manifest
profiles, but it needs an explicit architectural record for how future render
orchestration should be structured before the code phase begins.

## Decision

`@plasius/gpu-renderer` will plan around a ray-tracing-first hybrid render
graph with these assumptions:

- the renderer consumes stable visual snapshots rather than in-flight
  simulation state
- raster or depth-oriented visibility work remains the efficient path for
  primary scene determination
- ray tracing is the premium path for direct shadows, reflections, and
  important indirect lighting
- temporal accumulation and denoising are first-class render stages
- the renderer should understand representation bands:
  - `near`
  - `mid`
  - `far`
  - `horizon`
- acceleration-structure planning should distinguish static, rigid-dynamic,
  deforming, and proxy-driven RT participants

## Planned Frame Ordering

The preferred future render ordering is:

1. primary visibility and depth preparation
2. shadow preparation or assist paths
3. opaque scene foundation
4. ray-traced direct lighting and shadows
5. ray-traced reflections
6. ray-traced indirect lighting or GI
7. denoising and temporal accumulation
8. transparents, particles, and volumetrics
9. final composition
10. present

## Consequences

- Positive: render, lighting, and performance packages align on one shared
  premium path.
- Positive: range-banded representation becomes part of renderer planning
  instead of an afterthought.
- Positive: future post-processing and denoising work can be attached to an
  explicit frame model.
- Neutral: this ADR records orchestration direction; it does not yet implement
  individual passes.

## Follow-On Work

- Define the technical contract for representation bands, pass ordering, and
  acceleration-structure update classes.
- Add contract and unit test plans before coding the render-graph changes.
