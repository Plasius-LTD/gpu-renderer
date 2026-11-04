# Cloth material corrections — 2026-09-29

Story site#2268; renderer Task #224 and shared Task #135. Implementation and
bounded physical correctness evidence, not complete glTF conformance, matched
convergence, real-time performance or white-paper qualification.

## Immutable sources and reproduction

- Renderer: `501b2cf46d3c45ebcbd898ac08f847a5c7502175`.
- Shared loader: `b68f8682735fa8bffb5179d5e11342521a2f9446`.
- Lighting: `48823cd969a89296332ae4643104d986bf3eb9a9`.
- Site assets: `21d43a9b63722f1ce69175a5a42b53304ee79102`.
- Physical adapter: Apple / metal-3, non-fallback.

Run the lighting-owned local room server with those renderer/shared/site source
snapshots and the separately approved local model paths. Open the renderer's
`tests/fixtures/native-room-reference.html`. Select all models, Sofa centre,
FOV45, stable pattern, two-bounce splitting, guided denoising on, room entrance.
The sofa remains uniformly 1.5 m wide. Camera position is
`[4.55, 0.2559159755706788, 0.95]`, target
`[1.8, -0.4940840244293213, -1.1]`. Scene: 352,710 triangles / 90 meshes.
No change to geometry, camera, lighting or sampling ratios for these comparisons.

At 1080p/32 ceiling capture once with **Cloth sheen model** off, once on. Both
already use preserved source pixels and mapped-normal denoising. Thus this pair
isolates sheen, not the entire change set. Every capture retains raw and cleaned
images from the same contributing samples. The sheen response changes radiance
and path termination naturally; it does not introduce additional splitting.

Private images/models/HDR remain local under
`output/playwright/eames-environments/`; no private asset bytes are in this repo.
Local `output/verify-cloth-material.mjs` checks source pins, every tile's camera
count, sample histogram, source dimensions, PNG dimensions, chunk hashes,
assembled HDR hashes, finite/nonnegative RGB and alpha=1. Public metadata here
does not make private captures publicly downloadable.

## Physical checks

All captures run production assembled-WGSL probes before tracing the scene:

| Check | Result |
| --- | ---: |
| Affine/wrap cases across 17 texture slots | 6 cases pass |
| Maximum sampled-texel absolute error | 0.00000002384 |
| Charlie GPU vs numerical CPU reference relative error | 0.02635% |
| Cloth colour-texture relative error | 0.06297% |
| High-SPP normal-driven signal relative error | 0.06296% |
| Constant-HDR error | 0 |
| Protected-pixel absolute error | 0.000751 |
| Analytic noisy-cloth RMSE / unfiltered RMSE | 0.01974 |
| Guide / invalid-pixel failures | 0 / 0 |

Existing texture/normal limits (0.5%), protected-pixel limit (0.002), constant
limit (0.001) and noise ratio limit (0.65) were not relaxed. Separate 19-case
UV/geometry parity and four-case sidedness/128-direction surface checks pass.
The transformed-texture probe is nearest-sampled material correctness, not
minification or every possible rotated tangent-frame qualification. Numeric
unit tests additionally cover sheen reciprocity, finite grazing response and
hemispherical energy over the tested roughness/direction grid. The physical
sheen match is at authored roughness 0.8; it is not exhaustive material coverage.

## Native 1080p control pair

Radial 32/16/8/4/2/1 SPP over 5/10/15/20/25/25% of pixels: 5.95 average,
12,337,920 completed camera samples, all 135 tiles verified.

| Single diagnostic capture | Sheen off | Sheen on |
| --- | ---: | ---: |
| Secondary rays | 66,291,000 | 66,254,939 |
| Total path segments | 78,628,920 | 78,592,859 |
| Summed GPU tile time | 16.297 s | 16.075 s |
| Readback-inclusive render job | 17.274 s | 17.122 s |
| Filter + tone-map GPU median, five same-input rounds | 4.325 ms | 4.456 ms |

These are sequential single diagnostic captures, not a randomized matched-
quality performance experiment. No speedup or insignificance of overhead can
be inferred. Initialization, probe/LUT preparation and capture serialization
are outside the render-job timing. Guide capture is in tile time, not filter
time. Sheen LUT integration is cached initialization CPU work, not per-frame
work; per-hit evaluation, tracing and denoising execute on the GPU.

Retained folders:

- Off: `room-reference-2026-09-29T09-01-38-983Z-e05c799c-7c52-4e6b-b2f5-e9123846cd3f`.
- On: `room-reference-2026-09-29T09-06-48-295Z-64129a7c-6d3d-49f0-b222-52e918365aef`.

Receipt SHA256 (files end in `-guided.json`):

- Off: `2757843ca283eb2cfe9a3a12d771a8106d518f0619ac59c109d15ff24ff39e1b`.
- On: `024962d26cd29646864b1ab3cdbed411ece970b718b5990dfda98a413baf0283`.

Raw HDR SHA256:

- Off: `ad18c00bbeed1c1572803f8d892758172ca705b6d1624e4b9c1124e5248b2993`.
- On: `c12d6c9eb238428bb2dd625f96e75aa7e827eaf23671fff28bf0b935cd4f3bdf`.

Cleaned HDR SHA256:

- Off: `a752d7c2949399d2ee7724d92d1481df5ad2547ed1979095893f924f75bccfcc`.
- On: `2013dc2613aebaefdb3f287fe63c4e07f9cde30555d9a8115b17d7a663b508a7`.

Native review shows stronger cushion contour and velvet edge response with
sheen enabled. It does not establish a match to the user's differently lit
comparison app; residual peripheral noise remains. No automatic sharpening,
texture amplification or colour correction was added to fake fibre detail.

## Native 4K quality reference

Sheen enabled, six bounces, 256/128/64/32/16/8 SPP over the same area ratios:
47.6 average, 394,813,440 camera samples, all 510 tiles verified. This is not
256 SPP across the entire image. Scene/camera/placement/dimensions/settings and
budgets match the [preceding sofa-centred reference](sofa-centre-2026-09-29.md).

- Secondary rays: 2,120,718,801; total segments: 2,515,532,241.
- Summed GPU tile time: 460.905 seconds.
- Readback-inclusive render job: 473.578 seconds (about 7m54s).
- Filter + tone-map median: 16.974 ms, five same-input diagnostic rounds.
- Renderer buffers: 355,975,492 bytes; additional guided allocation:
  165,889,024 bytes; material metadata: 74,880 bytes.
- Validation failures: none; cleanup passed. All raw/cleaned HDR chunk hashes,
  final hashes, finite/nonnegative RGB, alpha and native PNG dimensions pass.

Folder: `room-reference-2026-09-29T09-07-51-789Z-492482c8-95f4-4d8b-80f3-af529407124c`.
Stem: `room-eames-3840x2160-stable-pattern-6-bounces-split2-spp256-seating-centre-sheen`.

- Guided receipt SHA256: `b155158d0a2ae84797e4009edb78d4bc220072b83300fd615d71cf725d3e2cf1`.
- Raw HDR SHA256: `2a1a900e9540c336cd957829681c5a57283428b48826ebc9a6b70fdc97731c0f`.
- Cleaned HDR SHA256: `e59a8df141075cfaffb43264712af4c0f7e1c7c83ae21aff04b47e67a618af72`.
- Raw PNG SHA256: `f274582b33cf0329fc54864a352c98a5c32dac9432e16ff9dc950b2dcc3a18ff`.
- Cleaned PNG SHA256: `48626cf9a733d35a515cced8e6e0e42338f610e4e495055f4c16150c6aec82cc`.

The previous quality reference recorded 449.005-second job / 434.763-second GPU
tile sum. This new diagnostic is slower, not evidence of a speedup. Shader work
and material radiance intentionally changed; single captures cannot establish
a confidence-bound overhead or matched-quality result. The filter-only median
is not the frame time and excludes tracing and guide capture.

Native raw and cleaned review confirms clearer cushion folds and grazing velvet
response; subtle surface variation remains visible. Fine weave is not yet
proven equivalent to the comparison application. Grain/mottling remains, with
more noise on lower-SPP peripheral/reflective surfaces. Keep the original maps,
strength and colours; do not amplify texture to manufacture a visual match.

## Allocation, gates and limitations

Browser QA used the actual local controls: sheen on/off/reset, raw/cleaned
switching without retracing, invalid zero SPP, and incompatible fast sampler
plus splitting. Invalid settings reject before GPU work. During capture,
resolution/material controls are disabled and Stop remains enabled. At the
current 1713px viewport there is no horizontal overflow. Cancellation was
previously qualified for this unchanged path, but not rerun during this capture;
no fresh narrow-screen layout or other-browser/device qualification was done.

Both 1080p captures allocate the same 291,340,612 renderer buffer bytes and
41,473,024 additional guided bytes. The new 52-by-90 RGBA32F material metadata
texture is 74,880 bytes; it is per material, not per ray/pixel. Existing BRDF
LUT spare channels carry sheen data without another texture. Reports describe
application-visible allocations, not exact physical VRAM residency.

358 renderer tests pass (96.2% line coverage; all 15 changed runtime JS files
in LCOV), 113 shared tests pass (88.03% line coverage). Lint, public types,
clean consumer, build, public-package, Zero-Three and production dependency
audits pass. Shader hash pins were updated because material code intentionally
changed; transport ownership/bounce/termination bodies are unchanged.

Implementation CI passed at both exact source commits:
[renderer](https://github.com/Plasius-LTD/gpu-renderer/actions/runs/36546576005),
[shared](https://github.com/Plasius-LTD/gpu-shared/actions/runs/36546574042).
README, Unreleased CHANGELOG, design, public types and ADRs were updated in both
packages. Three.js remains prohibited in implementation, artifacts and rollback.

Sheen defaults off; local controls are overrides of the feature snapshot, not
production activation. A coordinated shared/renderer release is required:
older consumers must not silently ignore the new texture metadata. Full
material-conformance, ray-footprint/mip filtering, authored tangents, temporal
and matched-quality performance qualification remain separate. No main merge,
CD release, package publish or white-paper advancement was performed.
