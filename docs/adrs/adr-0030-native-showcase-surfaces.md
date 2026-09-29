# ADR-0030: Native multipass showcase surfaces

Status: Accepted for implementation; visual qualification and release pending.

## Context

Site Feature 1170 / Story 2272 and renderer Task 227 require actual rendered-scene
improvements. The shared Shoreline runtime paints projected triangles in Canvas2D.
The existing wavefront path tracer is valuable for Product Studio, but its separate
source-fidelity and sampling work must not become a dependency on every animated
water/cloth frame. The gpu-model-renderer main package is still a bootstrap.

## Decision

Add `createNativeSceneRenderer` to `@plasius/gpu-renderer`, reusing `createGpuRenderer`
for adapter/device/context/frame submission. An optional `encodeFrame` hook owns
the full command encoder's render passes; existing callers retain their default
clear pass and `onBeforeEncode` semantics. The native adapter supplies bounded
interleaved world-space triangles and schedules frames itself.

The renderer performs a directional depth-map pass, a half-resolution mirrored
camera pass, and a four-sample main pass. Opaque material shading uses linear
roughness/metalness response, a sky hemisphere and a directional light. Water uses
analytic waves, a planar scene reflection and boat wake positions. Reflection is
stored in linear HDR; tone mapping occurs once for presentation. This is raster
rendering, not ray tracing or full global illumination.

`@plasius/gpu-shared` retains asset loading, transforms, cloth/physics and controls.
The site must explicitly pass the backend-evaluated `gpu-demo.scene-fidelity.enabled`
decision. Missing/disabled gates retain Canvas2D. Unavailable WebGPU retains an
identified compatibility renderer. Native initialization failure must remain
visible rather than being misreported as successful GPU rendering.

## Consequences and limits

- Dynamic import keeps native renderer code out of unrelated landing pages.
- No new framework/dependency and no Three.js.
- Vertices, textures and render size are bounded; targets are reused and destroyed
  on resize/teardown. Shader/pipeline validation is awaited before returning ready.
- Pause/reduced motion preserve a static frame. Device loss reports unavailability.
- Material textures, water refraction, screen-space occlusion, contact-hardening
  shadows and animation skinning are not supplied by this initial surface API.
  Do not describe those features as active or call this photorealistic evidence.
- Shader testing includes an actual WebGPU browser render as well as unit resource
  and dispatch checks. Unit mock success alone is not visual qualification.

Disable the existing scene-fidelity flag to roll back the native scene. Preserve
the existing GPU demo capability for access. Package CI and approved CD must pass
before the site consumes the released API; site production uses main `cd.yml`.
