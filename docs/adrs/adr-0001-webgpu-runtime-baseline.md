# ADR 0001: WebGPU Runtime Baseline for Renderer

- Status: Accepted
- Date: 2026-02-10

## Context

Plasius needs a renderer package that does not depend on Three.js and can be
consumed by multiple application layers. Existing runtime rendering paths in site
projects are still Three.js-based, which blocks the zero-Three migration goal.

## Decision

Create `@plasius/gpu-renderer` as a framework-agnostic WebGPU runtime baseline.

- Provide a minimal renderer lifecycle (`createGpuRenderer`).
- Keep rendering orchestration explicit via direct command encoding.
- Expose support detection (`supportsWebGpu`) and lifecycle snapshots.

## Consequences

- Positive: establishes a concrete migration target from `@plasius/renderer`.
- Positive: rendering behavior is explicit and testable without scene framework coupling.
- Negative: scene graph/material abstractions need to be layered on top incrementally.

## Alternatives Considered

- Continue with Three.js as core runtime: Rejected due to migration objective.
- Build app-specific renderers per project: Rejected due to duplication and drift.
