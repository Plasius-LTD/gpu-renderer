# Restore fast fixed-pattern development lane and isolate lighting bias

Tasks renderer#169 / lighting#87; Stories site#2119/#2125; Feature site#2114.
User rejects stable-pattern as the working direction because visible tier artifacts
remain and like-for-like native4K time doubled. This supersedes the earlier
choice of stable-pattern as primary experimental lane, not retained evidence.

## Scope and rollout
Restore fixed-pattern as the default on the native six-bounce local reference UI.
Keep stable-pattern explicitly selectable as a comparison. Reuse existing flags
renderer.sampling.fixedPattern.enabled and renderer.sampling.stablePattern.enabled;
they remain mutually exclusive and production-default false. No production
remote configuration, site release, public API, transport, exposure, colour
transform, PDF/MIS, normalization, camera, model, depth, resolution or budgets change.
No destructive Git reversion, deleting experiments, rewriting old receipts,
local publishing, or Three.js fallback. Three.js is permanently prohibited.

## Acceptance before implementation
- Tests first: default fast selection, explicit stable selection, invalid selection,
  sampler-specific artifact names, settings/receipt/frame agreement, and clear
  warnings that both candidates remain unqualified. No stale completed image
  can be labelled as the newly selected sampler.
- Reuse native runner, original Eames loader and GPU parity probes. Lock selection
  during Run, allow cancellation and restart; normal controls must show the
  selected sampler and known defects. Preserve 3840x2160, depth6, mean5.95, denoise off.
- Physical capture: correct source/admission, exact completed counts, sampler
  parity and repeated HDR hash; immutable source/asset hashes and saved PNG/HDR.
  Keep diagnostics separate from qualified timings. No new performance claim.
- Add characterization coverage for the fixed sampler's cross-event correlation:
  emitter selection vs surface U, lobe selection vs hemisphere U, light-class
  selection vs environment U. Check at32 and1024 samples. Marginal uniformity
  alone is not sufficient; report joint occupancy without relaxing prior gates.
- Investigate existing sampling/lighting ownership and propose targeted,
  independently flagged follow-up experiments. Do not introduce a new sampler
  or colour compensation before an explicit design and causal comparison.
- Tests/coverage/changed-source LCOV, lint/type/build/package/dependency/Zero-Three,
  README/Unreleased CHANGELOG, design/evidence updates, push and CI remain required.

## QA inventory
Initial view: fast selected, known defects explicit, hidden preview and usable controls.
Switch stable then back: labels and warnings match; old preview/download clear.
Run: choice/run disabled, progress includes sampler; Stop/restart supported.
Final: native image and receipt identify actual sampler, full counts and repeat hash.
Negative cases: invalid sampler and mismatched frame rejected; interrupted run
cannot be retained as success. Inspect desktop and narrow layout, no overflow.
Browser testing uses supported in-app controls if the skill runtime is unavailable.

## Risks and bounded claims
The restored fast path has known brightness bias, structured errors and tier
boundaries; restoring it is a development choice, not accuracy qualification.
Shader code and allocations are unchanged. A local UI switch adds no GPU work.
Changes in cross-event correlation may change rays and GPU coherence: speed and
quality must both be measured; no assumed speed recovery.
Whole-ring energy means can hide local bias/variance. Future correction must pass
local contrast/colour, boundary visibility, silhouette and noise checks against
a convergence-qualified reference, in addition to energy and matched-quality time.

