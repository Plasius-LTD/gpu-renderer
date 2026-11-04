# Layered clearcoat and explicit wood variants

Parent Epic: https://github.com/Plasius-LTD/plasius-ltd-site/issues/2113
Parent Feature: https://github.com/Plasius-LTD/plasius-ltd-site/issues/2114
Story: https://github.com/Plasius-LTD/plasius-ltd-site/issues/2286
Depends on existing material fidelity work in gpu-renderer #226.
Parent flags `renderer.sampling.adaptivePerPixel.enabled` and
`gpu-demo.scene-fidelity.enabled` remain disabled.

## User-approved scope

Correct the existing GPU-native clearcoat, then compare optional varnish on the
Eames wood and supplied seating wood. Preserve original model bytes and default
materials. No name-based behavior in the renderer. The local fixture may select
explicit asset/material identities and retain its material overrides in receipts.
Do not rewrite water/glass transmission, AO, colour filtering or adaptive policy.
Three.js is prohibited, including dependencies and rollback.

## Design and contracts

Reuse existing clearcoat factors/textures and canonical wavefront BSDF/PDF. Add
default-off snapshot flag `renderer.materials.layeredClearcoat.enabled`, separate
from sheen and sampling. Correct mode uses red coating weight, green roughness,
and an independent tangent-space coat normal and scale. An absent coat normal
uses the interpolated mesh normal, not the base normal map. Preserve UV0/UV1,
transforms, handedness and geometric-normal validity. Carry the coat normal in
HitRecord using its unused lanes at byte offsets 40, 44 and 56; preserve the
240-byte reflected stride and 256-byte host allocation contract. Metadata header
spare lanes hold normal scale/presence without enlarging its texture.

Use the glTF clearcoat Fresnel-layer approximation (IOR 1.5): attenuate the full
underlying BSDF by the coating Fresnel weight before adding the coat lobe.
Independent coat sampling and its PDF must use the same coat normal. Reject
invalid sampled directions as zero-contribution events in corrected coated mode;
do not silently replace them with a differently distributed sample. Keep primary
sample identity/counting, queues, bounce limit and MIS contracts unchanged.
Coordinate emission attenuation with the same coating normal/weight.
This is an infinitely thin clear coat, not a tinted volumetric varnish simulation.

Keep legacy mode and zero-coat behavior unchanged. Rollback disables the coating
flag and explicit local variants; only GPU-native release rollback is permitted.
No public production activation, main merge, publishing or CD changes.

## Tests and frozen acceptance

- Requirements-first tests for texture channels, independent normal/scale and
  normal-off behavior, no unrelated sheen modulation, finite inputs and layouts.
- Coat disabled and zero-coat equality; independent analytic Fresnel layering,
  grazing response, positive matching PDF, no doubled base specular energy.
- Assembled WGSL physical probe must check real material sampling and BSDF/PDF
  against independent expectations (absolute 2e-5 or relative 0.2%); invalid
  values, device loss and validation errors fail. Small probes are correctness
  evidence only, not performance benchmarks.
- Fixture variants are opt-in, adjustable finite weight/roughness, applied only
  to selected wood materials; preserve textures, transforms, colour, geometry,
  camera, original asset hashes and cached models. Record authored versus override.
- Retain same-camera native 1080p A/B and 4K confirmation where practical, raw HDR
  and cleaned PNG, counts, timing, allocation inventory and source provenance.
  Do not claim objective beauty, convergence, speedup or real-time qualification.
- Full unit/coverage (>=80%, every changed source in LCOV), types, lint, package,
  Zero-Three, physical shader checks and exact-head CI. Update README, Unreleased
  CHANGELOG and ADR. Private models/images stay local; retain hashes publicly.

## Reference

Khronos KHR_materials_clearcoat: independent normal and roughness, Fresnel coating
over the underlying material, including emission. Model authoring changes are
explicit variants, not corrections to source assets that do not declare a coat.

## Browser QA inventory

- Initial scrollable page: labelled coating switch, wood variant and two numeric
  controls, default off; readable status and Render action; no horizontal clipping.
- Full off/on/off switch and reset cycle. Reject a wood variant with renderer off
  before GPU work. Reject invalid strength/roughness through native validation.
- Native same-camera 1080p authored versus varnished: only selected wood changes;
  preserve cloth/leather/suit maps, record asset hashes, actual samples and memory.
- Raw/clean selection and downloadable final image; high-resolution 4K confirmation
  when practical. Inspect actual render, not only status/receipt.
- Exploratory: attempt variant with coating off; edit strength then reset and
  confirm controls return to original defaults. Do not sign off unrelated controls
  or broader mobile/full application accessibility from this local fixture.
