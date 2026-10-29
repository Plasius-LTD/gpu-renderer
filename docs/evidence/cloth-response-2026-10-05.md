# Isolated cloth normal response — 5 October 2026

Task renderer#226, Story site#2268, Feature site#2114. This is a diagnostic,
**not** full-transport, photorealism, material-conformance or performance
qualification. Private model bytes, native PNGs and linear HDR remain local.

## Method and immutable implementation

The [frozen experiment](../design/cloth-response-diagnostic.md) compares authored
normal maps on/off under one unoccluded white directional light. For each control
it retains a pixel-centre image and an image averaged over the canonical stable
camera sequence. It reuses the assembled renderer's camera, mesh BVH, material
sampling, normal validity and BSDF evaluation. No shadows, indirect transport,
rough-bounce splitting or denoising run in this experiment. All geometry, UVs,
normal strength, roughness, colour and sheen remain unchanged.

- Renderer for 1080p captures: `fe69b7c031ca89a6605ec5c296bc2f3c860005d3`.
- Renderer for 4K capture: `fa4f2cd666d77c6b22482e3de8ec26e0556dbb17`.
  The later change adds GPU-completed-count readback and correction histograms,
  not changes to radiance evaluation. Earlier receipts record scheduled counts;
  they must not be presented as GPU-observed completion counts.
- Lighting: `48823cd969a89296332ae4643104d986bf3eb9a9`.
- Shared: `b68f8682735fa8bffb5179d5e11342521a2f9446`.
- Site source: `21d43a9b63722f1ce69175a5a42b53304ee79102`.
- Physical adapter: Apple metal-3, not a fallback adapter.

Original room, Eames, seating and standing-model composition: 352,710 triangles.
Sofa uniformly scaled to 1.5 m wide, centred for inspection, yaw 45 degrees.
Close-up distance 0.85 m, elevation 50 degrees, target [0.5,0.55,0.65], FOV45.
Camera position [2.2961084265,-0.0079926513,-0.6038915735], target
[1.9097668705,-0.6591304279,-0.9902331295]. Sheen enabled; white-light intensity 3.
Light elevation is relative to the seating orientation; camera stays fixed.

Metrics use only normal-mapped cloth pixels whose camera samples all hit the
same mesh. Signal is the linear RGB difference between normal-on and normal-off.
Its four-neighbour Laplacian RMS measures fine spatial variation, excluding
silhouettes and pixels without four eligible same-mesh neighbours. The retained
fraction is averaged-sample signal RMS divided by centre-sample signal RMS. It is
**not** percentage image accuracy, a convergence score, or a weave-recovery score.

## Results

| Resolution / samples / light | Eligible interior pixels | Centre signal RMS | Averaged signal RMS | Fine-signal retained |
| --- | ---: | ---: | ---: | ---: |
| 1080p / 1 / 10 degrees | 1,577,029 | 0.04648155 | 0.04648155 | 100% |
| 1080p / 128 / 10 degrees | 1,574,426 | 0.04642547 | 0.04338172 | 93.44% |
| 1080p / 128 / 60 degrees | 1,574,426 | 0.01472919 | 0.01372644 | 93.19% |
| 4K / 128 / 60 degrees | 6,310,441 | 0.00818936 | 0.00773679 | 94.47% |

The 1-SPP centre/averaged HDR images are byte-identical for each normal setting,
as required by the stable sequence's centred first sample. At 1080p/128 SPP,
changing only the light elevation reduces averaged normal-on/off RGB RMSE from
0.02556718 to 0.00808901, a factor of 3.16. Fine spatial signal changes by a
similar factor. The normal map visibly changes the lit image. Camera averaging
attenuates that measured fine signal by about 5.5–6.8%, not by orders of magnitude.
Do not compare absolute Laplacian RMS across resolutions as a quality score;
the pixel footprint differs.

At 4K, every pixel's GPU record verified 128 completed diagnostic camera samples:
**1,061,683,200 total**, across all 510 tiles. Of 810,035,456 samples in eligible
cloth pixels, 2,783,894 (0.3437%) needed a normal-validity adjustment greater than
0.1 degrees. Mean mapped tilt was 5.4057 degrees and mean validity correction
0.01514 degrees. Maximum correction was 104.16 degrees. This rare large correction
must remain visible in the evidence; the small mean does not prove that every
local grazing-angle case is correct.

Per-pixel mean correction histogram (6,328,402 eligible pixels):

| Degrees, lower inclusive / upper exclusive | Pixels |
| --- | ---: |
| 0–0.1 | 6,300,617 |
| 0.1–1 | 9,633 |
| 1–5 | 12,139 |
| 5–15 | 5,222 |
| 15–45 | 762 |
| 45–181 | 29 |

## Interpretation and next work

The map reaches material lighting; neither widespread normal-validity flattening
nor camera averaging alone explains the subdued cloth appearance in this
close-up. Light direction has a much larger measured effect in this experiment.
This supports further isolation of lighting/material/display response, **not**
a claim that the current BSDF or full renderer has been independently validated.

The earlier [full-transport comparison](cloth-closeup-2026-09-29.md) already showed
subdued detail before denoising. Together these tests narrow the investigation;
they do not match the reference application's unknown lighting/exposure or prove
that all texture filtering is correct. Do not boost normals, invent a weave,
remove normal-validity protections or change the production sampler on this basis.

The known ambient-dependent base-colour floor in `evaluate_surface_bsdf` remains
an independent correctness candidate. It requires an independent expected-value
test and qualified fix. Localized large normal corrections also need spatial
inspection. Follow either demonstrated runtime fix with a matched full-transport
raw/cleaned capture; this diagnostic cannot close the broader Task #226.

## Retained evidence

Each capture directory is under the local `output/playwright/eames-environments/`
evidence root. `cloth-response-report.json` identifies four native PNGs and
byte-plane-compressed Float32 linear-HDR chunks. Hashes below are SHA-256.

| Capture | Directory suffix after `room-reference-` | Receipt hash |
| --- | --- | --- |
| 1080p / 1 / 10 degrees | `2026-10-05T20-09-09-066Z-c7f3128f-3044-46ec-aef1-d8c66c20d174` | `e3648df4f63db1c9cdd728584183b5593bf8086bf3da77170879854c64de7d4b` |
| 1080p / 128 / 10 degrees | `2026-10-05T20-09-56-833Z-d7a44c18-5e81-4580-b150-4ef07577fb1d` | `303c09dd6ece5a2d9aaf0510369614e53c9f9ae67054472051dd837a0bdbb7c5` |
| 1080p / 128 / 60 degrees | `2026-10-05T20-10-57-317Z-ad1f5c37-afbb-4897-a920-a1fc21074932` | `85032409635e6c8a6e4ec4dc90484421a6e77ad45dc6265d90341bf67cc766ef` |
| 4K / 128 / 60 degrees | `2026-10-05T20-13-48-269Z-93ac1e2a-8597-4288-bb1e-f94ff77bbdf3` | `34953424499753b0ae2aef5b619a647e2825f03c335473240121b07a65f02d73` |

4K retained image hashes:

| View | Linear HDR | PNG |
| --- | --- | --- |
| Centre / normal on | `b004185bf19a41ec373b9b5068ceda335848a155d1217a30fcf767b259aabae6` | `59fb1b95e0ae7dea3935936bc9f0be67fed7bf6b9acd35db456be387b864f1e1` |
| Centre / normal off | `746ff9af94ef9a75c8440cb8178d646480c3b9fe3b7d1453e8d26b8acfc78f6b` | `cd92c8fb8f17a561a352ee776a6ddbd7a96abe101e1eb88b6b299cc8b8251656` |
| Averaged / normal on | `c71e79b16f6a01fe95e8c19a2f39d3c193de9bc1e89f5c5e67aaf3d47ec9e9ae` | `2faa1cae00b410f7896bb24bf27c2339b68f5904ab6e66558a10ff8b0a26b825` |
| Averaged / normal off | `b30adb546bd54130784b3b587b3e2998ca4d1a8ba2728944af6c9431fc6db440` | `7140bb49c94ba5886111e9f32a6399a875b217b7ea1d13ee32f8f37853646850` |

Native files were independently decoded and their dimensions, chunk offsets,
chunk/full-image hashes and finite nonnegative RGB/alpha-one values verified.
All accepted captures report zero GPU validation errors and resource cleanup.

## Cost, validation and delivery limits

The 4K diagnostic took 17,795.7 ms for its tile/readback/analysis interval, excluding
scene setup and subsequent image encoding/retention. This is not GPU-only time
and must not be compared with the full six-bounce renderer. The experiment adds
3,146,064 bytes of tile-sized GPU buffers, 564,019,200 bytes of host image/mask
arrays at 4K, and 1,572,864 bytes per tile-readback array, beyond renderer setup.
PNG encoding and retention also consume host memory. These are application-visible
allocations, not exact physical VRAM residency or a memory optimization.

Four new requirement-driven tests failed first with missing diagnostic modules,
then passed. The full suite passes 366 tests; overall line coverage is 96.2%
(packaged `src` 96.9%). Types, lint, build, package validation, Zero-Three and
production dependency audit pass. No packaged source or dependency changes.
README, Unreleased CHANGELOG and the diagnostic design are updated.

Native images and normal/off comparisons were visually inspected. Invalid light
settings and an Eames-only scene were rejected. Reset/invalidation and four-view
selection were exercised, plus a 720-pixel-wide layout without horizontal overflow.
Stopping a 4K/256-SPP diagnostic during GPU tile processing rejected the partial
result and restored Render/Reset while disabling Stop. Reset restored defaults.
Synchronous scene preparation can delay UI interaction before tile processing;
this experiment does not fix or qualify that existing setup responsiveness.

Implementation-head CI is queued, not passed:
https://github.com/Plasius-LTD/gpu-renderer/actions/runs/37368461298.
Task #226 remains In Progress. No production flags, package publishing, merge/CD,
white-paper advancement, performance gain or final cloth-fidelity success claimed.
