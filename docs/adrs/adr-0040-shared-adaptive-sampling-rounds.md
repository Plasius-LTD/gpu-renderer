# ADR 0040: Shared adaptive sampling rounds

Date: 2026-09-20. Status: experimental, pending review and qualification.
Task: gpu-renderer#169; Story: site#2119; Feature: site#2114.

## Context

The ADR 0039 integration correctly handles unequal samples, but independent
2/8/32 tier execution encodes 42 rounds rather than 32. Full-tile preparation and
accounting repeat even for a small worklist. Fewer rays alone do not remove this
dispatch and memory-traffic overhead. The retained old scheduler remains useful
as an identical-image comparison, not the preferred future production strategy.

## Decision

Use shared ordinal ranges [0,2), [2,8), [8,32). At each range boundary, compact all
pixels whose preassigned budget reaches that range's end. A pixel receives the
same absolute sample ordinals and maximum-period strata as before. Each round
fuses compacted root initialization with canonical camera generation, executes
the unchanged wavefront bounce encoder, then fuses canonical complete-tree
reduction with unweighted sum/count commit. Reflection/transmission siblings
still complete only one camera sample. Final output requires exact budget/count
agreement. No radiance history, optional stopping or transport change is added.

Phase-boundary validation checks bounds, capacities, range coverage, completed
counts, failure flags and private worklist identities. The GPU-generated worklist
is immutable during a range; arbitrary caller-supplied worklists are unsupported.
Per-sample commit still checks ordinals, lineage, completion, overflow and finite
radiance. Failed ranges veto frame output. Keep direct worklist-construction and
indirect-execution layouts separate: indirect arguments must not simultaneously
be bound as writable storage in an execution pass.

Use an independently reflected/generated 32-byte phase ABI. Batch immutable frame
and phase uploads; reuse capped, tile-bounded resources. No per-round CPU readback
or in-shader multi-sample loop is introduced. The internal default-off factory
does not touch the device when disabled. Public renderer and site integration
remain absent; the inherited adaptive parent flag stays off.

## Consequences and qualification

The 2/8/32, four-bounce fixture reduces rounds 42→32 and compute passes 389→206.
This is a structural result, not a promised GPU-time saving. Existing allocation
capacity is retained for paired comparison, including unused legacy scratch;
fewer rays and writes do not establish lower allocated memory or physical VRAM.

Retain the old scheduler, frozen lighting-owned metrics and all measurement
attempts. Require fixed/shared-uniform and old/shared-reduced image identity,
actual queue counts, failure tests, physical execution and matched-quality timing
confidence before publication. Ten milliseconds saved and real-time rendering
remain targets, not consequences of a ray count. See the
[design](../design/adaptive-shared-rounds.md) and
[evidence report](../evidence/shared-adaptive-rounds-2026-09-20.md).
Rollback is the fixed GPU-native dispatcher. Three.js is prohibited and cannot
be a fallback. No release or white-paper advancement is approved by this ADR.
