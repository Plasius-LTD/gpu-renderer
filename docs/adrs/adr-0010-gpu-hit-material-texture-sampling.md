# ADR 0010: GPU Hit-Time Material Texture Sampling For Wavefront Path Tracing

## Status

Accepted

## Context

The display-quality wavefront renderer already resolved exact triangle UVs on
the GPU, but it still shaded mesh hits from CPU-baked triangle averages for
base color, metallic-roughness, and normal-map influence. That mismatch caused
three problems:

- shading could not use the exact texel at the final hit UV;
- normal-map detail and material variation were smeared across each triangle;
- CPU-side texture sampling remained part of the active render path even though
  the renderer already had the information needed to shade on the GPU.

For higher-quality reflective and textured assets, especially the Eames chair
validation scene, this was a hard realism ceiling.

## Decision

`@plasius/gpu-renderer` will evaluate mesh material textures on the GPU at
hit-time for the display-quality wavefront path tracer.

The renderer now:

- builds GPU-uploaded atlases for base-color, metallic-roughness, normal,
  occlusion, and emissive textures during scene/config preparation;
- writes one compact GPU material record per submitted mesh;
- carries a dense `materialSlot` through mesh ranges, triangle records, and hit
  records;
- samples the material atlases in `intersectActiveQueue` using the resolved hit
  UV before the hit record is written;
- stores the sampled base color, material factors, emissive term, occlusion,
  and exact normal-mapped shading normal in the hit record for later lighting
  passes.

CPU-side texture decoding and atlas packing remain load-time preparation only.
They are not part of per-frame or per-hit shading.

## Consequences

- Display-quality shading now uses the exact hit texel instead of a
  triangle-averaged CPU approximation.
- Normal maps, roughness variation, AO, and emissive maps can influence the
  actual GPU shading path.
- The renderer consumes one additional storage buffer and several sampled
  textures in the trace bind group, so its required storage-buffer count rises
  to `11`.
- The current implementation still uses pragmatic atlas packing rather than a
  streaming virtual texture system. It is correct for this validation workload,
  but very large scenes will eventually need a more explicit residency model.
