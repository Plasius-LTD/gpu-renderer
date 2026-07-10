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
4. The trace pass carries a bounded four-entry `mediumStack` plus its depth on
   the ray; `mediumRefId` remains as a compatibility/current-medium field.
5. Surface resolution multiplies travelled throughput by Beer-Lambert
   transmittance for the distance traversed in the current medium.

## Current Fallback Contract

- The renderer carries a bounded nested medium stack per ray (four entries in the GPU record); the current medium is the top entry.
- Invalid or unknown surface medium ids preserve the current stack instead of
  propagating a broken lookup.
- Entry pushes the authored medium id, while exit removes the matching entry
  and exposes the next outer medium.
- The GPU stack is capped at four entries; overflow keeps the newest four
  entries and is surfaced by the CPU transport contract.

## Explicit Non-Goals

- deeper-than-four nested medium stacks and physically exact arbitrary-depth stacks;
- arbitrary-depth reflected/transmitted branching trees;
- full spectral rendering beyond the bounded reference wavelength samples;
- extension semantics that are not authored by the source glTF material.

## Validation

- unit coverage for implicit medium derivation from volume inputs;
- unit coverage for bounded entry/exit stack transitions and Beer-Lambert
  attenuation;
- source-contract coverage for secondary reflected/transmitted queue records;
- stable packing tests for scene-object and material records;
- renderer typecheck, build, lint, tests, and coverage.
