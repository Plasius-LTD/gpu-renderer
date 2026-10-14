# Guided spatial denoise for adaptive room references

## Problem and scope

The native adaptive room lane currently bypasses denoising. The legacy spatial
filter uses global SPP, very weak blending, and a display-oriented HDR clamp.
Low-SPP rough surfaces need stronger spatial reconstruction without modifying
the transport estimator. Reuse renderer-owned WebGPU resources and canonical
surface records; no external denoiser or new dependencies.

Parent: site Feature #2114 / Epic #2113. This is a separately controlled
experimental presentation extension, not evidence that adaptive transport is
converged or real time. Three.js remains prohibited, including any fallback.

## Decision frozen before implementation

- Default-off snapshot flag `renderer.denoise.guidedSpatial.enabled`; inherited
  adaptive parent remains production-off. The host's remote feature evaluator
  supplies this flag. The local reference control is an explicit test override,
  not a production rollout or entitlement. Disable it for raw GPU-native output.
- Record shading normal, log distance, base colour and conservative material
  eligibility from the already computed first camera sample's primary hits.
  One capture dispatch per tile, before shading/queue reuse; no extra rays/BVH
  traversal, CPU pixel processing, radiance history, reprojection or variance
  stopping. Preserve sourcePixelId, not queue slot, for full-frame placement.
- Filter linear HDR with three bounded 5x5 edge-avoiding a-trous passes, steps
  1/2/4, then the existing tone map. Guidance and original input stay immutable.
  Normal/depth/albedo discontinuities limit mixing; ineligible glossy, metallic,
  emissive, transparent and background pixels retain their raw value. This is
  deliberately a rough-surface filter, not a reflection/environment denoiser.
- Use actual completed camera counts for the final blend, not the 32-SPP ceiling
  or number of split children. At low SPP the filter is stronger; preserve more
  raw detail as counts rise. Do not clamp radiance to 16 or adjust exposure.
  Invalid samples remain invalid and cannot be filled from neighbours.
- Guides: rgba16float normal/log-depth (8 bytes/pixel), rgba8unorm
  albedo/eligibility (4). Ping-pong radiance: reuse the existing 8-byte scratch
  texture and add one 8-byte texture. Additional owned storage is 20 bytes/pixel
  plus bounded uniforms, admitted before allocation under a separate default
  192 MiB denoise cap. A caller without reusable scratch needs 28 bytes/pixel
  and the same cap. This is application-visible allocation, not physical VRAM.
- Off creates no additional pipelines, guides or textures and preserves shader
  transport/command order. Failed setup cleans partial allocations. Destroy is
  idempotent. The native adaptive coordinator owns integration; no claimed site
  production activation or replacement of the legacy public boolean denoiser.
- Expose raw/denoised comparison from the same completed input. Retain raw HDR
  independently and GPU-filtered output, native PNGs, counts, source hashes,
  allocation totals, validation failures and dedicated filter GPU/job timing.
  Diagnostic readback is separate from filter timing. Retain the old splitting
  benchmark as denoise-off, never silently change its comparison target.

## Requirements-first acceptance

Unit/integration: flag on/off, admission/cap, resource cleanup/setup failure,
immutable source, constant HDR (including >16), invalid-pixel propagation,
protected materials, geometry/albedo edge rejection, unequal counts, source
pixel ownership, capture ordering and no dispatch after sample zero. Reflect
assembled WGSL records/bindings; physical compilation and execution mandatory.

Physical: native 1080p and 4K room/Eames, stable sampler, six bounces, depth-two
splitting, the existing 5.95 mean-SPP plan. Keep raw counts/energy/hash intact;
compare off/on on the same data. Warm the postprocessor then measure at least
five runs without rerendering paths. Include guide dispatch in render intervals
and report it as additional work, not free. Synthetic known truth probes must
preserve constants within half-float tolerance, keep invalid/protected pixels,
and reduce RMSE on noisy flat diffuse patches without bleeding depth/material
edges. These are correctness probes, not native performance benchmarks.

Noise reduction is not proof of recovered detail. Room screenshots are visual
evidence only until matched converged references, texture-detail retention and
temporal/static qualification pass. Existing transport flaws remain tracked.
No relaxed existing quality thresholds or white-paper performance claims.

README, Unreleased CHANGELOG, ADR, tests/coverage/changed-file LCOV, lint, types,
build/package/Zero-Three and post-push CI are required. No local publish, main
merge or production CD. Browser QA: control lock/reset, raw/filtered same-input
comparison, cancellation, invalid options, desktop/narrow layout and final image.

Reference: [Dammertz et al., HPG 2010](https://diglib.eg.org/handle/10.2312/EGGH.HPG10.067-075).
This implementation adapts the spatial edge-avoiding idea; it is not SVGF and
does not claim the paper's performance or a complete reproduction.
