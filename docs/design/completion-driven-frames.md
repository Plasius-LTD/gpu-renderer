# Completion-driven wavefront frames

Task gpu-renderer#169, Story site#2119, Feature site#2114. Inherits the remotely
evaluated `renderer.sampling.adaptivePerPixel.enabled` flag, still default off.
The new loop is explicitly opt-in; it does not activate adaptive sampling.
Three.js is prohibited, including as a fallback.

## Scope and contract

The existing queue-completion promise already suspends the renderer without
blocking JavaScript. Add a reusable `createWavefrontFrameLoop` around an async
`renderFrame` callback, usable with the canonical renderer and experimental
adaptive probe. Its `start()` returns the run promise; `stop()` prevents another
frame and returns that same promise, draining the current frame and observers.
Repeated starts join the current run; failures stop it and reject. No automatic
retry after failure. The caller owns renderer destruction after draining.

One frame at a time, including optional readback. Between completed frames post
a browser task using a reusable MessageChannel (timer fallback), without waiting
for another display tick or spinning in a microtask loop. Close the channel on
stop/failure. Stop does not pretend to cancel already submitted GPU work. Keep
existing bounded renderer GPU waits and per-tile resource-reuse barriers.

`getRenderOptions` runs only at a frame boundary: callers can apply the existing
gpu-performance budget adapter and the latest camera/scene snapshot there. Force
`awaitGPUCompletion: true`; default diagnostic readbacks off. The adapter callback
must genuinely await GPU completion and exclusively own its renderer. No separate
governor, automatic quality reduction, mid-frame SPP mutation, CPU ray readback,
new GPU allocations, shader edits or changes to the legacy display-paced loop.

Expose an on-demand immutable progress snapshot: lifecycle, frame/completed
frames, current elapsed milliseconds, observational target/elapsed ratio and
over-budget time. Zero/omitted target disables budget comparison, not rendering.
The target is not an implicit SPP budget or a deadline/cancellation signal.
Canonical optional `onProgress` events report encoding, acceleration wait,
render wait, GPU-complete, readback and completion. Only queue-confirmed tiles
advance completedTiles/totalTiles; their ratio is NOT percent GPU time, remaining
time, or CPU availability. No polling/readback is added for progress. Callback
errors must not release a renderer while its GPU work is still pending.

## Acceptance tests defined before implementation

- Opt-in disabled has no scheduling/device effects; repeated starts and stop
  share one promise; no overlapping frames or backlog; unrelated tasks run while
  a deferred GPU promise is pending; next frame follows completion and a task yield.
- Stop during frame, callback or yield drains safely; failure/device loss/timeout
  rejects and prevents continuation; restart only after clean stop, not failure.
- Boundary options can change next-frame quality; completion is forced; diagnostic
  readback off by default, explicit diagnostics preserved; observer errors stop.
- Elapsed/budget values, immutable progress, unknown GPU percentage, confirmed
  tile fractions, terminal time frozen, no fabricated completion on failure.
- Canonical commands/uploads/sample identity unchanged with progress enabled;
  single/tiled frames, readback, acceleration, non-awaited and error cases.
- Public types/packed consumer, changed-source LCOV, coverage, lint, build,
  package and Zero-Three; physical fixed/shared/fused fixture exercises the loop,
  confirms image/count/ray identity and independent heartbeat during waits.

Physical evidence must distinguish scheduling correctness from speedup: no
claimed GPU reduction, guaranteed spare CPU budget, matched-quality gain or
white-paper advancement. Retain before/after command and image evidence. Existing
site/full-matrix quality/CI/release gates remain open. Rollback stops/drains the
loop and resumes the existing GPU-native caller; no local publication or site
release is part of this refinement.
