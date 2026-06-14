# ADR 0009: Shadowed Direct Light And Bounded Attenuation For Deferred Wavefront Resolve

## Status

Accepted

## Context

ADR 0008 established deferred terminal path resolution so the renderer no
longer committed continuation radiance before a path reached a known terminal
source. That improved exposure control, but deferred mode still had no
shadow-tested direct-light estimate during surface resolution, and its recorded
per-bounce response could numerically collapse a valid terminal source into
isolated black pixels.

Debug captures showed a non-black terminal source with black pixels appearing
only after several reverse response multiplications. The failure was therefore
not an absent environment source; it was a combination of missing explicit
direct-light visibility and overly aggressive multiplicative attenuation.

## Decision

`@plasius/gpu-renderer` will extend deferred wavefront resolution with two
stabilizers:

- surface resolution may add an explicit shadow-tested direct environment term
  before terminal path resolution completes;
- recorded per-bounce response is remapped to a small, scene-brightness-driven
  luminance floor so lit paths do not numerically die into isolated black
  pixels.

This direct-light term is allowed in deferred mode because it is already tied to
an identified source and an explicit visibility check. Unresolved continuation
radiance still remains deferred until the path reaches its terminal source.

## Consequences

- Occlusion shadows remain possible and become more believable because direct
  light is now visibility-tested instead of inferred from broad ambient fill.
- Bright scenes become more stable at low spp because explicit direct lighting
  and bounded attenuation reduce speckled black failures.
- The estimator remains biased. It is still a pragmatic preview-oriented
  wavefront integrator pending fuller MIS/PDF-correct direct lighting, material
  tables, and medium transport.
