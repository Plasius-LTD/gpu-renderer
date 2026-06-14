# ADR 0012: Environment Specular Response For Wavefront Shading

## Status

Accepted

## Context

The wavefront renderer already supports environment maps, portal-gated sky
lighting, GPU hit-time texture sampling, and generic glTF material transport.
That made diffuse environment response materially better, but reflective and
semi-reflective surfaces still relied too heavily on a narrow sun-direction
heuristic during direct-light resolution.

In practice this meant:

- leather sheen did not pick up the room or HDRI convincingly;
- chrome and polished wood read flatter than their authored material inputs;
- environment maps influenced misses and ambient floors more than glossy
  surface response, which is the opposite of what physically-based shading
  needs.

## Decision

`@plasius/gpu-renderer` will evaluate a generic environment-driven glossy term
for direct and terminal surface response in the display-quality wavefront path.

The renderer now:

- derives reflection-aligned environment sample directions from the hit normal,
  incoming ray, and roughness rather than treating the sun direction as the
  primary glossy light source;
- uses visibility-tested environment radiance for specular, sheen, and
  clearcoat response before adding any narrower sun highlight term;
- blends the terminal environment fallback toward reflection-aligned response
  for glossy materials so the last collision retains plausible environment
  colour instead of collapsing toward a mostly diffuse ambient estimate.

## Consequences

- Glossy materials respond to the actual environment map or procedural sky more
  consistently.
- The shading path remains generic across glTF-authored materials instead of
  relying on model-specific overrides.
- This is still an approximation, not a full split-sum IBL or MIS pipeline.
  Prefiltered environment maps and full BSDF PDFs remain follow-on work.
