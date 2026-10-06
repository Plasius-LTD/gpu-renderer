# ADR 0054: independent, opt-in clearcoat over authored materials

Status: Accepted for experimental implementation; physical/image qualification pending.
Story: plasius-ltd-site #2286. Task: gpu-renderer #232. Parent Feature #2114.

## Context

The original Eames and local seating wood have no authored clearcoat. The existing
clearcoat path also multiplies coating weight by the normal map's red channel,
reads roughness from red, shares the base normal and adds a reflection without
attenuating the full base. These are separate authoring and renderer issues.

## Decision

Add default-off `renderer.materials.layeredClearcoat.enabled` to the existing
remote feature-flag snapshot. Follow the Khronos infinitely thin Fresnel coating
approximation with an independent normal, red weight and green roughness. Use the
same normal for GGX sampling/PDF and emission attenuation. Invalid proposals are
null events, not redistributed directions. Preserve the legacy branch and zero
coat. This does not authorize a general water/glass transport rewrite.

Carry the normal in existing HitRecord padding (XY at 40, Z at 56). Reflected
stride stays 240 bytes; host allocation stays 256 bytes per record. Metadata uses
two spare header floats; no new textures, queues, passes or allocated bytes.
Direct sampling of coated emissive triangles reuses the material sampler; this
adds conditional shader work, not an additional surface interaction.

Only the local fixture adds an explicit, adjustable varnish variant to verified
Eames chair/ottoman wood and the checksum-pinned seating wood. Preserve original
files, texture maps, geometry and cached objects. Receipts distinguish authored
properties from overrides. No renderer-level material-name inference.

## Limits and rollout

This is clear, infinitely thin varnish: no coloured volume absorption, interlayer
scattering, refraction inside the coat or claim of photographic equivalence.
Initial visual qualification is opaque, non-delta wood; coated ideal metals and
transmissive bases are not qualified by this change. Keep production defaults
off. Rollback disables the flag and local variant; Three.js is never a fallback.

See [design and frozen checks](../design/layered-clearcoat.md) and the
[Khronos specification](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_clearcoat).
