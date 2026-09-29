# ADR 0042: Opt-in host elapsed attribution

Date: 2026-09-26. Status: experimental diagnostics; disabled by default.
Task gpu-renderer#169; Story site#2119; Feature site#2114.

## Context

Reduced primary rays did not proportionally reduce total job time. Existing
GPU timestamps and job intervals cannot identify CPU work by subtraction.
The probe rebuilds synthetic budgets; the renderer encodes tile/sample/bounce
commands and, for awaited high-SPP work, waits between tiles.

## Decision

Implement the [measurement contract](../design/cpu-render-profiling.md) in a
renderer-local profiler reused by the public fixed dispatcher and experimental
paired fixture. Existing gpu-debug aggregation and gpu-performance policy are
not replaced. Add `renderFrame({cpuProfiling:{enabled:true,userTiming:false}})`
and optional immutable `cpuProfile`; new diagnostics default off independently
of readStats. No new dependencies, adaptive activation or GPU allocations.

Instrument host stages and local transparent command facades. Preserve native
receivers, arguments, returns, error propagation and order. Synchronous spans
report inclusive/exclusive elapsed time; asynchronous waits/readback are separate.
Never call job-minus-GPU CPU utilization or sum nested inclusive stages. Record
API command/byte counts, not executed rays or physical memory traffic. Record
only explicit temporary ArrayBuffer backing stores, not arbitrary JS/GC memory.

CPU profiling can perturb the measurement. Retain alternating on/off captures,
unchanged image/count/ray evidence, raw timings and quantiles; never subtract an
assumed profiler cost to invent corrected performance. Optional browser timing
spans are capped and cleaned; aggregates remain complete. Full browser CPU/GC
and GPU idle-time attribution require separate traces. Setup/scene updates/UI
and diagnostic readback commands are outside render-job API counters.

## Consequences and rollback

No cache/pooling/scheduling optimization or shader change is bundled with this
instrumentation. Existing default-off remote adaptive parent remains
`renderer.sampling.adaptivePerPixel.enabled`; diagnostics enable no entitlement,
site route or adaptive renderer. Disable cpuProfiling to remove wrappers/marks.
Fixed GPU-native rollback only; Three.js remains prohibited. No publishing,
site activation, white-paper improvement claim or release qualification.
