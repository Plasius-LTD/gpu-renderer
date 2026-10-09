# ADR 0031: Canonical Model Ingestion Boundary

## Status

Accepted

## Context

Feature `Plasius-LTD/plasius-ltd-site#1153` and Task
`Plasius-LTD/gpu-renderer#96` require the renderer to consume canonical model
output without taking ownership of glTF, FBX, OBJ, CAD, or image parsing. The
renderer already exposes `WavefrontMeshInput`, which carries the geometry,
material factors, and decoded texture samples used by its acceleration and
material pipelines.

`@plasius/gpu-model-core` publishes the canonical document and material types.
That document describes canonical IDs, materials, textures, and resources, but
renderer geometry and decoded pixel samples are supplied by the upstream
conversion layer.

## Decision

- Add `createCanonicalWavefrontMeshInputs` as a narrow public adapter in
  `@plasius/gpu-renderer`.
- Accept a canonical document, decoded triangle geometry keyed by primitive ID,
  and decoded texture samples keyed by canonical texture ID.
- Reuse `@plasius/gpu-model-core` types; do not duplicate its canonical model
  schema or add format-specific loaders.
- Map canonical PBR factors and standard material texture bindings into the
  existing Wavefront fields. Preserve supported extension records and texture
  channels, including normal scale, occlusion strength, and texture coordinate
  set. Support metallic-roughness and unlit workflows; reject other workflows
  until the renderer has an explicit compatible mapping.
- Fail closed for unsupported topology, duplicate or missing geometry/material
  references, unresolved decoded textures, and unconsumed geometry. Leave absent
  normals absent so the existing renderer fallback remains authoritative.
- Keep parsing, network/resource resolution, image decoding, and texture
  transform application in the upstream converter. Consumers gate adoption with
  the inherited `gpu.model.conversion.enabled` flag and retain the current path
  for disabled or rollback states.

## Alternatives considered

- Add format-specific parsing or image decoding to the renderer.
  Rejected because it couples rendering to import formats and duplicates the
  canonical conversion boundary.
- Accept loose renderer-owned material records without canonical types.
  Rejected because it would recreate the model contract and weaken consistency
  across adapters.
- Silently ignore missing resources or unsupported topology.
  Rejected because it could drop geometry or material appearance without a
  reviewable failure.

## Consequences

- The renderer depends on the released `@plasius/gpu-model-core` contract
  (`^0.4.4`) for public type resolution; it adds no runtime parser or decoder.
- Existing Wavefront APIs and GPU packing remain the rendering implementation.
- Consumers can migrate incrementally by adapting one decoded canonical model
  and keeping the current path available behind the inherited remote flag.
- Texture samples must be decoded before calling the adapter, and only triangle
  primitives are accepted by this first boundary.

## Validation

- Unit tests cover static and multi-material meshes, standard texture channels,
  extension factors and textures, omitted normals, unresolved references, and
  unsupported topology.
- Type checks verify the public API against `GpuModelDocument` from the released
  canonical package.
- Package tests, coverage, lint, typecheck, build, package checks, and dependency
  audit validate the implementation and release artifact.
