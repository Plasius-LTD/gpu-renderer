# Shared-round adaptive execution

Task gpu-renderer#169, Story site#2119, Feature site#2114. Internal experimental
path under the existing default-off adaptive parent; no public flag or site change.

The retained tier scheduler emits 42 sample batches and 389 compute passes for
2/8/32 budgets. Replace this overhead in a separately selectable experimental
path, retaining the old path as a comparison. Ranges [0,2), [2,8), [8,32) share
absolute ordinals across all pixels still needing samples. Quantised budgets are
unchanged; sequence period remains the configured maximum. No transport changes.

Build a private immutable GPU worklist once per range. Reuse the canonical prefix
scan. Validate requested/completed counts, range coverage, dimensions, capacities,
flags and worklist bounds before sampling. Reject gaps, skipped phases, stale
counts and failed buffers. All low-budget pixels must already be complete before
the next range. Worklist uniqueness follows from one compaction invocation per
tile pixel; arbitrary caller worklists are not supported.

For each absolute ordinal, clear existing counters, prepare only compacted roots
and camera rays together (canonical make_ray), execute the unchanged wavefront
bounce encoder, then fuse canonical complete-tree reduction and selected count
commit. Siblings still count once. Reject pending/overflow/identity/lineage,
nonfinite/negative radiance, duplicate/skipped ordinals and invalid configurations.
Final resolution requires completed == requested for every pixel; a failed range
vetoes output. No CPU readback between rounds, no in-shader multi-sample loop and
no reuse of temporal radiance. Buffers stay within existing allocation admission.

Shared configuration is an independently reflected 32-byte range record; legacy
reserved fields and ABI stay unchanged. Use existing frame uniform slots and
primary config storage. Batch immutable config uploads; do not overwrite GPU-used
slots. Old shader variants and physical evidence retain their original semantics.

Requirements-first tests: exact pixel/sample set, <= maximum rounds, phase gaps,
disabled no-touch, final WGSL reflection/layout, command counts/order, errors and
fixed shader identity. Physical tests: shared-uniform vs fixed; shared-reduced vs
legacy-reduced exact HDR/count/segment agreement, success cleanup and malformed
inputs. Reuse frozen lighting scenes/metrics/tolerances with warmups and rotated
paired timing. Preserve failures, same-commit controls and raw provenance. Do not
change budgets to obtain a timing result. About 10 ms saved is an aspiration, not
a promised result; small-scene speed alone does not establish real-time Eames,
matched-quality gains or lower allocated memory. Full baseline/image/matrix and
CI/CD gates remain open. Three.js is prohibited; rollback is fixed GPU-native.
