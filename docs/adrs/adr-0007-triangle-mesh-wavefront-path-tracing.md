# ADR 0007: Mesh BVH Wavefront Path Tracing As Display Quality Baseline

## Status

Accepted

## Context

The analytic `sphere`/`box` wavefront renderer is useful for validating tiled
GPU queue execution, but it is not visually correct for display-quality output.
Across the Plasius `gpu-*` rendering family, mesh BVH is the only acceptable
baseline for user-visible display-quality path tracing. Product renders and
other asset-backed scenes must preserve the source triangle mesh, triangle
identity, geometric normals, interpolated shading normals, material lookup, and
future medium interactions. Bounce directions must be derived from the resolved
triangle surface at the hit point, not from coarse proxy objects.

Future high-end modes also need room for inverse prismatic scatter experiments
where paths are traced from light sources through refractive or participating
media, then related back to screen-space contribution.

## Decision

`@plasius/gpu-renderer` will treat triangle mesh BVH path tracing as the display
quality path for the whole project, not just Product Studio. The renderer will:

- accept indexed triangle mesh buffers for positions, indices, vertex normals,
  UVs, tangents where available, material references, and primitive metadata;
- build or consume a GPU-friendly acceleration structure, initially BVH-style,
  so tiled path tracing remains practical at 720p, 1080p, and future 4K targets;
- intersect active rays against triangles on the GPU and select the nearest
  valid triangle hit;
- write barycentric coordinates, primitive id, material id, geometric normal,
  interpolated shading normal, UV, front-face state, and medium/material
  references into the hit record;
- calculate reflection, refraction, transparency, and diffuse continuation
  directions from the triangle hit using a repaired shading normal that remains
  consistent with the geometric normal;
- keep analytic `sphere` and `box` objects as debug fixtures only. They must not
  be presented as display-quality renderer output.

## Normal Handling

The geometric normal is calculated from the hit triangle winding. The shading
normal is interpolated from vertex normals with barycentric coordinates when
normals are present; otherwise it falls back to the geometric normal. If a
normal map is available later, it is transformed through the tangent frame after
the barycentric normal is resolved. Invalid, zero-length, or back-facing shading
normals must be repaired against the geometric normal before they affect bounce
directions.

## Future Medium And Prismatic Work

Inverse prismatic scatter and light-source-originated path experiments are a
later high-performance mode. This ADR does not require that mode in the first
triangle implementation, but the mesh/material/medium records must not block it.
The record model should leave explicit room for wavelength/dispersion controls,
medium references, and light-surface emission metadata.

## Consequences

- Product Studio and any other user-visible renderer must not claim visual
  correctness while it submits proxy boxes or other non-mesh geometry instead of
  source triangles.
- Any demo, page, or screenshot that uses analytic/proxy geometry must label it
  as debug/test output and must not be used as visual acceptance evidence.
- The first triangle implementation may ship with limited materials and no
  texture sampling, but the intersection and normal path must be triangle-based.
- CPU work is limited to source-buffer upload and WebGPU command submission.
  Production BVH construction/update, triangle assembly, ray traversal,
  nearest-hit selection, material evaluation, and accumulation must run on the
  GPU.
- The analytic debug renderer remains valuable for WebGPU capability checks,
  buffer-limit validation, and small deterministic tests.

## Current Implementation Boundary

The first implementation slice in `@plasius/gpu-renderer` uploads indexed mesh
source buffers for positions, indices, normals, UVs, mesh ranges, and material
metadata. Display-quality configuration selects `accelerationBuildMode: "gpu"`
and rejects `cpu-debug` acceleration. The GPU build pass assembles triangle
records, writes Morton-style centroid keys into a leaf-reference buffer, sorts
the leaf references on the GPU, materializes sorted BVH leaves, and builds a
deterministic binary BVH before tiled wavefront tracing. Internal BVH nodes are
built bottom-up with one compute dispatch per dependency level, so all parent
nodes at the same depth execute concurrently on the GPU. The WGSL intersection
path traverses the BVH, intersects triangles, selects the nearest valid hit, and
writes primitive id, material reference, medium reference, barycentric
coordinates, UVs, geometric normal, and repaired shading normal into the hit
record.

The wavefront renderer also supports configurable `samplesPerPixel` within the
GPU render pass. Higher sample counts multiply primary-ray dispatches, but the
queue and hit buffers stay tile-bounded. Ray, hit, triangle, BVH, and
accumulation record sizes must match WGSL alignment exactly; buffer stride
mismatches are treated as release-blocking visual corruption bugs. Resolved tile
output is written to a linear `rgba16float` radiance texture, then an optional
two-stage full-frame GPU denoise reads across tile boundaries, writes through an
`rgba16float` scratch texture, and tone-maps into the presented `rgba8unorm`
texture. Low-sample
Product Studio preview output stores compact emissive-triangle guidance metadata
in the existing BVH buffer tail and uses it to guide diffuse continuation rays
toward finite mesh light geometry without adding a ninth trace storage buffer.
This guide changes the next active-ray direction only; it does not add a
separate shadow ray or direct-light contribution. Radiance is still accumulated
when the active path hits emissive geometry, misses into the environment, or
expires with the configured ambient residual. Guided emissive hits carry a
bounded estimator weight until full material PDFs/MIS are implemented. Radiance
clamping and damped diffuse throughput reduce fireflies while continuation rays
still evaluate mesh BVH hits.

The remaining production-hardening work is not optional: material-id lookup
tables, texture sampling, direct-light PDF/MIS correction, dynamic TLAS instance
records, higher-grade LBVH/SAH construction, runtime execution behind the
`@plasius/gpu-worker` lock-free queue, runtime GPU smoke coverage, and
larger-scene traversal benchmarks still need to land before the mesh renderer is
treated as final production-quality output.
