# Opt-in host-side renderer profiling

Task gpu-renderer#169; Story site#2119; Feature site#2114. The existing remote
parent `renderer.sampling.adaptivePerPixel.enabled` remains disabled. Diagnostics
do not enable adaptation or change transport. Three.js is prohibited.

## Measurement contract (26 September 2026)

Add per-render `cpuProfiling: { enabled: true, userTiming?: true }`, default off,
and optional `cpuProfile` statistics. Reuse renderer telemetry and command
encoding; gpu-debug aggregates metrics, not renderer-internal timing boundaries,
and gpu-performance remains the budget-policy owner. No new dependency/governor.

Measure synchronous host elapsed time for configuration packing, uploads,
command encoding, command finalization and submission. Nested spans report both
inclusive and exclusive time, avoiding double counting. Measure GPU-completion
waits and diagnostic readback separately as asynchronous elapsed time, never as
CPU busy time. Count encoded passes, bindings, dispatches, copies, uploads/bytes,
submissions and known configuration allocations. These are API/explicit-buffer
counts, not executed rays, hardware memory traffic, total JS allocations or VRAM.

Keep existing GPU timestamp/job boundaries unchanged. Neither job-minus-GPU nor
completion-wait-minus-GPU is CPU execution time. Whole GPU spans can include idle
gaps. Per-tile CPU encode/wait aggregates expose synchronization frequency, but
do not measure exact per-tile GPU idle time; that needs a correlated GPU trace.
Browser CPU samples, allocation/GC and UI traces remain complementary captures.

Disabled mode creates no profiler, wrappers, marks or GPU resources. Enabled
mode wraps only local command/queue facades, never mutates native device methods,
and preserves arguments, return values, receivers, errors and command order.
Aggregates are bounded by a fixed stage vocabulary. Optional User Timing entries
are emitted for at most 128 actual spans per frame and cleared after emission;
excess entries are counted as dropped, without dropping aggregate measurements.
Profiling-on/off paired runs measure observer overhead. Profile failures must
not turn a failed render into successful evidence.

The existing paired fixture records budget calculation/packing separately,
known temporary typed-array backing allocations, encode/finish/submit/wait and
post-job readback. A dedicated diagnostic page alternates profile-off/on for
fixed32, shared and fused, checks image/count/ray identity, retains raw frames,
and reports median/p95 and paired job/GPU overhead. No improvement claim from
instrumentation; unchanged reduced-quality failures remain open.

## Acceptance tests before implementation

- Disabled no-touch, deterministic injected-clock nested/exclusive accounting,
  repeated stages, synchronous/asynchronous failure propagation and clock checks.
- Transparent native-receiver forwarding; byte units for typed arrays/DataView;
  commands and returns unchanged; bounded stages, snapshots and User Timing cleanup.
- Renderer profile-off/on command identity, optional field/types, stats-on/off,
  tile waits separated from encoding; fixed WGSL checksum unchanged.
- Physical paired image/count/ray identity and retained overhead measurements;
  failed/cancelled runs cannot claim completion. Existing full-resolution/site,
  quality, confidence, CI and approved release gates remain prerequisites.
- Unit/coverage/changed-file LCOV, lint, type/consumer, build/package/Zero-Three.

No scheduling, caching, pooling, shader or importance-policy optimization in this
change. No site activation, local publishing or release. Rollback: disable CPU
profiling; fixed GPU-native rendering remains available.
