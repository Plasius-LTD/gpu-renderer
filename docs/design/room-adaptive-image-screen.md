# Corrected native adaptive image screen

Task renderer#174, Story site#2124, Feature site#2114. The existing parent flag
`renderer.sampling.adaptivePerPixel.enabled` and its children remain default off.
This work prepares read-only admission of the prescribed radial scheduler; it
does not resume adaptive performance measurements before correctness passes.
Three.js is prohibited, including tools, dependencies and rollback.

## Requirements before implementation — 2 November 2026

Reuse the full room runner, retained linear HDR, native convergence verifier,
gpu-lighting radial budgets and image metrics. Do not add a sampler, classifier,
governor, denoiser, renderer allocation, transport change or GPU pass. Do not
interrupt the immutable running 1080p/4K reference capture.

Provide one offline command taking the complete reference summary and one
ordinary production-sampler radial room capture at each native resolution.
First reverify all reference captures, hashes, exact sources, counts and frozen
3% convergence/1% energy screens. Incomplete, failed, stale or partial reference
evidence must prevent candidate admission; no caller-supplied `passed` boolean.
Use the existing 32-SPP reference protocol and lighting-owned circular area
shares; values are protocol inputs, not new renderer constants. Native 1080p
and 4K are mandatory. A successful thumbnail or only one resolution cannot pass.

Require the candidate's source, scene, geometry, camera, original assets, material
maps, lighting, transport and optical policy to match the references. The one
intentional difference is independent frame-indexed transport for reference
uncertainty versus the normal production fixed-pattern transport for a radial
candidate. Record that distinction; do not call production frame-seed metadata
independent replication. Reference-only shader/probe metadata is excluded from
the scene comparison explicitly; no actual scene or transport field is ignored.
Missing preflights, validation/device errors, fallback adapters, hidden captures,
incomplete HDR, failed cleanup, duplicate/missing/reordered tiles, incorrect
actual counts or histogram, and overflow fail closed. Reuse the optical-budget
evidence validator. Per-tile expected primaries come from the existing radial
budget map, not an assumed full-frame average. Shadow/BVH queries are outside
the camera/continuation segment counters.

Compare each radial candidate against both independent 256-SPP references and
compare the corresponding uniform32 baseline to the same reference. Report
global and every actual SPP tier's linear HDR metrics, signed energy drift,
local p95/p99 errors and row attribution. Reuse gpu-lighting `assessQuality` and
its frozen limits, including 1% energy, 1.10 error ratio and 1e-5 slack. Tier
reference uncertainty uses that tier's independent256 pair and the existing
3% screen; do not hide uncertain local references behind a global average.
Failing or uncertain tiers remain red. No threshold changes after seeing data.

Report actual primary/secondary/total segments and primary reduction relative
to uniform32, plus the retained allocation inventory. Clearly separate counters
from time and application-visible allocated bytes from physical residency.
The ordinary uniform reference uses the diagnostic count-resolve path, so this
screen cannot establish disabled-dispatch identity, zero adaptive allocations,
matched-quality performance, sustained60Hz or memory savings. Timing acceptance
remains a separate future run after local/silhouette/temporal correctness gates.
Even a passing screen does not enable flags or certify the full Feature.

## Tests, failure handling and delivery

Define portable tests first for matching scene identity with only reference
metadata removed; native complete radial counts including partial edge tiles;
actual count and queue/optical evidence errors; uniform/other modes and changed
camera/source/assets rejection; failure precedence; global/tier quality gates;
invalid budgets, non-finite/missing metrics and unsafe capture paths. Verify
blocked reference evidence never reads or admits candidates. Synthetic tiny
images are algebra tests only, never native performance evidence. Inputs are
read-only and all earlier captures/failures remain unchanged.

Run full tests/coverage including changed-file LCOV, lint/types/build/package,
Zero-Three and exact-head CI; update README and Unreleased CHANGELOG. Reuse
existing ADRs for classification/count ownership and reference qualification;
there is no new production architecture. No release, publishing, rollout or
white-paper gain claim. Rollback disables GPU-native adaptive flags; Three.js
cannot be a fallback. Cancel or failure of the current reference batch leaves
this command blocked rather than weakening its prerequisites.
