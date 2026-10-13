# Rough optical transmission (experimental)

Parent: site Epic #2113 / Feature #2114 / Story #2291; renderer Task #234.
Approved scope extension: transparent/translucent transport and surface collisions.
Baseline: renderer `c984ba85ab0a45b6855beaba9349c394179e38a6`.

## Defects and design

The existing dielectric branch ignores roughness, uses transmission as a tint
blend instead of transmitted energy, and omits the non-transmitted diffuse
component. Geometry is intersected, but these optical defects cannot be repaired
by ignoring the intersected surfaces. Alpha coverage is separate work (Task #237,
site Story #2296); changing opacity is not a substitute for optical transmission.

Add default-off `renderer.transport.roughDielectricTransport.enabled`. Require
explicit nested-media refraction for this volume-boundary experiment. Reuse the
existing IOR/priority/absorption table, ray stack, material textures, sample
dimensions and tile queues. No new dependency, ray ABI, allocation or CPU tracer.
The new model selects one continuation, irrespective of the legacy splitting flag.

Use GGX microfacet reflection and refraction with matching directional densities,
exact Fresnel, Smith masking and radiance-mode squared IOR scaling. Transmission
factor scales transmitted energy; the remaining component is Fresnel-attenuated
Lambertian reflection. This is a surface-roughness approximation for frosted
materials, not subsurface scattering or a participating translucent volume.
Preserve the smooth-interface and equal-IOR limits. Invalid microfacet proposals
are zero-contribution samples, not resampled directions with an incorrect PDF.

Reflection retains occupancy; only an accepted direction crossing the geometric
surface changes it. Entered volume exits remain collidable despite single-sided
authoring. Opaque backfaces remain culled. Missing volume metadata, unmatched
exits, overflow and invalid samples fail closed. Do not skip geometry on a shadow
ray: refraction requires a real transport event. Straight-line next-event sampling
initially covers reflection/diffuse only. Transmitted continuations carry an
explicit no-competing-NEE marker so terminal MIS cannot suppress their energy.
Specular caustics from delta lights remain unsupported; no caustic convergence claim.

Lighting visibility queries also retain the parent's occupied-medium stack, so
an internal shadow ray cannot accidentally cull its exit as an unoccupied
backface. Unblocked finite lighting segments retain Beer attenuation. CPU
admission rejects untracked optical materials and non-opaque material alpha;
sampled alpha is checked at the GPU hit too. These are explicit unsupported
coverage errors, not converted to transmission or silently ignored surfaces.
Mixed metallic/clearcoat optical materials are also rejected until their combined
lobes have matching evaluation/sampling support; ordinary opaque coated/metal
materials continue through their existing path.

## Current verification boundary

The 2026-10-13 room capture exposed a canonical shader-creation error: the local
predicate `smooth` is a [reserved WGSL word](https://www.w3.org/TR/2026/CRD-WGSL-20260921/#reserved-words).
It is renamed to `isSmooth` without changing optical calculations, flags or layouts.
A red/green token regression covers the canonical and physical-probe assemblies; the existing
software parser/executor did not reject this name. Device compilation preflight
remains mandatory, and fixing this error alone does not qualify a water image.
The regression reproduced line 2940 before the correction. Afterward, all 416
tests passed (96.38% lines, 83.12% branches; changed shader module in LCOV), as did
lint, types/clean-package consumer, build, package, Zero-Three and runtime audit.
No successful device compilation or updated water image is claimed from those
local checks; the physical room preflight must be rerun on the corrected source.

Software execution of the canonical WGSL numerical functions checks T=0/.25/.5/1,
roughness 0/.35/.8, total internal reflection, equal IOR, PDFs, medium ownership
and energy against independent double-precision angular quadrature. A second
software harness executes canonical triangle collision and lighting-ray helpers:
front entry and occupied exit hit; an unoccupied single-sided backface is culled.
These tests substitute scene resource lookups, not the tested scattering or
collision bodies. They are not physical device execution.

The full assembled device probe is retained and wired to room preflight. Its
tolerances are frozen before image capture. Current physical compilation,
1080p/4K room images, UI visual QA and timings remain pending while browser
control is unavailable. No new successful glass/water image is claimed.

Browser QA inventory (pending): initial off state, on with nested transport,
back off and Reset; visible prerequisite error with nested transport off;
empty/filled room and close-up; rendering progress, completion, raw image and
receipt. Inspect full controls and smaller viewport for label/preview clipping.
Exploratory cases: missing optical medium and alpha-covered optical material
must reject without publishing a completed image. Inspect glass rims, waterline,
reflection/transmission direction, silhouettes, noise and dark horizontal bands.

Local validation on 2026-10-11: 407 tests passed, 96.38% line / 83.12% branch
coverage, all six changed runtime JavaScript modules present in LCOV. Lint,
type/clean-package-consumer checks, build, package checks, Zero-Three and runtime
dependency audit passed. The browser connection again reported no available
browser; no device compilation, UI interaction, image or timing result is added.

## Acceptance before qualification

- Red/green flag, material contract, collision and assembled-source regressions.
- Assembled GPU probe: T=0/.25/.5/1, smooth/rough response, finite positive PDFs,
  estimate versus independent angular integration, TIR, geometric hemispheres,
  entry/exit and nested-medium identity, alpha independent of optical direction.
- Existing disabled paths, sample identities, completion/overflow guards and
  bounded storage preserved. Reflective NEE uses the same BSDF/PDF as continuation.
- Empty/filled glass and frosted variants: denoise-off HDR at 1080p and 4K,
  six/eight bounces, fixed/adaptive, actual counts, variance/energy and timings.
- Tests/coverage (including changed-source LCOV), lint, types, package/Zero-Three,
  exact-head CI; physical/image qualification remains pending until actually run.
- README, Unreleased CHANGELOG and ADR. No main release or publication claim.

Rollback disables the new flag, keeping the GPU-native renderer. Three.js remains
prohibited and cannot be a fallback. Private scene assets remain local.

References: [Khronos transmission contract](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_transmission),
[PBRT rough dielectric equations](https://pbr-book.org/4ed/Reflection_Models/Rough_Dielectric_BSDF).
