# Rough cloth reconstruction

Historical Task #222 design. Task #224 / ADR 0053 supersedes geometric-only
cloth guides with mapped normals and removes the compulsory high-SPP smoothing
floor. Independent default-off sheen is now implemented; see the
[current material-fidelity design](cloth-material-fidelity.md). The evidence
below describes the earlier stage, not current implementation guidance.

Owning task: Plasius-LTD/gpu-renderer#222.

Parent Epic: Plasius-LTD/plasius-ltd-site#2113; Feature #2114; Story #2256.
Depends on renderer #218 and #221. Existing default-off remote snapshot flag:
`renderer.denoise.guidedSpatial.enabled`; exposure remains
`gpu-demo.scene-fidelity.enabled`. No new entitlement or rollout is introduced.

## Problem and repository evidence

At renderer 4aebe8bc4522d0d9bb53b5c192b9268948621dfd, the guide capture
explicitly excludes every nonzero sheen colour. The room's rough, opaque,
nonmetallic velvet consequently receives no guided reconstruction, including
in the low-SPP peripheral region. The supplied comparison is from different
lighting/camera/software and is a visual target, not matched convergence truth.

Reuse the renderer-owned GPU guided filter, not CPU image processing or a new
denoising dependency. This task addresses stochastic grain, not a complete
KHR_materials_sheen implementation: the current transport lacks a separate
Charlie lobe/energy-compensated layering and ignores authored sheen roughness
in its BSDF. Texture minification also remains a separate qualification gap.
Do not hide those limitations or change transport merely to match a screenshot.

## Approach and scope

- Admit rough (base roughness >= 0.7), opaque, uncoated, nonmetallic sheen
  surfaces into a separate guide class. Keep smooth, metallic, emissive,
  transmission, transparent and background surfaces protected. Revisit sheen
  eligibility when a true independently sharp sheen lobe is implemented.
- For cloth only, guide with geometric normals so normal-map microfibres do
  not veto all neighbouring samples. Preserve normal/depth boundaries and
  prohibit mixing cloth and ordinary diffuse guide classes.
- Filter a bounded albedo-demodulated signal and remodulate each output with
  that pixel's original colour, preserving colour texture rather than blurring
  it. Floor the divisor at 0.1 to avoid unstable dark-channel amplification.
  This filters total radiance, not separated diffuse/specular lobes, so remains
  a biased presentation approximation. Geometry/shadow details below the
  kernel footprint can soften; raw HDR must remain available unchanged.
- Keep existing three passes, buffers, ABI sizes, count validation and raw
  resolve. No rays, extra samples, bounce changes, history, exposure changes,
  CPU pixel work, or extra full-frame allocation. Ordinary diffuse path remains
  unchanged. Turning the existing flag off retains raw GPU-native rendering.
- Three.js is prohibited in source, graph and artifacts and cannot be a fallback.

## Frozen acceptance and tests

Tests precede implementation. Unit/assembled-WGSL tests cover class eligibility,
class boundaries, bounded colour compensation, unchanged ordinary filtering,
flag-off resources and ABI. A physical synthetic probe must execute production
capture and filter, preserve protected pixels, constant HDR and alternating
cloth texture (<= 0.5% relative error), reduce noisy cloth RMSE below 65% of
input error, and preserve invalid/incomplete-count handling and edges. Include
black/saturated channels and micro-normal discontinuities.

Retain same-scene native 1080p and 4K, six bounces, existing adaptive tiering,
stable pattern and splitting settings. Confirm raw HDR hashes/counts/rays stay
unchanged; retain filtered images/HDR, source provenance, timings, allocations,
errors and cleanup. Compare a preselected upholstery ROI and seams. Difference
from noisy input is not error from converged truth. No quality/performance or
white-paper success claim without matched converged references.

Run full tests/coverage (changed source in LCOV), typecheck, lint, build,
package/dependency/zero-Three gates and exact-head post-push CI. Update README,
Unreleased CHANGELOG and ADR. Keep experimental and in review until acceptance;
no local publishing, main merge or CD bypass. Record residual sheen/material
limitations separately. Rollback is the guided flag off, never a legacy renderer.

## Browser QA inventory

- Render the unchanged room at native 1080p and 4K; inspect upholstery texture,
  seams/buttons, silhouette, wood legs, spacesuit and reflective visor.
- Cycle Show raw input / Show cleaned result / raw / cleaned on one capture;
  verify reversible view, retained evidence, unchanged count and transport hashes.
- Check resolution/sampler/splitting/denoise settings, busy control locking and
  final status. Inspect page at current window size without horizontal clipping.
- Explore cancellation/retry and invalid settings without leaving stale images
  presented as a successful new capture. No new controls or layout are introduced.
- Synthetic probes exercise black channels, invalid/incomplete pixels, sharp
  boundaries and protected material combinations independently of visual review.
