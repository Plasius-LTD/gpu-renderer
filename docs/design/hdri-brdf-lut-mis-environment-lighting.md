# HDRI, BRDF LUT, And MIS Environment Lighting

## Goal

Replace the remaining heuristic environment-lighting path with a fuller PBR
environment workflow for the display-quality wavefront renderer.

## Scope

- roughness-aware prefiltered HDRI sampling;
- BRDF integration LUT support;
- explicit HDRI light sampling tables;
- MIS weighting between HDRI light samples and BSDF continuation misses.

## Approach

1. Precompute a mipmapped roughness-aware HDRI resource from the authored
   equirectangular environment map.
2. Precompute a BRDF LUT for split-sum environment response.
3. Build HDRI sampling tables from luminance-weighted texel probabilities.
4. Update the WGSL trace path so:
   - glossy direct/terminal response uses prefiltered HDRI plus BRDF LUT;
   - explicit HDRI direct-light samples are weighted against BSDF PDFs;
   - BSDF-sampled environment misses use the complementary MIS weight.

## Non-Goals

- cubemap-only environment workflows;
- temporal reuse or reservoir sampling;
- replacing emissive-triangle guidance in this change.

## Validation

- renderer unit tests for resource creation and shader-source integration;
- `npm run typecheck`
- `npm test`
- `npm run build`
- screenshot validation once local WebGPU capture is available again.
