# ADR 0013: HDRI Prefilter, BRDF LUT, And MIS For Wavefront Environment Lighting

## Status

Accepted

## Context

The wavefront renderer already transports generic glTF material data and can
sample exact texture hits on the GPU, but its environment-lighting path still
leans on heuristic glossy response and non-MIS continuation.

That leaves three hard realism gaps:

- reflective and semi-reflective materials do not consume the HDRI with the
  same fidelity expected from a modern PBR pipeline;
- specular response lacks a proper BRDF integration term;
- environment contribution is not balanced against BSDF continuation with a
  multiple-importance heuristic.

## Decision

`@plasius/gpu-renderer` will adopt a fuller environment-lighting pipeline for
the display-quality wavefront renderer:

- prefiltered HDRI mip levels for roughness-aware specular environment lookup;
- a BRDF integration LUT for split-sum specular environment response;
- environment importance-sampling tables for explicit HDRI light samples;
- MIS weighting between explicit HDRI samples and BSDF-sampled continuation
  rays that terminate against the environment.

## Consequences

- First-bounce and terminal glossy response align more closely with established
  physically-based HDRI workflows.
- Continuation rays that miss to the environment are less biased toward either
  brute-force BSDF sampling or explicit light sampling.
- Renderer setup becomes heavier because environment resources now include
  prefiltered mip data, a BRDF LUT, and HDRI sampling tables in addition to the
  base environment texture.
- This remains compatible with the current equirectangular HDRI input model;
  cubemap conversion is not required for this step.
