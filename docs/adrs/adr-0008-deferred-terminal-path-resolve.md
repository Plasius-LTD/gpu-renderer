# ADR 0008: Deferred Terminal Path Resolve For Wavefront Path Tracing

## Status

Accepted

## Context

The first wavefront path tracer accumulated some visible radiance while a path
was still traversing the scene. Surface resolution could add broad direct
environment estimates, terminal ambient floors could multiply material colour
immediately, and continuation rays carried an already-tinted throughput. That
made low-sample renders brighter and more stable, but it also made lighting
levels difficult to reason about because sun, HDRI, ambient residual, and
material response were mixed before the path had reached a real terminal light
source.

The renderer needs a path model where a camera sample first reaches an
emissive surface, an HDRI/environment miss, or an explicit residual termination
before visible colour is committed. This gives better control over exposure and
ambient residuals, and it makes path diagnostics easier because every sample has
a clear terminal source and a bounded list of material responses.

## Decision

`@plasius/gpu-renderer` will support deferred terminal path resolution for the
wavefront path tracer. In deferred mode the trace pass:

- records one compact material response per ray bounce;
- records the terminal source radiance in the final path slot when the path hits
  emissive geometry, misses into the HDRI/environment, reaches max depth, or
  overflows the active queue;
- uses the lighting-owned `sunlitBaseline` scalar as a time-of-day terminal
  daylight floor instead of raising the global ambient colour;
- avoids adding direct environment or ambient contribution to the visible
  accumulation buffer during surface traversal;
- resolves the path in the terminal pass by walking recorded responses from the
  last bounce back to the first camera hit and then adding the weighted sample
  to the pixel accumulation.

The first implementation remains a single stochastic continuation path per
sample. Reflective or refractive materials do not branch into separate reflected
and transmitted paths yet.

## Consequences

- Display-quality lighting becomes less dependent on fake per-bounce brightening
  and more dependent on the terminal emissive/HDRI source discovered by the
  active path.
- Low-sample images can become darker when paths fail to find strong light
  sources. Bright time-of-day presets still retain a bounded terminal daylight
  floor through `environmentLighting.sunlitBaseline`; further noise and light
  reach issues should be addressed with better light/HDRI sampling, PDFs, MIS,
  and denoising rather than by restoring broad ambient floors.
- The trace stage requires one additional storage buffer for path vertices. The
  renderer therefore requests `maxStorageBuffersPerShaderStage >= 10`.
- The path response record intentionally stores the current approximate material
  response, not a final physical BSDF. Future material-table, texture, medium,
  Beer-Lambert absorption, Fresnel PDF, and spectral-dispersion work should
  replace the response calculation without changing the terminal-source model.
- A legacy forward accumulation switch remains available for before/after
  comparison and regression isolation.

## Current Implementation Boundary

Deferred resolution stores path data in a tile-bounded `pathVertices` buffer
with `(maxDepth + 1)` `vec4<f32>` slots per tile pixel. Slots `0..maxDepth-1`
store per-bounce RGB response and a validity flag. Slot `maxDepth` stores the
terminal source RGB and validity flag. The output pass resolves the current
sample immediately after its bounce loop so the next sample can clear and reuse
the same path slots while the pixel accumulation buffer preserves the weighted
result.

The implementation does not yet include texture-material sampling, material
lookup tables, medium entry/exit distance tracking, Beer-Lambert absorption,
Russian roulette, PDF-correct throughput, MIS, or spectral prism dispersion.
Those are follow-up renderer material-system features. Shadow-tested direct
lighting and bounded attenuation were added later under ADR 0009 without
changing the core terminal-source model.
