# TDR-0010: Native raster completion verification

- Date: 2026-11-08
- Work: gpu-renderer#305; site Feature #2384, Story #2416
- Decision: [ADR-0052](../adrs/adr-0052-bounded-native-raster-completion.md)

Use the existing injected WebGPU fixture and Node test runner. Deferred queue
promises distinguish submission from completion. Count GPU writes/submissions
to verify that competing sync/async calls do no work; successful settlement must
allow reuse. Invalid options/geometry, pre-aborted signals and absent completion
support must not occupy the pending slot or destroy the renderer.

Use virtual timers for explicit and default deadlines. Exercise abort during
submission and while waiting; confirm abort listener removal on success/failure.
Reject queue promises both synchronously and asynchronously, return a missing
completion promise, lose the device, destroy explicitly, and settle the queue
late after termination. Preserve a single result and release each allocation
once. Inject upload/submission failures and a context cleanup exception to verify
that other resources and the device are still released. A failing host
unavailability callback cannot prevent device-loss cleanup.

Retain all native material, shadow, water, geometry, resize and shader tests.
The TypeScript public consumer must await the new method and reject invalid
option types. Build before full coverage: README import tests resolve the public
built entrypoint. Source syntax, clean type consumer, lint, package packing,
Zero-Three and audit checks remain mandatory. Check LCOV presence and >=80% line
coverage for the changed source and overall package.

These deterministic tests verify lifecycle behavior, not physical GPU speed,
visual fidelity, accessibility of a game, or ten-hour gameplay depth. The shared
scene adapter and each game retain their own real-device qualification gates.
No flags or capabilities are enabled by this package change.
