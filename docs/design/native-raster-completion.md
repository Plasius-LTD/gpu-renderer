# Bounded native raster frame completion

Parent work: site Epic #2382, Feature #2384, Story #2416. This renderer-owned
prerequisite supports gpu-shared#210's game-snapshot presentation adapter.

The released native scene renderer accepts mutable geometry and camera frames,
but `render()` returns after submission. A caller cannot await owned GPU work.
Games need explicit completion to retain at most one submitted presentation
frame while simulation continues independently. Shared adapters must not reach
into private renderer devices or copy its resource ownership.

Add `renderAsync(frame, { signal?, timeoutMs? })` beside the existing synchronous
method. It submits through the same validated path and resolves only after
`GPUQueue.onSubmittedWorkDone()`. While this call is pending, both submission
methods reject additional work before modifying GPU buffers. The API queues no
frames. A consumer may keep one latest CPU snapshot and submit it after completion.

The wait defaults to 5,000ms and accepts integer deadlines from 1 to 60,000ms.
Reject invalid options, missing completion support or a pre-aborted signal before
submission. After submission, abort, timeout, queue failure, device loss or
explicit destruction reject the wait promptly. Terminal submission failures
release the renderer's owned resources; callers recover by creating a fresh
renderer. Timer/abort listeners are removed exactly once, and late completion
cannot resolve a terminated frame. Existing synchronous callers retain their
behavior when no asynchronous frame is active.

## Acceptance and verification

Define failing tests before implementation for deferred completion, contention,
invalid frames/options, missing queue support, pre/post submission cancellation,
deadline expiry, queue rejection, device loss, explicit teardown, late completion
and successful reuse. Verify a render validation failure does not occupy the slot
or destroy a usable renderer. Retain native geometry/material/shadow/water tests
and add the async method to the public TypeScript consumer. All changed runtime
source must appear in LCOV and satisfy the package's 80% gate.

Run full coverage, lint, type/build, dependency audit and public-package checks.
Use the existing frozen-branch quarantine admission, protected merge, exact-main
CI and main/production OIDC `cd.yml` release. gpu-shared consumes only that released
version. This API adds no assets, network delivery, telemetry, identity or game
rules; completion is a resource-lifecycle signal, not a gameplay outcome or
physical latency benchmark. Host accessibility, simulation and input remain
outside this low-level renderer.

The inherited stored `arcade.runtime.enabled` remains disabled, with backend
capabilities and the all-24 public-launch barrier governing future access.
The additive API does not enable a feature. Rollback disables arcade sessions
through those controls, disposes presentation and preserves saves. No environment
rollout override is introduced; existing synchronous consumers need no migration.
