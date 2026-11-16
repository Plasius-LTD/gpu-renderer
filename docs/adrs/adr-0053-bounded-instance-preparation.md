# ADR 0053: Reduce transient instance preparation allocations

- Status: Accepted
- Date: 2026-11-16
- Work: gpu-renderer#310, site#2529 / Feature #1170

## Context

A million retained instances create millions of CPU bounds and hierarchy objects
before GPU upload. Baseline preparation measurements show substantial allocation
and garbage-collection pressure independently of camera traversal costs.

## Decision

Build median BVHs over index ranges in one build-owned ordering array. Preserve
stable centroid sorting, axis priority, median partitioning and preorder nodes.
Apply TLAS outward padding during node construction instead of cloning the tree.
Transform eight bounds corners with scalar temporaries. Reuse affine/inverse
storage for frozen placement arrays within one preparation call; each primitive
still owns its separate mesh bounds. Mutable inputs are copied and validated.

No cache survives a build. No geometry, instance, material, ray or bounce is
omitted. Renderer/shader layout and equal-distance hit policy remain unchanged.

## Validation and consequences

Reference tests compare exact hierarchy/order and transformed corner bounds,
including ties, padding, mutable inputs and repeated build isolation. Real GPU
qualification compares display and HDR bytes at matched camera/sample/frame
sequences after motion. CPU preparation and GPU motion metrics are separate;
object-count-independent frame time is not guaranteed by this optimization.
Peak memory still scales with retained instances. Publication and public consumer
qualification remain required before the story is complete.
