# Complete-camera-sample commit and actual-count resolve

Task [168](https://github.com/Plasius-LTD/gpu-renderer/issues/168), Story 2118,
Feature 2114, Epic 2113. Internal/default off; not yet a site rendering mode.

## Boundary

The transport producer must finish and reduce **all** branches of one camera
sample before providing a complete record. A record is 32 reflected bytes:
unweighted linear RGB, full-screen source pixel, absolute per-pixel ordinal,
completion status and reserved padding. A branch event is never a camera sample.
An incomplete or failed producer record cannot increment the completed count.
The CPU branch reducer is a test oracle, not a new host transport implementation.

Task [210](https://github.com/Plasius-LTD/gpu-renderer/issues/210) tracks the
existing sibling-address conflict: current siblings share non-atomic radiance
and deferred-path destinations. This normalization boundary cannot repair that
producer. Task 169 must integrate a qualified, race-free producer before any
adaptive renderer is enabled. Do not claim synthetic input tests qualify actual
reflection/transmission transport.

## GPU stages

Dispatch one invocation per tile-local pixel, independent of temporary ray-queue
slots. Derive the full-screen owner from validated tile bounds and verify the
sample's source pixel and absolute ordinal. This makes count ownership single
writer even when a camera sample has multiple contributing branches.

An eligible sample must match the configured ordinal and the previous completed
count, fit the requested budget (1–256), have complete status, and contain finite
non-negative float32 radiance. Add its unweighted radiance to a tile-local
float32 sum and increment the packed count exactly once. Reset the tile sum when
the completed count is zero. A failed frame, invalid identity, partial sample,
non-finite sum or count-order defect sets the highest reserved metadata flag and
does not commit radiance or advance the count. No retries or partial-frame
acceptance occur. Exhausted budgets are inactive, not erroneous.

A separate resolve pass computes sum / actual completed count into a tile-local
float32 output. Zero, corrupt or poisoned counts produce invalid alpha (zero),
not a supposedly completed black pixel. Valid output has alpha one. Resolve
never mutates the unweighted sum. Presentation and denoise must consume only
this normalized output, after the scheduler verifies complete frame success.
No temporal radiance, optional stopping, transport changes or HDR clamp is added.

## Allocation and configuration

Task 167's owner optionally admits three tile-local buffers: 32-byte sample
records, 16-byte sums and 16-byte normalized output, totalling 1 MiB at 16,384
pixels. It also admits 256-byte-aligned immutable configuration slots (32 bytes
of payload each), default one. The scheduler must provision a distinct slot for
every in-flight tile/sample configuration; overwriting one slot while encoding
multiple configurations is prohibited. Additional slots count against the
existing 128 MiB cap before allocation. Device uniform limits are checked too.

Configuration carries canvas dimensions, tile origin/extent, sample ordinal and
frame-valid state. CPU configuration packing uses generated reflected offsets.
The GPU independently validates bounds, buffer lengths and ordinal range. All
pipeline/buffer work is absent when this internal stage is not requested.
No full-frame radiance allocation or duplicate budget governor is introduced.

## Validation and release

Requirements-first tests cover unequal means through 256 SPP, split/partial
reference samples, duplicate or out-of-order commits, invalid identities,
float32 HDR and overflow, inactive budgets, reset/tile reuse, failure flags,
configuration packing, generated reflection and lazy allocation. Execute the
final WGSL on physical WebGPU with float32 output/count readback and tile edges.
Assert the fixed assembled shader's immutable hash and run the whole package
suite/LCOV, lint, types, build, pack, Zero-Three and post-push CI.

These are arithmetic/stage tests, not image/performance qualification. Keep
Task 168 open for end-to-end producer integration and the approved HDR programme.
The inherited remote flag `renderer.sampling.adaptivePerPixel.enabled` stays off;
the site remains its evaluator. Roll back through fixed GPU-native rendering.
Three.js is prohibited permanently and cannot be a fallback or waiver.
