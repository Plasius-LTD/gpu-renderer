# ADR-0052: Bounded native raster completion

- Status: Accepted
- Date: 2026-11-08
- Task: gpu-renderer#305; site Epic #2382, Feature #2384, Story #2416
- Feature flag: `arcade.runtime.enabled` (disabled)

## Context

The game-snapshot adapter in gpu-shared#210 needs to await a submitted native
frame without accessing the renderer's private device. Synchronous `render()`
returns after queue submission, so a separate host loop can otherwise accumulate
GPU work independently of its fixed-step simulation.

## Decision

Add `renderAsync(frame, { signal?, timeoutMs? })`. Validate the same frame once,
submit through the shared native path and await `queue.onSubmittedWorkDone()`.
Own one pending completion, one timer and at most one abort listener. Both entry
points reject contention before GPU writes; the renderer queues no snapshots.
Default the timer to 5,000ms with integer bounds 1–60,000ms. This is an event-loop
wait limit, not a hard real-time or display-latency guarantee.

Invalid input, missing completion support and pre-aborted signals do not submit
or terminate a usable renderer. After submission, abort, timeout, queue failure,
device loss or destruction rejects and terminates the renderer. Partial upload or
submission failure also terminates it. Cleanup attempts the context, every owned
allocation and the device, even when an earlier cleanup operation throws. Late
settlement cannot change an already settled result. Direct teardown may report
its first cleanup exception; asynchronous frame errors remain controlled.

Retain synchronous rendering between awaited frames. Existing snapshot fields
keep their meaning: submittedFrames counts submissions, not visible frames. GPU
completion is specified by [WebGPU](https://www.w3.org/TR/webgpu/#dom-gpuqueue-onsubmittedworkdone);
visual correctness and physical frame pacing require consumer qualification.

## Alternatives and consequences

Host-side sleeps cannot establish completion. A second renderer in gpu-shared
would duplicate GPU ownership. A renderer-internal frame queue would retain stale
game state. This additive boundary keeps ownership in gpu-renderer and lets the
adapter retain only the latest CPU snapshot. Terminal recovery deliberately
requires a new renderer rather than trying to reuse uncertain GPU state.

No dependency, third-party engine, game rules, telemetry, input or entitlement is
added. Consumers use only the released package. The stored feature flag stays
disabled, and backend capabilities plus the all-24 launch barrier govern arcade
access. Rollback disables new sessions and disposes presentation without deleting
progress. No environment rollout override or production linking is introduced.

## Verification and delivery

See [design](../design/native-raster-completion.md) and
[TDR-0010](../tdrs/tdr-0010-native-raster-completion.md). Run requirement-derived
failure tests, existing scene regressions, types, coverage, lint, build, public
package and dependency checks. All changed runtime source must be represented in
LCOV. Use frozen-branch quarantine admission and exact-main CI followed by the
existing main/production OIDC cd.yml workflow; do not publish locally.
