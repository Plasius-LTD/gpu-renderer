# Nested, Spectral, and Branching Material Transport

This tranche extends the wavefront renderer's authored-material contract.

## Contract

- Rays carry a bounded four-entry nested medium stack.
- Segment attenuation uses Beer-Lambert transmittance from the current medium.
- Dielectric hits can preserve reflected and transmitted continuations within a
  two-record branch limit and the tile queue capacity.
- The reference transport helpers derive wavelength-separated IOR samples from
  material IOR and dispersion inputs.
- `KHR_materials_*` factors and authored extension textures are normalized into
  stable material records, extension atlas sources, GPU triangle records, and
  shader bindings.

## Operational limits

The stack intentionally drops the oldest entry when a fifth nested medium is
entered, while reporting overflow in the reference contract. Branching is
bounded to keep queue growth finite. The GPU shader carries the stack,
secondary queue record, and extension atlas bindings.

## Validation map

`tests/wavefront-transport.test.js` covers pure transport behavior.
`tests/wavefront-compute.test.js` covers generated WGSL contracts and authored
material/atlas retention. Package typecheck, lint, unit tests, build, package
validation, and dependency audit are release gates for this change.
