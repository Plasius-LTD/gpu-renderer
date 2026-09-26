# Primary camera terminal MIS correction

Task [212](https://github.com/Plasius-LTD/gpu-renderer/issues/212), Story 2168,
Feature 2114. Local development is stacked on Task 210's branch-owned producer;
neither prerequisite nor this change is release-qualified.

## Contract

A camera ray (`bounce == 0`) has no competing next-event lighting estimate.
Its directly visible environment or emissive source must retain unit MIS weight.
Only non-delta secondary rays remain eligible for the existing terminal MIS.
Do not change light PDFs, BSDFs, source radiance, sample sequence, guided weights,
medium attenuation, roulette, allocations, dispatch, or fixed sample weighting.

## Requirements-first verification

- Both terminal branches in the final assembled module use the same predicate.
- Primary rays are ineligible regardless of the PDF or delta flag; secondary
  diffuse/guided rays remain eligible and secondary delta rays remain ineligible.
- Execute the predicate and existing power heuristic on physical WebGPU.
- Render uniform environment, emissive mesh, ideal metal and small glass scenes
  in both resolve modes at 1, 32 and 128 SPP, denoise off, frame budget omitted.
  Inspect actual per-pixel completed counts and linear float32 accumulation;
  freeze 1e-5 absolute radiance error before the fix. Retain failures and receipt
  provenance, including implementation and assembled-shader hashes.
- Run coverage with every changed runtime source present, lint, types, build,
  packed consumer, artifact and Zero-Three checks. CI waits for approved runners.

These focused scenes do not qualify Eames/noise, nested scattering, the full
resolution/depth stress matrix or adaptive performance. Those gates stay open.
The parent adaptive flag remains off. No local publication or production change;
rollback requires a qualified GPU-native release. Three.js is prohibited.
