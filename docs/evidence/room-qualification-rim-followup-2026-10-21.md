# Rim follow-up: native scene captures — 21 October 2026

Task gpu-renderer#234, Story site#2291, Feature site#2114. This follows, and does
not replace, the [earlier rejected qualification](room-qualification-2026-10-21.md),
[rim correction history](rim-reconstruction-correction-2026-10-21.md) and frozen
[shared-diagonal case](rim-shared-diagonal-2026-10-21.json).

## Outcome

All six automatic native captures pass sample/preflight/HDR/cleanup integrity on
runtime `665e2bd9a01122a312a71e61d7888f14f41ea137`. The formerly failing rim and
shared-diagonal regions no longer stop the tested 4K captures. **The broad water
band is still visible. Image correctness is not cleared; adaptive performance
work remains paused.** No transport change is made merely to conceal the band.

| Native size | Control | Completed camera samples | Integrity |
|---|---|---:|---|
| 3840 × 2160 | Empty glass close-up | 265,420,800 | Pass |
| 3840 × 2160 | Filled glass close-up | 265,420,800 | Pass |
| 3840 × 2160 | Filled full room | 265,420,800 | Pass |
| 1920 × 1080 | Empty glass close-up | 66,355,200 | Pass |
| 1920 × 1080 | Filled glass close-up | 66,355,200 | Pass |
| 1920 × 1080 | Filled full room | 66,355,200 | Pass |

All controls use uniform 32 SPP, depth 20, fixed camera with independently keyed
transport, raw/denoise-off output, no splitting, bounded+nested optical transport,
rough transport off, the composed room/all reference models and 0.0001 m pedestal
clearance. Uniform budgets exercise actual-completed-count transport, not a
physical equivalence claim for the separate feature-off fixed dispatcher.

The validated development query changes order only: 4K runs first, then every
1080p lane. Normal Playwright UI interaction starts the application-owned sequence.
No lane is retried, skipped or relaxed. Controls restore after completion, run is
enabled, cancel is disabled, and the summary correctly says image review pending.

## Independently verified evidence

The [machine ledger](room-qualification-rim-followup-2026-10-21.json) retains every
receipt/HDR/PNG hash, relative artifact path, source pin, histogram and preflight
result. Independently decompress and reconstruct all 120 retained HDR chunks;
verify byte/chunk/full hashes and source identity, native PNG dimensions, finite
nonnegative RGB/alpha 1, exact per-pixel counts and cleanup. Total: 31,104,000 image
pixels and 995,328,000 completed **camera samples**, not total transport segments.
The non-fallback adapter reports Apple/metal-3; the exact chip is not independently
confirmed here. Qualification does not generalize to other devices/workloads.

Aggregate `room-qualification-acea036d-5be6-4900-9e61-261db7901267/summary.json`,
SHA256 `b780c6fe1e127b907466ee5669147b03827f36e037ad31ce84756d85789314cd`.
All 30 assembled optical device cases and the UV, surface, material, optical
sampling/parity preflights pass. Original intermediate/failure evidence remains
unchanged; images/private model assets remain local, outside the public package.

All three new 1080p HDR **and PNG** hashes exactly match their preserved e2a0922
controls. The new rare-case certificate resolves the tested 4K rejection without
altering these 1080p controls; it does not remove their visible band. Native filled
4K also retains the broad light/dark regions. Descriptive linear-HDR region means
are local diagnostic data, not an independent truth or artifact metric. Uniform
SPP excludes a radial budget-tier boundary as the cause of this particular band;
it does not by itself prove sampling/transport correctness.

## Remaining banding gate and automation boundary

Diagnostic-only `04e28a30a59fa0569daadc6cb1e2ea21f70a0b3f` adds bounded selected
successful-sample journals with original geometry/medium state and post-surface
direct/terminal radiance/termination kinds. No runtime src files differ from
665e2bd. Eight selections, matched controls and exact raw-HDR non-mutation hash
are frozen before the intended physical execution in the local QA acceptance
plan. Default-off diagnostics do not create a new accepted rendering path.

That targeted physical capture is **not run**: the normal browser dropdown calls
are denied with `MCP tool call requires approval, but approval policy is never`.
Both presets remain at their defaults, the page is idle, and no alternate tool,
DOM write, terminal browser or permission/sandbox modification is used to bypass
the denial. The already completed six-lane evidence is unaffected. No additional
manual render tests are requested from the user.

The supporting analytic continuous-cylinder dominant transmission/TIR trace
predicts pedestal visibility and total internal reflection in parts of this
view, but omits full scene lighting/Fresnel branching and cannot certify the band.
The independent Blender CPU attempt crashed exit139 without an image; the exact
crash point is unknown. Its inputs/logs are retained, not accepted as reference
evidence or a renderer fallback.

Restore normal approval/access for dropdown automation, run the frozen selected
capture, verify raw-HDR equality, then compare per-bounce contributions/termination
with matched controls before another transport correction. Converged-reference
HDR/error/energy/silhouette acceptance remains open. Do not increase depth/SPP,
change IOR/exposure/denoise, reset media or relax tolerances to declare a fix.
This 32-SPP matrix does not qualify 256-SPP stress or higher fidelity by inference.

## Software and delivery gates

481 tests pass; 96.45% line/83.20% branch coverage. All 59 changed executable src
files relative to the PR base appear in combined LCOV; non-executable index.d.ts
is checked by typecheck/clean consumer, not falsely counted as executed coverage.
Lint, types/clean consumer, build, package integrity, all nine Zero-Three gates
and runtime audit (zero vulnerabilities) pass. Runtime/diagnostic exact-head CI
runs 39583017550, 39584404650 and 39588632326 succeed. Shader SHA256:
`998cbc8590e7c19fde02466697c549e2b83de23966330bd54b0f8a9520d34e14`.

README, Unreleased CHANGELOG, design, ADR 0063 and versioned evidence are updated.
Task 234 stays assigned/In progress; draft PR 216 stays open. No adaptive speed,
memory, white-paper success, merge/release, local package publication or main/CD
completion is claimed. Three.js remains prohibited and cannot be a fallback.
