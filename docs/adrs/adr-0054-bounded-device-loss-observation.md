# ADR 0054: Bounded GPU device-loss observation

- Status: Accepted
- Date: 2026-11-16
- Work: gpu-renderer#310, site#2529 / Feature #1170

## Context

Each awaited frame previously attached another reaction to the unresolved
`GPUDevice.lost` promise. Winning a `Promise.race` does not remove its losing
reactions. Completed frames therefore retained loss observers until the device
was destroyed. This is a reproducible lifetime fault; it is not proof that it
caused any particular measured frame-time spike.

## Decision

Use one loss reaction per device in a weakly keyed observer. Each active wait
registers a separate completion callback and detaches it in `finally`, including
queue rejection and timeout paths. Detachment also settles the per-wait loss
promise so its race callbacks can be reclaimed. Loss rejects all outstanding and
future waits on that device, without changing completion or timeout semantics.

## Verification and consequences

Regressions cover a thousand completed frames, simultaneous waits, late loss,
timeouts and device isolation. Memory associated with loss observation scales
with active waits, not frame history. GPU timing and stationary display/HDR
identity remain separate real-device qualification requirements.
