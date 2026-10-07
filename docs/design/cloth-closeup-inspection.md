# Matched cloth close-up inspection

Parent: site Epic #2113 / Feature #2114 / Story #2268. This diagnostic follows
renderer #224; the corrected material path has not yet qualified fine weave.
Implementation Task: renderer #225, assigned and In Progress before coding.

## Problem and bounded approach

Room-view framing, illumination, texture sampling and reconstruction can each
hide authored detail. More samples alone cannot identify the cause. Reuse the
existing native room composition, canonical first-hit guide capture, GPU texture
reader, native sample-count validation and guided postprocess. No second material
renderer, altered textures, invented fibres, lighting changes or Three.js.

Add fixture-only close-up camera controls derived from the seating model's
source bounds, uniform scale and placement. Distance, elevation and normalized
target are configurable; validate finite ranges and room containment. Preserve
the room camera when inspection is off. Add uniform camera-sample budgets as an
independent alternative to existing radial tiers; record the actual histogram.

Opt-in material views reuse the same completed render's first-camera-sample
guides: linear base colour (including the authored factor, displayed with sRGB
encoding and no lighting/tone mapping), and world-space mapped normals encoded
as 0.5*N+0.5. Guides are single-sample and quantized (RGBA8 albedo / RGBA16 normal);
they are not antialiased ground truth. Normals are available only on denoiser-
eligible surfaces; other pixels must be marked explicitly, never shown as valid.
Do not change the transport or denoiser. Diagnostic display/readback occurs after
timed rendering, does not mutate raw HDR and is excluded from performance claims.

Parent flags remain renderer.sampling.adaptivePerPixel.enabled and
gpu-demo.scene-fidelity.enabled; existing sheen and guided-denoise snapshot flags
remain explicit and independently selectable. These are local test controls, not
a production feature or entitlement. No production flags are changed. Rollback
is disabling inspection / selecting the unchanged room view, always GPU-native.

## Tests and acceptance before implementation

- Unit: camera follows scale, placement/yaw and configurable target; valid bounds,
  unknown/missing model, nonfinite/out-of-range controls and outside-room rejection.
- Unit: radial passthrough, uniform count identity, invalid mode, exact completed
  histogram and total validation. No altered sample ordinals or transport.
- GPU: compile inspection shader; known colour/normal/masked-pixel outputs;
  raw/filtered HDR unchanged by diagnostic presentation; cleanup and validation.
- Browser functional: close-up vs room reset, uniform vs radial, material views
  vs raw/clean, invalid inputs and unsupported guide-off combination; keyboard
  controls, state invalidation, cancellation and evidence labels.
- Visual: genuine 1080p close-up at native pixels, same-frame albedo, normals,
  raw and cleaned; inspect seams and surface microdetail without enlarging a
  low-resolution room crop. Check normal window and narrower control layout.
- Retain commits, private asset hashes, camera, sample histogram, flags, native
  PNGs, HDR, guide hashes, timings, allocation inventory and failures locally.

Private models/images stay uncommitted. Full relevant tests/coverage, types,
lint, build, package, Zero-Three, audit and exact-head CI are required. Update
README and Unreleased CHANGELOG; no new runtime/public API or architecture.
This stage diagnoses detail, not matched-photo equivalence, convergence, speedup
or white-paper qualification. Future photo matching requires an actual photo,
camera calibration, lighting/exposure/colour pipeline and contact-shadow tests.
