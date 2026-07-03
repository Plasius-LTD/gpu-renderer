# Changelog

All notable changes to this project will be documented in this file.

## 0.1.0 - 2026-02-10

- Initial scaffold for `@plasius/gpu-renderer`.
- Added framework-agnostic WebGPU renderer lifecycle APIs.
- Added XR manager binding helper to integrate with `@plasius/gpu-xr`.
- Added unit tests, demo, and ADR documentation.

## [Unreleased]

- **Added**
  - (placeholder)

- **Changed**
  - Changed emissive light metadata upload to resolve stable triangle ids back
    to the BVH-ordered triangle buffer before writing GPU light records.

- **Fixed**
  - Fixed multi-bounce source-stable renders so terminal emissive continuation
    hits are MIS-weighted against direct emissive sampling instead of adding
    full softbox radiance as sparse stippled pixels.

- **Security**
  - (placeholder)

## [0.2.33] - 2026-07-03

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - Fixed professional Animation Adventure travel so repeated locomotion clips
    advance by accumulated root-motion distance instead of a single unlooped
    root translation.

- **Security**
  - (placeholder)

## [0.2.32] - 2026-07-03

- **Added**
  - Added `createProfessionalAnimatedSceneRenderer`, a fail-closed WebGPU
    Animation Adventure surface with textured skinned GLB diagnostics,
    root-motion-required movement validation, cinematic follow camera state,
    and no 2D proxy fallback.

- **Changed**
  - Expanded animated GLB parsing to report UVs, normals, material/texture
    counts, diffuse and normal texture availability, missing texture buffers,
    and per-clip root translation distance.

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.2.31] - 2026-07-03

- **Added**
  - Added `renderer.transport.sourceStableDirectLighting.enabled` as a strict
    physical Product Studio transport flag for source-stable direct-light
    validation.
  - Added `presentationOutput: "tone-mapped" | "linear"` for denoise-off
    Product Studio validation captures.

- **Changed**
  - Changed source-stable direct lighting to reuse deterministic direct-light
    evaluation while removing direct-light sample dependence on adjacent pixel
    ids and frame-index shimmer.
  - Changed emissive light metadata upload to resolve stable triangle ids back
    to the BVH-ordered triangle buffer before writing GPU light records.

- **Fixed**
  - Fixed multi-bounce source-stable renders so terminal emissive continuation
    hits are MIS-weighted against direct emissive sampling instead of adding
    full softbox radiance as sparse stippled pixels.

- **Security**
  - (placeholder)

## [0.2.30] - 2026-07-03

- **Added**
  - Added composable strict low-SPP transport experiment flags for stable
    sample routing, strict zero overflow, deferred low-SPP Russian roulette,
    deterministic direct lighting, Product Studio environment importance, and
    product transport telemetry.

- **Changed**
  - Changed wavefront renderer config, frame stats, and snapshots to expose the
    requested/effective transport experiment set and packed shader bitfield.

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.2.29] - 2026-07-02

- **Added**
  - Added Animation Adventure movement diagnostics to animated scene snapshots,
    including active movement mode, expected/actual speed, movement distance,
    root-motion source, loop count, and foot-slide warnings.

- **Changed**
  - Changed animated scene character motion to resolve from beat-scoped
    movement requirements so stationary action beats hold their route anchor
    instead of being dragged along later route segments.

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.2.28] - 2026-07-02

- **Added**
  - Added the boolean `renderer.transport.strictPhysicalLowSppLighting` rollout
    path, including direct/nested feature-flag input support and frame stats for
    strict physical low-SPP lighting validation.
  - Added strict physical termination diagnostics for absorption/null
    throughput, Russian roulette, and strict max-depth termination.

- **Changed**
  - Changed strict low-SPP wavefront lighting to sample procedural sunlight as a
    shadow-tested directional source, procedural sky over the visible
    hemisphere, and emissive triangles by area-weighted emission power with
    matching MIS PDFs.

- **Fixed**
  - Prevented strict physical low-SPP renders from using terminal ambient rescue
    for max-depth, null-throughput, or queue-overflow termination.

- **Security**
  - (placeholder)

## [0.2.27] - 2026-07-02

- **Added**
  - Added a renderer-owned animated scene surface for adventure playback with scripted beats, route motion, blend snapshots, and bezier-lag camera follow.
  - Added animated camera mode integration with `@plasius/gpu-camera`,
    including editor, spectator, third-person, and first-person view snapshots
    plus head-look intent state.
  - Added a renderer-owned model-tree leaf material lab with procedural branches, close-up leaf rendering controls, quality tiers, and offscreen renderer telemetry for GPU Demo model iteration.

- **Changed**
  - Updated renderer dependencies to consume the `@plasius/gpu-shared` v1 line
    and the next `@plasius/gpu-camera` camera-rig release.

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.2.26] - 2026-07-02

- **Added**
  - Added animated camera mode integration with `@plasius/gpu-camera`,
    including editor, spectator, third-person, and first-person view snapshots
    plus head-look intent state.

- **Changed**
  - Added `@plasius/gpu-camera` as a runtime dependency for shared animated
    character camera rig resolution.

- **Fixed**
  - Fixed Animation Adventure skinned GLB canvas drawing so Peasant Girl renders
    as a filled mesh instead of a sparse stroked/wireframe triangle subset under
    task `#117`.

- **Security**
  - (placeholder)

## [0.2.25] - 2026-07-01

- **Added**
  - Added renderer-owned skinned GLB ingestion for Animation Adventure,
    including mesh/skin/clip parsing, Mixamo node-name retargeting, CPU
    skinning for the active clip, model-derived canvas drawing, and snapshot
    renderability diagnostics under task `#114`.

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.2.24] - 2026-07-01

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - Fixed Animation Adventure canvas projection so farm props and the visible
    Peasant Girl proxy stay grounded on the route plane, with improved crop
    soil, tree, cart, crate, and character drawing plus snapshot diagnostics for
    character visibility and prop ground anchors under task `#108`.

- **Security**
  - (placeholder)

## [0.2.23] - 2026-07-01

- **Added**
  - (placeholder)

- **Changed**
  - Updated runtime GPU dependencies to `@plasius/gpu-shared` `^1.0.2` and
    `@plasius/gpu-xr` `^0.1.16` so downstream GPU Demo consumers do not pull
    stale shared runtime packages transitively.
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.2.22] - 2026-06-30

- **Added**
  - Added a renderer-owned animated scene surface for adventure playback with scripted beats, route motion, blend snapshots, and bezier-lag camera follow.
  - Added a renderer-owned model-tree leaf material lab with procedural branches, close-up leaf rendering controls, quality tiers, and offscreen renderer telemetry for GPU Demo model iteration.

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.2.21] - 2026-06-29

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - Added the missing `samplesPerPixel` field to the WGSL frame config and
    matching CPU uniform payload so live Product Studio wavefront shaders compile
    in browser runtimes that validate the assembled shader strictly.

- **Security**
  - (placeholder)

## [0.2.20] - 2026-06-29

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - Removed a duplicate `radical_inverse_vdc` WGSL helper definition from the
    assembled wavefront compute shader so stricter live-browser compilers do not
    reject validation-scene startup before first frame.

- **Security**
  - (placeholder)

## [0.2.19] - 2026-06-28

- **Added**
  - Added a named wavefront sample-dimension registry plus low-discrepancy 2D
    sampling helpers for camera jitter, BSDF continuation, and direct/emissive
    light selection.
  - Added machine-checkable high-SPP denoise-independence thresholds for
    structural artifacts, invalid samples, baseline noise, and sheen/chrome/wood
    detail retention.

- **Changed**
  - Changed wavefront jitter/light sampling to use explicit sample-dimension
    constants instead of ad hoc numeric offsets in shader code.

- **Fixed**
  - Prevented denoise-on output from qualifying a high-SPP validation report
    when the paired denoise-off result still contains structural artifacts.

## [0.2.18] - 2026-06-22

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.2.17] - 2026-06-22

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.2.16] - 2026-06-22

- **Added**
  - (placeholder)

- **Changed**
  - Wavefront transport now derives continuation and visibility-ray origin offsets
    from geometric/shading-normal agreement and ray direction instead of a fixed
    shading-normal bias.

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.2.15] - 2026-06-22

- **Added**
  - (placeholder)

- **Changed**
  - Changed wavefront terminal and direct-light accumulation to preserve HDR
    linear radiance through accumulation and deferred resolve, while sanitizing
    only invalid or half-float-overflow samples before presentation.

- **Fixed**
  - Fixed the renderer's legacy per-sample `4.0` radiance clamp so HDR
    fireflies are now measured through `radianceDiagnostics` and
    `transportGuardrails` instead of being silently biased out of the linear
    estimator path.
  - Fixed medium handoff fallback so invalid medium ids and unsupported nested
    medium transitions keep the current ray medium instead of propagating a
    broken or pretend stack state.

- **Security**
  - (placeholder)

## [0.2.14] - 2026-06-22

- **Added**
  - Added deterministic numeric transport-validation helpers and unit coverage
    for BSDF PDF consistency, furnace-style reflectance bounds, and bounded
    terminal-environment residual handling in the wavefront renderer.

- **Changed**
  - Split the renderer and wavefront implementation into purpose-specific
    modules while preserving the existing public package exports, and updated
    source syntax checks to cover every JavaScript file under `src/`.

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.2.13] - 2026-06-22

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.2.12] - 2026-06-22

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.2.11] - 2026-06-22

- **Added**
  - Added ADR 0017 to document physical deferred-throughput continuation,
    invalid-throughput fallback, and rollout expectations for
    `renderer.transport.physicalEstimator`.
  - Added terminal-radiance diagnostics to awaited wavefront frame stats so
    callers can measure total terminal luminance, ambient-residual luminance,
    and ambient-residual share during renderer validation.
  - Added `updateCamera(...)` support for wavefront renderers so validation
    views can animate camera movement without rebuilding mesh buffers.
  - Added `gpuWorkerJobs` diagnostics to wavefront frame stats so callers can
    inspect completed compute-dispatch jobs per frame, per second, and per
    command submission alongside the existing GPU parallelism figures.
  - Added `transportGuardrails` summaries to awaited wavefront frame stats so
    validation harnesses can read throughput, submission, queue-overflow,
    memory, and device-loss health from one structured result.
  - Added `gpuParallelism` diagnostics to wavefront frame stats and snapshots so
    consumers can inspect adapter compute limits, direct workgroups,
    indirect-dispatch estimates, and whether a frame exposes multi-workgroup GPU
    parallelism.
  - Added optional equirectangular `environmentMap` sampling for wavefront
    tracing so environment misses and surface environment estimates can use a
    bound radiance texture before falling back to procedural sky/ambient values.
  - Added default-on `deferredPathResolve` support for wavefront tracing so
    surface traversal records material responses and terminal source radiance
    before the output pass resolves the path backward into pixel accumulation.
  - Added design and ADR coverage for shadow-tested direct light and bounded
    bounce attenuation in deferred wavefront path resolution.
  - Added display-quality material-response support for sheen, clearcoat, and
    decoded base-colour, metallic-roughness, normal, and occlusion maps in the
    wavefront mesh path.
  - Added GPU hit-time material atlas sampling for display-quality wavefront
    tracing so exact hit UVs now drive base-colour, metallic-roughness, normal,
    occlusion, and emissive texture evaluation on the GPU instead of relying on
    CPU-baked triangle averages.
  - Added ADR and design coverage for generic glTF material transport so
    specular colour, sheen colour, transmission, clearcoat, and IOR can travel
    through the shared wavefront shading path instead of being inferred from
    demo-specific material names.
  - Added ADR and design coverage for environment-driven glossy surface
    response so specular, sheen, and clearcoat shading can use reflection-
    aligned environment radiance instead of leaning primarily on a sun-only
    highlight proxy.
  - Added ADR and design coverage for prefiltered HDRI, BRDF LUT, and MIS-based
    environment lighting in the wavefront display-quality path.
  - Added ADR/design coverage and public contract support for authored volume
    transport so mesh materials can derive Beer-Lambert media from glTF-style
    attenuation inputs while preserving shell thickness in GPU material
    packing.
  - Added adaptive `renderFrame(...)` sampling controls so callers can cap a
    frame with `frameTimeBudgetMs`, guarantee a `minimumSamplesPerPixel`, and
    inspect actual `renderedSamplesPerPixel` separately from the configured SPP
    ceiling.
  - Added `createWavefrontAdaptiveSamplingLevels(...)` so consumers can hand
    wavefront SPP adaptation to `@plasius/gpu-performance` without duplicating
    renderer-specific ladder construction in app or demo code.
  - Added ADR 0016 for the mixed environment/emissive direct-light MIS
    contract used by the wavefront display-quality renderer.

- **Fixed**
  - Raised the bounded wavefront `maxDepth` ceiling to 32 so offline/reference
    renders can request 20-bounce paths without being clamped by renderer
    configuration.
  - Fixed release metadata preparation on protected `main` so repositories that
    only require pull-request mediation can fall back to a `github.token` PR
    path instead of failing immediately on missing `RELEASE_PREP_TOKEN`.
  - Fixed deferred wavefront continuation to record sanitized physical
    throughput segments instead of heuristic path-response colours, with
    explicit delta-lobe tagging and bounded terminal fallback for invalid
    continuation throughput.
  - Awaited wavefront frame waits now scale their submitted-work timeout by
    actual triangle load as well as pass count, preventing mesh-heavy
    validation frames from failing early while the GPU is still legitimately
    finishing the submitted work.
  - Awaited high-SPP wavefront frames now break first-frame GPU work into
    progressive 1-SPP submission slices with bounded wait windows, which avoids
    queueing an entire heavy validation frame ahead of a single completion wait
    and materially reduces browser-side device-loss risk on mesh renders.
  - Fixed the display-quality `cpu-upload` mesh path so uploaded triangle
    records preserve raw material factors, atlas rects, and texture settings
    for GPU hit-time sampling instead of baking CPU-side averages that could
    corrupt leather, wood, and chrome shading with the wrong atlas region.
  - Fixed awaited `>= 8 spp` wavefront scheduling to stay tile-major while the
    accumulation buffer is tile-local, preventing repeated-tile/striped image
    corruption and stalled validation captures on higher-SPP frames.

- **Changed**
  - Changed internal wavefront frame batching and dispatch-diagnostics plumbing
    to live in a dedicated runtime helper module so scheduling concerns stay
    separated from shader and pipeline assembly.
  - Changed display-quality mesh tracing to default to `accelerationBuildMode:
    "cpu-upload"` so stable CPU-built BVH uploads are used for validation and
    demo rendering unless callers explicitly opt into the experimental GPU-side
    BVH construction path.
  - Changed wavefront frame dispatch to split large tile/sample workloads into
    bounded command submissions instead of encoding an entire high-resolution
    frame into one command buffer.
  - Changed display-quality wavefront tracing to pack HDRI importance-sampling
    PDFs and CDFs into one GPU texture so the MIS path stays compatible with
    adapters that expose only the existing 10 trace-stage storage buffers.
  - Changed wavefront terminal/direct environment estimates to consume
    `environmentLighting.sunlitBaseline` as a time-of-day daylight floor instead
    of relying only on restrained ambient colour.
  - Changed deferred wavefront surface resolution to allow explicit
    shadow-tested direct lighting before terminal continuation resolution and to
    remap extremely dark bounce responses to a small scene-brightness floor.
  - Changed wavefront denoise to adapt its kernel strength to SPP and to skip
    the intermediate full-screen scratch pass for 4+ SPP frames, reducing blur
    and denoise cost on cleaner renders.
  - Changed async wavefront frame rendering to wait for submitted GPU work and
    to batch higher-SPP workloads more defensibly, while raising the SPP ceiling
    from 64 to 256 for higher-end GPUs.
  - Changed awaited high-SPP wavefront rendering to fence submitted GPU work
    once per `renderFrame(...)` call instead of after every intermediate command
    submission.
  - Changed wavefront scene, mesh, triangle, material, and hit records to carry
    generic glTF-style specular colour, sheen colour, and transmission inputs
    in addition to the existing roughness, metallic, clearcoat, and IOR data.
  - Changed direct and terminal wavefront surface environment shading to sample
    reflection-aligned environment radiance for glossy materials before adding
    narrower sun highlights, improving leather, chrome, and polished-surface
    response without model-specific rules.
  - Changed wavefront environment-lighting setup to prepare roughness-aware HDRI
    resources, a BRDF integration LUT, and HDRI importance-sampling tables for
    display-quality renders.
  - Changed wavefront continuation sampling to emit BSDF PDFs for diffuse,
    conductor, clearcoat, and transmission paths so environment misses and
    explicit HDRI samples can use MIS instead of the older light-guidance
    heuristics.
  - Changed wavefront explicit direct lighting to use a one-sample
    environment/emissive mixture with solid-angle-normalized area-light PDFs
    and BSDF-semantic eligibility instead of the older material-kind/bounce
    gate.

- **Fixed**
  - Fixed low-sample wavefront renders so non-emissive surface hits receive a
    deterministic sky, sun, and portal-light estimate before random continuation.
  - Reduced deterministic environment fill on direct surface hits so ambient
    rescue lighting no longer washes dark materials toward the full scene
    ambient colour.
  - Fixed wavefront output-probe readback so higher-SPP validation renders wait
    for submitted GPU work before mapping the staging buffer, avoiding
    `GPUBuffer.mapAsync(...)` lifetime failures during probe capture.
  - Fixed display-quality environment misses so non-delta BSDF paths now apply
    MIS weighting against the HDRI direction PDF instead of overcounting raw
    sky radiance on termination.

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
[0.2.11]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.2.11
[0.2.12]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.2.12
[0.2.13]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.2.13
[0.2.14]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.2.14
[0.2.15]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.2.15
[0.2.16]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.2.16
[0.2.17]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.2.17
[0.2.18]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.2.18
[0.2.19]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.2.19
[0.2.20]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.2.20
[0.2.21]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.2.21
[0.2.22]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.2.22
[0.2.23]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.2.23
[0.2.24]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.2.24
[0.2.25]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.2.25
[0.2.26]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.2.26
[0.2.27]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.2.27
[0.2.28]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.2.28
[0.2.29]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.2.29
[0.2.30]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.2.30
[0.2.31]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.2.31
[0.2.32]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.2.32
[0.2.33]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.2.33
