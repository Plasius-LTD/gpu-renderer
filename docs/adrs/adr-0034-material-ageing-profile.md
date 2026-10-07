# ADR-0034: Separate ageing intent from native surface authoring

Status: Accepted for local review; extraction and production adoption pending.
Date: 2026-10-07.
Feature: plasius-ltd-site#1170; Story #2272; renderer Task #230.
Flag: `gpu-demo.scene-fidelity.enabled`; existing GPU route capability unchanged.

## Decision

Prototype a small source-demo wrapper with two boundaries: `material-ageing.js`
owns a serializable immutable version-1 profile; `native-crate-ageing.js` adapts it
to existing native finish/rope helpers. Reuse gpu-shared's geometry/image contract
and gpu-renderer's triangle/material pipeline. No new shader, dependency, package
export, simulation clock or renderer-owned gameplay state is introduced.

Use independent normalized channels: rope fraying 0–1 and varnish wear 0–1, plus
a stable uint32 seed. The review default is 0.30 / 0.90. Fraying selects exactly
`round(fibreCount * ropeFray)` longer loose ends from a seeded permutation. Selection
is nested with increasing wear; roots, UVs and short-fibre randomness stay fixed.
Coating wear affects coverage and roughness only; fibres and hardware stay bare.
The coat pattern remains stable in UV space. Neither channel implies years,
mechanical damage, or percentage of coating area removed.

## Wrapper project direction

Existing shared/render/cloth/scene packages contain no reusable ageing profile.
Keep the prototype in this tracked renderer task until at least a second asset
and wear type establish the contract. A future `@plasius/material-ageing` package
is the proposed home for validated profiles, wear evolution and authored masks;
native geometry/material adapters stay at the consuming renderer boundary.
Create that package only with its own linked Task, schema-template tooling,
legal/docs/test baseline and approved release flow. Do not add a dependency to
every renderer consumer for one crate or encode fixture triangle IDs in it.

## Validation and limits

Test profile validation/immutability, deterministic exact counts, stable root
sampling, nested wear, channel isolation, outward tube winding and unchanged
budgets. Test 0/30/100% fray and 0/90/100% coating wear in the real WebGPU preview.
Expose comparison controls and report the selected levels in text. Static fibres
remain an approximation: no hair scattering, wind or damage simulation is claimed.
Rollback uses the existing feature flag at site adoption; local review can set
wear/fray to zero or disable the additional fibres/coating entirely.
