# TDR 0002: Renderer Worker Manifest Profiles

- Status: Accepted
- Date: 2026-03-14

## Context

Renderer work needs to compose with the shared worker-manifest contract used by
`@plasius/gpu-performance` without forcing the renderer to depend on that
package directly.

## Decision

Publish two stable manifest profiles:

- `realtime`: `acquire`, `visibility`, `mainEncode`, `postProcess`, `submit`
- `xr`: `acquire`, `visibility`, `lateLatch`, `mainEncode`, `submit`

Each job entry includes:

- worker scheduler metadata:
  `jobType`, `queueClass`, `priority`, `dependencies`, `schedulerMode`
- performance metadata:
  `domain`, `authority`, `importance`, `levels`
- debug metadata:
  `owner`, `queueClass`, `jobType`, `tags`, `suggestedAllocationIds`

## Implementation Notes

- `rendererWorkerQueueClass` is fixed to `render`.
- `schedulerMode` is always `dag` for exported manifests.
- `lateLatch` is XR-only and sits on the critical path between acquire and main
  encode.
- `postProcess` is flat-render only and remains degradable through its level
  ladder before submit.

## Consequences

- Positive: consumer packages can import renderer manifests directly and feed
  them into worker-budget adapters.
- Positive: the manifest surface remains small and serializable.
- Negative: future renderer stage renames require migration discipline.
