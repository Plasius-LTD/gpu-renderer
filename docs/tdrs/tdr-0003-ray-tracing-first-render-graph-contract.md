# TDR 0003: Ray-Tracing-First Render Graph Contract

## Status

Accepted

## Goal

Define the future render-graph contract for the ray-tracing-first renderer.

## Planned Contract Areas

The renderer contract should eventually describe:

- stable visual snapshot ingestion
- representation-band selection:
  - `near`
  - `mid`
  - `far`
  - `horizon`
- pass ordering for:
  - primary visibility
  - shadow assist or shadow preparation
  - opaque foundation
  - RT direct lighting
  - RT reflections
  - RT GI
  - denoise and temporal accumulation
  - transparents, particles, and volumetrics
  - composition and presentation
- acceleration-structure update classes:
  - static
  - rigid-dynamic
  - deforming
  - proxy

## Planned Tests

Contract tests should prove that:

- the renderer can describe pass ordering without coupling to package-local
  implementation details
- representation bands are explicit rather than implied by distance checks
- temporal accumulation and denoising are first-class render stages

Unit tests should prove that:

- stable visual snapshots are accepted as the frame input boundary
- near-field content can retain premium RT participation while far and horizon
  content move to cheaper representations
- acceleration-structure update planning can classify static, dynamic, and
  deforming work separately

## Implementation Notes

The first public implementation now ships as
`createRayTracingRenderPlan(...)` plus expanded renderer worker-manifest
metadata. The package now publishes a stable snapshot boundary, explicit RT
stage ordering, representation-band policies, and acceleration-structure update
classes without coupling consumers to renderer-internal pass code.
