# ADR0050: A frame-local viewport inside persistent allocations

Status: Proposed — Story site2485/renderer296; not released.

Motion quality policy needs to change work without reconstructing a large scene.
Add optional renderScale to each wavefront submission. Scene resources, pipelines,
canvas and full-size textures remain stable; active frame uniforms/tiles determine
work. The presentation pass reuses the first16bytes of the existing frame uniform
to sample only the active rectangle. Full-scale presentation retains its original
sampling path. The camera projection uses the allocation aspect throughout.

Resolution transitions invalidate progressive history and per-sample timing
calibration; omitted scale restores full size. Same-resolution accumulation remains
valid. Telemetry reserves full-capacity records and reports effective dimensions.
Reject concurrent submissions while an awaited frame owns mutable frame state.
The host owns quality decisions through gpu-performance; renderer never selects a
product frame-rate target or changes geometry, transport or requested depth.

Feature1170/Epic2271 and gpu-demo.scene-fidelity.enabled/existing capabilities are
inherited. Omitting renderScale rolls back to full-resolution rendering. Keep all
quality, memory/device admission and approved release gates; do not enable unrelated
adaptive-pixel/animation flags or alter renderer259/site2330 holds.
