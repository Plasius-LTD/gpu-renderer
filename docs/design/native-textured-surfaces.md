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

## Review refinement: varnished wood (2026-10-05)

The user identified reflection appearing at the wood-colour level. Add an opt-in
clearcoat following the layered dielectric model in
[KHR_materials_clearcoat](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_clearcoat).
Use independent `clearcoat` strength and `clearcoatRoughness` in [0,1]. A zero
strength preserves old callers. The coat uses the geometric normal, independently
of the base's grain normal, and neutral dielectric Fresnel; attenuate the base
radiance by the coating's reflected fraction rather than adding unconstrained
brightness. Apply it consistently to direct light and environment reflection.
No clearcoat texture or separate clearcoat normal map is claimed by this slice.

Tests must reject invalid coat parameters, check defaults and uploaded uniforms,
and preserve the existing old-call tests. Verify actual browser views at multiple
angles with coat enabled/disabled, without errors. The preview also needs the
already tracked glTF omission fix in gpu-shared#131; read its existing local source
for visual qualification, but require its published release for site consumption.
Do not duplicate or modify that separately owned loader fix.

## Review refinement: selective worn varnish (2026-10-07)

The coat currently blankets the crate body's ropes and stays uniform across worn
wood. Extend Task #230 with optional `clearcoatMap`: linear RGBA8, R multiplies
coat coverage and G multiplies coat roughness. A white fallback preserves existing
scalar callers. Reuse material validation, mip generation, lifetime and source-byte
budgets. Both main and reflected surfaces sample the same UV-bound map; no moving
world-space noise, base-colour tint or shader guesses about material identity.

For the Wooden Crate 01 review fixture, use explicitly authored triangle ranges
verified against the downloaded model topology to split wood, rope and hardware.
Rope and hardware receive a material with zero coat, even when sampling distant
mips. Generate only the wood finish map from the source roughness detail plus
stable, broad UV variation: rubbed/scuffed areas lose coverage and gain roughness.
Expose a wear control with pristine and worn endpoints, keeping strength and wear
independent. Preserve source assets and record the selection/provenance; keep
asset-specific authoring out of the renderer runtime.

Acceptance defined before implementation: test map validation/budget/linear mips,
white fallback, actual binding in both passes, resource cleanup, and old callers;
test explicit uncoated rope/hardware ranges, fail closed on different topology,
bounded deterministic wood masks and meaningful wear variation. Visually inspect
several angles, wear extremes and coat on/off in the actual WebGPU preview. Retain
screenshot and browser-error evidence. Update README, Unreleased, ADR and asset
review. Continue existing Feature #1170 / Story #2272 / flag and capability; this
is a refinement of the pending package PR, with CI required before release.

## Review refinement: rope fibres (2026-10-07)

Task #230 also covers a subtle frayed silhouette on the chest's rope. Existing
gpu-renderer native triangles and gpu-shared loading are sufficient; the current
native renderer and gpu-cloth do not supply a hair/fur primitive. Use a source-demo
authoring helper to generate short, curved, tapered fibre geometry only on the
explicit rope ranges. Keep asset interpretation outside renderer/shader APIs.
This is dry rope fuzz, not animated fur, transparency shells or a full hair BRDF.

Sample roots deterministically in proportion to triangle area, including root UVs
and normals. The same stable seed retains strands across camera moves and finish
changes. Most strands should hug the rope, with sparse longer curled ends. Use
a matte, zero-clearcoat colour-only material; omit core occlusion/normal creases
from exposed fibres while inheriting atlas colour. Never grow
fibres on wood, fittings or ground. Native multisampling and existing depth,
lighting, shadows/reflection paths render the additional triangles normally.

Bound inputs at the existing 600,000-vertex ceiling and additional output at 2,000
fibres, with four segments and three radial sides per fibre. Generate once at
load, not per frame; no network dependency, runtime simulation or asset edits.
The review UI offers a labelled keyboard-accessible fibre toggle and both rope
detail views. Keep the
default subtle and inspect both rope silhouettes and lit fibres at close range.

Tests first: reject malformed/nonfinite/out-of-bounds inputs and overlapping
ranges; skip degenerate triangles; area-weighted roots stay on selected ranges;
determinism/source immutability; bounded output, finite unit normals and root UVs;
tapered curved tips; no fibres at zero density. Actual WebGPU on/off and angle
comparison must show attached fraying without a shaggy halo or errors. Update
the README, Unreleased and asset review; retain screenshot evidence and the
existing Feature/Story/flag. Package CI remains required before delivery.
