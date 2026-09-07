# ADR 0030: Single-writer complete-camera-sample resolve

- Status: Accepted for internal staged implementation; live integration unqualified
- Date: 2026-09-07
- Task: [gpu-renderer #168](https://github.com/Plasius-LTD/gpu-renderer/issues/168)
- Parent: [Story 2118](https://github.com/Plasius-LTD/plasius-ltd-site/issues/2118),
  [Feature 2114](https://github.com/Plasius-LTD/plasius-ltd-site/issues/2114)

## Context

Pixels with different budgets cannot share a fixed requested-SPP denominator.
Temporary queue positions are not pixel identities. Reflection/transmission
siblings belong to one camera sample and cannot independently increment actual
SPP. Existing transport siblings currently alias non-atomic accumulation and
deferred-path addresses; [Task 210](https://github.com/Plasius-LTD/gpu-renderer/issues/210)
tracks that separate producer defect. It is not yet a physically demonstrated
cause of the reported fixed-32-SPP noise.

## Decision

Introduce an internal GPU boundary taking one producer-completed 32-byte record
per tile-local pixel: unweighted radiance, source identity, absolute sample
ordinal and completion status. One invocation owns each count/sum. All sibling
work must be reduced before this boundary. The CPU branch reducer is solely a
reference oracle and does not implement GPU transport or estimator weights.

Reject partial, mismatched, duplicate, skipped, invalid and non-finite samples
without incrementing counts. Reserve bit 31 of the packed state as a failure
flag (13 remaining general-purpose flag bits). First-sample commits reset reused
tile sums. Resolve unweighted float32 sum / actual count separately, with invalid
alpha for failed or zero-count pixels and no display-range HDR clamp.

Reflect the final assembled WGSL with the existing development-only
`@plasius/gpu-shader` dependency. Generate byte offsets and compare CPU codecs
and runtime binding layouts to that reflection. Reuse renderer pipeline helpers
and Task 167's lazy resource owner. Admit at most 1 MiB tile scratch plus
256-byte-stride immutable configuration slots against the existing 128 MiB cap.
Count uniform slots separately from storage-binding limits. No readbacks or
debug atomics are added to these runtime stages.

## Consequences and qualification

The fixed dispatcher, transport shaders, sampling sequence and public API remain
unchanged. No adaptive allocation/pipeline occurs while the internal stage is
disabled. The inherited remote flag
`renderer.sampling.adaptivePerPixel.enabled` remains disabled; its source-of-truth
evaluator is the site's remote control plane, not a new local budget governor.

Synthetic arithmetic tests and physical buffer readback do not qualify the
producer, BSDF/PDF/MIS, split estimator, scene energy or visual results. Task 168
remains open until integration and the required physical/HDR programme pass.
Task 169 must not feed this boundary from the current racy producer. A scheduler
must preserve unique pixel ownership, immutable in-flight configs, complete-frame
validation and presentation from normalized output only.

Rollback remains fixed GPU-native rendering; an independent qualified environment
may remain enabled. Three.js is permanently prohibited, never a fallback.
No adaptive speed-up, lower residency or total memory saving is claimed. See the
[design](../design/adaptive-count-resolve.md) and
[evidence](../evidence/task-168-adaptive-count-resolve.md) for bounded scope.
