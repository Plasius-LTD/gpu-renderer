# ADR 0017: Physical Throughput For Wavefront Continuations

## Status

Accepted

## Context

The deferred wavefront path currently records a heuristic RGB "path response"
per surface bounce and multiplies that response backward from the terminal
light source. That keeps images bright enough for validation, but it does not
match the BSDF sample/eval/pdf contract needed for stable high-SPP convergence.

Story `plasius-ltd-site#1094` requires the renderer to stop multiplying
heuristic surface response and instead carry explicit continuation throughput
for non-delta lobes while keeping the rollout behind the existing feature flag
`renderer.transport.physicalEstimator`.

## Decision

`@plasius/gpu-renderer` will store sanitized physical continuation throughput
for deferred wavefront paths:

- non-delta continuation stores `BSDF * abs(dot(N, L)) / pdf`;
- delta reflection and delta transmission remain explicitly flagged so they are
  excluded from incompatible light-PDF MIS comparisons;
- invalid, negative, NaN, or effectively null continuation throughput does not
  enter the deferred path buffer and instead falls back to the bounded terminal
  residual path for that hit;
- the terminal residual remains a bounded environment-derived fallback and is
  not used to brighten ordinary non-terminal continuation throughput.

The deferred path buffer still stores per-bounce local throughput and a final
terminal source slot, and the resolve pass still walks the path backward from
the terminal source.

## Alternatives Considered

- Keep the heuristic path-response lift and only tighten tests.
  Rejected because it preserves known estimator bias and makes high-SPP
  validation ambiguous.
- Multiply a minimum luminance floor into every continuation throughput.
  Rejected because it reintroduces a hidden ambient lift into the transport
  estimator instead of keeping residuals explicit and bounded.

## Validation Baseline

- Unit coverage must assert the physical-throughput contract, delta-path
  tagging, and invalid-throughput fallback behavior.
- Renderer typecheck, lint, build, and targeted unit tests remain required.
- Release-facing validation should continue using the parent feature flag plus
  denoise-off reference scenes from the neighboring validation story.

## Consequences

- High-SPP convergence becomes more dependent on correct PDFs and light
  sampling and less dependent on a hidden response lift.
- Some scenes may appear darker until the remaining transport and validation
  stories land; that is expected and is part of the rollout risk guarded by
  `renderer.transport.physicalEstimator`.
- Deferred path data becomes easier to reason about because each bounce now
  stores a compact physical throughput segment instead of an approximate
  material-response tint.

## Release Implications

- Rollback remains the parent feature flag `renderer.transport.physicalEstimator`.
- The current non-physical fallback path remains available while this story is
  validated.
