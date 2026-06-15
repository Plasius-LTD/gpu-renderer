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

## Explicit Non-Goals

- nested medium stacks;
- reflected/transmitted branching trees;
- spectral or wavelength-sampled dispersion;
- full texture-driven support for every `KHR_materials_*` extension.

## Validation

- unit coverage for implicit medium derivation from volume inputs;
- stable packing tests for scene-object and material records;
- renderer typecheck, build, lint, tests, and coverage.
