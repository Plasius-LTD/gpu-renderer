# Native surfaces and authored materials

## Native animated showcase surfaces

`createNativeSceneRenderer({ canvas })` draws interleaved world-space triangles
with depth testing, four-sample antialiasing, filtered directional shadows and
animated water with a planar reflection. Call `render({ vertices, camera, time,
wakes })` from the caller's animation loop and `destroy()` on teardown. Each vertex
has twelve floats: position XYZ, normal XYZ, linear colour RGB, roughness,
metalness, and procedural detail kind (0 plain, 1 wood, 2 mineral/cloth, 3 terrain).
`camera` supplies `eye`, `target` and optional vertical `fov`. At most four wakes
contain `[x, z, headingRadians]`; water can be disabled with `water: false`.

The input limit defaults to 300,000 vertices. Colour/depth targets are reused and
render dimensions are capped at 3840 per axis and a 1080p pixel budget. Snapshots identify `webgpu-raster`
and count submitted frames; they do not claim ray tracing, GPU completion or
photorealism. Native initialization failures reject; device loss changes
`available` and calls `onUnavailable`. The existing wavefront APIs are unchanged.

Enable only through the consumer's remote `gpu-demo.scene-fidelity.enabled`
decision and existing access capability. See [design](../design/native-showcase-surfaces.md)
and [ADR-0030](../adrs/adr-0030-native-showcase-surfaces.md) for rollout and limits.

### Authored materials in native surfaces

`createNativeSceneRenderer({ canvas, materials })` accepts up to 16 opaque
materials containing decoded RGBA8 `baseColor`, `normal`, and/or `orm` maps.
This matches images returned by the `@plasius/gpu-shared` glTF loader. Colour maps
are sRGB; normals and ORM (occlusion/roughness/metalness) are linear. Optional
`normalScale` defaults to 1. Maps must be power-of-two, up to 2048 pixels per axis,
with a 64 MiB combined decoded-source budget. Textures are uploaded once and mip
filtered; the renderer owns GPU disposal, while callers own image loading.

For textured frames, supply `texcoords` (two floats per vertex) and `surfaces`
containing `{ firstVertex, vertexCount, materialIndex }`. Ranges must cover the
whole triangle list in order, refer to the initialization-time materials, and
contain whole triangles. At most 256 ranges are accepted. Linear vertex colour
and roughness/metalness factors multiply the maps. Omit both new frame fields to
retain the existing procedural/untextured path. Main and reflection passes use
the same authored material; alpha/transmission/skinning are not added here.

See [material design](../design/native-textured-surfaces.md) and
[ADR-0031](../adrs/adr-0031-native-authored-materials.md). Rollout inherits
`gpu-demo.scene-fidelity.enabled`; access remains governed by the site's capability.

For varnished wood, set optional `clearcoat` and `clearcoatRoughness` (both 0–1).
The coating reflects neutral light using its own smooth geometric normal above
the coloured, normal-mapped wood; Fresnel layering attenuates the underlying
material instead of simply adding shine. Strength defaults to zero, preserving
uncoated callers. Coating roughness defaults to zero and is independent of the
base roughness map. Optional `clearcoatMap` uses linear RGBA8: red multiplies
`clearcoat` coverage and green multiplies `clearcoatRoughness`; blue and alpha
are ignored. Omission uses white, preserving the scalar-only finish. Use a
nonzero roughness factor (for example 1) to author roughness directly in green.
The map shares the surface UVs, mip filtering, memory budget and GPU lifetime of
other maps. Clearcoat normal maps remain unsupported.

For mixed objects, give uncoated parts their own surface ranges with
`clearcoat: 0`. This keeps rope and hardware uncoated even when they share the
wood's atlas. The source example [native-crate-finish.js](https://github.com/Plasius-LTD/gpu-shared/tree/main/src/material-study-helpers/native-crate-finish.js)
provides reviewed crate ranges and a deterministic wear preset combining existing
roughness/scuff detail with broad UV patches. Its 0–1 wear control changes coat
coverage and roughness without modifying the underlying colour or source asset.
See [spatial coating decision](../adrs/adr-0032-spatial-native-clearcoat.md) and
the [fixture/provenance record](../design/cc0-demo-asset-review.md). The example
helper is source-only; the published API is the generic material map.

For subtle rope fraying, the source-demo helper
[native-rope-fibres.js](https://github.com/Plasius-LTD/gpu-shared/tree/main/src/material-study-helpers/native-rope-fibres.js) exports `createRopeFibres`.
Pass the expanded native `vertices`, `texcoords` and explicit rope-only
`{ firstVertex, vertexCount }` ranges. It returns separate triangles/UVs and a
`fibreCount`; append them once with their own draw range. Generate in metre-scale
world coordinates after transforms. Sampling is deterministic and area-weighted,
with short tapered curves in small aligned tufts. `density` controls roots per
square metre; `maxFibres` caps them at 4,000 (default 1,600). `length` and `radius`
are in metres. The 21 triangles per strand use ordinary native multisampling,
depth and lighting; no animated fur or dedicated hair scattering is claimed.

Optional `fray` (0–1, default 0.08) promotes exactly
`round(fibreCount * fray)` strands to longer curled loose ends, reported as
`looseEndCount`. Selection is seeded and nested: raising the level keeps earlier
loose ends, roots and UVs in place. At 0, short fuzz remains. This is a visual
proportion of generated fibres, not lost rope strength.

Use `createRopeFibreMaterial(ropeMaterial)` for the added range: it keeps the
rope's colour map and zero clearcoat while omitting the core's baked occlusion
and normal creases from exposed fibres. Vertex roughness is 1 and metallic is 0.
The review fixture offers fibre on/off and both rope-detail views. See
[ADR-0033](../adrs/adr-0033-demo-rope-fibres.md). These helpers remain source-only
and do not add a renderer API, dependency or network request.
