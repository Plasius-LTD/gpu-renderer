# ADR 0022: Professional Animation WebGPU Surface

## Status

Accepted

## Context

Animation Adventure previously used a 2D canvas renderer that CPU-skinned GLB
vertices and filled projected triangles with flat heuristic colours. That was
useful for validating skeleton math but not acceptable as the professional demo
path because it could still show proxy visuals, route-driven movement, and
untextured props.

## Decision

Introduce `createProfessionalAnimatedSceneRenderer` as a separate async WebGPU
surface. The professional surface:

- requires a WebGPU canvas and renderer lifecycle
- requires textured skinned GLB character metadata
- requires root-authored movement profiles for travel beats
- exposes professional diagnostics in snapshots
- rejects 2D proxy fallback instead of silently drawing one

The legacy `createAnimatedSceneRenderer` remains compatible for fallback and
validation use. It is not the professional primary path.

## Consequences

`gpu-shared` and the site runtime can explicitly mount professional animation
through WebGPU and can fail closed when assets or motion profiles are not good
enough. The initial WebGPU surface establishes the correct lifecycle,
diagnostic, and validation boundary; shader-level PBR textured character and
environment drawing can iterate behind that stable surface.
