# Wavefront Shadowed Direct Light Stability

## Context

The deferred terminal path resolve model improved exposure control by waiting
until a path reached emissive geometry, an HDRI/environment miss, or a terminal
environment residual before committing the continuation radiance to the visible
pixel. That removed broad fake ambient fill, but it also exposed a new failure
mode in low-sample scenes: a path could have a non-black terminal source while
several recorded per-bounce response terms still drove the visible result toward
isolated black pixels.

Local Eames-chair debug captures confirmed the issue. Terminal-source-only
frames remained lit, while exact black pixels first appeared only after several
reverse response multiplications. That points to two concrete gaps:

- deferred mode has no explicit shadow-tested direct-light estimate before the
  continuation path reaches a terminal source;
- the current multiplicative response chain is too aggressive for dark or
  saturated low-sample paths.

## Goals

- Preserve real occlusion shadows: lit surfaces should become dark because a
  source is blocked, not because a continuation path numerically died.
- Keep brightness source-driven: sun, HDRI sky, portals, and emissive geometry
  should dominate the visible estimate.
- Prevent isolated black speckles on otherwise lit surfaces in bright scenes.

## Non-Goals

- This is not a physically complete MIS/PDF-correct direct-lighting system.
- This does not add material tables, texture lookups, spectral transport, or
  full medium absorption.
- This does not restore broad per-bounce ambient injection.

## Proposal

### 1. Add shadow-tested direct environment lighting during surface resolution

Deferred mode should still allow an additive direct-light estimate when the
source and its visibility are known immediately.

For diffuse and rough metallic surfaces, surface resolution should:

- evaluate direct sky/sun/HDRI contribution using explicit visibility tests;
- evaluate environment-light portals with the same occlusion check;
- add that direct term to pixel accumulation even when continuation radiance is
  still deferred.

This keeps deferred terminal resolution for unresolved continuation light while
allowing real shadows to appear from source visibility.

### 2. Bound the per-bounce material response floor

The current recorded response is multiplied backward without any protection
against low-sample collapse. Instead of adding ambient at every bounce, the
renderer should remap extremely dark responses upward to a small,
environment-derived luminance floor.

Requirements:

- preserve hue/chroma as much as possible;
- keep the floor low enough that true occlusion shadows remain dark;
- allow deeper bounces to decay more than early bounces.

The floor should derive from scene brightness inputs already owned by the
renderer, primarily `environmentLighting.sunlitBaseline` and the environment-map
ambient strength.

## Expected Outcome

- Sunlit or bright-HDRI scenes retain colour and brightness on first-bounce
  surfaces even at 1-2 spp.
- Dark regions stay dark when the direct sample is blocked and the terminal
  environment residual is low.
- Isolated black speckles become rare because lit paths no longer depend only on
  a terminal source multiplied through an unrestricted response chain.

## Validation

- Source-level renderer tests should assert the presence of visibility-tested
  direct lighting and bounded response remapping.
- Eames-chair validation should show that terminal-source frames are already
  lit, while later reverse-pass frames no longer introduce large pockets of
  exact black pixels in bright presets.
