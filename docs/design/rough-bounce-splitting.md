# Bounded rough-bounce splitting experiment

Tasks renderer#169 / lighting#87; Stories site#2119/#2125; Feature site#2114.
User requests additional diffuse bounce samples, tapering with depth, and physical
performance tests. This is a default-off experiment, not production qualification.

## Design frozen before implementation

- Named remote snapshot flag `renderer.sampling.roughBounceSplitting.enabled`.
  Parent adaptive flag remains off in production. Explicit local test controls
  may select the child; no remote configuration is modified.
- `roughBounceSplitting.splitDepth` is 1 (default) or 2: split into two children
  at eligible absolute bounce indices below that depth, then one continuation.
  Thus the schedules are 2/1/1/... or 2/2/1/...; rough splitting alone creates at
  most two or four leaves per camera path. Depth means scene interactions, not
  a count reset at each diffuse surface. Maximum admitted transport depth is 8.
- Initially eligible: non-emissive, opaque non-metal surfaces, roughness >= 0.5,
  no transmission, clearcoat or sheen. Sample the existing complete surface BSDF
  twice rather than discard its specular component. Perfect mirrors, glass and
  rough metals keep the existing transport. Other materials are not claimed.
- Use the existing stable-pattern sampler, or the independent-lighting control
  with the same centre-first camera. Reject fast/legacy sampler combinations.
  Branch lineage participates in every downstream lighting sampling key;
  retain actual pixel/sample identity and camera ordinals for ownership/counts.
- Each child carries half the original BSDF/PDF-weighted throughput. Parent
  direct lighting is evaluated once. Retain the existing MIS partition weights
  and average the two BSDF estimates; sample-count-aware MIS optimization is
  not part of this experiment. No emission, exposure, material, normal or offset
  modification. All siblings complete one camera sample, not multiple SPP.
- Reuse binary PathNode links. Increase only ray queues, hit scratch and path
  nodes by the admitted factor. Separate queue/path stride from geometric tile
  pixel count in specialized shaders; reflected record layouts do not change.
  No new pass, readback or host per-pixel decisions. Fixed/off shader bytes and
  allocations remain unchanged. Default additional-allocation cap is 128 MiB;
  reject over-cap settings before device/resource creation. Queue overflow
  invalidates the frame rather than silently discarding weighted branches.
- Preserve glass sibling lineage too. The queue capacity is a hard bound, not
  a guarantee that arbitrary repeated glass splitting fits; overflow is failure.
  No new radiance history, cache, denoiser, variance stopping or Three.js fallback.

## Requirements-first checks

Unit: flag forms/off/conflicts, schedule bounds, allocation accounting/cap,
sample key separation, 1/2 and 1/4 weighting, diffuse eligibility, identity and
count-once resolve; binary tree/capacity/assembled WGSL reflection and compilation;
disabled-source identity. Cover every changed source in combined LCOV; >=80%
coverage gate remains unchanged. Keep original transport tests intact.

Physical: analytic diffuse constant environment/black/emissive plus original
room/Eames, denoise off, native 1080p minimum and 4K. Compare fast reference,
decorrelated no-split control, depth1 and depth2 independently. Check completed
counts/histograms, rays/segments, no overflow/validation errors/device loss,
cleanup, native PNG/full HDR and source provenance. Use matching camera/SPP/depth
for paired runs; separate one warmup and three rotated timing-only rounds from
diagnostics. Report CPU/job/GPU time where available, allocations and local image
errors. No speedup/quality qualification without a converged reference; sampler
and splitting effects must not be conflated. Cancellation and invalid config
are negative tests. Freeze tolerances before measured captures.

## Delivery

Browser QA inventory: verify depth off/1/2 and return to off; stable sampler
selection, native 1080p/4K selection, benchmark progress/control locking, retained
preview/download/evidence and successful cleanup. Reject fast-plus-splitting;
cancel a run and verify controls recover without accepting partial results.
Reset returns depth to off. Inspect default and completed page screenshots,
readable controls/status, no unintended horizontal clipping, and the native
room image separately. Existing placement/view behavior was tested in the room
reference delivery and is unchanged. No claim of artifact removal or converged
quality may be signed off from these captures alone.

Update README, Unreleased CHANGELOG and ADR; retain controls and failures. Commit,
push, verify CI (explicitly report unavailable runners), never publish locally.
Disable child flag and recreate renderer for unchanged GPU-native rollback.
Three.js is prohibited. Main/CD only applies after approved merge/release.
