# ADR 0021: Strict Physical Low-SPP Lighting

## Status

Accepted

## Context

Low-SPP wavefront renders were too dependent on heuristic terminal residuals and
uniform light selection. Those mechanisms made some frames brighter, but they
also made dark pixels difficult to classify because max-depth expiry, null
throughput, queue overflow, and genuine occlusion could all look like unstable
lighting failures.

The renderer needs a remotely switchable path that favours physically
explainable transport over preview stabilization.

## Decision

`@plasius/gpu-renderer` will support the boolean rollout flag
`renderer.transport.strictPhysicalLowSppLighting`.

When enabled, the wavefront path tracer:

- stops using terminal ambient rescue for max-depth, null-throughput, and queue
  overflow termination;
- records strict physical termination reasons for absorption/null throughput,
  Russian roulette, strict max-depth loss, and queue overflow;
- samples procedural sunlight as an explicit shadow-tested directional light;
- samples procedural sky from the surface hemisphere instead of a uniform
  sphere fallback; and
- selects emissive triangles by area-weighted emission power, with PDFs that
  match the sampled distribution before MIS.

Strict Product Studio validation can additionally enable
`renderer.transport.sourceStableDirectLighting.enabled`. That flag uses the
deterministic direct-light estimator and removes direct-light sample dependence
on adjacent pixel ids and frame index, reducing source-routing stipple without
adding terminal fill or ambient rescue.

When disabled, existing stabilized behavior remains the rollback path.

## Consequences

- Strict mode can retain honest Monte Carlo variance at very low SPP, but dark
  pixels should now be explainable by diagnostics rather than hidden terminal
  fill.
- Procedural sun and finite emissive lights no longer depend on raw collision
  luck or uniform triangle selection.
- The counter buffer grows to expose additional termination categories.

## Validation

- Unit coverage must assert boolean flag packing, strict termination reasons,
  procedural sun/sky sampling, power-weighted emissive selection, and corrected
  emissive PDFs.
- Existing Eames/Product Studio benchmark scenes should be validated with
  `denoise: false` at SPP 1, 4, 8, 20, 32, 64, 128, and 256 before enabling
  strict/source-stable mode broadly.
