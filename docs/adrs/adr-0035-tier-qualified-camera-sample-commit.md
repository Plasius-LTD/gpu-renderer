# ADR 0035: Tier-qualified camera-sample commits

- Status: Accepted
- Date: 2026-09-14
- Tasks: #169 and #168; Feature plasius-ltd-site#2114

## Context

The dense internal count stage attempts every pixel whose budget exceeds the
current ordinal. A compacted tier pass produces records only for pixels with
that exact budget. Feeding such a pass to dense commit would poison unscheduled
pixels, preventing independent or cumulative adaptive scheduling.

## Decision

Extend the immutable resolve configuration with selectedTier and reserved
padding: a 48-byte version-2 internal ABI in the same allocated 256-byte slots.
Zero retains dense internal commit. A nonzero integer tier selects exact-budget
pixels before any sample access, sum update or completed-count change. Selected
pixels retain all identity, ordinal, finite-radiance and producer-success checks.
Unselected pixels do not require sample records. No branch counts as an extra
camera sample. Invalid tiers and ordinals fail closed on CPU and GPU.

Whole-tile resolve still normalizes all valid completed pixels, irrespective
of the most recent tier. The future coordinator must complete and verify every
tier before presentation. Selected-tier state is immutable per in-flight pass.

## Consequences and qualification

The 32-byte ABI cannot be mixed with this shader or layout; regenerate reflected
constants and consume them in fixtures. Application-visible allocated bytes do
not change because slots were already 256 bytes. Fixed transport stays byte
identical and no public option, pipeline or adaptive allocation is introduced
on the disabled dispatcher.

Test mixed budgets in ascending and descending order, missing unselected records,
selected missing/duplicate records, exact ownership, final resolve, invalid GPU
configurations and physical WebGPU. Synthetic complete-sample records are not
real producer, rendered-image or speed evidence. This remains internal staging;
qualified producer/dispatcher/site integration and CI/CD are outstanding.
Rollback remains the fixed GPU-native dispatcher; Three.js is prohibited.
