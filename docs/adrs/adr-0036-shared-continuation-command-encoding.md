# ADR 0036: Share continuation command encoding

- Status: Accepted
- Date: 2026-09-19
- Task: gpu-renderer#169
- Parent: plasius-ltd-site#2114 / Story #2119

## Context

The existing frame encoder combines dense primary generation with the wavefront
bounce loop. Calling it after compacted camera generation would regenerate dense
primary rays. Copying its loop into an adaptive coordinator would create a second
transport orchestration implementation that could drift.

## Decision

Keep the fixed dispatcher and its `encodeTileSample` entry unchanged. Extract the
existing continuation commands into one private implementation and add the internal
`encodePreparedTileSample` entry, which emits that same continuation suffix only.
Both retain active-count telemetry, indirect-argument copies, ping-pong bindings,
intersection/shading/compaction order and immutable frame configuration offsets.
No shader, pipeline, GPU buffer, public option or radiance calculation changes.

The prepared entry is not an adaptive scheduler. Its future caller must first
validate the compacted primary queue, initialize counters and path state, then
produce and commit unweighted complete camera samples. The fixed dispatcher does
not call it. Parent and child adaptive flags remain default disabled.

## Consequences and qualification

Command-trace tests compare fixed and prepared continuations at depths 1, 4 and 8,
with and without telemetry, and verify fresh bindings and error propagation.
The fixed shader remains byte-identical. Parallelism workgroup figures remain
upper bounds, not measurements of actual traced rays. Physical combined transport,
image-quality and timing qualification is still required before enabling adaptation.
No performance claim, release waiver, Three.js dependency or fallback is allowed.
