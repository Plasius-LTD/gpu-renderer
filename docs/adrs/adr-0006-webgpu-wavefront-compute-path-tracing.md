# ADR 0006: WebGPU Wavefront Compute Path Tracing

## Status

Accepted

## Context

The wavefront path-tracing work belongs in the `gpu-*` renderer stack and must
exercise WebGPU compute hardware. A CPU JavaScript reference loop is useful for
small deterministic fixtures, but it does not prove renderer performance,
parallel queue compaction, or GPU-core utilisation.

The renderer already publishes wavefront queue and buffer contracts. The missing
piece is an executable GPU path that demonstrates those contracts without
recursion or CPU readback between bounces.

## Decision

`@plasius/gpu-renderer` will expose the executable path-tracing demo/runtime as
a WebGPU compute runner.

The runner must:

- generate primary rays from screen pixels on the GPU
- store active and next rays in ping-pong storage buffers
- process bounces breadth-first through compute passes
- compact continuation rays into the next queue
- use GPU-written indirect dispatch arguments for later bounces
- accumulate terminal radiance on the GPU
- write final colour into a WebGPU storage texture
- avoid CPU readback between ray passes
- allow only compact end-of-frame stats readback for diagnostics

CPU reference implementations are permitted only for deterministic tests,
fallback messaging, or tolerance comparisons. They are not the accepted
renderer implementation.

## Consequences

- Positive: the renderer now exercises WebGPU compute workgroups and queue
  compaction rather than blocking JavaScript execution.
- Positive: 720p and 1080p targets can be reasoned about through workgroup
  dispatch counts and continuation queue sizes.
- Positive: demo surfaces can consume a public renderer API instead of owning
  local renderer logic.
- Neutral: the first compute runner uses a compact deterministic scene and a
  single sample per pixel. Multi-sample progressive accumulation, denoise, BVH
  acceleration, and richer scene uploads remain follow-on work.
- Negative: full-resolution queue buffers are memory heavy. Future releases
  should add adaptive allocation, tiled GPU work submission, and acceleration
  structures.

## Follow-On Work

- Add GPU-side denoise and temporal accumulation passes.
- Replace the hard-coded deterministic scene with uploaded scene/material
  buffers.
- Add BVH or another acceleration structure for large scenes.
- Add GPU fixture comparisons against a small CPU reference scene.
