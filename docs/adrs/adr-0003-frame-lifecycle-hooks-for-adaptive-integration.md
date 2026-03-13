# ADR 0003: Frame Lifecycle Hooks for Adaptive Integration

- Status: Accepted
- Date: 2026-03-13

## Context

`@plasius/gpu-performance` negotiates device-specific frame targets and
`@plasius/gpu-debug` can record opt-in runtime samples. The renderer already owns
the render loop, so it is the correct package to expose frame lifecycle signals
without moving debug or performance policy into the renderer itself.

## Decision

Add additive frame lifecycle hooks to `createGpuRenderer(...)` and publish a
small `createRendererDebugHooks(...)` helper.

- `createGpuRenderer(...)` emits `onFrameStart` and `onFrameComplete`.
- Callers may provide a `frameIdFactory(...)` for correlation across packages.
- `createRendererDebugHooks(...)` records frame samples into
  `@plasius/gpu-debug` and accepts negotiated target frame times from
  `@plasius/gpu-performance`.
- Renderer remains framework-agnostic and does not own analytics/export logic.

## Consequences

- Positive: frame-level contracts become consistent across flat and XR rendering.
- Positive: apps can connect performance/debug packages without duplicating
  renderer glue code.
- Negative: the renderer API surface grows and must remain backward compatible.

## Alternatives Considered

- Put renderer frame sampling directly into `@plasius/gpu-debug`: Rejected
  because the render loop contract belongs with the renderer.
- Keep all frame hook composition in apps: Rejected because it duplicates
  correlation logic in every consumer.
