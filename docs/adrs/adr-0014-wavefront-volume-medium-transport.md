# ADR 0014: Wavefront Volume And Medium Transport For Authored Materials

## Status

Accepted

## Context

The wavefront renderer now carries generic glTF-style surface parameters,
samples texture hits on the GPU, and can attenuate travelled ray segments with a
Beer-Lambert medium table. That still left an integration gap: authored volume
inputs such as `KHR_materials_volume` attenuation colour, attenuation distance,
and shell thickness were not part of the normal mesh material contract, so
callers had to inject ad hoc `medium` objects instead of forwarding authored
material data directly.

The public scene-object API also already exposed `mediumRefId` and `medium`
fields, but the GPU scene-object record still discarded that information.

## Decision

`@plasius/gpu-renderer` will treat authored volume inputs as first-class
wavefront material transport data.

The renderer now:

- accepts a `volume` input block alongside explicit `medium` input for meshes
  and scene objects;
- derives a medium-table entry automatically for meshes when authored volume
  attenuation data is present;
- carries authored shell thickness through material packing in the fourth
  `materialExtension` channel;
- preserves scene-object `mediumRefId` values in the GPU record so analytic
  fixtures can participate in medium lookup as well;
- keeps Beer-Lambert segment attenuation fully on the GPU once a medium is
  active on a ray.

## Consequences

- Authored mesh materials can now express transmissive attenuation without
  requiring renderer-specific medium wiring at every call site.
- The renderer boundary is closer to glTF PBR plus `KHR_materials_volume`, even
  though texture-driven volume thickness and other advanced extension inputs are
  still follow-on work.
- Thickness is transported now for correctness of the public contract and later
  shading work, but this change does not yet add a full shell-thickness volume
  solve.
- The transport model is still not physically complete: there is still no
  nested medium stack, spectral dispersion, or reflected/transmitted branching
  tree in deferred path resolution.
