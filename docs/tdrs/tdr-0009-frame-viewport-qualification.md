# TDR 0009: Frame viewport qualification

2026-11-05. Proposed; Story site2485, renderer Tasks295/296,
Feature1170/Epic2271. See [ADR0050](../adrs/adr-0050-frame-local-render-viewport.md).

Allocate the full scene, frame queues, textures and pipelines once. Verify that
frame-local scale changes only active work and preserves the original camera
projection, including odd dimensions. Compare active HDR/display against an
independently rendered equivalent viewport. Then restore omitted/full scale and
compare full stationary HDR/display byte for byte against the released renderer
with identical scene, pose, frame indices and sample batches.

Exercise full 64-SPP forest/model references and 128-SPP Studio with denoise on and
off. Record actual ray counts, allocations, device disposal and full restoration.
Test invalid scales and mutation attempts during pending GPU work. Optional
telemetry may allocate on first use; initialise it before freezing allocation
controls and require no subsequent scale-related allocation.

Performance qualification belongs to the consuming host policy. Measure actual
completed-frame cadence, p95, maximum and deadline misses over scene-relative
orbit/zoom as well as small camera moves. GPU timestamps and queue-completion
latency are distinct measurements; overlapping passes must not be summed. Keep
failed trials and qualify instrumented diagnostics separately from normal timing.
Neither fewer rays nor an average above target proves every frame met the budget.

All source coverage, types, lint, build, package and approved exact-main CI/CD
remain release gates. Local source experiments do not establish public delivery,
physical-touch support, UHD capability or million-object performance.
