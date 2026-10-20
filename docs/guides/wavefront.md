# Wavefront rendering

## WebGPU Wavefront Compute Renderer

The package also exposes an executable WebGPU wavefront renderer for active-ray
debug validation scenes. It is compute-driven, tiled, and breadth-first by
bounce depth, so queue buffers are bounded by tile size instead of presentation
resolution. Renderer-owned GPU record sizes are part of the public compute
limits so ray, hit, triangle, BVH, and accumulation buffers stay aligned with
their WGSL layouts. Frame submission batching and dispatch diagnostics are kept
in dedicated runtime helpers so performance-facing integrations can consume
stable frame stats without inheriting the renderer's shader and pipeline
assembly internals.

## Transport and experimental flags

The production transport rollout remains gated by
`renderer.transport.physicalEstimator`. With the flag enabled, deferred
continuation vertices carry sanitized physical throughput segments instead of a
heuristic material-response tint, while the older fallback path remains the
rollback route during validation.
Low-SPP physical lighting hardening is separately controlled by the boolean
`renderer.transport.strictPhysicalLowSppLighting` flag, passed either as
`strictPhysicalLowSppLighting: true` or through `featureFlags`. When enabled,
the renderer disables terminal ambient rescue for max-depth/null-throughput
termination, samples procedural sunlight as an explicit shadow-tested
directional source, samples procedural sky over the visible hemisphere, and
selects emissive triangles by area-weighted emission power with matching MIS
PDFs. Use `denoise: false` when validating this strict path so remaining
variance is measured in the transport rather than hidden by filtering.
Strict validation can also enable the Product Studio transport experiment
matrix through independent boolean feature flags. The flags are composable:
none, one, several, or all may be requested at once. Flags that depend on strict
physical transport report as requested but no-op effectively when
`renderer.transport.strictPhysicalLowSppLighting` is disabled.

- `renderer.transport.stableSampleRouting.enabled`
- `renderer.transport.strictZeroOverflow.enabled`
- `renderer.transport.deferLowSppRussianRoulette.enabled`
- `renderer.transport.deterministicDirectLighting.enabled`
- `renderer.transport.sourceStableDirectLighting.enabled`
- `renderer.transport.deterministicLowSppIndirect.enabled`
- `renderer.environment.productStudioImportance.enabled`
- `renderer.diagnostics.productTransportTelemetry.enabled`

Renderer config, frame stats, and snapshots expose both the structured
`transportExperiments` state and the packed `transportExperimentFlags` bitfield
so Product Studio diagnostics can record the exact active set for each render.
`renderer.transport.sourceStableDirectLighting.enabled` is intended for
denoise-off Product Studio validation: in strict physical mode it enables the
deterministic direct-light path and removes direct-light sample dependence on
adjacent pixel ids and frame index so low-SPP source routing is stable without
adding ambient fill. Multi-bounce continuation rays that terminate on emissive
geometry are MIS-weighted against that direct emissive estimator, so rare
softbox hits remain physically valid without adding full unbalanced source
radiance as isolated stippled pixels.
`renderer.transport.deterministicLowSppIndirect.enabled` is also strict-mode
only. The flag remains in the public experiment matrix so Product Studio can
keep reporting requested and effective rollout state, but the strict shader path
does not inject cached indirect radiance or suppress physical continuation. Any
future low-SPP indirect stabilizer must be introduced as an auditable transport
source with measured PDFs, visibility, and validation against high-SPP reference
renders before it contributes radiance. Until then,
`transportContributions.cachedIndirectLuminance` should remain zero and
multi-bounce energy should come from direct explicit lighting, true terminal
emissive/environment hits, or stochastic BSDF continuation.
Set `presentationOutput: "linear"` for linear presented validation captures, or
omit it to keep the default tone-mapped presentation.

```js
import {
  createWavefrontPathTracingComputeRenderer,
} from "@plasius/gpu-renderer";

const renderer = await createWavefrontPathTracingComputeRenderer({
  canvas: "#product-render",
  width: 1280,
  height: 720,
  maxDepth: 6,
  samplesPerPixel: 8,
  displayQuality: true,
  meshes: [
    {
      id: 1,
      positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
      indices: [0, 1, 2],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
      emission: [8, 7, 5, 1],
    },
  ],
});

renderer.renderOnce();

// Destroy the renderer from your host's teardown after pending work completes.
```

Existing consumers that still call `renderFrame(...)` or
`renderWavefrontPathTracingComputeFrame(...)` remain supported as compatibility
wrappers around the canonical mesh renderer.

Analytic scene objects remain available for debug fixtures:

```js
import { createWavefrontPathTracingComputeRenderer } from "@plasius/gpu-renderer";

const debugRenderer = await createWavefrontPathTracingComputeRenderer({
  canvas: "#debug-render",
  width: 1280,
  height: 720,
  maxDepth: 6,
  sceneObjects: [
    {
      type: "sphere",
      center: [0, 1.8, -0.5],
      radius: 0.35,
      emission: [8, 7, 5, 1],
      materialKind: "emissive",
    },
  ],
});

debugRenderer.renderOnce();

// Destroy the renderer from your host's teardown after pending work completes.
```

Scene objects currently support analytic `sphere` and axis-aligned `box`
records with colour, emission, roughness, metallic, opacity, IOR, clearcoat,
sheen colour, specular colour, and transmission fields.
These records are debug fixtures only. Product Studio visual rendering requires
the mesh BVH path described in
`docs/adrs/adr-0007-triangle-mesh-wavefront-path-tracing.md`. This is a
project-wide display-quality baseline for path-traced rendering, not a
Product-Studio-only requirement.

Mesh inputs are normalized into triangle records, packed into GPU buffers, and
uploaded as source buffers for tracing. Vertex normals are preserved for smooth
shading; when normals are absent the triangle geometric normal is used. The
display-quality path now defaults to `accelerationBuildMode: "cpu-upload"` so
CPU-built BVH nodes and triangle records are uploaded once and then reused by
the GPU tracing passes. Set `accelerationBuildMode: "gpu"` only when you
explicitly want the experimental GPU-side BVH assembly path for validation or
development. The `createWavefrontMeshAcceleration(...)` helper is therefore no
longer debug-only; it is the stable display-quality acceleration builder,
whereas GPU BVH construction remains available behind the explicit mode switch.
CPU-upload records still preserve the raw material factors plus atlas rects and
texture settings expected by the GPU hit-time samplers; they are not meant to
replace exact UV-driven sampling with CPU-baked triangle averages.
The GPU BVH path still uses Morton-style centroid keys to sort leaf references
before sorted leaves and level-concurrent internal nodes are materialized.
When mesh inputs also carry UVs plus decoded base-colour,
metallic-roughness, normal, occlusion, or emissive maps, the display-quality
path now packs them into GPU texture atlases and samples them at the resolved
hit UV inside the wavefront trace pass. Generic glTF-style material factors
such as clearcoat, sheen colour, specular colour, transmission, and IOR are
also preserved through the GPU records so demo validation does not need
model-name overrides. CPU-side texture work is limited to load-time decode and
atlas packing; per-hit shading stays on the GPU. Direct and terminal glossy
response now also samples reflection-aligned environment radiance so leather,
chrome, and other polished authored materials can read from the active
environment map or procedural sky instead of relying mostly on a sun-direction
proxy.
Authored participating-media inputs can also enter through the same mesh path.
A mesh may provide an explicit `medium` block or a glTF-style `material.volume`
block with `thickness`, `attenuationColor`, and `attenuationDistance`; the
renderer derives the medium-table entry, carries the active medium id on the
GPU ray, and applies Beer-Lambert transmittance to travelled segments on the
GPU. Thickness is now preserved in material packing for later shell-volume
work, but the current renderer still tracks only one active medium id per ray
and does not yet implement nested media, spectral dispersion, or a branching
reflection/refraction tree. Invalid medium ids fall back to the current ray
medium, and entering a second medium while one is already active preserves the
existing medium id until dedicated stack support is implemented.

`samplesPerPixel` controls how many GPU primary-ray samples are accumulated per
screen pixel within a single render. This multiplies dispatch work but does not
increase the tile queue memory footprint, so 720p/1080p/4K targets remain
bounded by `tileSize`. `maxDepth` is bounded at 32 for offline/reference
renders, allowing 20-bounce quality checks while keeping path-vertex memory
explicit and predictable. When `denoise` is enabled the renderer writes raw
linear radiance to an `rgba16float` texture first, then runs a two-stage
full-frame GPU denoise through an `rgba16float` scratch texture before final
tone mapping into the presented `rgba8unorm` output. Filtering in linear
radiance space lets the denoise pass cross tile boundaries without compressing
energy/detail before the final resolve. High-SPP wavefront sampling now routes
camera jitter, BSDF continuation, emissive-light selection, and environment
selection through named sample dimensions in
`src/wavefront-sampling-dimensions.js`, using low-discrepancy 2D pairs where
they improve convergence without adding CPU-side sample tables. The companion
`src/wavefront-denoise-validation.js` acceptance helper keeps denoise-off
validation explicit with structural-artifact, invalid-sample, baseline-noise,
and sheen/chrome/wood detail-retention thresholds so the
`renderer.denoise.highSppIndependence` rollout can stay reviewable and
rollbackable. The renderer also stores compact
emissive-triangle metadata in the existing BVH buffer tail and uses it to guide
diffuse continuation rays toward finite mesh light geometry. This is not a
separate shadow/direct-light pass: the active ray still has to hit emissive
geometry or miss into the environment before radiance is committed. Guided
emissive hits carry a bounded estimator weight so finite light guidance does not
over-expose low-sample renders before full material PDFs/MIS are implemented.
By default, `deferredPathResolve` records
per-bounce material responses in a tile-bounded path buffer and records the
terminal emissive/HDRI/environment source in the final path slot. The output
pass then resolves that recorded path backward and adds the weighted sample to
the pixel accumulation, so unresolved continuation light is still deferred until
a terminal source is known. Surface resolution may still add a small
shadow-tested direct-light term immediately when it has an explicit source and
visibility result, which keeps true occlusion shadows possible without falling
back to broad per-bounce ambient fill. Set `deferredPathResolve: false` only
for legacy forward-accumulation comparison.
When an `environmentMap` is provided, the wavefront trace shader samples it as
an equirectangular radiance source for environment misses and uses the same
mapped radiance for terminal residuals before falling back to static ambient.
The procedural horizon/zenith/sun model remains the fallback for callers that
have not supplied an HDRI/radiance texture. `environmentLighting.sunlitBaseline`
adds a time-of-day daylight floor to terminal and direct environment estimates,
so bright presets retain colour at the last collision without returning to a
whitewashed global ambient term. Extremely dark recorded bounce responses are
also remapped to a small scene-brightness-driven luminance floor so bright
low-sample scenes do not produce isolated black speckles when a valid terminal
source was already found. Awaited `renderFrame({ readStats: true })` results now
keep linear accumulation unclamped, sanitize only invalid or half-float-
overflow samples before presentation, and expose
`terminalRadiance.totalLuminance`,
`terminalRadiance.ambientResidualLuminance`, and
`terminalRadiance.ambientResidualShare` so validation harnesses can track how
much of the final resolved image came from terminal ambient residuals.
The same stats also expose `radianceDiagnostics.invalidSamples` and
`radianceDiagnostics.legacyClampEquivalentSamples`, so hardening scenes can
measure NaN/Inf cleanup and legacy-4.0-equivalent fireflies without
re-introducing a hidden estimator clamp.
When `strictPhysicalLowSppLighting` is enabled, termination stats also separate
`absorptionNull`, `russianRoulette`, and `strictMaxDepth` so validation can
distinguish physically explainable dark samples from legacy ambient fallback.
For static mesh scenes, the GPU acceleration build is submitted once and then
reused by subsequent frames. Per-frame tracing writes one dynamic uniform slot
per tile/sample or post-process pass and batches tile tracing, tile output,
optional denoise, and presentation into bounded command submissions controlled
by `maxFramePassesPerSubmission` to keep 4K/high-spp command buffers from
becoming oversized. `updateCamera(...)` can update the per-frame camera uniforms
without rebuilding scene buffers. `renderFrame(...)` also accepts an optional
`frameTimeBudgetMs` plus `minimumSamplesPerPixel`: when present, configured
`samplesPerPixel` becomes a ceiling instead of a hard requirement, the renderer
guarantees at least the minimum full-screen pass, and frame stats report both
configured `samplesPerPixel` and actual `renderedSamplesPerPixel` so realtime
callers can budget motion frames without overstating delivered quality.
Before requesting a WebGPU device, the renderer derives the largest scene
storage binding from the normalized scene, mesh, and BVH records. It requests
the smallest sufficient `maxStorageBufferBindingSize` (and `maxBufferSize` only
when the WebGPU default is also exceeded), preserves stricter caller limits,
and rejects unsupported adapters before device creation. Default-sized scenes
do not elevate either size limit. `config.memory` and snapshot memory telemetry
describe the actual persistent GPU buffer descriptors: placeholder records,
combined BVH/emissive storage, mesh source buffers, aligned frame/build uniform
buffers, counters, and dispatch arguments are each counted exactly once;
`materialTableBytes` is zero because material data is packed into mesh and
triangle records rather than a standalone GPU buffer.
For consumers that want to hand wavefront SPP adaptation to
`@plasius/gpu-performance`, `createWavefrontAdaptiveSamplingLevels(...)` exposes
a bounded low-to-high ladder of per-frame `samplesPerPixel`,
`frameTimeBudgetMs`, and `minimumSamplesPerPixel` configs that stay aligned
with the renderer's supported adaptive-sampling surface. Frame stats and
snapshots expose
`gpuParallelism` diagnostics with adapter compute limits, configured workgroup
size, direct compute dispatches, known workgroups/invocations, indirect dispatch
counts, and upper-bound indirect work estimates. WebGPU does not expose physical
GPU core counts, so `physicalCoreCount` remains `null`; use
`exposesMultiWorkgroupParallelism`, `largestDirectWorkgroupsPerDispatch`, and
`largestEstimatedIndirectWorkgroupsPerDispatch` to confirm the renderer is
issuing multi-workgroup GPU work. Awaited frame results also expose a
`transportGuardrails` summary with jobs/frame, jobs/s, jobs/submission, command
submissions, queue-overflow count, radiance diagnostics, total tracked memory
bytes, and device-loss status so validation harnesses can gate transport work
without scraping ad hoc metrics from multiple fields. Treat any sustained >10%
drop in jobs/submission or jobs/s versus the approved baseline as a
release-validation failure unless a linked ticket explicitly approves the
regression; `submission-batching` warns when the renderer falls back to roughly
one GPU job per submission despite a higher pass ceiling.

Awaited fixed-SPP renders can opt into exact ray and timing evidence:

```js
/** @param {import("@plasius/gpu-renderer").WavefrontPathTracingComputeRenderer} renderer */
export async function inspectFrame(renderer) {
  const frame = await renderer.renderFrame({
    readStats: true,
    readOutputProbe: false,
  });

  console.log({
    primaryRays: frame.primaryRays,
    secondaryRays: frame.secondaryRays,
    totalPathSegments: frame.totalPathSegments,
    bounceHistogram: frame.rayCounts.bounceHistogram,
    gpuTimeMs: frame.timings.totalGpuTimeMs,
    renderJobTimeMs: frame.timings.totalRenderJobTimeMs,
    timingSource: frame.timings.source,
  });
  return frame;
}
```

`primaryRays` is the exact number of camera samples. `secondaryRays` is the
sum of active continuation records intersected after bounce zero, including
bounded reflection/transmission branches, and `totalPathSegments` is their sum.
The renderer copies the existing active-queue counter once per bounce into a
lazily allocated telemetry buffer; it does not add diagnostic shader atomics or
change WGSL transport. `rayCounts.status` distinguishes available,
unavailable, failed, and not-requested evidence. A mismatch between scheduled
and observed primary rays fails the `ray-count-telemetry` transport guardrail.
Ray-count reduction uses constant call-stack space, including the supported
4K/eight-bounce/128-SPP stress envelope where hundreds of thousands of
tile/sample/depth records collapse into a small per-bounce histogram.

When the adapter exposes `timestamp-query`, the device requests it
opportunistically and two timestamps measure the GPU span from the first
primary pass through presentation. Set `gpuTimestamps: false` at renderer
creation to prevent that optional feature request. Where timestamp queries are
not exposed or fail, `timings` reports `source: "queue-completion"`, leaves
`totalGpuTimeMs` null, and retains the awaited
`totalRenderJobTimeMs`. Classification, compaction, and sampling sub-pass times
remain null until the corresponding adaptive passes exist. Without
`readStats: true`, and for `renderOnce()`, the fixed dispatcher creates no
telemetry buffers, query sets, readbacks, or timestamped pass descriptors.

After each
primary-ray or compaction pass, the GPU writes the active-ray workgroup count
into the counter buffer and the encoder copies it into an indirect-dispatch
argument buffer. Intersection and surface-resolution passes therefore scale
with active continuation rays instead of the maximum tile capacity, while still
avoiding CPU readback between bounces. WebGPU
still preserves ordering between dependent bounce passes, but the renderer
keeps CPU queue submissions bounded rather than forcing one submission per
tile/sample. Awaited higher-SPP submission slicing remains tile-major because
the accumulation buffer is tile-local; changing that order to sample-major
would mix samples across tiles and corrupt the resolved image.
Environment-light portals can additionally guide and gate sky/HDRI contribution
through rectangular openings such as windows. `environmentPortalMode: "guide"`
biases diffuse continuation rays toward configured openings, while
`"guide-and-gate"` requires an environment miss to pass through a portal before
it receives sky radiance; misses outside a portal fall back to the ambient
residual. This keeps interior rooms from treating the whole sky as visible from
every bounce.
Dynamic TLAS updates, higher-grade LBVH/SAH construction,
runtime execution behind the `@plasius/gpu-worker` lock-free queue, and broader
material lookup remain follow-up work.

## Progressive still-frame refinement

Create the wavefront renderer with `progressive: true` to retain linear radiance across frames. `samplesPerPixel` at creation is the maximum batch capacity; pass a smaller value to `renderOnce({ samplesPerPixel })` or `renderFrame({ samplesPerPixel })`. Submit batches serially. `renderFrame()` awaits completion by default; with `renderOnce()`, await `renderer.device.queue.onSubmittedWorkDone()` before reporting completed samples. `getSnapshot().accumulatedSamplesPerPixel` reports submitted history samples.

Camera or scene updates reset history automatically; `resetAccumulation()` also discards it without reallocating. Do not call `updateCamera()` between refinement passes unless the view changed. Progressive mode uses independent frame seeds, overriding static-frame stable sample routing. Denoising is applied after accumulation. Leave `progressive` unset for the existing independent-frame path. See [ADR 0038](../adrs/adr-0038-progressive-linear-radiance.md) for memory costs and host rollout responsibilities.

Camera-only wavefront updates preserve the loaded mesh, material, acceleration
and lighting resources while resetting progressive accumulation. Changing the
view no longer rebuilds those CPU scene tables; scene updates retain their
existing reconstruction path.

## Adaptive per-pixel implementation status

Per-pixel adaptive rendering is not yet exposed by the public renderer API.
The internal [metadata foundation](../design/adaptive-metadata.md) now provides
reflected requested/completed count storage and lazy, bounded allocation.
`@plasius/gpu-shader` validates the final initialization WGSL in development;
the reflector does not enter browser bundles. The normal `npm test` suite checks
generated byte constants, count packing, allocation admission and cleanup.

The fixed renderer and its whole-frame budget adjustment are unchanged. Actual
completed-count normalization, compact primary scheduling, foveation and shared
integration must land before a site comparison can claim per-pixel adaptation.
No image-quality, performance or net-memory-saving claim follows from the
metadata-only WebGPU execution fixture. See [ADR 0029](../adrs/adr-0029-reflected-adaptive-metadata-admission.md).
