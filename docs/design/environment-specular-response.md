# Environment Specular Response

## Problem

The renderer had enough material data to distinguish diffuse, metallic,
clearcoat, sheen, and transmission surfaces, but it still evaluated most
glossy response from a sun-direction proxy. That was acceptable for preview
contrast, but it limited realism because authored materials could not reflect
the actual HDRI or procedural environment strongly enough.

## Decision

Add a generic environment-reflection shading step inside the wavefront WGSL
surface-resolution path.

## Approach

1. Derive a reflection direction from the incoming ray and shading normal.
2. Blend that direction back toward the normal as roughness increases so broad
   surfaces do not use a razor-sharp reflection sample.
3. Visibility-test the chosen direction against scene geometry.
4. Use that environment radiance for:
   - glossy/specular response,
   - sheen response,
   - clearcoat response,
   - terminal environment fallback at the last resolved collision.
5. Keep the narrower sun highlight as a secondary term instead of the main
   glossy light source.

## Non-Goals

- prefiltered specular environment mip chains;
- BRDF integration LUTs;
- full multiple-importance sampling across BSDF and environment PDFs.

## Validation

- `npm test`
- `npm run typecheck`
- `npm run build`
- screenshot validation remains a follow-on runtime check once local WebGPU
  capture is available again on this machine.
