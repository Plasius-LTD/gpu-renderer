# Physical room qualification — 21 October 2026

Task [#234](https://github.com/Plasius-LTD/gpu-renderer/issues/234), Story site#2291,
Feature site#2114. [Machine-readable ledger](room-qualification-2026-10-21.json).
No earlier code, captures, rejected evidence or ADR history was removed.

## Conclusion

Browser automation now works through the normal Playwright connector without
permission/sandbox changes. Its earlier access-denial cause is not established.
The qualification ran automatically through real UI input; no repeated manual
render request was needed.

**Banding is not confirmed fixed; the reported horizontal water band remains
visible in the completed uniform 32-SPP filled-glass image. Full native 4K
qualification fails. Adaptive performance work remains gated.**

The first physical attempt exposed an origin-rounding regression, corrected in
[7002c0e2ff66879ce54e97fb3d1b920d2d5b9c75](https://github.com/Plasius-LTD/gpu-renderer/commit/7002c0e2ff66879ce54e97fb3d1b920d2d5b9c75)
with requirements-first tests and [retained evidence](optical-origin-corner-2026-10-21.md).
The corrected rerun completes all three 1080p lanes but rejects the 4K empty-glass
lane at a different rim-reconstruction case. It stops rather than bypassing the
failure to obtain screenshots. Later 4K lanes are not run or reported as passing.

## Provenance and configuration

- Renderer `7002c0e`; lighting bac0d5c0aeda57ef29878eb2f92c60ff0775a8ce;
  shared b68f8682735fa8bffb5179d5e11342521a2f9446;
  site asset pin 21d43a9b63722f1ce69175a5a42b53304ee79102.
- Physical Apple/metal-3 non-fallback adapter, Chrome 154.0.0.0, arm64 host.
  Exact chip identity is not independently verified; host CPU query was denied
  and no alternate access was attempted. Do not infer M2 Max from Metal 3 alone.
- Uniform 32 camera samples per pixel, 20 bounces, corrected fixed camera/transport,
  raw/denoise off, splitting off, bounded+nested transport on, rough optics off,
  0.0001 m pedestal clearance, original daylight intensity 1, all reference models.
- These are uniform-budget native shared-worklist fixture captures, not an
  independent disabled fixed-dispatcher performance baseline. No frame-budget,
  motion or variable per-pixel sampling policy reduces their target counts.
- Model geometry/texture snapshots and camera/lighting/flags remain source-bound
  in receipts. Room, sofa, Eames and astronaut are actually admitted; this is not
  a tiny synthetic timing probe. Captures are from immutable Git-object serving.

## Six-lane result

| Native resolution | Control | Completed camera samples | Result |
| --- | --- | ---: | --- |
| 1920x1080 | Empty glass close-up | 66,355,200 | Integrity passed; no converged-reference quality claim |
| 1920x1080 | Filled glass close-up | 66,355,200 | Integrity passed; horizontal water band still visible |
| 1920x1080 | Filled full room | 66,355,200 | Integrity passed; no converged-reference quality claim |
| 3840x2160 | Empty glass close-up | No complete frame | Rejected at tile 165/sample 14 |
| 3840x2160 | Filled glass close-up | Not run | Stopped on prior failure |
| 3840x2160 | Filled full room | Not run | Stopped on prior failure |

Each successful 1080p lane has 2,073,600 pixels at exactly 32 completed samples.
Together they complete 199,065,600 camera samples. Independently decompress and
unshuffle all 24 retained HDR chunks; check chunk/full-image SHA256, source/capture
identity, native PNG dimensions, every RGB value finite/nonnegative and alpha 1,
actual histograms/counts, no failure, and explicit successful cleanup. All pass.
Device preflight includes the 27th captured origin case: origin-y stays above the
bottom, next exit is 1.4414573e-7 m, and normal-projected displacement 2.2815259e-6
still exceeds the original 2.0040848e-6 error estimate. The earlier missing-exit
case is physically corrected, not merely accepted with a wider threshold.

The aggregate remains `failed`, with 3/6 completed lanes. Its directory is
`room-qualification-14759371-a95a-48b6-be58-d8a2b9aaf318` and summary SHA256
`bd52863deb6fc1db29118d16c493810717802faad773edd37d13f05c48e41fa4`.
The ledger lists every main receipt, PNG and HDR hash. Complete private images
and lossless HDR chunks stay local under their UUID capture directories.

## Visual result and comparison limits

Review all three completed native images separately from count checks. Empty
glass admits the background through the body. Filled glass still shows a broad
light/dark horizontal structure in the water region; it resembles the retained
c90e706 independent-transport images, including the prior 256-SPP radial ceiling
control. The reported feature is therefore not visually cleared.

Uniform 32 at every pixel rules out a boundary between radial SPP tiers as the
cause of this particular captured band. It does not establish the correct
physical appearance of every reflection/refraction or identify the band's
transport cause. Grain remains in raw 32-SPP images; no denoising hides it.
The 4K rim defect below is a separate demonstrated correctness blocker, not
proof that it causes every visible band.

As a descriptive before/after check, regenerate and hash-verify the old radial 32
budget mask. Compare only its 103,680 central 32-SPP pixels against the new uniform
image. Camera, scene/assets, flags, lighting, depth and seed match; sampler word
equivalence is independently tested. Runtime geometry/origin corrections differ.
Existing lighting-owned HDR metrics give RGB RMSE 0.0628603, normalized difference
0.123852, p99 local difference 0.171541 and relative central mean-luminance change
-0.000232316. These are differences between two noisy/source-different captures,
**not error against truth, an energy-conservation pass or a speed/quality gain**.
The whole-frame radial and uniform images have different SPP outside that mask.
No image tolerance was relaxed after observing these results. Converged same-build
references and frozen image/energy/silhouette acceptance still remain open.

## Remaining 4K rim defect

[Frozen original parametric case](room-rim-reconstruction-2026-10-21.json) contains
the binary32 ray/vertices/barycentrics and reference events, not private model data.

Capture `room-reference-2026-10-21T07-46-36-950Z-890fa400-c83e-4cda-93cb-253d5e241521`
retains failed receipt SHA256
`ac9be55a6612c2d9de6919988a50eea4e7a08c285860c510d61e9d7dd518fedf`.
Tile 165 `(1920,640,128,128)` reports `245760/524288` primaries, a **tile** count,
not completed full-frame SPP. Failed node: pixel 2747573/sample 14/bounce 1,
reason 2, primitive 353696. Later rounds are suppressed after rejection; this
count mismatch is a consequence, not proof of faulty camera-ray generation.

The canonical camera ray correctly hits rim 353396 with positive barycentrics
`[0.00002435777787468396,0.8868099451065063,0.11316579580307007]`.
The planar y-coordinate reconstructs exactly, so its normal-projected error is
zero and the dominant-axis offset correctly performs no displacement. But the
reconstructed x/z point is not on the correct side of the adjacent inner wall:

| Quantity | Independent double geometry / retained canonical value |
| --- | --- |
| Original binary32 ray's rim point | `(2.8955625499541995,-0.5140840411186218,-0.07711015795245352)` |
| Stored reconstructed point | `(2.8955624103546143,-0.5140840411186218,-0.077110156416893)` |
| Tangential x error | `-1.39599585e-7m` (~140 nm) |
| Next hit from original point | Inner-wall exit 353589, t~1.53274706e-7m |
| Next hit from stored point | Far-wall entry 353696, t~0.154880341m |

Rebuild the original public parametric glass from its retained settings, round
vertices to binary32, and independently intersect in double precision. The
primary identity and far-wall successor match the canonical journal. Numerical
execution of the current assembled `optical_triangle_position` function
reproduces the stored point **exactly** with the captured barycentrics. This is
an automated deterministic numerical reproduction of the physical failure, not
an accepted image or replacement renderer.

The next correction must preserve the admitted triangle's interior/topology and
the neighbouring interface under in-plane reconstruction error; a normal-only
error estimate and coordinate AABB inset do not establish that contract. Freeze
the original vertices/ray/barycentrics and test both interfaces, signs, winding,
axes and permitted arithmetic before another implementation. Do not increase a
generic offset, widen hit tolerances, reset media, skip an entry, accept missing
samples or increase SPP/bounce depth to hide this. The defect occurs in empty
glass at bounce 1, independently of water and the 20-bounce ceiling.

## QA and delivery boundary

Normal UI qualification input, serialized lanes, disabled controls, available
cancel, automatic stop, initial-control restoration and explicit failure state
were observed. Cancellation itself was not deliberately executed during these
expensive captures; do not claim new physical cancellation coverage. Initial and
final viewport screenshots and UI snapshots remain locally retained. Native
render dimensions come from output, not CSS viewport/DPR. The corrected run
logged no browser console errors; 3 successful frames have no validation errors
and explicit cleanup pass. The failed 4K receipt has no cleanupPassed marker;
do not promote that absence to a complete stability/cleanup pass.

Correction `7002c0e`: 461 tests, 96.42% lines/83.20% branches, changed-runtime LCOV 100%,
lint/types/clean consumer/build/package/all nine Zero-Three gates/runtime audit
pass. [Exact-head CI](https://github.com/Plasius-LTD/gpu-renderer/actions/runs/39562506464)
succeeded. This follow-up report changes no additional transport or shader code.
The earlier cdfecb0 failure and all original before evidence remain unchanged.

Task stays assigned/In progress; no release/main-CD/local package publication,
white-paper success update, matched-quality gain or memory-saving claim. All
experimental flags remain default off, and Three.js is prohibited as a fallback.
Resolve the remaining reconstruction blocker, then rerun the native matrix and
the independent image/convergence checks before adaptive performance work resumes.
