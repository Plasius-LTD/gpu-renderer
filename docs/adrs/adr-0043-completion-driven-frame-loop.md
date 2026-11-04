# ADR 0043: Completion-driven frame ownership and observational progress

Status: Accepted for experimental opt-in implementation; not release qualified.
Date: 2026-09-26
Task: gpu-renderer#169; Story: site#2119; Feature: site#2114.

## Context

GPU waits already use promises. The measured wait interval is not CPU busy time
or guaranteed spare processing capacity. Callers need a safe way to schedule
the next frame after completion, and observe budget pressure during that wait.
The renderer reuses tile-local GPU resources; concurrent frames or mid-frame
camera/scene updates would invalidate that ownership model.

## Decision

Add explicitly opted-in `createWavefrontFrameLoop`, enabled by the integration's
remote `renderer.sampling.adaptivePerPixel.enabled` decision (default off).
Use one completion-awaiting render callback and drain diagnostic readback and
completion observers before another frame. `start`/`stop` share the run promise;
stop prevents continuation, not cancellation of submitted work. Failed runs reject
without automatic retry. Caller destroys resources only after draining, and owns
all render/update calls exclusively.

Post the next frame via one reusable MessageChannel task, timer fallback when
unavailable, so immediately resolved promises cannot form a microtask busy loop.
No additional display-tick wait, CPU ray readback or GPU polling. Keep existing
per-tile completion barriers and bounded timeout/device-loss handling.

Expose elapsed/budget ratio and confirmed tile counts. Neither is an estimate of
GPU-time completion or remaining time. Progress observer errors are deferred
until submitted frame work drains. Boundary options may consume the existing
gpu-performance budget adapter; this helper must not introduce a new governor
or alter current-frame SPP. Target time is observational, not an implicit budget.

## Consequences and rollback

One owner/no backlog is simpler than overlapping resource sets. Other independent
JavaScript tasks may run during waits, but long tasks can delay continuation.
This throughput-oriented helper does not promise display pacing or improvement
in GPU execution time. Diagnostics/callbacks have overhead and require paired
evidence. No new GPU allocation, transport change or cached radiance is involved.

Default path and legacy display-paced loop remain unchanged. Disable the remote
parent flag, stop/drain the helper, then resume the GPU-native caller. Three.js
is prohibited, not a rollback option. No new user entitlement/capability is added;
site activation and released-package consumption remain separate tracked work.

See [requirements and tests](../design/completion-driven-frames.md).
