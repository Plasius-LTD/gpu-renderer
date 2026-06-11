# Changelog

All notable changes to this project will be documented in this file.

## 0.1.0 - 2026-02-10

- Initial scaffold for `@plasius/gpu-renderer`.
- Added framework-agnostic WebGPU renderer lifecycle APIs.
- Added XR manager binding helper to integrate with `@plasius/gpu-xr`.
- Added unit tests, demo, and ADR documentation.

## [Unreleased]

- **Added**
  - Added `updateCamera(...)` support for wavefront renderers so validation
    views can animate camera movement without rebuilding mesh buffers.

- **Changed**
  - Changed wavefront frame dispatch to split large tile/sample workloads into
    bounded command submissions instead of encoding an entire high-resolution
    frame into one command buffer.

- **Fixed**
  - Fixed low-sample wavefront renders so non-emissive surface hits receive a
    deterministic sky, sun, and portal-light estimate before random continuation.
  - Reduced deterministic environment fill on direct surface hits so ambient
    rescue lighting no longer washes dark materials toward the full scene
    ambient colour.

- **Security**
  - (placeholder)

## [0.2.1] - 2026-06-06

- **Added**
  - Added deterministic wavefront reference helpers for primary-ray creation,
    triangle-hit evaluation, nearest-hit selection, and environment-miss
    fallback alongside regression tests for task-level acceptance coverage.
  - Added ADR coverage for mesh BVH wavefront path tracing as the display-quality
    baseline.

- **Changed**
  - Promoted the mesh BVH wavefront renderer source into the canonical
    `src/wavefront-compute.js` module so source, typings, tests, and package
    builds no longer drift behind generated artifacts.
  - Changed wavefront mesh tracing to dispatch bounce intersection and
    surface-resolution work from GPU-authored active-ray counts instead of the
    fixed tile capacity after queue compaction.
  - Changed the npm CD workflow to prepare package version and changelog
    metadata locally, then publish the validated tag while persisting release
    metadata through an automation PR branch instead of direct protected-main
    pushes.

- **Fixed**
  - Fixed wavefront source ownership so display-quality mesh BVH code is not
    hidden behind a legacy module split.
  - Preserved the wavefront mode/workgroup constants, shader-source helper,
    one-shot frame helper, and `renderFrame(...)` compatibility wrapper while
    promoting the mesh BVH renderer source.
  - Fixed a production performance regression where compacted continuation
    queues still scheduled full-capacity per-bounce workgroups.
  - Fixed low-sample wavefront surface traces so terminal non-emissive surface
    collisions use an environment-derived ambient floor instead of a flat or
    missing fallback.
  - Fixed release metadata versioning, demo dependencies, and one-shot
    wavefront cleanup blockers found during PR validation.

- **Security**
  - (placeholder)

## [0.1.14] - 2026-06-04

- **Added**
  - Added wavefront path-tracing queue/buffer contracts and bounce-schedule
    metadata beneath `createRayTracingRenderPlan(...)`.
  - Added a tiled WebGPU wavefront compute renderer with scene-object buffers,
    GPU ray queues, hit records, material continuation, emissive/environment
    termination, ambient residual expiry, denoise resolve, and presentation.
  - Added triangle mesh normalization, GPU-source mesh packing, triangle/BVH
    buffer contracts, and display-quality guards requiring mesh BVH input.
  - Added GPU mesh-source buffer packing and GPU build-pass entry points for
    triangle assembly, GPU Morton leaf sorting, sorted leaf materialization,
    and deterministic, level-concurrent BVH node construction.
  - Added public BVH sort-stage and build-level scheduling metadata for worker/queue
    integration.
  - Expanded GPU hit records with primitive id, material reference, medium
    reference, barycentric coordinates, and UV coordinates.
  - Added mesh BVH tests for flat normals, smooth normals, stable triangle
    identity, leaf splitting, and GPU record layout stability.
  - Added public scene-object packing/config helpers for Product Studio and
    other package consumers.
  - Updated the browser demo to mount the wavefront compute renderer directly
    and consume a `@plasius/gpu-lighting` environment preset.
  - Added `samplesPerPixel` support for GPU wavefront renders so quality
    presets can accumulate multiple primary-ray samples without increasing
    tile-queue buffer size.
  - Added a two-stage full-frame GPU denoise pass that filters linear
    `rgba16float` radiance through a scratch texture after all tiles complete,
    then tone-maps into the final `rgba8unorm` output while avoiding tile-local
    denoise artifacts.
  - Added GPU emissive-triangle continuation guidance stored in the BVH buffer
    tail so active diffuse rays sample finite mesh light geometry more often
    without adding a ninth trace storage buffer or separate direct-light/shadow
    accumulation path.
  - Added WebGPU environment-light portal records so rooms and studio interiors
    can guide and gate sky/HDRI contribution through openings such as windows.

- **Changed**
  - Wavefront environment misses now evaluate a direction-aware sky/key-light
    environment payload instead of only using a flat environment colour.
  - Wavefront environment misses now respect `environmentPortalMode`; in
    `guide-and-gate` mode, misses outside configured portals fall back to the
    ambient residual instead of receiving full sky radiance.
  - Display-quality wavefront configuration now uses GPU-built mesh
    acceleration; CPU-built mesh acceleration is treated as debug-only.
  - Replaced the one-thread BVH internal-node build kernel with bottom-up
    level dispatches so parent nodes at the same depth build concurrently on
    the GPU.
  - Reordered mesh BVH leaves on the GPU by Morton-style centroid keys before
    internal node construction, avoiding author/index-order BVH layout as the
    display-quality baseline.
  - Removed the direct `@plasius/gpu-shared` dependency from the renderer to
    keep shared demo adapters dependent on the renderer rather than the reverse.
  - Wavefront surface resolution now removes the separate direct key-light
    accumulation term, clamps high-energy path samples in linear radiance, and
    applies a bounded estimator weight to guided emissive hits while relying on
    active emissive/environment path hits plus ambient residual expiry for
    preview output.
  - Wavefront primary-ray jitter and bounce sampling now use mixed
    pixel/sample/bounce/frame seeds to reduce row-correlated low-sample noise.
  - Wavefront frames now reuse a static GPU-built mesh BVH after the first
    acceleration build and batch tile/sample tracing, tile output, optional
    denoise, and presentation into one frame command submission.

- **Fixed**
  - Fixed primary-ray jitter seeding to use absolute screen pixel ids instead
    of tile-local pixel ids, preventing repeated sampling patterns across
    tiles.
  - Fixed environment portal WGSL reserved-word usage and now request the
    required 9-storage-buffer trace limit from capable WebGPU adapters before
    creating the mesh-BVH trace pipeline.
  - Fixed the WebGPU hit-buffer stride to match the WGSL `HitRecord` layout
    and added a continuation-queue capacity guard, preventing tile-row
    corruption in mesh BVH wavefront renders.

- **Security**
  - (placeholder)

## [0.1.12] - 2026-05-13

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.1.11] - 2026-05-13

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.1.10] - 2026-04-02

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.1.9] - 2026-03-23

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.1.8] - 2026-03-15

- **Added**
  - ADR, TDR, and test-first planning coverage for the ray-tracing-first
    hybrid render graph and range-banded scene representations.
  - Added `createRayTracingRenderPlan(...)` plus public render-stage,
    representation-band, and acceleration-structure policy exports.
  - Expanded renderer worker manifests with stable visual snapshot input
    boundaries and RT-first render-planning metadata.
  - Added tests covering stable snapshot ingestion, required denoise/temporal
    stages, representation-band policies, and acceleration-structure classes.

- **Changed**
  - TDR-0003 now reflects the implemented RT-first render-planning helpers.

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.1.7] - 2026-03-14

- **Added**
  - Added frame lifecycle hooks and frame-id generation support to
    `createGpuRenderer(...)`.
  - Added `createRendererDebugHooks(...)` for opt-in `@plasius/gpu-debug`
    frame sampling tied to negotiated frame targets.
  - Added ADR, TDR, and design docs for renderer frame hook integration.
  - Added renderer worker profile and manifest exports for `realtime` and `xr`
    DAG scheduling across `@plasius/gpu-worker` and
    `@plasius/gpu-performance`.
  - Added ADR, TDR, and design docs for renderer frame-stage DAG manifests.

- **Changed**
  - Clarified renderer guidance for adaptive frame targets and debug
    instrumentation.
  - Clarified that frame hooks cover correlation while worker manifests cover
    renderer stage scheduling.
  - Raised the minimum `@plasius/gpu-xr` dependency to `^0.1.7` so npm
    installs resolve the published adaptive XR session helpers by default.
  - Updated GitHub Actions workflows to run JavaScript actions on Node 24,
    refreshed core workflow action versions, and switched Codecov uploads to
    the Codecov CLI.

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.1.6] - 2026-03-04

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.1.2] - 2026-03-01

- **Added**
  - `lint`, `typecheck`, and security audit scripts for local and CI enforcement.

- **Changed**
  - CI now fails early on lint/typecheck/runtime dependency audit before build/test.

- **Fixed**
  - Pack-check regex cleanup to remove an unnecessary path escape.

- **Security**
  - Runtime dependency vulnerability checks are now enforced in CI.

## [0.1.1] - 2026-02-28

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.1.0] - 2026-02-11

- **Added**
  - Initial release.

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)
[0.1.1]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.1.1
[0.1.2]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.1.2
[0.1.6]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.1.6
[0.1.7]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.1.7
[0.1.8]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.1.8
[0.1.9]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.1.9
[0.1.10]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.1.10
[0.1.11]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.1.11
[0.1.12]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.1.12
[0.1.14]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.1.14
[0.2.1]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.2.1
