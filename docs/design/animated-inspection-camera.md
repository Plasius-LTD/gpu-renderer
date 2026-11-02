# Animated scene inspection camera

Story: Plasius-LTD/plasius-ltd-site#2357; Task #272; Feature
Plasius-LTD/plasius-ltd-site#1170. Consumers compose the existing
`gpu-demo.scene-fidelity.enabled` flag and `site.studio-coming-soon.view` capability.

Add `setInspectionCamera(pose | null)` to the canvas animation renderer. A pose
contains position, target and vertical field of view. Build view and projection
matrices with `@plasius/gpu-camera`, once per frame; use them for environment
anchors and each skinned vertex. Retain the existing follow rig and timeline
while inspection is active; null returns to follow without restarting animation.
This is an additive opt-in API; unchanged consumers keep their current projection.

Reject malformed, degenerate or non-finite poses before changing state. Inputs
are copied, snapshots are copied, and destroyed renderers cannot resume drawing.
The renderer owns projection, while `gpu-shared` owns DOM gestures and focus hints.
Do not enable the separate unconfigured professional-animation path as part of
this work. Existing sampling and asset limits remain unchanged.

Tests must verify projected image coordinates for orbit, truck, pan, dolly and
lens zoom, clipping of behind-camera geometry, reset to follow, stationary
animation time while changing views, and lifecycle disposal. Run package CI,
coverage (including every changed source), public contract, build and security
gates before the approved main CD release. Qualify the actual consumer image.

## Playback lifecycle qualification

The workspace needs a real `stop()` method for pause and reduced motion. It must
cancel the scheduled frame without destroying the canvas, retain the displayed
timeline position, and allow inspection-camera redraws while paused. Resuming
rebases the first frame to that position rather than counting paused wall time.
Repeated starts/stops are idempotent; callbacks from an older playback generation
must not render or schedule new work. Explicit `renderOnce` remains available to
manual consumers. Tests must use the actual exported renderer and public types.
