# ADR-0033: Author rope fraying with existing native geometry

Status: Accepted for local review; package release/site adoption pending.
Date: 2026-10-07.
Feature: plasius-ltd-site#1170; Story #2272; renderer Task #230.
Flag: `gpu-demo.scene-fidelity.enabled`; existing access capability unchanged.

## Decision

Author slightly frayed rope as static, curved, tapered triangle tubes in a
source-demo helper. Reuse gpu-shared's loaded geometry/UVs and the existing
native renderer's triangle, material, depth, shadow/reflection and multisampling
paths. No new render pass, transparency system, shader or runtime API is needed.
The current native renderer and gpu-cloth do not provide a hair/fur primitive.

Select rope by explicit ranges already verified for the fixture. Sample roots
proportionally to triangle area using a fixed seed and barycentric interpolation.
Keep root UVs along each strand, and orient outward-facing tapered tubes using
the surface normal. Most strands sweep briefly along the surface; sparse longer
ends lift and curl. Fibres use a matte, zero-coat colour-only material because
baked creases and occlusion describe the packed rope core, not suspended strands.

Validate finite input arrays and disjoint triangle ranges before allocation.
Accept at most 600,000 input vertices, 256 ranges and 2,000 fibres. Four segments
with three sides produce 21 triangles per fibre; the tip uses one triangle per
side, avoiding degenerate duplicate faces. Generate once at load, then retain
the same geometry through camera changes, finish edits and comparison toggles.

## Alternatives and limits

A texture-only change cannot alter the silhouette. Shell fur needs alpha/depth
handling and a larger overdraw budget. A dedicated hair-scattering pipeline is
unnecessary for this static prop refinement. Triangle fibres remain bounded and
small in screen space, but are not a general fur simulator or a physically
complete hair BRDF. Source-demo helpers do not enter the package public API.

The reviewed mesh and images stay unchanged. The local preview adds labelled
fibre on/off and left/right detail views. Default placement is repeatable; no
wind animation, camera-dependent reseeding or extra frame loop is introduced.

## Validation and delivery

Requirements-first tests cover root isolation, area weighting, determinism,
immutability, range/budget rejection, degenerate triangles, finite unit normals,
outward winding, curve/taper, and material isolation from coat/core occlusion.
Require actual WebGPU on/off and both-side inspection, existing varnish controls,
changed-source LCOV, local gates and exact-head CI. Keep publication and site
adoption on the approved CD route; this local fixture does not deploy itself.
