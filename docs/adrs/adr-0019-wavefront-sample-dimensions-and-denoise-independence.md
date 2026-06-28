# ADR 0019: Wavefront Sample Dimensions and Denoise-Independence Gates

## Status

Accepted

## Context

Task `Plasius-LTD/gpu-renderer#66` requires the renderer to stop relying on ad
hoc numeric seed offsets for camera jitter, light selection, and BSDF sampling.
Task `Plasius-LTD/gpu-renderer#67` requires denoise-off high-SPP validation to
become machine-checkable so denoise cannot hide structural transport failures.

Before this change:

- WGSL call sites embedded raw dimension integers directly into `mix_seed(...)`
  or `seed + N` expressions.
- Reviewers could not easily see whether two sampling sites reused a dimension
  accidentally.
- High-SPP denoise validation existed only as implicit harness expectations
  spread across renderer and lighting discussions.

## Decision

`@plasius/gpu-renderer` now treats sampling dimensions and denoise-independence
rules as explicit, testable renderer contracts:

- `src/wavefront-sampling-dimensions.js` owns the canonical dimension registry.
- WGSL imports those named constants and uses shared `sample_dimension_1d(...)`
  / `sample_dimension_2d(...)` helpers instead of raw numeric offsets.
- 2D camera/jitter/light samples use a shader-cheap low-discrepancy pair built
  from stratified X plus Van der Corput Y, both scrambled by the canonical
  dimension seed.
- `src/wavefront-denoise-validation.js` owns the acceptance thresholds for
  denoise-off structural artifacts, invalid-sample share, baseline noise
  regression, and sheen/chrome/wood detail retention.

## Alternatives Considered

- Keep hashed random sampling but rename only the existing integers.
  Rejected because it leaves high-value 2D sampling sites without any
  convergence improvement.
- Introduce CPU-generated blue-noise tables.
  Rejected because the task explicitly requires shader-cheap sampling and no
  CPU-side sampling textures/tables.
- Leave denoise-independence checks in ad hoc markdown or issue comments.
  Rejected because release gates need deterministic, versioned thresholds.

## Consequences

- Camera jitter, guided light picks, BSDF lobe sampling, emissive triangle
  barycentrics, and direct-environment selection now expose their sampling
  intent by name.
- Review/test failures catch duplicate or missing dimensions before they become
  visual regressions.
- Renderer validation can reject a denoise-on "pass" when the paired
  denoise-off result still contains structural artifacts or excessive material
  blur.
- Future sampling sites should extend the registry first rather than reusing
  raw numbers inline.

## Validation Baseline

- `node --test tests/wavefront-compute.test.js`
- `npm run test:coverage`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
