# ADR 0016: Mixed Direct-Light MIS For Wavefront Materials

## Status

Accepted

## Context

The display-quality wavefront renderer already supports HDRI importance
sampling, BSDF PDFs, emissive-triangle guidance metadata, and deferred terminal
path resolve. It still had two transport gaps:

- explicit direct lighting only ran for a narrow diffuse/metal subset on the
  first two bounces; and
- emissive-triangle direct lighting did not publish a solid-angle PDF contract
  that could be compared safely against BSDF PDFs in MIS.

That left chrome, clearcoat, textured, and later-bounce glossy surfaces outside
the explicit direct-light path, while emissive-area lights still relied mostly
on heuristic continuation guidance rather than a measure-consistent estimator.

## Decision

`@plasius/gpu-renderer` will use a single direct-light sample contract for
non-delta wavefront surface hits:

- choose one explicit light sample per eligible hit from a bounded mixture of
  environment lighting and emissive-triangle area lighting;
- keep the environment path in solid-angle measure via the existing HDRI PDF
  tables;
- convert emissive-triangle area PDFs into solid-angle PDFs at the shading
  point before comparing them against BSDF PDFs in MIS; and
- gate explicit direct lighting from BSDF semantics, excluding delta-only
  reflection and refraction paths instead of using material-kind-plus-bounce
  special cases.

## Alternatives Considered

- Keep the old first-two-bounce diffuse/metal gate.
  This was rejected because it preserved known bias and left multiple supported
  material classes outside the direct-light estimator.
- Add both an environment sample and an emissive sample on every hit.
  This was rejected because the current performance guardrail allows only one
  default NEE sample per hit without a separate performance decision.
- Continue relying on emissive guidance without a direct-light PDF contract.
  This was rejected because it cannot provide measure-consistent MIS against
  BSDF PDFs.

## Consequences

- Direct lighting now reaches all non-delta supported material classes without
  hard-coded bounce limits.
- Emissive-area light MIS becomes comparable with the existing HDRI path.
- The renderer keeps its one-sample direct-light budget while broadening
  estimator coverage.
- Perfect mirror and refraction paths remain continuation-only until the
  renderer grows non-delta transmissive/direct-light handling.

## Test Implications

- Unit coverage must assert the presence of the mixed direct-light sample
  contract, the emissive area-to-solid-angle PDF conversion, and the removal of
  the old material-kind/bounce gate.
- Existing renderer test, lint, build, coverage, and package validation gates
  remain required.

## Release Implications

- Rollback remains the parent feature flag
  `renderer.transport.physicalEstimator`.
- No package-public API shape changes are required for this step; release risk
  is renderer-behavioral rather than contract-breaking.
