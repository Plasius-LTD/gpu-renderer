# ADR 0018: Purpose-Specific Renderer Module Boundaries

## Status

Accepted

## Context

The renderer package had grown several broad JavaScript files that combined
public package exports, worker/render-plan metadata, WebGPU runtime helpers,
wavefront scene normalization, GPU source packing, and WGSL source text. That
made renderer changes difficult to review and increased the chance of accidental
regressions when unrelated responsibilities were edited together.

Task `Plasius-LTD/gpu-renderer#86` requires the package to keep files small
enough to reason about while preserving existing public APIs, supported
materials/scenes, and renderer robustness.

## Decision

`@plasius/gpu-renderer` will use purpose-specific module boundaries:

- `src/index.js` remains a public facade and does not own implementation
  details.
- `src/renderer-*.js` owns framework-agnostic renderer constants, validation,
  worker manifests, render plans, and WebGPU runtime/XR binding helpers.
- `src/wavefront-scene-data.js` remains a compatibility facade, with
  material/medium normalization, scene/mesh normalization, and mesh/GPU source
  generation split into named modules.
- `src/wavefront-shaders.js` remains the WGSL assembler/factory, with shader
  source sections split by layout, material sampling, lighting/transport,
  BVH/intersection, render kernels, and present pass.
- `src/wavefront-compute.js` remains the stateful wavefront renderer lifecycle
  boundary and public instance factory.
- Lifecycle-adjacent responsibilities are split into purpose-specific modules
  for acceleration building, bind groups, pipeline construction, frame encoding,
  frame dispatch, frame statistics, GPU synchronization, and readbacks.

## Alternatives Considered

- Arbitrarily split files by line count.
  Rejected because it hides intent and makes imports harder to reason about.
- Move every nested helper out of `wavefront-compute.js` immediately.
  Rejected because those helpers share GPU resources, pipeline state, frame
  counters, and live configuration. Pulling them out without a lifecycle design
  would trade readability for robustness risk.
- Leave WGSL in one JavaScript source string.
  Rejected because shader validation issues are easier to localize when layout,
  material, lighting, BVH, and kernel sections are separate.

## Consequences

- Public imports remain stable through `src/index.js` and
  `src/wavefront-scene-data.js` facades.
- Most renderer source files now have one clear reason to change and remain
  below roughly 1,000 lines.
- `wavefront-compute.js` is still larger than the other files, but its
  remaining size corresponds to the renderer lifecycle/state boundary rather
  than a mix of unrelated scene/shader/data/pipeline/readback responsibilities.
- Future changes that need to split `wavefront-compute.js` further should first
  introduce an explicit renderer state/ports design and tests for frame
  lifecycle, resource rebuilds, device loss, and high-SPP submission behavior.

## Validation Baseline

- `npm run lint`
- `npm run typecheck`
- `npm run test:coverage`
- `npm run build`
- `npm run pack:check`

All validation should run under a Node version satisfying the package engine.
