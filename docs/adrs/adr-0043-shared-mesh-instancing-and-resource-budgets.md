# ADR 0043: Shared mesh instancing and resource budgets

Status: Accepted. Date: 2026-10-27.
Task: gpu-renderer #264. Story: plasius-ltd-site #2336. Feature: #1170.

## Context

The inspection compositor expanded every placement into world-space triangles.
A fixed aggregate triangle count bounded that implementation but prevented dense
scenes without expressing their actual resource requirements. Existing mesh
acceleration, material atlases and camera/refinement facilities remain reusable.
Native sparse PVOX traversal is a separate architecture and is not claimed here.

## Decision

Accept an optional `instances` array referencing unique mesh IDs. Each instance
has a stable unsigned ID and a finite, invertible column-major affine transform.
Build each mesh's local BLAS once, then a balanced world TLAS over transformed
bounds. Store TLAS and BLAS nodes in the existing BVH allocation. Mesh triangles,
vertex/index sources and material atlases are allocated once per unique geometry.

Store each 144-byte transform/inverse/identity record in nine `rgba32uint` texels.
The instanced shader uses binding 47 only; the original shader and ten storage
bindings remain unchanged. This avoids requiring an eleventh storage binding on
adapters whose exposed limit is ten. Request one extra sampled-texture binding
only for instanced scenes. Integer texels preserve unsigned IDs exactly.

Transform rays into local space without normalizing directions, retaining the
world-space ray parameter. Transform oriented normals by inverse transpose,
correct front-face parity for reflections, and transform triangle edges at the
selected hit for normal-map tangent construction. Primary, secondary and shadow
rays share the same TLAS/BLAS traversal. Camera changes reuse acceleration data.

Initial support is static non-emissive geometry with CPU BLAS construction.
Reject emissive instances and explicitly requested GPU acceleration builds until
per-instance light sampling and multi-BLAS GPU construction are qualified. Do
not expand geometry silently. Legacy uninstanced mesh and analytic callers retain
their rendering path, including existing emissive support.

Account for renderer-owned GPU buffers and textures from their allocation
descriptors, including material atlases, refinement, denoising and transient
readbacks. Validate device limits and optional `memoryBudgetBytes` before each
allocation. Release all resources when initialization fails. Report current and
peak requested resource bytes; driver overhead, external resources and physical
VRAM residency/free capacity are not exposed by this accounting.

## Rollout and consequences

The library API is opt-in. Site integration inherits
`gpu-demo.scene-fidelity.enabled` and `site.studio-coming-soon.view`; existing
backend rules control rollout and rollback. New byte budgets do not bypass those
controls or permit local publishing. Release through approved main/production CD
before consumers adopt the package. Scene changes currently recreate the runtime;
this release does not implement animated instance refitting.

Large buffer uploads are staged in sequential chunks of at most 8 MiB, with
bounded GPU completion waits between chunks. Resource-byte accounting describes
destination resources; transient browser/driver staging may add overhead, so avoid
submitting hundreds of megabytes of staging work at once during initialization.
