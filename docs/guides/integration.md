# Runtime integration

## Canonical model ingestion

`createCanonicalWavefrontMeshInputs` adapts decoded primitive geometry and image
samples from the canonical model pipeline to the renderer's existing
`WavefrontMeshInput` shape. It maps canonical material factors and standard
texture bindings, preserves supported material extension data, and rejects
missing primitive, material, or decoded texture references. It accepts triangle
primitives; parsing, resource fetching, image decoding, and other topologies stay
in the upstream conversion layer. Metallic-roughness and unlit workflows are
supported; workflows without an existing Wavefront mapping fail explicitly.

Canonical `blend` computes `baseColorFactor.a × baseColorTexture.a` exactly once
(the missing texture contributes one). Canonical `opaque` uses alpha one even
when the factor or sampled texture is transparent. Authored RGB, transmission,
and IOR are independent of that alpha decision. Canonical `mask` still fails
explicitly.

For direct `WavefrontMeshInput`, optional `alphaMode: "opaque" | "blend"`
selects the same packing/shader interpretation. Opaque forces opacity and sampled
alpha to one. Blend defaults `opacity` to one; an explicit opacity remains an
additional multiplier. Omitted mode preserves the legacy behavior, including
defaulting opacity to factor alpha and multiplying opacity, factor alpha, and
texture alpha. Scene-object APIs are unchanged. Unsupported mesh modes fail
with a fixed diagnostic.

Both CPU-uploaded triangles and GPU-built meshes carry the interpretation in
the existing `textureSettings.w` slot (one for opaque, zero otherwise); record
sizes and atlas pixels remain unchanged. See [ADR0041](../adrs/adr-0041-canonical-alpha-semantics.md).

```js
import { createCanonicalWavefrontMeshInputs } from "@plasius/gpu-renderer";

/** @param {import("@plasius/gpu-renderer").CreateCanonicalWavefrontMeshInputsOptions} decoded */
export function createMeshes(decoded) {
    // Supply the canonical document, decoded primitive geometry and texture map.
    return createCanonicalWavefrontMeshInputs(decoded);
}
```

The canonical document uses types from `@plasius/gpu-model-core`. Geometry is
already renderer-ready, normals may be omitted to retain the renderer's existing
fallback, and texture samples are keyed by canonical texture ID. The consuming
surface remains responsible for evaluating the remote
`gpu.model.conversion.enabled` flag: when disabled or rolled back, keep the
existing rendering path active.

The public canonical types use released `@plasius/gpu-model-core` `^0.5.0`.
In addition to the existing core/clearcoat/transmission/sheen channels, the
adapter maps thickness, specular, specularColor, iridescence,
iridescenceThickness and anisotropy to their existing KHR renderer texture
inputs. Factors remain in their canonical extension records; decoded pixel
buffers are reused by reference. This does not add a new shading model.

The current canonical geometry contract supplies **UV0 only**. A binding or
decoded sample selecting another UV set fails explicitly before meshes are
returned. Nonidentity or malformed canonical binding transforms also fail;
identity offset `[0,0]`, scale `[1,1]` and rotation `0` (including omitted fields)
are accepted. The upstream converter must apply a supported transform and
reverify the corresponding identity binding, or keep that asset on its previous
supported consumer path. Do not remove a transform or change the UV selection
merely to avoid the failure. No converter or texture resampler is embedded here.

The old UV1 fixture used to preserve a marker while the geometry/shader sampled
UV0; its regression now requires rejection. The broader dual-UV room path is
tracked separately by renderer#220. Canonical unlit/alpha qualification remains
renderer#238/#237; metadata normalization does not prove GPU shading fidelity.
See [ADR 0040](../adrs/adr-0040-canonical-material-texture-admission.md) for the
owning-package and release sequence with bridge#28 and glTF#14.

## Adaptive Frame Hooks

`@plasius/gpu-renderer` now exposes frame lifecycle hooks so the app can pass
negotiated frame targets from `@plasius/gpu-performance` and opt into renderer
frame sampling for `@plasius/gpu-debug`.

```js
import { createGpuRenderer, createRendererDebugHooks } from "@plasius/gpu-renderer";

/**
 * @param {import("@plasius/gpu-renderer").RendererDebugHooksOptions["debugSession"]} debugSession
 * @param {{ getSnapshot(): { targetFrameTimeMs: number } }} governor
 */
export async function mountInstrumentedRenderer(debugSession, governor) {
  const rendererDebugHooks = createRendererDebugHooks({
    debugSession,
    getTargetFrameTimeMs: () => governor.getSnapshot().targetFrameTimeMs,
  });

  const renderer = await createGpuRenderer({
    canvas: "#scene",
    frameIdFactory: ({ frame, xrActive }) => `scene.${xrActive ? "xr" : "flat"}.${frame}`,
    ...rendererDebugHooks,
  });
  return renderer; // The host starts it and destroys it on teardown.
}
```

## Worker DAG Manifests

The renderer also publishes worker-facing frame-stage manifests so
`@plasius/gpu-performance` and `@plasius/gpu-worker` can reason about renderer
work as a multi-root DAG instead of a flat queue.

```js
import { getRendererWorkerManifest } from "@plasius/gpu-renderer";

const realtimeManifest = getRendererWorkerManifest();
const xrManifest = getRendererWorkerManifest("xr");

console.log(realtimeManifest.jobs.map((job) => job.worker.jobType));
console.log(xrManifest.jobs.find((job) => job.key === "lateLatch"));
```

- `realtime` publishes `acquire`, `visibility`, `mainEncode`, `postProcess`,
  and `submit`.
- `xr` publishes `acquire`, `visibility`, `lateLatch`, `mainEncode`, and
  `submit`.
- Jobs include queue class, priority, dependencies, adaptive budget levels, and
  debug metadata such as allocation tags.

## Ray-Tracing-First Planning

The renderer now publishes a stable-snapshot render plan for the premium
ray-tracing-first frame model.

```js
import { createRayTracingRenderPlan } from "@plasius/gpu-renderer";

const plan = createRayTracingRenderPlan({
  snapshotId: "visual-snapshot-42",
});

console.log(plan.inputBoundary);
console.log(plan.renderStages.map((stage) => stage.key));
console.log(plan.representationBands);
console.log(plan.wavefront.queueLayout.strategy);
```

## Authored Material Transport

Wavefront materials support authored `KHR_materials_*` factors and extension
textures, bounded nested media, Beer-Lambert attenuation, and reference
transport helpers for reflected/transmitted branching and spectral dispersion.
GPU rays carry up to four medium identifiers and enqueue one selected
continuation per hit. Dielectric lobes are weighted by their selection
probability; total internal reflection retains unit throughput. The standalone
CPU reference helper can describe both branches, but the fixed GPU path never
enqueues an untracked sibling into its tile-sized queue. Physically qualified
nested media, rough dielectric transport and full spectral rendering remain
separate work. See [the Amber correction](../amber-transport-correction.md).

```js
import {
  createMediumStack,
  createTransportBranches,
  createSpectralSamples,
} from "@plasius/gpu-renderer";

const stack = createMediumStack([1, 4]);
const branches = createTransportBranches({
  mediumStack: stack,
  mediumId: 7,
  transmission: 1,
  ior: 1.5,
});
const wavelengths = createSpectralSamples({ ior: 1.5, dispersion: 0.2 });
```

The plan makes the stable visual snapshot boundary explicit, publishes the
required RT-first stage ordering, and exposes representation-band plus
acceleration-structure update policy metadata for downstream lighting and
performance packages. It now also exposes the renderer-owned wavefront queue
model, versioned ray/hit/surface/material/medium/accumulation contracts, and
the termination policy for emissive/environment path completion.

## XR integration

```js
import { createXrManager } from "@plasius/gpu-xr";
import { createGpuRenderer } from "@plasius/gpu-renderer";

const renderer = await createGpuRenderer({ canvas: "#scene" });
const xr = createXrManager();

renderer.bindXrManager(xr, {
  onSessionStart: () => console.log("XR active"),
  onSessionEnd: () => console.log("XR inactive"),
});
```

## API

- `supportsWebGpu(options)`
- `createGpuRenderer(options)`
- `createRendererDebugHooks(options)`
- `getRendererWorkerProfile(name?)`
- `getRendererWorkerManifest(name?)`
- `createRayTracingRenderPlan(options)`
- `createWavefrontPathTracingComputeRenderer(options)`
- `createWavefrontPathTracingComputeConfig(options)`
- `createWavefrontPathTracingComputeShaderSource(options?)`
- `renderWavefrontPathTracingComputeFrame(options)`
- `createWavefrontReferenceRay(config, options?)`
- `intersectWavefrontReferenceTriangle(ray, triangle, options?)`
- `traceWavefrontReferenceTriangles(config, ray, triangles, options?)`
- `normalizeWavefrontMesh(input)`
- `createWavefrontGpuMeshSource(meshes)`
- `createWavefrontBvhSortStages(itemCount)`
- `createWavefrontBvhBuildLevels(triangleCount)`
- `createWavefrontMeshAcceleration(meshes)`
- `normalizeWavefrontSceneObject(input)`
- `packWavefrontSceneObjects(sceneObjects, capacity?)`
- `packWavefrontTriangles(triangles, capacity?)`
- `packWavefrontBvhNodes(nodes, capacity?)`
- `rendererWavefrontComputeMode`
- `rendererWavefrontComputeWorkgroupSize`
- `rendererWavefrontComputeStatsStride`
- `bindRendererToXrManager(renderer, xrManager, options)`
- `defaultRendererClearColor`
- `rendererDebugOwner`
- `rendererWorkerQueueClass`
- `defaultRendererWorkerProfile`
- `rendererWorkerProfiles`
- `rendererWorkerProfileNames`
- `rendererWorkerManifests`

The reference helpers mirror the renderer WGSL camera and triangle-hit math in
deterministic JavaScript so tests and downstream tooling can validate primary
ray generation, barycentrics, nearest-hit selection, and environment misses
without standing up a WebGPU device.

## Privacy-Safe Feedback Diagnostics

Approved in-game viewers can explicitly convert a small set of current renderer
health observations into the closed
`@plasius/gpu-shared/feedback-diagnostics` packet:

```js
import { createFeedbackGameDiagnosticSnapshot } from "@plasius/gpu-renderer";

/** @param {boolean} featureEnabled @param {boolean} capabilityGranted */
export function createConsentedDiagnostics(featureEnabled, capabilityGranted) {
  return createFeedbackGameDiagnosticSnapshot({
    featureEnabled,
    capabilityGranted,
    consentConfirmed: true,
    surfaceId: "site.gpu-demo",
    renderer: "webgpu",
    backend: "worker",
    viewportWidth: 1920,
    viewportHeight: 1080,
    frameRate: 59.9,
    frameTimeMs: 16.7,
    featureIds: ["renderer.frame-loop"],
    counters: [{ code: "frame-drop", count: 2 }],
    errorCodes: [],
  });
}
```

The helper returns `null` before reading renderer observations unless the
remotely evaluated `feedback.game-diagnostics.enabled` flag, the
`feedback.game-diagnostics.attach` capability, and explicit consent are all
present. It derives trusted provenance and returns only coarse buckets and
closed codes.

This API is deliberately separate from general renderer snapshots. It accepts
no canvas, user-captured pixels, DOM, player object, URL, filename,
adapter/device detail, coordinate or raw warning, performs no automatic
diagnostic capture or network/storage operation, and never registers
`/player-system`. Disabling the flag preserves ordinary structured-only bug
reporting.
