# ADR 0031: Branch-owned complete camera samples

- Status: Experimental implementation; release qualification outstanding
- Date: 2026-09-08
- Task: [renderer #210](https://github.com/Plasius-LTD/gpu-renderer/issues/210)
- Parent: [Feature #2114](https://github.com/Plasius-LTD/plasius-ltd-site/issues/2114)

## Context

Physical reproduction of the existing assembled terminal helper at commit
`3382f8226c312f06903adbd1f8f37a737de8a97f` confirms that siblings sharing a
camera identity overwrite terminal storage. A shared per-pixel throughput chain
also cannot describe distinct reflection/transmission lineages. Atomic count
updates alone cannot repair that radiance producer.

## Decision

Adopt the [complete-path ownership design](../design/split-path-ownership.md).
A 64-byte node has one queue/depth owner. Parent/child links preserve the root,
full-screen pixel and absolute in-render sample ordinal. One root invocation
walks the completed tree with constant traversal state and bounded work.
Direct and terminal radiance are combined once per camera sample; siblings do
not independently increment completed SPP. No float atomics or per-pixel scan
of every unrelated queue record is introduced.

Both existing resolve modes use this ownership boundary. The fixed weight
remains 1 / effective fixed SPP. Future adaptive dispatch may use unweighted
complete-camera radiance with actual-count normalization, but is not enabled
by this change. The adaptive parent flag remains off.

Invalid or missing lineage and any failed queue reservation reject the sample.
Failure survives later samples and tiles through a frame-sticky integrity word;
affected pixels remain invalid through denoise. Optional readback reports
true/false/null rather than presenting missing evidence as a pass. No new
release readbacks or debug atomics run on successful paths solely for this flag.

The ownership investigation also identifies and explicitly corrects three
separate producer defects: ideal metals entering the dielectric sibling path,
inconsistent secondary refraction ratio, and uncompensated sibling roulette.
Total internal reflection carries unit reflected throughput (subject to the
existing segment transmittance). These corrections require energy/variance
qualification; race-free arithmetic is not proof of estimator correctness.
Other canonical BSDF/PDF/MIS, environment sampling, normals and offsets are reused.

## Consequences and limits

Actual node storage is tileCapacity × (maxDepth + 1) × 64 bytes. Default
128-square/depth-eight storage rises from 2.25 to 9 MiB. Device storage-binding
admission uses the new stride. This is a measured allocation trade-off, not a
memory-saving claim. Both modes now reduce after each sample, adding dispatch
cost to the previous non-deferred path; performance remains unclaimed.

Bounded queues can still overflow for heavily refractive workloads. Such a
frame is rejected rather than silently losing a sibling. A future capacity or
estimator policy cannot be called transport-equivalent without qualification.
No adaptive scheduler may treat the invalid frame as history or valid evidence.

The retained [evidence ledger](../evidence/task-210-path-ownership.md) records
focused physical checks and remaining broad HDR, variance, stress and CI/CD
obligations. Existing shared-chain descriptions are historical, not active
guidance for this producer. Rollback uses a qualified GPU-native release;
Three.js and its dependency graph remain permanently prohibited.
