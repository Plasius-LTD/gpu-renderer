# ADR-0035: Groom rope nap and define the bare coating endpoint

Status: Accepted for local review; production adoption pending.
Date: 2026-10-07.
Feature: plasius-ltd-site#1170; Story #2272; Task gpu-renderer#230.
Flag: `gpu-demo.scene-fidelity.enabled`; existing GPU route capability unchanged.

## Decision

Correct the coating authoring curve so every texel reaches zero at 100% wear.
Explicitly set scalar coating strength to zero at that endpoint too. Intermediate
wear erodes patches at different rates; source wood maps and base lighting remain
unchanged. Verify the endpoint against the same frame with varnish disabled.

For a fur-like rope nap, replace random azimuths with bounded authored polyline
guides. Keep crate loop/knot paths in a separate source-demo fixture helper and
project their closest segment direction onto the sampled surface. A consistent
helical tangent component follows the rope's lay. Nearby fibres share an anchor
and bend direction, with only small per-strand variation. No asset identity or
groom logic enters the renderer or shader.

Use four roots per tuft with at most 1 mm spread, fine tapered low-lift curves and
the existing native lighting/MSAA path. The crate uses 4,000 fibres at a 4.5 mm
length scale and 0.16 mm radius, costing 84,000 added triangles and 14,112,000 bytes
of final vertex/UV arrays. Total fixture vertices are 271,734, below the existing
300,000 default. Generation stays outside frame/camera updates. Stable sampling,
exact normalized fray counts and independent coating controls remain intact.

## Limits and verification

These are groomed static triangle fibres, not a fur-scattering or wind simulator.
Guide paths must use the same transformed coordinates as the input geometry.
Reject malformed/excessive guide data before allocation; use a finite tangent
fallback for absent guides or guide/normal degeneracy. Test direction coherence,
clustering, geometry budgets and endpoint equivalence, then inspect real WebGPU.
The wrapper/package direction in ADR-0034 remains unchanged. Local review is not
production deployment; retain the approved package/site CD path and flag rollback.
