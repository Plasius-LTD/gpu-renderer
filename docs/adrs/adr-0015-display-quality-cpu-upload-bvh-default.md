# Architectural Decision Record (ADR)

## Title

> Default display-quality mesh acceleration to CPU-built BVH upload

## Status

- Accepted
- Date: 2026-06-19

## Context

The display-quality wavefront renderer currently depends on triangle-mesh BVH
data for correct ray traversal. The shader-side traversal and shading are GPU
resident, but the system has supported two distinct acceleration preparation
paths:

- GPU-built BVH generation from uploaded mesh/index buffers.
- CPU-built triangle/BVH preparation uploaded into GPU storage buffers.

The GPU build path is desirable for dynamic scenes, but the current
implementation is still under correctness hardening. The Eames validation scene
showed visible corruption ranging from missing image-space regions to repeated
striped geometry, which indicates invalid acceleration data rather than a mere
sampling-noise issue.

For the current release bar, correctness of the visible render is mandatory.
Scene preparation may happen once at load time or whenever the local scene
changes materially. That preparation step is not the same thing as CPU-side
shading or CPU-side pixel evaluation.

## Decision

Introduce `accelerationBuildMode: "cpu-upload"` as a first-class mesh
acceleration mode for display-quality rendering and make it the default for
display-quality mesh scenes.

Under `cpu-upload`:

- triangle records and BVH nodes are built on the CPU during scene-preparation
  time;
- those records are uploaded once into GPU storage buffers;
- traversal, lighting transport, shading, denoise, and presentation remain GPU
  work;
- GPU-built BVH generation remains available explicitly via
  `accelerationBuildMode: "gpu"` for ongoing hardening and future dynamic-scene
  optimization.

The legacy `cpu-debug` selector is retained as a compatibility alias and maps to
the same `cpu-upload` behavior.

## Consequences

- Positive:
  - display-quality mesh rendering defaults to the more trustworthy
    prevalidated CPU acceleration layout;
  - demo and validation scenes can prioritize image correctness immediately;
  - GPU traversal and shading remain intact, so the renderer still exercises the
    production GPU lighting path.

- Negative:
  - initial scene preparation shifts some work to the CPU;
  - highly dynamic future scenes will still need a correct GPU BVH build path to
    avoid repeated CPU rebuild cost.

## Alternatives Considered

- Keep GPU BVH build as the only display-quality path:
  - rejected because the current path is not meeting correctness requirements.

- Disable display-quality rendering until GPU BVH build is fixed:
  - rejected because it blocks delivery of a working render path for the demo.
