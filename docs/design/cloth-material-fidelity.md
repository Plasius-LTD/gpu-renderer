# Cloth material fidelity: texture transforms, sheen and reconstruction

Parent Epic site#2113 / Feature site#2114; follows material Story site#2256.
Tracked Story site#2268; renderer Task #224 and gpu-shared Task #135.
The user approved correcting all three diagnosed losses, not increasing samples.

## Evidence and ownership

The supplied velvet has a 512-square colour map repeated seven times, a
1024-square normal map repeated twice, UV1 occlusion, and sheen roughness 0.8.
gpu-shared currently resamples transformed pixels at unchanged dimensions.
gpu-renderer drops flattened sheen roughness and has no layered sheen BSDF.
Its cloth denoiser uses geometric rather than mapped normals and keeps a 25%
smoothing floor even at high counts. Raw 4K/256-centre detail remains subdued.

Reuse shared glTF decoding/mesh forwarding; renderer material atlas, reflected
geometry, common BSDF/PDF/MIS and guided filter. No new dependencies or Three.js.
Three.js is prohibited in source, graph and artifacts, including rollback.

## Staged implementation

1. Preserve original decoded pixels; carry validated per-texture transform and
   wrap metadata. Select UV0/UV1, apply scale/rotation/offset, then wrap and atlas
   addressing on GPU. Transform normal-map tangent coordinates without wrapping.
   Use a bounded per-material metadata texture, not per-ray/per-pixel transforms
   or enlarged geometry records. Identity inputs retain the old path. Reject
   invalid transforms; do not silently fall back to lossy baked textures.
2. Preserve sheen roughness through flattened and nested contracts, including
   alpha-channel roughness and linearised sheen colour textures. Implement the
   Charlie distribution with integrated Smith visibility and bounded energy layering; use a matching
   full-support proposal and evaluate the same total BSDF in direct and bounced
   paths. Zero-sheen and disabled behavior remain unchanged. Qualify numerical
   hemispherical energy, finite grazing behavior and physical WGSL execution.
3. Preserve mapped-normal cloth structure during spatial reconstruction. Keep
   colour demodulation and geometry/material protection; remove compulsory
   high-SPP smoothing. Test actual normal-driven signal independently from random
   noise, not only checkerboard albedo. Keep raw HDR untouched and flag-off free
   of reconstruction resources. Retain or improve existing noise/edge thresholds.

Parent flags renderer.sampling.adaptivePerPixel.enabled and
gpu-demo.scene-fidelity.enabled remain off. Add an independent default-off
renderer.materials.sheen.enabled snapshot gate for the new material lobe.
Guided reconstruction retains renderer.denoise.guidedSpatial.enabled. Texture
correctness applies to fixed/adaptive alike; rollback is a coordinated GPU-native
release, never an old consumer silently dropping transforms.

## Acceptance and qualification

Tests first: byte-identical source texture retention, independent transforms on
17 slots, UV overrides, rotation/negative scale/wrap, tangent orientation,
CPU/GPU geometry parity and reflected bindings; sheen value/channel transfer,
zero/disabled equivalence, energy/PDF consistency; clean normal-map detail,
constant HDR, noisy cloth RMSE, edges/protected pixels and count validation.
Run unit/integration/assembled WGSL/physical WebGPU before the native room capture.
Native 4K retains the sofa-centred scene, 1.5 m proportions, six bounces and
current ratios; isolate changed paths with same-frame raw/clean controls and
retained sources/counts/timings/memory/errors. A small analytic probe is not
native-resolution performance evidence. No speedup/convergence/publication claim.

Full tests, >=80% coverage and changed-source LCOV, lint/types/build/package,
Zero-Three/audit and exact-head CI are required. Update public types, README,
Unreleased CHANGELOG and ADRs in both changed packages. Private model/capture
bytes remain local. No package publish, main merge or CD bypass is authorized.
