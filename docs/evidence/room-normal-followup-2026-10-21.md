# Absent-normal correction: native scene follow-up — 21 October 2026

Task gpu-renderer#234 / Story site#2291 / Feature site#2114. This adds to the
[rim follow-up](room-qualification-rim-followup-2026-10-21.md) and
[selected optical histories](selected-optical-paths-2026-10-21.md); all earlier
source, rejected/intermediate captures and private assets remain unchanged.

## Outcome

Correction `d53ced33554cab6d669d2d8104ca15cfcf86add2` preserves authored normals
when a mesh has no normal map, while retaining real maps and their scales. All
six automatic native captures complete and pass independently checked
count/preflight/HDR/normal/cleanup integrity. **The broad water band remains
visible. Image correctness is not cleared; adaptive performance stays paused.**

| Native size | Control | Completed camera samples | Capture integrity |
|---|---|---:|---|
| 3840 × 2160 | Empty glass close-up | 265,420,800 | Pass |
| 3840 × 2160 | Filled glass close-up | 265,420,800 | Pass |
| 3840 × 2160 | Filled full room | 265,420,800 | Pass |
| 1920 × 1080 | Empty glass close-up | 66,355,200 | Pass |
| 1920 × 1080 | Filled glass close-up | 66,355,200 | Pass |
| 1920 × 1080 | Filled full room | 66,355,200 | Pass |

Uniform32, depth20, fixed camera/independent transport, denoise/splitting off,
bounded+nested on, rough off, original daylight/intensity1, all reference models,
0.0001 m pedestal clearance. No retries, skipped lanes or relaxed gates. The
development ordering override runs4Kfirst, then all1080p controls. Uniform budgets
exercise completed-count transport, not physical feature-off fixed-dispatcher
equivalence. This matrix does not infer256-SPP stress qualification.

## Retained evidence and independent verification

The [machine ledger](room-normal-followup-2026-10-21.json) records every source,
receipt/PNG/HDR hash and relative local artifact path. Independently decompress
and reconstruct all120 HDR chunks and verify chunk/full hashes, source identity,
native PNG dimensions, finite nonnegative RGB/alpha1, exact per-pixel histograms,
transport controls, normal preflights and cleanup. Total31,104,000 image pixels
and995,328,000 completed **camera samples**, not total ray segments.

Aggregate `room-qualification-763ed9da-791a-48f7-8dee-b5a269421099/summary.json`,
SHA256 `ca017b9f93478d8933b31d8ef0fed623bbd6ab8f044ec20657e06410a0dc6964`;
status `captures-complete-image-review-pending`, failures empty. Controls restore,
run is enabled, cancel disabled, and browser console has no errors. Native images
were visually reviewed separately from their numeric integrity. Original and new
full PNG/HDR, journals and UI evidence stay local; no private model is published.

The non-fallback browser adapter reports Apple/metal-3. Separate read-only local
host GPU inventory reports Apple M2 Max,38 cores. The browser descriptor does not
expose that chip name. These controls do not qualify other devices/workloads or
establish exact physical VRAM residency.

## Verified normal contract

The portable missing-map regression fails first: all four packing representations
contain normal strength1 instead of0. The correction reuses the existing field;
no shader, ABI, renderer resource, BSDF/PDF/MIS or medium change. Real map bytes,
default/authored scales and explicit zero remain intact, including nested material
input. Do not reinterpret authored byte128 as exact tangent-space zero.

All six physical runs execute the four-case assembled absent/null/real/zero-scale
normal probe. Missing/null/zero-scale give exactly[0,0,1]; the real map preserves
its independent analytic perturbation. Maximum component error2.579719238227085e-8
passes the frozen1e-6 tolerance. Selected real glass-wall normals now have y=0,
and base normals y=±1, without the fallback's approximately1/255 tangent tilt.

The corrected selected-journal and ordinary1080p filled captures have identical
HDR `e050e56eb765a97471b6502bf1c7268aadf53c35b7db127644bbed01183bf88f`
and PNG `688aae9a67549de301d04055185da8ead46ae32c6cd980bd41c1afd87bb370c3`.
This independently confirms diagnostic non-mutation after the packing correction.
Diagnostic-inclusive timings are not performance evidence. Comparisons with the
defective normal control are descriptive changes, not errors against truth.

## Remaining correctness gate

The selected histories establish pedestal visibility and base internal reflection
in sampled band regions; none of those eight samples reaches depth20. They do
not certify the whole band. The source audit also finds strict procedural direct
lighting's hemisphere distribution differs from terminal environment MIS's sphere
PDF. The [scalar counterexample](environment-mis-pdf-audit-2026-10-21.json) retains
exact sources, integral, class assumptions and limitations; it is not a physical
whole-scene error or a proven attribution of the entire band. Sampling-class
probabilities, prior-vertex support and separate sky/glow/sun contributions need
correct treatment before energy/image signoff. A refracted directional-sun
connection is not implemented by ordinary straight visibility.

Task234 acceptance comment6317491410 requires a failing portable/assembled
regression before that next correction, then physical furnace/PDF/energy and
matched native scene tests. No new runtime MIS/sun/visibility change is included
in this follow-up. Do not hide the issue by ignoring glass collisions, applying
straight alpha transparency, changing IOR/exposure/denoise, increasing depth or
SPP, or accepting missing samples. Independent converged-reference HDR/local
error/energy/silhouette and stability gates remain open. The original rejected
schema1 benchmark supplies no timing variance or performance evidence here.

## Delivery

483 tests pass,96.45% overall line/83.27% branch coverage. All59 executable src
files changed relative to the PR base appear in combined LCOV; the changed packing
module has98.72% line coverage. Non-executable declarations remain type/clean-
consumer checked, not falsely line-covered. Lint, types/clean packed consumer,
build, public-package check, all nine Zero-Three gates and runtime audit (zero
vulnerabilities) pass. Runtime exact-head CI39603988783 succeeds in all jobs.

README, Unreleased CHANGELOG, design, ADR0063 and versioned evidence are updated.
Task234 remains assigned/In progress and PR216 draft/open. Evidence-only delivery
CI is recorded separately after push. No adaptive improvement, lower memory,
white-paper success, merge/release/local publication or main/CD completion is
claimed. Three.js remains prohibited and cannot be a fallback.
