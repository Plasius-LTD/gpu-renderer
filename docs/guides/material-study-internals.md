# Material study implementation notes

These notes describe the supplied crate fixture and its internal helpers. They
are not an API for general-purpose ageing or camera integration.

## Material ageing internals

[material-ageing.js](https://github.com/Plasius-LTD/gpu-shared/tree/main/src/material-study-helpers/material-ageing.js) validates and freezes a serializable
version-1 profile. [native-crate-ageing.js](https://github.com/Plasius-LTD/gpu-shared/tree/main/src/material-study-helpers/native-crate-ageing.js) applies it
through the existing coating/fibre helpers:

The internal `createCrateAgeing` helper is not exported by the published
material-study entry. To mount the supplied fixture, use the public
`createMaterialStudy` API described in the [shared material-study guide](https://github.com/Plasius-LTD/gpu-shared/blob/main/docs/guides/material-study.md).

Those values are also the review defaults. `varnishWear` is independent visual
intensity, not coating area removed or elapsed years. Broad scuff patches expose
wood while sheltered areas retain coating at intermediate wear. Above 70%, the
remaining islands smoothly erode; at 100%, every coverage texel and the scalar
coat strength are zero, matching varnish disabled. The original wood maps remain
unchanged, including their ordinary substrate light response. `seed` controls fibre placement and
loose-end selection; varnish uses its existing stable UV pattern. The crate adapter
uses a 4.5 mm fibre length scale and 0.16 mm root radius, with a 4,000-fibre budget;
loose ends are 1.3–2 times the length scale and taper to a point. Source images and
geometry remain unchanged; rope, added fibres and metal never acquire clearcoat.

Generate/copy geometry only when the fray channel changes; rebuild finish maps
only when coating settings change. Camera movement reuses both. The caller still
owns verified asset ranges, GPU resources and disposal. The local review includes
fresh/aged presets, fibre/coat toggles and both handle-detail views.

This is a tested source-demo wrapper, not a newly published package or a complete
damage simulator. [ADR-0034](../adrs/adr-0034-material-ageing-profile.md) records
the proposed `@plasius/material-ageing` boundary after a second asset establishes
the shared contract. Production adoption retains `gpu-demo.scene-fidelity.enabled`
and the existing GPU route capability; disabling the feature selects the existing
site fallback. No package publication or site deployment is implied by this study.


For structured nap, `createRopeFibres` accepts optional `guides`: at most eight
polylines of 2–65 finite 3D points, in the same metre-scale coordinates as the
input geometry. The nearest guide is projected onto the surface and given a
consistent helical lay. Without a usable projected guide, a finite tangent
fallback is used. Four nearby roots form a tuft within 1 mm of its anchor, with
small angular variation, shallow lift and tapered tips. Sampling remains stable
when fray changes; changing guides reauthors the groom.

[native-crate-groom.js](https://github.com/Plasius-LTD/gpu-shared/tree/main/src/material-study-helpers/native-crate-groom.js) supplies the hash-verified
fixture's loop/knot paths. Pass the same `heightOffset` used to ground its vertices
(default 0 means unmodified asset coordinates); other transforms require matching
transformed guide coordinates. The crate adapter adds 84,000 triangles: 90,578
triangles / 271,734 vertices total, within the native default budget. Its final
fibre arrays occupy 14,112,000 bytes. This deliberate denser nap replaces the
previous 1,600-strand loose-end study. See [ADR-0035](../adrs/adr-0035-groomed-rope-and-bare-coat-endpoint.md).


### In-scene material inspection camera

The shared [native-demo-camera.js](https://github.com/Plasius-LTD/gpu-shared/tree/main/src/material-study-helpers/native-demo-camera.js) adapter uses
released `@plasius/gpu-camera` state/control/projection APIs and the separate
`@plasius/gpu-camera-controls` pointer gesture runtime/browser normalizer. It maps DOM input to
orbit, camera-plane truck/pedestal, pan/tilt, dolly and optical zoom; camera math
is not duplicated in the renderer. The camera and fixture adapters now belong to the isolated gpu-shared material-study
entry; the renderer root does not load them.

`createNativeDemoCamera` is an internal adapter, not a published export.
The public `createMaterialStudy` and `createModelInspection` runtimes own its
setup and teardown. Hosts provide a focusable, labelled canvas and persistent
accessible camera instructions through those public entry points.

The material review uses direct manipulation with no persistent camera toolbar.
The optional `onHintChange` callback shows a brief example on canvas focus and
hides it after five seconds, on blur, Escape or disposal. Refocus or `?` replays
it; replay replaces the prior timer. The host owns visual presentation: show
mouse/touch or keyboard examples, preserve a screen-reader description without a
time limit, and respect reduced motion. Do not move the camera to demonstrate a
gesture or let the example intercept input. Keep material controls below the scene.

| Input | Camera action |
| --- | --- |
| Left-drag / one finger | Orbit, with the grabbed surface following the drag on both axes |
| Right/middle/Shift-drag | Truck / pedestal across the current view |
| Alt-drag | Pan / tilt in place |
| Scroll / touch pinch | Move closer or farther (dolly) |
| Shift-scroll | Change the lens (optical zoom) |
| Two fingers moving together | Truck / pedestal |
| Arrows / Shift-arrows | Selected keyboard mode / truck |
| 1–5 | Select orbit, truck, pan, dolly or lens zoom for keyboard arrows |
| +/− | Dolly (lens zoom in keyboard zoom mode) |
| Home | Reset view |
| ? / Escape | Replay / dismiss the brief guide |

Vertical orbit follows the grab direction for mouse, one-finger touch and keyboard
arrows. The adapter maps single-pointer orbit through gpu-camera; the shared
gesture runtime retains original pointer coordinates for multi-pointer truck/pinch
and stable transitions. Keyboard mode selection does not change mouse or touch gestures. The source-only
`setMode`, `getMode`, `move` and `reset` methods remain available to host code.
Browser Ctrl/Meta/Alt key shortcuts and keys outside the canvas are left alone.
Wheel input only belongs to a focused canvas; the surrounding page remains
scrollable. No inertia or animation loop is introduced. Distances, lens and travel
are bounded; pointer cancellation/blur/disposal release captures and listeners.
This is an inspection camera without scene collision detection or object picking.

Native material normal-map degeneracy checks now use normalized screen-space
position/UV gradients. Valid tiny derivatives in rope macro views no longer disable
normal maps. Mirrored UV handedness and geometric-normal fallback for degenerate
UVs are retained in the common direct/reflection shader. The shader contract tests
require browser rendering evidence as well; Node mocks do not execute WGSL.
See [ADR-0036](../adrs/adr-0036-in-scene-material-inspection.md).

### Shared material-study runtime

The public material study is provided by `@plasius/gpu-shared/material-study`; its fixture helpers and their regression tests are internal to that package. The renderer exposes `validateNativeSurfaceMaterials(materials)` so authoring and GPU creation use identical validation without allocation. See [ADR-0037](../adrs/adr-0037-shared-material-study-runtime.md).
