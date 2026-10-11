# ADR-0032: Spatial varnish and explicit uncoated surfaces

Status: Accepted for implementation; package release pending.
Date: 2026-10-07.
Feature: plasius-ltd-site#1170; Story #2272; renderer Task #230.
Flag: `gpu-demo.scene-fidelity.enabled`; retain the existing route capability.

## Context

The crate body combines wooden boards, fittings and rope handles in one mesh
and texture atlas. Applying uniform clearcoat to that body varnished the rope
and made the weathered wood look freshly sealed everywhere. Scalar factors alone
cannot describe rubbed or scuffed coating.

## Decision

Extend the optional native material with one decoded linear RGBA8 `clearcoatMap`.
Red multiplies coating strength; green multiplies coating roughness. Blue and
alpha are reserved/ignored. White fallback preserves existing scalar callers.
Use the same UVs and sampler in main and reflection passes. Reuse existing map
validation, mip generation, allocation limits, failure cleanup and disposal.
A finish-only map does not disable procedural base-material detail.

Keep asset interpretation outside the renderer. The source demonstration helper
defines reviewed triangle ranges for wood, rope and hardware. Rope and hardware
receive zero coating strength, avoiding atlas/mip bleed regardless of wear.
Wood's deterministic authoring preset combines source ORM scuff detail and
stable UV patches to vary coverage and roughness. Original geometry and textures
are unchanged. The preview validates the reviewed glTF and binary hashes before
applying topology-dependent ranges; different assets require new authoring.

## Alternatives and limits

Masking only by texture colour would mistake dark timber for rope and produce
filtering bleed. Renderer-side model-name or colour heuristics would couple a
generic library to this fixture. Separate author-defined ranges reuse the
existing surface interface and make the material boundary explicit.

This remains a simple neutral dielectric layer with a smooth geometric normal,
not a full volumetric varnish model. It adds one texture binding per material
and one sample per shaded fragment. Maps remain immutable during a renderer
lifetime; callers recreate the renderer when replacing maps. No new dependency,
loading system, entitlement or public route is introduced.

## Verification and rollout

Tests cover malformed maps, combined budgets, linear mips, defaults, main and
reflection bindings, GPU lifetime, explicit uncoated ranges, deterministic wear,
and unchanged source images. Actual WebGPU qualification exercises fresh/worn
endpoints, coating toggle and camera angles. Require changed-source LCOV,
coverage, types, lint, build, package checks and exact-head CI. Site adoption
uses a released package and the existing scene-fidelity flag; omission of the
map preserves the earlier scalar finish. This local fixture is not a production
rollout or approved Harmony game asset.
