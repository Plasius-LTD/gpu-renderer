# Authored materials for native showcase surfaces

Parent Feature: Plasius-LTD/plasius-ltd-site#1170. Parent Story: #2272.
Rollout flag: `gpu-demo.scene-fidelity.enabled`; existing route capability unchanged.

The user selected cinematic realism: natural materials, convincing light and water,
and believable movement. The first native pass provides geometry and lighting,
but colour-only procedural surfaces cannot preserve an authored asset's detail.

## Boundary and reuse

Extend `createNativeSceneRenderer` additively. Keep the existing twelve-float
vertices and add optional UV coordinates plus bounded, contiguous triangle draw
ranges referring to initialization-time materials. Existing callers need no change.
Use the decoded RGBA image shape already supplied by `@plasius/gpu-shared`'s glTF
loader; do not add another network/image loader, renderer framework or scene format.

Materials supply optional base-colour (sRGB), tangent-space normal (linear), and
occlusion/roughness/metalness (linear RGB) maps. Upload once, build a complete mip
chain, use filtered repeated sampling, and dispose all owned textures on teardown
or failed initialization. White/flat default maps preserve untextured callers.
The shadow pass draws all geometry; main and reflection passes draw the same UVs
and materials. Tangent frames use screen derivatives with a safe degenerate-UV
fallback. Opaque surfaces only in this slice; no false transparency/skinning claims.

## Limits and tests defined before implementation

- At most 16 materials, 1–2048 power-of-two texture dimensions, and 64 MiB total
  source texture bytes per renderer. Validate before device allocation.
- At most 256 draw ranges, covering the entire triangle list exactly once; reject
  missing/non-finite UVs, invalid material references and incomplete/overlapping
  ranges before any frame is submitted.
- Unit tests verify linear-light colour mip filtering, linear data maps, default
  maps, actual material bindings in both colour passes, unchanged old call shape,
  allocation reuse, cleanup and rejection paths. Every changed JS source in LCOV.
- Actual WebGPU render of a textured CC0 model must prove compile/draw success,
  visible detail, correct orientation and no browser errors. Retain a screenshot.
- Keep the renderer lazy loaded. Asset download/decoding remains caller owned.

## Asset provenance and delivery

Prefer CC0 assets whose publishers explicitly permit commercial use and raw-file
redistribution, because the demonstration is hosted on Plasius's company website.
Record original URLs, authors, licence, checksums and conversion steps. Use bounded
web assets; million-polygon source scans need a separate reviewed optimization pass.
Do not claim any stock asset is Project Harmony game art or approved original canon.

Renderer package validation and approved CI/CD precede consuming its published
version in gpu-shared, followed by the normal site CI/CD. The existing flag is the
rollback control. This remains a staged step toward the visual target; Animation
Adventure's textured skinning and Product Studio's material work remain open.

## Local evidence (2026-10-05)

The CC0 Wooden Crate 01 fixture rendered in the actual in-app WebGPU browser,
with and without maps, at 1440 × 571; 6,578 submitted triangles including ground.
No browser errors or warnings were recorded. The existing untextured Shoreline
scene also rendered water, geometry, shadows and reflections with the new pipeline
layout and paused correctly. See the [asset review](cc0-demo-asset-review.md).
These are local checks; remote CI/CD and downstream publication are still required.
