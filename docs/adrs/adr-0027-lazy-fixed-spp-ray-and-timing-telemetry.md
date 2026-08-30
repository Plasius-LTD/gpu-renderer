# ADR-0027: Lazy fixed-SPP ray and timing telemetry

- Status: Accepted
- Date: 2026-08-30

## Context

Adaptive per-pixel sampling can only claim a matched-quality performance gain
against a retained fixed-SPP baseline. The existing renderer reports scheduled
primary rays and dispatch upper bounds, but it cannot report the exact number
of active continuation rays or distinguish timestamp-query GPU time from host
submission and queue-completion time.

The baseline must not alter the fixed-SPP sample sequence, wavefront transport,
or disabled-path resource and shader cost. The parent Feature is remotely
controlled by `renderer.sampling.adaptivePerPixel.enabled` and remains disabled
by default. Baseline telemetry is an explicit diagnostic request rather than an
adaptive scheduling path. No product capability is required because this
package surface does not grant user-visible access or entitlement.

The renderer is permanently GPU-native. The Zero-Three architecture invariant
is unconditional and cannot be a compatibility mode, fallback, waiver, or
rollback.

## Decision

Use `renderFrame({ readStats: true })` as the opt-in evidence boundary:

1. Lazily allocate one GPU copy target and one mapped readback buffer sized for
   the fixed frame's tile, sample, and bounce records.
2. Copy the existing `activeCount` counter before every intersection bounce.
   Bounce zero supplies an independent observed-primary check; later bounces
   sum to exact secondary rays and all entries sum to total path segments.
3. Fail the ray-count telemetry and transport guardrail when observed primary
   counts differ from the fixed dispatcher contract or when capture/readback is
   incomplete.
4. Opportunistically request `timestamp-query` when the adapter exposes it,
   unless the caller sets `gpuTimestamps: false`.
5. Use two timestamp indices only: the beginning of the first primary compute
   pass and the end of the final presentation pass. This remains bounded for
   4K, 128-SPP, and deep-bounce frames.
6. Report timestamp-query GPU time separately from awaited total render-job
   time. If timestamp evidence is unsupported or fails, expose an explicit
   queue-completion fallback with `totalGpuTimeMs: null`.
7. Keep classification, compaction, and sampling sub-pass timing fields in the
   public contract as null until the corresponding adaptive passes can provide
   exact timestamp evidence.
8. Create no telemetry buffers, query sets, readbacks, timestamp descriptors,
   or diagnostic shader operations when stats are not requested. The existing
   fixed dispatcher and WGSL remain the disabled-state implementation.
9. Qualify the final assembled shader and pipeline layouts through the standard
   `GPUShaderModule.getCompilationInfo()` API and physical WebGPU execution.
   Triangle records use zero-value construction plus named field assignment so
   future ABI additions cannot silently create constructor-arity drift. The
   device requests the existing trace ABI's 10 storage-buffer and 21
   sampled-texture per-stage limits only after confirming the adapter exposes
   them.

## Consequences

- Benchmark and debug packages can consume exact primary, secondary, segment,
  per-bounce, memory, and timing-source evidence without estimating queue
  occupancy from dispatch capacity.
- Reflection/transmission split records are counted as the actual secondary
  path segments they generate; camera samples remain counted once by the
  fixed primary total.
- Timestamp queries add only two query values, independent of resolution, SPP,
  bounce depth, tile count, or submission slicing.
- Opt-in ray telemetry adds one four-byte GPU copy per scheduled bounce and a
  bounded readback after awaited frame completion. It must therefore be used
  for qualification and diagnostics rather than always-on presentation.
- Queue-completion time includes CPU encoding and synchronization overhead and
  is not mislabeled as GPU timestamp time.
- Operator rollback stops requesting stats and disables the adaptive parent or
  affected child flag. Rendering remains on the unchanged GPU-native fixed-SPP
  path.

## Alternatives considered

- New shader atomics and a telemetry storage binding were rejected because they
  would add disabled-path shader cost and create another transport ABI.
- CPU estimates based on upper-bound indirect dispatch capacity were rejected
  because compaction and split branches make them unsuitable for matched-ray
  comparisons.
- Timestamping every pass was rejected because query capacity would scale with
  tiles, samples, and bounces and would not remain robust at 4K/128-SPP.
- Always allocating telemetry resources was rejected because feature-off
  memory and resource creation must remain in the measured fixed-path noise
  band.
