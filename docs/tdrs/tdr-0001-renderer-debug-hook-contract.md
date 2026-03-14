# TDR 0001: Renderer Debug Hook Contract

- Status: Accepted
- Date: 2026-03-13

## Context

The renderer needs to expose enough information for adaptive performance and
debug tooling to correlate frame work, but it should not overfit to one specific
app architecture or analytics path.

## Decision

Use a two-part contract:

- Renderer lifecycle hooks:
  `onFrameStart`, `onBeforeEncode`, `onAfterSubmit`, `onFrameComplete`
- Renderer debug helper:
  `createRendererDebugHooks(...)`

The helper records frame samples only. It does not invent queue depth, GPU busy
time, or memory metrics that the renderer cannot measure authoritatively.

Worker DAG manifests are defined separately so debug sampling does not become
coupled to worker-topology exports.

## Implementation Notes

- `frameIdFactory(...)` lets callers align renderer frames with worker and XR
  correlation identifiers.
- Frame targets may be supplied as:
  `targetFrameTimeMs`, `targetFrameRate`, or `getTargetFrameTimeMs(...)`.
- If the first frame has no prior timestamp, the helper skips frame sampling
  until a positive frame duration exists.

## Consequences

- Positive: the renderer emits bounded, honest telemetry.
- Positive: the contract composes cleanly with device-negotiated targets.
- Negative: callers still need to supply allocation and queue data from other
  packages when they need deeper diagnostics.
