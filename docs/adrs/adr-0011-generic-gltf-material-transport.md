# ADR 0011: Generic glTF Material Transport For Wavefront Shading

## Status

Accepted

## Context

The Eames validation scene had drifted toward demo-specific material overrides.
The loader and validation page inferred chrome, leather, and wood behaviour from
material names, then injected tuned roughness, sheen, clearcoat, and colour
values before the renderer saw the asset.

That approach created two problems:

- improvements were specific to one asset instead of generic renderer
  capability;
- the shared wavefront renderer could not faithfully consume authored glTF
  material inputs such as specular colour, transmission, sheen colour, and IOR.

For product-quality validation, material response must come from the asset and
the renderer's generic shading model rather than from demo naming conventions.

## Decision

`@plasius/gpu-renderer` will carry generic glTF-style material inputs through
its wavefront path instead of relying on demo-local surface overrides.

The renderer now transports and shades the following per-surface inputs:

- base colour and opacity
- roughness and metallic
- IOR
- clearcoat and clearcoat roughness
- sheen colour
- specular weight and specular colour
- transmission

The GPU record layout for scene objects, mesh ranges, triangle records, GPU
material records, and hit records is expanded so these values remain available
inside GPU shading and scattering.

The Eames validation integration must pass authored material values through
without material-name heuristics.

## Consequences

- Demo-specific material overrides are no longer the primary source of leather,
  chrome, or wood response in validation renders.
- Shared wavefront shading can now use generic material inputs that map more
  directly to glTF PBR and selected `KHR_materials_*` extensions.
- Buffer layouts become larger, so all record-byte constants and buffer packing
  code must remain aligned with the WGSL structs.
- This is still not a complete glTF BSDF implementation. Extension textures,
  MIS, and prefiltered HDRI reflection remain follow-on work.
