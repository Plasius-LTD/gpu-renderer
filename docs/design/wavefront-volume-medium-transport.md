# Wavefront Volume And Medium Transport

## Goal

Let authored transmissive materials carry volume attenuation data into the
shared wavefront renderer without demo-local medium construction.

## Scope

- accept authored `volume` inputs plus explicit `medium` inputs on mesh and
  scene-object contracts;
- derive mesh medium-table entries from volume attenuation data when no explicit
  medium is supplied;
- preserve authored shell thickness through GPU material packing;
- wire scene-object medium references through the GPU scene-object record;
- keep Beer-Lambert segment attenuation on the GPU once a ray is inside a
  medium.

## Data Flow

1. Caller supplies either:
   - explicit `medium`, or
   - a glTF-style `volume` block with thickness and attenuation data.
2. Mesh normalization derives:
   - `mediumRefId`
   - normalized medium coefficients
   - `thickness`
3. Config assembly collects all referenced media into the compact medium-table
   texture.
4. The trace pass carries the active `mediumRefId` on the ray.
5. Surface resolution multiplies travelled throughput by Beer-Lambert
   transmittance for the distance traversed in the current medium.

## Current Fallback Contract

- The renderer currently supports a single active medium per ray.
- Invalid or unknown `mediumRefId` values fall back to the current ray medium
  instead of propagating a broken lookup.
- Nested medium stacks fall back to the current ray medium until dedicated
  stack support is scoped; entering a second medium while another is active
  preserves the existing medium id instead of pretending stack semantics exist.
- Exiting the active medium returns the ray to vacuum (`0`) only when the
  surface medium id matches the current ray medium id.

## Explicit Non-Goals

- nested medium stacks;
- reflected/transmitted branching trees;
- spectral or wavelength-sampled dispersion;
- full texture-driven support for every `KHR_materials_*` extension.

## Validation

- unit coverage for implicit medium derivation from volume inputs;
- unit coverage for invalid `mediumRefId` fallback and single-slot nested-medium
  fallback behavior;
- stable packing tests for scene-object and material records;
- renderer typecheck, build, lint, tests, and coverage.
