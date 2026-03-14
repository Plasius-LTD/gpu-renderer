# ADR 0004: Renderer Frame Stages as Worker DAG Manifests

- Status: Accepted
- Date: 2026-03-14

## Context

`@plasius/gpu-worker` and `@plasius/gpu-performance` now treat GPU package work
as multi-root DAGs with priority-aware ready lanes. The renderer already owns
frame-stage ordering, so it needs to publish that ordering explicitly instead of
leaving apps to reconstruct it from ad hoc knowledge of the render loop.

## Decision

Expose worker manifest helpers from `@plasius/gpu-renderer`.

- `getRendererWorkerProfile(name?)` returns a stable high-level profile
  description for `realtime` and `xr`.
- `getRendererWorkerManifest(name?)` returns a scheduler-ready DAG manifest with
  queue class, priority, dependencies, adaptive budget levels, and debug tags.
- The renderer remains the source of frame-stage topology, while scheduling,
  adaptation, and debug aggregation stay in `@plasius/gpu-worker`,
  `@plasius/gpu-performance`, and `@plasius/gpu-debug`.

## Consequences

- Positive: renderer work can be budgeted and prioritized consistently with
  lighting, particles, and physics packages.
- Positive: XR-specific stages such as late-latch are explicit, so headset paths
  can negotiate timing and critical-path work independently from flat rendering.
- Negative: the renderer now owns backward compatibility for its manifest names
  and stage labels.

## Alternatives Considered

- Infer renderer DAGs in `@plasius/gpu-performance`: Rejected because the
  topology belongs to the renderer package.
- Keep renderer scheduling opaque and only publish frame hooks: Rejected because
  worker-first coordination needs runnable DAG nodes, not only frame events.
