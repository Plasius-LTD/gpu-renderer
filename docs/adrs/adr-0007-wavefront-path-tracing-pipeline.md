# ADR 0007: Wavefront Path Tracing Pipeline

## Status

Accepted

## Context

ADR 0005 established a ray-tracing-first hybrid render graph for
`@plasius/gpu-renderer`, but it deliberately stopped at orchestration direction.
The current executable path tracing work in the `gpu-*` family lives primarily in
`@plasius/gpu-lighting` and processes all bounces for a pixel inside one compute
shader invocation.

The renderer now needs a pass-level architecture for screen-driven ray rendering
that can support primary rays, nearest-hit buffers, surface/material evaluation,
emissive light hits, environment contribution, reflection, refraction,
transparency, fluid interaction, accumulation, and denoising without recursive
shader logic or CPU readback between bounces.

## Decision

`@plasius/gpu-renderer` will treat wavefront path tracing as the canonical
pass-level model for full path tracing mode.

The renderer will process rays in GPU buffers breadth-first by bounce depth:

1. generate primary rays from screen pixels or texels
2. intersect the active ray queue against renderable scene geometry
3. write structured hit records
4. resolve surface/material data for every hit
5. accumulate emission or environment contribution when active path rays hit
   light sources or miss into the environment
6. evaluate surface/material scattering and write continuation rays
7. compact and swap ray queues
8. repeat until max depth, queue exhaustion, or budget termination
9. denoise, tone map, compose, and present

Explicit light sampling and visibility probes are allowed as optional
variance-reduction passes, but the correctness baseline is active path rays
gathering light by hitting emissive geometry or environment entries. If a sample
path never reaches a light source within the configured depth and throughput
limits, that sample is expected to contribute little or no radiance.

Raster or deferred primary visibility remains a supported optimization and
fallback for hybrid modes, but it is not the correctness reference for the full
screen-ray path tracing model.

The renderer owns pass orchestration and stable buffer contracts. Lighting and
material evaluation remain owned by `@plasius/gpu-lighting`. Camera-to-ray data
belongs in `@plasius/gpu-camera`. Fluid, cloth, world-generation, and shared asset
packages should provide renderer adapters rather than package-local rendering
paths.

## Consequences

- Positive: the path tracer avoids recursion and is suitable for WebGPU compute
  execution.
- Positive: intersection, surface evaluation, emissive/environment contribution,
  continuation, and accumulation become independently testable passes.
- Positive: all rays for bounce `N` complete before bounce `N + 1`, which aligns
  with GPU queue compaction and performance-budget control.
- Positive: hit records can preserve barycentrics, true smooth normals,
  geometric normals, UVs, material ids, front/back state, and medium/fluid state.
- Neutral: the initial implementation can start with brute-force deterministic
  fixtures, but production scenes require acceleration structures.
- Negative: memory usage and package/API impact increase because ray, hit,
  surface, optional visibility, and accumulation buffers are explicit.
- Negative: material, texture, and asset ingestion gaps must be addressed before
  the renderer can replace the shared showcase path.

## Follow-On Work

- Add versioned ray, hit, surface, material, light, medium, and accumulation
  contracts.
- Add `RayCameraUniform` helpers to `@plasius/gpu-camera`.
- Refactor the existing `@plasius/gpu-lighting` path tracer into wavefront WGSL
  jobs.
- Add deterministic CPU reference tests and small GPU fixture tests before
  production scene integration.
- Define an acceleration-structure ADR before committing to a TLAS/BLAS build and
  refit strategy.
- Decide whether a reusable `@plasius/gpu-ray` package is justified after the
  initial renderer and lighting contracts stabilize.
