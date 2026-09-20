# ADR 0039: Adaptive complete-camera-sample integration

- Status: Experimental; public enablement and release qualification outstanding
- Date: 2026-09-20
- Tasks: gpu-renderer#169, #168, #210, #212
- Parent: plasius-ltd-site#2114, flag `renderer.sampling.adaptivePerPixel.enabled`

## Decision

Combine the existing experimental path-ownership/MIS corrections and compacted
worklist stages in an isolated integration branch. Preserve their canonical
transport; fixed shader SHA-256 remains
`c0a78da83cb60ed59a1bc56ead48d7e258c01ce402836d464c5b713b24c38fcb`, matching
PR 214's retained corrected-baseline evidence. This is not release approval.

Adapt bootstrap to 64-byte PathNodes: invalidate selected root records and leave
child initialization to their unique bounce/queue owners. The old per-pixel
throughput-chain clearing from ADR 0037 is superseded for this producer ABI.
Retain all earlier evidence as revision-bound history, not current qualification.

After all bounce passes, produce one reflected AdaptiveCameraSample per selected
pixel by invoking the existing `resolve_complete_path_tree`. No new transport
implementation is added. Check configuration, weight one, maximum period, absolute
ordinal, identity, bounds, reserved fields, worklist failure, pending rays and
overflow. Invalid evidence emits failure, never a valid dark sample. Commit through
the existing selected-tier consumer, then normalize its sum by actual count.
Every reflection/transmission sibling is included before the count advances once.

Reuse existing capped sample/sum/output buffers and immutable configuration slots.
No temporal radiance, variance stopping, extra storage, public API, release
readback or governor is introduced. Producer and commit each add one dispatch;
these costs must be included in later matched-quality timing measurements.

## Qualification and rollout

Follow the [integration design](../design/adaptive-complete-sample-integration.md).
Reflect and physically compile the executed producer module. Test disabled
no-touch, ordering/failure, unequal budgets, reversed tiers, legitimate black
samples, constant HDR sources, real metal/glass transport, duplicate/skipped
ordinals, invalid roots, overflow and cleanup. Retain actual counts and linear
radiance, not tone-mapped appearance as the primary evidence.

Small analytic scenes do not qualify Eames, broad diffuse/indirect transport,
noise reduction, stress stability or speedups. Full programme, approved dependency
and CI/CD gates still apply. Flags remain default off and site integration is
separate. Three.js is prohibited; rollback uses fixed GPU-native rendering only.
