# TDR 0004: Animation Adventure Skinned GLB Canvas Path

## Status

Accepted

## Context

The GPU Demo Animation Adventure must show the Peasant Girl as the actual
loaded skinned GLB asset. The previous v1 adventure canvas used a procedural
character proxy, which kept the route and camera demo alive but did not satisfy
the model-rendering requirement.

## Decision

`@plasius/gpu-renderer` owns a lightweight GLB ingestion path for the Animation
Adventure canvas renderer:

- parse binary GLB JSON and BIN chunks directly in the renderer package
- read mesh positions, indices, skin joints, weights, inverse-bind matrices,
  and Mixamo-compatible animation channels
- retarget animation clip channels to model skeleton nodes by node name
- compute CPU skinning matrices for the current active clip and route time
- project the skinned mesh into the v1 adventure canvas without Three.js

`@plasius/gpu-shared` is responsible for loading model and clip bytes and
passing those buffers to the renderer. It does not parse or render the GLB.

## Consequences

- The current demo renders a model-derived Peasant Girl mesh instead of a
  procedural proxy when compatible GLB payloads are available.
- The renderer snapshot distinguishes loaded payloads from renderability through
  `modelLoaded`, `modelRenderable`, `fallbackProxyActive`, and skinned mesh
  diagnostics.
- The implementation remains canvas-based for v1. A later WebGPU-native
  skinned mesh path can replace the projection layer while preserving the
  renderer-owned parsing and snapshot contract.
