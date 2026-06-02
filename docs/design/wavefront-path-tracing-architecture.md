# Wavefront Path Tracing Architecture

## Status

Proposed design for the `gpu-*` rendering family. This document records the
current state discovered across the relevant packages and defines the
recommended pass-based path tracing architecture. It does not implement the
runtime rewrite.

## Current State

### `@plasius/gpu-renderer`

`@plasius/gpu-renderer` owns the WebGPU canvas lifecycle, frame hooks, XR binding,
worker-facing frame-stage manifests, and ray-tracing-first render-plan metadata.
The package currently exposes:

- `createGpuRenderer(...)` for device, context, frame lifecycle, resize, start,
  stop, and presentation.
- `onEncodeFrame(...)` so applications can own command encoding for custom
  multi-pass pipelines.
- `getRendererWorkerManifest(...)` for `realtime` and `xr` stage DAG metadata.
- `createRayTracingRenderPlan(...)`, which publishes stable snapshot boundaries,
  representation bands, RT stage ordering, and acceleration-structure update
  classes.

The renderer does not yet expose reusable scene, mesh, material, texture, light,
ray-buffer, hit-buffer, or acceleration-structure submission APIs. The
ray-tracing render plan is architectural metadata, not an executable pass graph.

### `@plasius/gpu-lighting`

`@plasius/gpu-lighting` contains the only substantial GPU path tracing code found
in the current packages. The path tracer is a WebGPU compute path with WGSL
modules for path tracing, accumulation, and denoising.

Current capabilities:

- Perspective primary camera rays are generated per pixel with jitter and
  aperture support.
- Ground plane, sphere, and triangle intersections are evaluated in WGSL.
- Triangle hits use barycentric coordinates and interpolate authored vertex
  normals when available, with a face-normal fallback.
- Materials include albedo, roughness, emission, metalness, transmittance, and
  IOR fields.
- Direct sun lighting, opaque shadow rays, environment contribution,
  progressive accumulation, and a small spatial/temporal denoise pass exist.

Important limitations:

- The path tracer processes all bounces for one pixel inside one compute
  invocation. It is iterative, but it is depth-first per pixel rather than a
  breadth-first wavefront queue.
- There is no first-class hit-buffer pass that resolves all collisions before
  material evaluation.
- Triangle intersection is brute-force over the triangle array. There is no BVH,
  TLAS/BLAS, spatial index, or ray queue compaction.
- Hit records do not carry entity id, primitive id, UVs, tangent/bitangent,
  geometric normal and shading normal separately, front-face state, material
  flags, medium/fluid state, or miss/environment metadata beyond a generic miss.
- Texture sampling, UV mapping, normal maps, alpha modes, transparent shadows,
  refraction, volume/medium tracking, fluid materials, and light geometry are not
  implemented in the path tracer despite some material fields reserving space for
  them.
- Hybrid WGSL jobs are mostly placeholders except for a limited reflection
  resolve path that traces a small ground/sphere scene.

### `@plasius/gpu-camera`

`@plasius/gpu-camera` manages camera state, fast switching, perspective and
orthographic projection matrices, view matrices, camera uniforms, and multiview
render plans. It has enough information to generate rays, but it does not yet
publish a ray-camera uniform contract with inverse matrices, jitter metadata, or
camera basis fields intended for path tracing.

### `@plasius/gpu-shared`

`@plasius/gpu-shared` owns the shared browser demo runtime and asset helpers. The
showcase currently centralizes scene drawing because `gpu-renderer` does not yet
provide a reusable scene/mesh submission surface.

The shared runtime performs CPU canvas rendering with a hit-driven triangle patch
path for the showcase. It can interpolate authored vertex normals for sub-triangle
patch shading, uses `@plasius/gpu-fluid` water normals, and layers heuristic
reflection/shadow effects. This is not the long-term GPU renderer and should not
be treated as the path tracing architecture.

The GLTF loader extracts positions, indices, normals, colors, and simple PBR
factor values. It does not currently extract UVs, textures, normal maps, tangents,
alpha modes, transmission, or full material extension data needed by a path
tracer.

### `@plasius/gpu-fluid`

`@plasius/gpu-fluid` publishes banded representation plans for near, mid, far,
and horizon fluid surfaces. Bands already declare RT participation, shadow mode,
shading hints, update cadence, and performance metadata. The package also
provides sampled water height, wake, impulse, finite-difference normal, tangent
frame, and renderer-ready large-area water-surface mesh helpers.

It does not yet provide a GPU path tracing material adapter, medium descriptor,
or analytic water-surface intersector. Fluid surfaces are currently best consumed
as renderable mesh geometry with fluid material metadata.

### `@plasius/gpu-cloth`

`@plasius/gpu-cloth` publishes banded representation plans for cloth with RT
participation, shadow modes, deformation quality, simulation resolution, and
performance metadata. It does not yet provide renderer-facing vertex/index/normal
buffer submission or acceleration-structure update adapters.

### `@plasius/gpu-world-generator`

`@plasius/gpu-world-generator` publishes near, mid, far, and horizon render
representation descriptors. It distinguishes live geometry, simplified geometry,
RT proxy, merged proxy, and horizon shell outputs, including RT participation and
shadow relevance.

Generated mesh helpers currently pack position, normal, color, sway, material,
and optional geomorph values into CPU arrays. There is no shared GPU scene
submission or acceleration-structure input contract yet.

### `@plasius/gpu-worker`

`@plasius/gpu-worker` provides WGSL job assembly, flat/DAG queue scheduling
metadata, scene-preparation manifest helpers, and worker-loop telemetry hooks.
It can host staged renderer jobs, but it does not own ray or hit data layouts.

### `@plasius/gpu-performance`

`@plasius/gpu-performance` already defines multi-dimensional quality and
representation-band budget metadata for ray-tracing-first rendering. The existing
contract can express geometry, shading, ray tracing, shadow, lighting sample,
update cadence, and temporal reuse decisions. It needs concrete renderer
dimensions for max bounces, samples per pixel, optional explicit light samples,
ray queue budgets, BVH update cadence, denoise level, and render scale.

### `@plasius/gpu-physics`

`@plasius/gpu-physics` publishes planning metadata and stable world snapshot
contracts. The current renderer should consume the stable visual snapshot and
scene-preparation outputs rather than in-flight physics state. No reusable
renderer ray-intersection API was found in physics.

### `@plasius/gpu-interaction`

`@plasius/gpu-interaction` resolves actions by screen point, UV, phrase, script,
and action id. It can consume future pixel-to-entity hit results for selection,
but it does not participate in rendering intersections today.

## Current Limitations And Debt

- The executable GPU path tracer is not wavefront. It resolves intersection,
  material evaluation, lighting, scattering, and continuation inside one pixel
  invocation.
- There is no shared scene submission API for renderable entities, instances,
  meshes, materials, textures, lights, skyboxes, fluids, cloth, or world chunks.
- There is no stable public ray, hit, surface, material, light, medium, or
  accumulation buffer contract.
- There is no acceleration structure contract or implementation. Current
  triangle tracing is brute-force and will not scale.
- The existing hit structure is too small for correct material evaluation,
  transparent/refractive behavior, selection, debugging, or interaction.
- True smooth normals are partially implemented in `gpu-lighting` and the shared
  showcase, but the design does not yet separate geometric normals from shading
  normals or handle tangent-space normal maps.
- Existing material data omits the texture, UV, alpha, transmission, normal-map,
  tangent, and extension data needed by realistic path tracing.
- Direct lighting is hard-coded around an analytic sun. General directional,
  point, spot, area, emissive-triangle, and environment lights are not modeled as
  a common light table.
- Shadow rays are opaque. Transparent, refractive, and fluid shadow behavior is
  not implemented.
- Fluid and cloth packages publish good representation metadata but do not yet
  provide renderer-owned GPU buffer adapters.
- The shared showcase contains useful visual heuristics and normal interpolation,
  but it is a CPU canvas demo path and should not become the production renderer.
- `ADR 0005` records a ray-tracing-first hybrid render graph, but it explicitly
  stops at orchestration direction and does not specify the pass-level path
  tracing algorithm.

## Design Goals

- Generate primary rays from screen pixels or texels using active camera state.
- Process rays breadth-first by bounce depth. All active path rays for bounce
  `N` must finish intersection, surface evaluation, emitted/environment
  contribution, and continuation decisions before bounce `N + 1`.
- Avoid shader recursion and avoid CPU readback between passes.
- Preserve true hit data: source pixel, ray id, hit primitive, barycentrics, UVs,
  geometric normal, interpolated normal, tangent frame, material, front/back
  state, medium state, and miss/environment state.
- Keep geometric normals and shading normals distinct.
- Support flat normals, smooth vertex normal interpolation, normal maps, and
  tangent-space transforms.
- Support light transport through active path rays hitting emissive geometry,
  light geometry, fluids, transparent/refractive surfaces, and the
  skybox/environment.
- Treat explicit light sampling and visibility probes as optional
  variance-reduction work, not as a required separate shadow-ray lighting path.
- Keep the hot ray path compact and split heavier material/texture data into
  lookup tables.
- Preserve package boundaries: renderer orchestrates passes, lighting owns
  material/light evaluation, camera owns camera-to-ray data, scene producers own
  representation output, performance owns budget policy.

## Recommended Architecture

Adopt a staged wavefront path tracer implemented as renderer-owned pass
orchestration with lighting-owned WGSL evaluation modules.

The production path tracing mode should be compute-driven and pass-based:

1. Scene preparation consumes a stable visual snapshot and produces GPU buffers
   for instances, geometry, materials, lights, textures, media, and acceleration
   structures.
2. Primary ray generation writes one or more `RayRecord` entries per screen
   pixel/texel into an active ray queue.
3. Intersection processes the active queue and writes one `HitRecord` per active
   ray.
4. Surface resolution fetches primitive, vertex, material, and texture data and
   writes `SurfaceRecord` entries.
5. Shading accumulates emission or environment contribution when active rays hit
   light sources or miss into the skybox/environment.
6. Surface/material evaluation samples the next BSDF/BTDF event and writes
   reflection, refraction, transparency, fluid, or indirect continuation rays to
   the next active queue.
7. Optional explicit light sampling may schedule visibility probes for
   variance-reduced direct lighting, but the correctness baseline must work
   without those probes.
8. Active queues are compacted and swapped.
9. The loop repeats until max depth, queue exhaustion, or budget termination.
10. Final accumulation, denoise, tone mapping, gamma correction, and presentation
    resolve the output texture.

Raster/deferred visibility remains a supported optimization and fallback, but it
is not the canonical path tracing algorithm. A G-buffer can seed primary hits for
opaque raster-friendly surfaces in a hybrid mode, while the full wavefront mode
uses screen-generated primary rays and the same surface/shading pipeline as all
secondary rays.

## Data Model

All runtime buffers should use stable 16-byte-aligned layouts. The exact WGSL
packing can evolve, but the semantic records should remain stable.

### Ray Queue

`RayQueueHeader`

- `activeCount`
- `capacity`
- `bounce`
- `frameIndex`
- `overflowCount`
- `rngBase`

`RayRecord`

- `rayId`
- `parentRayId`
- `sourcePixelId`
- `sampleId`
- `bounce`
- `rayKind`: primary, reflection, refraction, transparency, indirect, fluid,
  debug-pick, optional-visibility-probe
- `origin`
- `direction`
- `tMin`
- `tMax`
- `throughput`
- `pdf`
- `etaScale`
- `mediumId`
- `flags`: specular chain, inside medium, terminate-on-first-hit for optional
  probes, selection/debug
- `rngState`

Hot intersection passes should only read origin, direction, range, kind, ids, and
flags. Throughput, pdf, and medium state can be stored in a sidecar payload when
profiling shows bandwidth pressure.

### Hit Record

`HitRecord`

- `rayId`
- `sourcePixelId`
- `rayKind`
- `hitType`: miss, surface, light, environment, volume boundary, fluid surface
- `distance`
- `position`
- `entityId`
- `instanceId`
- `primitiveId`
- `primitiveKind`: triangle, analytic sphere, heightfield, procedural,
  emissive-light, skybox
- `materialId`
- `barycentricOrLocal`
- `uv`
- `geometryNormal`
- `interpolatedNormal`
- `frontFace`
- `mediumIn`
- `mediumOut`
- `environmentId`
- `flags`: alpha-tested, double-sided, back-face-valid, motion-vector-valid

The hit buffer may avoid duplicating ray origin/direction in production because
the `RayRecord` is keyed by `rayId`; debug and capture builds may enable an
expanded hit record that copies origin/direction for inspection.

### Geometry And Instance Records

`InstanceRecord`

- `entityId`
- `meshId`
- `materialTableOffset`
- `transform`
- `inverseTransform`
- `normalTransform`
- `bounds`
- `accelerationStructureRef`
- `representationBand`
- `rtParticipation`
- `visibilityMask`
- `updateClass`: static, rigid-dynamic, deforming, proxy

`TriangleRecord`

- vertex indices or direct packed positions for compact BLAS leaves
- material slot
- flags: flat-shaded, smooth-shaded, double-sided, alpha-tested, emissive,
  water/fluid, cloth, proxy

`VertexRecord`

- position
- normal
- tangent
- bitangent sign
- uv0
- uv1 when needed
- color
- material weights or morph/deformation payload reference when needed

### Surface Record

`SurfaceRecord`

- `rayId`
- `sourcePixelId`
- `hitType`
- `position`
- `viewDirection`
- `geometryNormal`
- `shadingNormal`
- `tangent`
- `bitangent`
- `uv`
- `baseColor`
- `opacity`
- `emission`
- `roughness`
- `metallic`
- `sheen`
- `transmission`
- `ior`
- `clearcoat`
- `normalValidity`
- `materialType`
- `mediumIn`
- `mediumOut`

Surface evaluation must clamp or repair invalid shading normals. If a normal map
or interpolated normal points below the geometric hemisphere, the renderer should
face-forward or reproject it to avoid incorrect reflections and light leaks while
preserving the geometric normal for ray offsets and front/back decisions.

### Material, Texture, Light, And Medium Records

`MaterialRecord`

- base color factor and texture id
- normal map id and normal scale
- roughness/metallic factors and texture ids
- opacity/alpha mode and cutoff
- emission factor and texture id
- transmission/transparency factor and texture id
- IOR, absorption, sheen, clearcoat, and material model flags

`LightRecord`

- type: directional, point, spot, area rectangle, emissive triangle alias,
  environment
- position/direction
- color/intensity
- range/cone
- area basis or primitive reference
- optional visibility-probe flags
- sampling weight

Light records are sampling aids. Actual scene lights should also be represented
as emissive materials or environment entries so an active path ray can gather
light by hitting the source. If explicit light sampling is disabled, pixels whose
paths do not hit an emissive source or the environment should remain dark apart
from accumulated indirect throughput.

`MediumRecord`

- IOR
- absorption/scattering coefficients
- density
- phase function id
- fluid body id when applicable

### Accumulation Records

`PixelAccumulationRecord`

- accumulated radiance
- accumulated alpha
- sample count
- moments/variance
- albedo
- normal
- depth
- motion vector
- reset epoch

The accumulator should store linear HDR radiance. Tone mapping and gamma
correction happen only in the final resolve.

## GPU Pass Pipeline

### Frame Setup

CPU responsibilities:

- select quality budget from `@plasius/gpu-performance`
- allocate or resize frame buffers and ray queues
- bind camera, scene, material, texture, light, and environment resources
- choose max depth, samples per pixel, optional explicit light samples, denoise
  mode, and render scale

GPU responsibilities:

- clear queue headers and per-frame counters
- reset accumulation when camera, scene, material, or render-target epoch changes
- refit/update acceleration structures that are marked dynamic and due this frame

### Scene Preparation

Scene preparation consumes stable visual snapshots and package representation
plans. It should:

- select near, mid, far, and horizon representations
- upload or reference mesh/vertex/index/material buffers
- build or refit BLAS buffers per mesh/proxy
- build or update a TLAS over renderable instances
- upload light, skybox, and medium tables
- produce a `SceneTraceDescriptor` consumed by all path tracing passes

Static geometry can use CPU-built BVH data in early phases. Deforming fluid and
cloth should move to GPU refit or rebuild paths once the buffer contract is
stable.

### Primary Ray Generation

Input:

- `RayCameraUniform` from `@plasius/gpu-camera`
- viewport and render scale
- frame/sample index
- jitter sequence

Output:

- active ray queue
- initial pixel sample metadata

Requirements:

- Perspective and orthographic cameras must be supported.
- Jitter is optional but should use deterministic blue-noise, Sobol, or
  stratified sequences when temporal accumulation is enabled.
- Primary rays must carry `sourcePixelId`, `sampleId`, and `rayId`.
- Debug-pick rays should use the same generator path with a one-pixel worklist.

### Intersection

Input:

- active ray queue
- scene trace descriptor
- TLAS/BLAS or provisional primitive arrays

Output:

- one hit record per active ray

Rules:

- Select the nearest valid hit within `[tMin, tMax]`.
- Use geometric normals for sidedness, ray offsets, and back-face detection.
- Preserve barycentric coordinates for triangle hits.
- Preserve miss/environment information in a hit record rather than skipping the
  ray.
- Active path rays use nearest-hit traversal. Optional visibility probes may use
  any-hit traversal because they are an estimator optimization, not the canonical
  light transport path.

### Surface Resolution

Input:

- active ray queue
- hit buffer
- geometry buffers
- material and texture tables

Output:

- surface buffer
- light-hit contribution records
- optional explicit light-sampling requests

Rules:

- Flat-shaded primitives use the geometric normal.
- Smooth primitives interpolate vertex normals from barycentric coordinates.
- Normal maps are sampled in material evaluation and transformed through the
  tangent frame.
- Tangent frame validity must be explicit. Missing tangents fall back to a stable
  generated frame and mark the surface for lower-confidence normal-map shading.
- Surface records carry both geometric and shading normals.
- Miss records produce environment/skybox surface records.

### Light Hits And Optional Explicit Light Sampling

Input:

- surface buffer
- light table
- environment table

Output:

- emitted-light and environment contribution records
- optional visibility-probe queue
- optional visibility/transmittance buffer

Rules:

- Emissive surface hits and environment misses are the canonical way active path
  rays gather light.
- If a path never reaches an emissive surface or environment contribution within
  the configured bounce and throughput limits, the pixel contribution for that
  sample is expected to be dark.
- Area lights and emissive geometry should be present as scene geometry or
  environment entries. The light table may additionally index them for optional
  explicit sampling.
- Optional next-event estimation may choose a light sample and trace a
  visibility probe, but it must be controlled by a quality flag and must not be
  required for correctness.
- Optional visibility probes use the same `RayRecord` base layout with
  `rayKind: optional-visibility-probe`; they can use any-hit traversal and may
  terminate at the first opaque occluder.
- Transparent visibility probes accumulate transmittance through
  alpha/transmission surfaces until opacity reaches a cutoff or the sampled light
  is reached.
- Fluid visibility probes should start with transparent attenuation and later add
  caustic support as a separate feature.
- When optional explicit light sampling is enabled, use
  multiple-importance-sampling weights or a mutually exclusive mode flag so light
  contributions from active path hits are not double-counted.

### Shading And Continuation

Input:

- ray queue
- hit buffer
- surface buffer
- optional visibility/transmittance buffer
- material/light/medium tables

Output:

- accumulation updates
- next ray queue

Rules:

- Add emission and environment contribution from active path hits to the pixel
  accumulator using the ray throughput.
- Add optional explicit-light contribution only when the visibility-probe result
  is valid and weighted to avoid double-counting emissive hits.
- Sample a BSDF or BTDF event for indirect continuation.
- Reflection, refraction, transparency, and indirect diffuse rays are queued for
  bounce `N + 1`.
- Optional visibility probes are auxiliary estimator rays for the current bounce
  and do not increment the path depth.
- Use Russian roulette only after a configured minimum depth.
- Preserve a medium stack or compact medium state for refraction and fluid
  interaction.
- Record termination reason for debugging and tests: max depth, miss, absorption,
  roulette, queue overflow, invalid material, or contribution below threshold.

### Queue Compaction And Bounce Loop

After shading:

- compact next rays into a dense queue
- record overflow counts
- swap active and next queues
- stop when active count is zero or max depth is reached

The initial target max depth should be configurable from 3 to 8. The performance
governor should scale max depth, samples per pixel, optional explicit light
samples, reflection roughness cutoff, and representation-band RT participation
independently.

### Final Resolve

Final resolve should:

- combine current sample radiance with temporal accumulation
- preserve HDR linear color until tone map
- denoise using normal, depth, albedo, motion, variance, and sample count
- tone map
- apply gamma correction or output transfer function
- compose UI or XR layers outside the path tracing accumulator

## Architecture Options

### Option 1: Full Wavefront Path Tracer

Rays live in GPU buffers and are processed pass-by-pass by bounce depth.

- Correctness: highest. It naturally supports primary rays, secondary rays,
  transparent/refraction events, emissive/environment hits, and explicit
  hit/surface records.
- GPU suitability: high. It avoids recursion and maps to compute dispatches,
  queues, compaction, and BVH traversal.
- Performance: good once acceleration structures and queue compaction exist;
  poor if implemented as brute-force intersections.
- Memory usage: highest because ray, hit, surface, optional visibility, and
  accumulation buffers coexist.
- Complexity: high.
- Package/API impact: high. Requires scene submission, ray/hit records, material
  tables, light tables, and acceleration contracts.
- Testability: high because each pass has deterministic inputs/outputs.
- Compatibility: best long-term fit with renderer ADRs, worker manifests,
  performance budget metadata, and banded fluid/cloth/world representation
  plans.

### Option 2: Hybrid Raster Plus Ray

Raster/deferred passes create a G-buffer, then ray passes handle shadows,
reflections, transparency, and indirect effects.

- Correctness: medium. Opaque primary visibility is efficient, but transparent
  primary surfaces, camera-inside-medium cases, and exact screen-ray behavior are
  harder.
- GPU suitability: high for real-time production.
- Performance: best near-term performance because raster primary visibility is
  cheap.
- Memory usage: medium due to G-buffer plus secondary ray buffers.
- Complexity: medium to high because raster and ray material paths must stay in
  sync.
- Package/API impact: medium. It can reuse renderer's existing hybrid plan, but
  still needs material and secondary-ray contracts.
- Testability: medium because correctness spans raster and ray outputs.
- Compatibility: strong with `ADR 0005`, but incomplete for the requested
  screen-driven path tracing model.

### Option 3: Single Compute Ray Marcher/Intersector

A compute shader manages ray generation, intersection, shading, accumulation,
and continuation in one monolithic pass or a small set of compute jobs.

- Correctness: low to medium. It can work for simple analytic scenes but becomes
  difficult for mesh geometry, textures, true materials, transparent shadows, and
  fluids.
- GPU suitability: medium. It avoids recursion but tends toward branch-heavy,
  untestable kernels.
- Performance: acceptable for small demos, poor for large scenes without a real
  acceleration structure.
- Memory usage: low to medium.
- Complexity: initially low, eventually high due to shader sprawl.
- Package/API impact: low initially, negative long-term because it hides reusable
  functionality inside one shader.
- Testability: poor compared with staged passes.
- Compatibility: closest to the current `gpu-lighting` path tracer style, but it
  does not satisfy the pass-based architecture objective.

### Option 4: Package-Level Staged Renderer

Ray generation, intersection, surface evaluation, lighting, continuation, and
accumulation are separate package-level APIs and shader modules.

- Correctness: high if paired with a real wavefront algorithm.
- GPU suitability: high because it encourages explicit buffers and pass
  boundaries.
- Performance: good when hot data layouts are stable; overhead is manageable if
  package boundaries are compile-time/API boundaries rather than CPU round trips.
- Memory usage: same as Option 1.
- Complexity: high, with risk of over-fragmentation if packages are created too
  early.
- Package/API impact: high but clean.
- Testability: highest because each package contract can have CPU reference and
  GPU fixtures.
- Compatibility: strong with the existing `gpu-*` family structure.

## Recommendation

Implement Option 1 as a staged package-level renderer in the spirit of Option 4.

The recommended path is not a monolithic rewrite. Start by defining stable
renderer-owned contracts and refactoring the existing `gpu-lighting` path tracer
into equivalent wavefront passes behind the current experimental/reference mode.
Keep the hybrid raster path as a budget/fallback mode, but make the full
wavefront path tracer the correctness reference for screen-driven ray rendering.

Do not create multiple new packages immediately. Add the first contracts in
`@plasius/gpu-renderer` and WGSL material/light jobs in `@plasius/gpu-lighting`.
Create `@plasius/gpu-ray` only when the ray/hit/intersection data model is used
by at least renderer, lighting, interaction/debug, and test/reference tooling.
Create a separate acceleration package only if BVH build/refit becomes reusable
outside renderer-owned path tracing.

## Proposed Package Responsibilities

### `@plasius/gpu-renderer`

- Render graph and pass orchestration.
- Frame resource lifecycle and command encoding integration.
- Scene submission API for instances, meshes, materials, textures, lights,
  media, and environments.
- Ray queue, hit buffer, surface buffer, and accumulation buffer contracts.
- Acceleration-structure lifecycle contract and update-class scheduling.
- Public plan APIs that expose selected quality, pass sequence, max depth, and
  representation-band policy.

### `@plasius/gpu-lighting`

- WGSL modules for BSDF/BTDF evaluation, emissive/environment contribution,
  optional explicit light sampling, visibility transmittance,
  continuation-ray generation, accumulation, and denoise.
- CPU reference material and light evaluation used by tests.
- Migration of the existing per-pixel path tracer into wavefront jobs.

### `@plasius/gpu-camera`

- `RayCameraUniform` helpers for perspective and orthographic cameras.
- Inverse view/projection and/or basis-vector ray generation data.
- Deterministic camera jitter metadata for temporal accumulation.

### `@plasius/gpu-fluid`

- Fluid material descriptors: water IOR, absorption, roughness, foam,
  transmission, and caustic flags.
- Renderer adapter for generated water mesh positions, normals, UVs, and band
  metadata.
- Future optional analytic water heightfield intersector.

### `@plasius/gpu-cloth`

- Renderer adapter for cloth vertex/index/normal/tangent/deformation buffers.
- RT participation and BLAS update-class hints for full, selective, proxy, and
  disabled cloth bands.

### `@plasius/gpu-world-generator`

- Renderer adapter for live terrain meshes, simplified meshes, RT proxies,
  merged proxies, and horizon shells.
- Stable material/surface ids for generated terrain and foliage.

### `@plasius/gpu-shared`

- Remain a demo and asset helper package.
- Consume the renderer scene submission API once available.
- Extend or replace the demo GLTF loader with UV, texture, tangent, alpha, and
  material extension extraction through an appropriate public package API.

### `@plasius/gpu-worker`

- Continue owning DAG job assembly and scheduling metadata.
- Add renderer pass/queue manifest helpers only where they stay generic.

### `@plasius/gpu-performance`

- Add concrete ray tracing budget dimensions: max depth, samples per pixel,
  optional explicit light samples, ray queue capacity, BVH update cadence,
  reflection/refraction cutoffs, denoise level, temporal accumulation, and render
  scale.

### `@plasius/gpu-physics`

- Continue to own authoritative simulation and stable snapshot contracts.
- Do not couple rendering intersection to physics collision shapes except through
  explicit render-proxy adapters.

## Testing Strategy

### CPU Reference Tests

Add a deterministic CPU reference implementation for the contract before relying
on GPU output:

- primary ray generation for perspective and orthographic cameras
- jittered and unjittered pixel rays
- ray/triangle intersection
- nearest-hit selection
- barycentric coordinate calculation
- flat normal behavior
- smooth vertex-normal interpolation
- tangent-space normal-map transforms
- front-face/back-face handling
- reflection direction
- refraction direction and total internal reflection
- transparency and alpha cutoff
- material base color, emission, metallic, roughness, IOR, and transmission
- skybox/environment miss
- light geometry hit
- emissive-surface hit contribution
- optional opaque visibility probe
- optional transparent visibility-probe transmittance
- water/fluid material event using a deterministic mesh surface
- accumulation, throughput, attenuation, and max-bounce termination

### GPU Fixture Tests

Use small GPU fixtures with storage-buffer readback in tests only:

- one triangle, one pixel, known hit
- two overlapping triangles, nearest hit wins
- smooth normal triangle, expected interpolated normal within epsilon
- flat triangle, expected geometric normal
- normal-map fixture with known tangent frame
- mirror plane reflection
- glass slab refraction/transmission
- emissive triangle hit
- optional explicit light sampling
- optional visibility occluder and transparent occluder
- water mesh surface with fluid normal
- max depth and queue overflow behavior

### Golden Scene Tests

Add low-resolution deterministic scenes for visual regression:

- Cornell-box style diffuse scene
- mirror sphere scene
- glass sphere or slab scene
- emissive area light scene
- water plane with skybox scene
- cloth flag proxy scene

Compare linear HDR buffers or tone-mapped outputs with tolerant per-channel and
aggregate image thresholds. Keep randomness deterministic through seeded
sequences.

### Contract Tests

Contract tests should prove:

- public buffer layouts stay aligned and versioned
- renderer pass plans preserve pass ordering
- no CPU readback is required between runtime passes
- representation-band RT participation survives scene submission
- performance budgets can independently scale max depth, samples, optional
  explicit light probes, render scale, and BVH cadence
- package adapters produce stable entity, primitive, material, and representation
  ids

## Performance Considerations

- Use wavefront queues to avoid recursion and keep bounce scheduling explicit.
- Use separate hot and cold buffers. Intersection should not read full material
  records.
- Start with brute-force triangle fixtures only for tests and early bring-up;
  move production scenes to BVH before demo integration.
- Use TLAS/BLAS with update classes aligned to existing renderer metadata:
  static, rigid-dynamic, deforming, and proxy.
- Compact active ray queues between bounces with prefix-sum or append-buffer
  allocation.
- Keep optional visibility probes in a separate any-hit queue only when explicit
  light sampling is enabled.
- Use material sorting or coarse ray-kind grouping later if branch divergence
  becomes a measured issue.
- Support progressive rendering so low sample counts can converge over time.
- Scale max depth from 3 to 8 based on performance budget.
- Cap rough reflection/refraction continuation by contribution and roughness
  thresholds when performance pressure rises.
- Avoid CPU/GPU readback except for tests, profiling, and explicit debug capture.

## Implementation Plan

### Phase 1: Current-State Review

- Inspect current `gpu-*` rendering, lighting, camera, physics, fluid, cloth,
  world-generation, worker, performance, and shared showcase packages.
- Record current rendering flow and gaps.
- Align the new design with `ADR 0005`, `TDR 0003`, worker manifests, and
  representation-band contracts.

### Phase 2: Minimal Ray And Hit Data Model

- Add versioned ray, hit, surface, material, light, medium, and accumulation
  contract types to `gpu-renderer`.
- Add CPU reference ray generation and triangle intersection fixtures.
- Add layout tests and documentation.

### Phase 3: Primary Ray And Intersection Pipeline

- Add `RayCameraUniform` helpers to `gpu-camera`.
- Add primary-ray generation compute pass.
- Add brute-force triangle intersection compute pass for tiny deterministic
  scenes.
- Add hit-buffer output with barycentrics, geometric normal, interpolated normal,
  entity id, primitive id, material id, UV, and miss state.
- Verify true normal calculation before any material shading work.

### Phase 4: Surface Evaluation And Emissive Lighting

- Add material and texture lookup records.
- Resolve flat, smooth, and normal-mapped surface records.
- Accumulate emission when active path rays hit emissive surfaces.
- Accumulate skybox/environment contribution on misses.
- Add optional light table and deterministic explicit light sampling behind a
  quality flag.
- Add optional opaque and transparent visibility-probe passes.

### Phase 5: Secondary Rays

- Add continuation-ray generation for reflection, refraction, transparency, and
  indirect diffuse events.
- Process active queues by bounce depth and swap compacted queues.
- Add medium/fluid state for water and refractive surfaces.
- Add max-depth, throughput cutoff, and Russian-roulette termination.

### Phase 6: Performance And Scalability

- Add TLAS/BLAS buffers and build/refit paths.
- Add queue compaction and overflow handling.
- Add performance budget integration for max depth, samples, optional explicit
  light probes, queue capacity, BVH cadence, denoise, and render scale.
- Add progressive accumulation and denoise integration.
- Measure representative near/mid/far/horizon scenes.

### Phase 7: Package Hardening

- Finalize public APIs or extract `@plasius/gpu-ray` if multiple packages need
  direct ownership of the data model.
- Add package adapters for fluid, cloth, world generator, and shared assets.
- Add docs, ADRs, TDR updates, README guidance, changelog entries, and tickets.
- Add CI coverage for changed source files and GPU fixture fallbacks.

## ADR Recommendations

- Add a renderer ADR accepting wavefront path tracing as the pass-level
  implementation model for the ray-tracing-first renderer.
- Add follow-up ADRs only when choosing a stable acceleration-structure strategy,
  creating a new `@plasius/gpu-ray` package, or committing to a material model
  beyond the initial PBR subset.

## Proposed Tickets

Use the GitHub Project hierarchy before implementation. Suggested work items:

- `[FEATURE] GPU renderer wavefront path tracing pipeline`
- `[STORY] Define renderer ray, hit, surface, material, light, medium, and
  accumulation contracts`
- `[TASK] gpu-renderer: add versioned path tracing buffer layout contracts and
  tests`
- `[TASK] gpu-camera: add RayCameraUniform helpers for perspective and
  orthographic primary rays`
- `[TASK] gpu-lighting: split current per-pixel path tracer into wavefront WGSL
  pass modules`
- `[TASK] gpu-renderer: add primary ray generation and minimal triangle
  intersection passes`
- `[TASK] gpu-renderer: add hit-buffer and surface-resolution passes with flat,
  smooth, and normal-map normals`
- `[TASK] gpu-lighting: add emissive/environment hit contribution and optional
  explicit-light visibility transmittance`
- `[TASK] gpu-lighting: add reflection, refraction, transparency, medium state,
  and continuation-ray generation`
- `[TASK] gpu-renderer: add queue compaction, bounce-loop orchestration, and
  overflow telemetry`
- `[TASK] gpu-renderer: add TLAS/BLAS acceleration-structure contract and initial
  static mesh BVH`
- `[TASK] gpu-fluid: add path tracing material and water mesh adapter`
- `[TASK] gpu-cloth: add cloth render/RT mesh adapter and deformation update
  hints`
- `[TASK] gpu-world-generator: add terrain/proxy scene submission adapter`
- `[TASK] gpu-shared: update showcase asset loading for UVs, tangents, textures,
  alpha, and material extensions or consume a new public asset adapter`
- `[TASK] gpu-performance: add concrete path tracing budget dimensions`
- `[TASK] gpu-interaction: consume renderer pixel-hit/entity-id output for
  selection`
- `[TASK] gpu-renderer: add deterministic CPU reference tests and GPU fixture
  tests`

## Open Questions And Risks

- WebGPU has no portable hardware ray tracing path today, so BVH traversal cost
  must be measured carefully on target adapters.
- The package family needs a decision on whether ray/hit layouts remain in
  `gpu-renderer` or move to a new `@plasius/gpu-ray` package after initial use.
- Texture and material ingestion needs a stable owner. The current shared GLTF
  loader is insufficient for production path tracing.
- Optional explicit light sampling, transparent visibility probes, and refraction
  semantics need product-level acceptance criteria because physically correct
  behavior can be expensive.
- Fluid caustics and volumetric media should be phased after baseline water
  reflection/refraction and transparent visibility behavior.
- XR may need a lower-depth or hybrid mode because stereo doubles primary ray
  cost.
- Denoising quality will likely determine whether 3 to 8 bounces are usable in
  realtime on consumer hardware.
