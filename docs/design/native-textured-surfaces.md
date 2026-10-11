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

## Review refinement: controlled material ageing (2026-10-07)

Extend Task #230 under the same Feature, Story and rollout flag. The next review
uses 30% rope fraying and 90% varnish wear. Fraying means the fraction of generated
fibres promoted to longer curled loose ends, rounded to the nearest whole fibre;
it does not measure lost rope strength or elapsed time. Keep short fuzz at 0%.
Varnish wear is an independent artistic intensity, not percentage area removed.

Introduce a renderer-independent, immutable version-1 ageing profile with bounded
`ropeFray`, `varnishWear` and uint32 `seed`. A source-demo crate adapter translates
that profile into the existing finish maps and bounded rope geometry. Keep source
assets, topology ranges and renderer lifecycle outside the profile. The prototype
does not justify creating/publishing another package yet (ADR-0034).

Derive requirements-first tests for exact loose-end counts at 0/30/100%, nested
selection and unchanged roots/UVs as fray increases, deterministic immutable
profiles, independent channels, invalid-input rejection and geometry budgets.
Use a fixed random draw count per fibre so moving the fray slider cannot scatter
the roots. Loose ends must remain tapered, curved, outward-facing and matte.

The local review has labelled fray/wear controls, fresh/aged comparison presets,
and both rope-detail cameras. Regenerate only the channel edited, never on camera
movement or every frame. Verify actual WebGPU at the target, endpoints and toggles;
retain the source asset hashes, no additional dependencies/network requests, and
the existing renderer resource limits. Update README, Unreleased, provenance,
changed-source LCOV and exact-head CI before calling the review ready.

## Review correction: bare endpoint and groomed nap (2026-10-07)

User review rejected remaining coat at 100% wear and random hay-like rope strands.
Task #230 now requires 100% wear to match varnish disabled, including at grazing
angles. Make coverage monotonically vanish everywhere by that endpoint, retaining
spatially staggered wear between endpoints. Do not alter the wood's source maps
or remove its ordinary substrate response to disguise a coating bug.

Replace random azimuths with coherent guide-driven rope nap and clustered roots.
The fixture supplies explicit loop/knot centreline guides outside the renderer;
the generic helper projects the closest guide direction into the surface tangent
plane and adds a consistent helical lay. Use four nearby roots per tuft, fine
tapered fibres, limited angular jitter and low lift. Keep exact nested fray counts
and stable roots when wear changes. Shorten the fixture length scale to 4.5 mm
and root radius to 0.16 mm. Raise the explicit fibre ceiling to 4,000: 252,000 added
vertices, 90,578 total triangles with this crate, below the unchanged native
300,000-vertex default. This is a deliberate denser nap, not an unbounded fur pass.

Tests first: all coating texels/scalar are zero at 1, exact off equivalence,
monotonic coverage, intermediate variation; guide validation, aligned directions,
cluster radius, shorter low-lift curves, finite fallback, bounds, outward winding,
determinism and preserved channel independence. Verify actual WebGPU endpoint/off
comparison, both handles at 30/100% fray, keyboard controls and browser errors.
Update README, Unreleased, provenance and changed-source LCOV; push and verify CI.

Tests first: reject malformed/nonfinite/out-of-bounds inputs and overlapping
ranges; skip degenerate triangles; area-weighted roots stay on selected ranges;
determinism/source immutability; bounded output, finite unit normals and root UVs;
tapered curved tips; no fibres at zero density. Actual WebGPU on/off and angle
comparison must show attached fraying without a shaggy halo or errors. Update
the README, Unreleased and asset review; retain screenshot evidence and the
existing Feature/Story/flag. Package CI remains required before delivery.

## Review correction: in-scene camera and visible rope (2026-10-11)

Continue Task #230 / Feature #1170 / Story #2272 and its existing rollout flag.
Replace the local angle slider and fixed-view selector with a canvas-bound camera
adapter using the released `@plasius/gpu-camera` controls and manager. The adapter
owns input mapping only: orbit, camera-plane truck/pedestal, pan/tilt, dolly and
optical zoom. Provide explicit in-scene modes, keyboard equivalents, touch drag,
two-finger truck/pinch, and a reset. Keep browser/page shortcuts outside the
focused scene, release pointer capture on cancellation/disposal, clamp movement,
and preserve the camera across material rebuilds. Render on changes only.

Tests first cover camera-space translation, distinct optical zoom versus dolly,
shared-runtime bounds, focus/modifier handling, touch transitions, cancellation,
listener cleanup and no stale callbacks after disposal. Browser validation covers
pointer, keyboard, reset and material changes without resetting the view. The rope
review additionally compares visible attached fibres at 0/30/100% from multiple
angles, with a regression for any diagnosed geometry/material failure. Do not
claim visual acceptance simply from passing numerical fibre tests.

### Diagnosed normal-map failure

The shader compared squared tangent derivatives with an absolute `1e-8` cutoff.
At a rope close-up, a valid 0.1 mm position derivative times a 0.001 UV derivative
has squared length `1e-14` and is rejected. Thus enlarging the asset suppresses
normal-map detail. Normalize position and UV gradients independently before
checking the relative determinant/basis lengths. Preserve mirrored UV handedness,
neutral-map behavior and a geometric-normal fallback for truly degenerate UVs.
Validate a small-scale numeric fixture against the former cutoff and render the
same rope/lens with and without the fix; apply to the common main/reflection
shader. Shader coverage remains the documented exception; import it in regression
tests so the changed source is still present in LCOV.

The separate released `@plasius/gpu-camera-controls` 0.1.1 also provides gesture
recognition. Reuse it for pointer orbit and multi-pointer truck/pinch, with damping
zero for a static demand-rendered inspector. The browser subpath's generic bindings
are designed for continuous game controls, lack focus/modifier filtering and do not
expose inspection tool selection. Keep a small canvas-scoped DOM adapter for those
host requirements, using the browser event normalizer and shared gesture runtime;
do not duplicate centroid/pinch logic. Add the package as a demo-only development
dependency so the published renderer runtime/bundle is unchanged.

The demo dependency installation exposed existing development-tool audit findings
in brace-expansion 5.0.9 (GHSA-q2hr-2g5m-vwhr, GHSA-qhr7-859c-m2p7 and
GHSA-6j4f-fj2g-mc7p). As required scoped dependency hygiene, update the existing
exact override to patched 5.0.12 and regenerate only its lock entry. Verify full
and runtime audits and rerun test/build/package gates; do not bypass audits.

## Focus gesture guide refinement (2026-10-11)

The user requests direct manipulation with no persistent camera toolbar. Keep
material-ageing controls separate. On canvas focus show a non-interactive gesture
example for five seconds; hide on blur, Escape or disposal, replay on refocus or
`?`. A permanent screen-reader description supplies the same instructions without
a reading-time limit. No automatic camera movement, looping illustration or
motion-dependent information; respect reduced-motion preferences.

Mouse left-drag and one-finger touch always orbit, independent of keyboard mode.
Right/middle/Shift-drag trucks, Alt-drag pans/tilts; focused wheel dollies and
Shift-wheel changes the lens. Shared two-pointer truck/pinch stays unchanged.
Keep keyboard modes/arrows, Shift-arrows, +/− and Home reset. The source-only input
adapter owns the optional hint visibility callback and one cancellable timer;
the host owns accessible markup and presentation. This refines ADR-0036's host UI
without changing the shared camera/runtime boundary or published package API.

Tests first cover five-second expiry, focus replay, Escape/blur/disposal cleanup,
no unsolicited initial hint, stable pointer mapping after keyboard-mode selection,
modifier movement and shared touch transitions. Verify the actual WebGPU preview,
320px layout and accessible instructions, then docs, coverage and exact-head CI.
