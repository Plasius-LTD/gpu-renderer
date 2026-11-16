# ADR 0055: Cooperative reference frames

Status: Accepted

## Context

Real-site forest traces under Task #310 and site Story #2529 show a completed
motion gesture returning to full-resolution refinement. New input arriving during
a four-sample reference batch can wait about 287 ms for obsolete GPU work. A GPU
submission cannot be revoked after submission.

## Decision

Add optional `maxTileSize` and `signal` controls to awaited `renderFrame` calls.
Validate controls before modifying renderer state. Submit and await one bounded
tile at a time, checking cancellation before submission and after the tile drains.
Keep submission exclusion active until drain completes. Reject cancellation with
the caller's abort reason and reset partial progressive history before reuse.

Reuse uniform slots only after the previous tile completes. Keep existing resource
allocations and normal batching when these options are absent. Diagnostic ray
telemetry retains full allocation capacity and grows if smaller tiles require more
records. Report the active tile size and capability in snapshots/types.

The tile limit changes scheduling only: every pixel, requested sample, bounce,
material and denoise operation remains required for a successful frame. No shader
transport or scene ordering changes belong to this decision.

## Consequences

Hosts can abandon obsolete references at tile boundaries and then submit the latest
camera pose. More completion waits can increase stationary render time. Cancellation
does not guarantee a fixed wall-clock bound on a submitted tile or solve device
wake-up latency. Physical tests must retain all misses and compare stationary image
and HDR bytes against a matched baseline before release qualification.

Portable regressions cover preflight rejection, pending mutation exclusion, abort
drain/recovery and expanded telemetry. Rollout remains consumer-controlled through
`gpu-demo.scene-fidelity.enabled`; renderer #259's optical/UHD holds are unchanged.
