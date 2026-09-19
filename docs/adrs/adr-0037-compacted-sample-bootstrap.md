# ADR 0037: Compacted sample bootstrap

- Status: Accepted (internal, not publicly enabled)
- Date: 2026-09-19
- Task: gpu-renderer#169
- Parent: plasius-ltd-site#2114 / Story #2119

## Context

Compacted camera rays need initialized active counters and per-camera-sample
scratch before using the shared bounce command loop. Dense primary generation
cannot be used for this preparation because it would overwrite the worklist.
An invalid late worklist entry must not allow earlier entries to modify state.

## Decision

Use two ordered compute passes after clearing the existing counter allocation.
The first validates frame/tile/ordinal/period coherence, deferred unweighted
sampling, buffer capacities, reserved fields, dispatch coverage and selected IDs.
Failure bits are sticky, including failures from the upstream GPU compactor.
The second writes active/indirect counters and clears only selected tile-local
accumulation and deferred-path records. Failure produces zero active rays.

Share literal canonical counter/path WGSL fragments with the fixed renderer.
Do not derive production shaders with text substitution or copy transport logic.
The assembled fixed shader must remain byte-identical. Disabled creation touches
no GPU object. Enabled preparation adds pipelines but no buffer allocation.

Only immutable, unique worklists from the qualified GPU compactor are accepted by
this internal contract. The bootstrap validates bounds, not arbitrary-list
uniqueness. It cannot run concurrently with consumers of the same tile scratch.
Camera generation and the shared continuation encoder follow preparation; the
future coordinator must finish every split sibling before committing a sample.

## Consequences and qualification

Host tests cover reflected actual shader layouts, disabled behavior, command
ordering, offsets, pipeline failures and fixed-shader identity. A physical WebGPU
fixture covers compaction, initialization and camera generation across depths,
tiers, tile edges, empty worklists and fail-closed cases, checking sentinels around
selected records. Fixture readbacks and staging are not release diagnostics.

Two added dispatches per prepared camera sample carry overhead that must be
included in later matched-quality measurements. No transport, image, timing or
memory-saving claim follows from bootstrap qualification. The existing allocation
cap, independent default-off flags and fixed GPU-native rollback remain in force.
Three.js is prohibited and cannot be a fallback.
