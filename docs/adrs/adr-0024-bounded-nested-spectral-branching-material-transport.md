# ADR 0024: Bounded Nested Spectral Branching Material Transport

## Status

Accepted and implemented for the wavefront transport tranche.

## Context

The renderer previously carried one active medium id and selected one
reflection or transmission continuation at a dielectric hit. Authored glTF
`KHR_materials_*` extension values were also normalized into factor fields but
did not have a shared texture-backed material contract. These limitations made
nested glass, spectral dispersion, and extension-authored materials diverge
from the source asset.

## Decision

- Carry a four-entry medium stack in every GPU ray record. Entry pushes the
  surface medium, exit removes the matching entry, and travelled segments use
  the stack top for Beer-Lambert attenuation.
- Keep a bounded two-branch transport fan-out. The sampled continuation stays
  the primary queue record; a reflected or transmitted sibling is enqueued
  when tile queue capacity permits.
- Expose deterministic reference transport helpers for stack transitions,
  Beer-Lambert attenuation, Schlick-weighted reflection/transmission branches,
  and bounded wavelength samples derived from IOR/dispersion.
- Normalize authored `KHR_materials_ior`, `transmission`, `volume`,
  `clearcoat`, `sheen`, `specular`, `iridescence`, `anisotropy`, and `unlit`
  inputs, retaining their extension texture inputs in material and triangle
  records. Extension atlases are built independently so absent textures retain
  explicit defaults.

## Alternatives considered

- An unbounded GPU medium stack was rejected because it would make the fixed
  WebGPU record contract and queue memory unpredictable.
- Replacing the wavefront queue with a recursive path tree was rejected because
  it would break the existing breadth-first dispatch and compaction model.
- Factor-only extension normalization was rejected because it loses authored
  texture variation at hit time.

## Limits and follow-on work

The stack is capped at four entries and secondary branching is capped at two
records per hit. Spectral samples are a bounded reference model, not a full
spectral renderer. Extension atlas shader sampling applies authored texture
factors to the shared material response; future work may add richer per-lobe
spectral semantics without changing the normalized public inputs.

## Verification

Regression coverage exercises stack entry/exit, overflow, Beer-Lambert
attenuation, dispersion, branch bookkeeping, extension factors, and texture
retention. The existing WGSL source-contract tests also verify the ray-record
stack fields and secondary queue path.
