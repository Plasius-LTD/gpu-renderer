# Layered clearcoat: physical checks and local room captures

Story: [site #2286](https://github.com/Plasius-LTD/plasius-ltd-site/issues/2286).
Task: [renderer #232](https://github.com/Plasius-LTD/gpu-renderer/issues/232).
Parent Feature: site #2114. Experimental, default off; not release qualification.

## Immutable implementation

All captures below use these source revisions:

- Renderer: `14c27452b6256011647b905f5e8bcf6b21e7a46d`.
- Lighting: `48823cd969a89296332ae4643104d986bf3eb9a9`.
- Shared: `b68f8682735fa8bffb5179d5e11342521a2f9446`.
- Site: `21d43a9b63722f1ce69175a5a42b53304ee79102`.

The local reference server serves immutable Git code and checksum-bound local
assets, not uncommitted browser modules. The later evidence/UI-copy commit does
not change renderer behavior. [Implementation and regression tests](https://github.com/Plasius-LTD/gpu-renderer/commit/14c27452b6256011647b905f5e8bcf6b21e7a46d)
and [successful implementation CI](https://github.com/Plasius-LTD/gpu-renderer/actions/runs/37507805711)
remain independently inspectable. See [ADR0054](../adrs/adr-0054-layered-clearcoat.md).

## What changed and what did not

The renderer now has an opt-in independent clearcoat normal and scale, correct
factor/roughness texture channels, whole-base Fresnel attenuation, and matching
coat sampling/PDF. This reuses existing hit-record padding and texture metadata.
There is no extra surface, bounce, queue, camera sample or allocation for a coat.
Additional conditional shader work is not claimed to be free.

The room's separate, explicit authoring variant adds weight 1 / roughness 0.18
to two verified Eames wood primitives and one verified seating wood primitive.
Both values are adjustable. No source asset is rewritten. No cloth, leather or
spacesuit material is overridden. Light reaching other objects can still change
through reflected paths; unaffected materials do not imply identical pixels.

These are opaque, non-delta wood checks. Water/glass transport, coated ideal
metals, coloured absorption and interlayer scattering are not qualified here.
An added coating cannot automatically remove highlights baked into a colour map.
Three.js remains prohibited; no fallback or additional dependency was introduced.

## Physical correctness and local validation

- 389 unit tests passed; requirements-first clearcoat/variant regressions failed
  before implementation and passed afterwards.
- Coverage: 96.23% statements/lines, 82.52% branches, 96.56% functions. Every
  changed runtime JavaScript file appears in combined LCOV.
- Lint, source/type checks, clean packed type consumer, build, public-package
  checks and full Zero-Three source/dependency/artifact/SBOM gate passed.
- Full assembled material WGSL ran on Apple Metal 3, non-fallback WebGPU.
  Six cases exercised absent/independent normals, zero/partial normal scale,
  UV1, rotation and mirrored texture transforms, plus distinct R/G channels.
  Off/on/off runs preserved zero-coat and flag-off results.
- The physical probe's maximum scaled error was `0.016424209146251655`, with a
  pass bound of 1 under the frozen absolute `2e-5` plus relative `0.002` tolerance.
  CPU analytic cases also cover Fresnel layering, grazing/finite response and
  aligned-normal white-furnace energy. These are correctness, not speed tests.
- Both 1080p captures and the 4K confirmation reported no failures or validation errors and successful
  cleanup. All raw/clean HDR chunks were independently decoded and SHA-256 checked;
  RGB values were finite/nonnegative and alpha was exactly one.

## Same-camera 1080p comparison

Common settings: 1920 × 1080, six bounces, stable-pattern comparison sampler,
256 ceiling with 256/128/64/32/16/8 radial tiers, 5/10/15/20/25/25% areas,
47.6 average SPP, seed 7, first-two-bounce rough splitting, layered sheen and
same-frame guided denoise. Raw HDR is retained before denoise. Camera FOV 45°,
sofa centred at the previously approved uniform 1.5 m width, cool-evening style
at intensity 1; 352,710 triangles in 90 meshes.

The receipts were checked for exact equality of source revisions, source asset
hashes, camera, placement, lighting, settings, budgets, allocated memory and
actual-SPP histogram. This compares authored materials with the opt-in coating
variant, not a converged ground truth or isolated performance experiment.

| Recorded quantity | Authored / coat off | Varnish / coat on |
| --- | ---: | ---: |
| Completed camera samples / primary rays | 98,703,360 | 98,703,360 |
| Secondary rays | 530,100,981 | 529,896,686 |
| Total path segments | 628,804,341 | 628,600,046 |
| Tiles | 135 | 135 |
| Sum of tile GPU timestamps | 129,028.784 ms | 124,719.661 ms |
| Diagnostic render intervals | 132,463.600 ms | 128,450.900 ms |
| Readback-inclusive render intervals | 133,885.700 ms | 129,850.100 ms |

Timing caveat: these single diagnostic captures occurred on different dates;
they are not interleaved replicated benchmarks. `completedFrameMs` is null in
this mode. The intervals exclude asset loading/preflight and final image encoding;
the sum of tile timestamps does not include every final denoise/presentation
operation. Do not infer a speedup, matched-quality gain, or real-time rate.

The wood response changes visibly while the wood colour/maps remain present.
Residual scene noise remains; neither this view nor the synthetic probes prove
photographic equivalence or eliminate the need for converged-reference testing.

### Allocation inventory (identical in both 1080p captures)

| Category | Application-visible bytes |
| --- | ---: |
| Renderer buffers | 306,823,492 |
| Renderer textures (25 descriptors, one mip/sample each) | 506,723,052 |
| Adaptive buffers | 9,478,428 |
| Telemetry buffers | 12,352 |
| Fixture staging | 852,016 |
| Guided denoise textures + uniform | 41,473,024 |
| Cached budgets on host | 20,736,000 |

Denoise diagnostic staging is already included in fixture staging. Texture bytes
are calculated from retained dimensions and format sizes, without driver padding.
These are application-visible inventories, not exact resident VRAM or process
memory; compiler/driver allocations, canvas backing and host asset data are not
claimed to be measured. The coating adds zero bytes in this comparison.

## 4K confirmation

The same varnished configuration completed at 3840 × 2160, six bounces and the
same 256/128/64/32/16/8 radial distribution. All 510 tiles completed, with
394,813,440 camera samples, 2,119,901,380 secondary rays and 2,514,714,820 total
path segments. The mean remains 47.6 SPP. Source revisions, camera, lighting,
model selection and the three wood overrides match the 1080p varnished capture.

Recorded tile GPU sum: 457,506.685 ms; diagnostic render intervals: 469,873.900 ms;
readback-inclusive intervals: 474,572.600 ms (about 7.9 minutes). These retain the
same timing limitations above. Local CPU test/build checks overlapped this
capture, further excluding it from performance qualification. This is not a
real-time result, a repeated benchmark, or a same-head 4K coating-off comparison.

The 4K allocation inventory records 355,975,492 renderer-buffer bytes,
631,139,052 renderer-texture bytes, 34,361,628 adaptive-buffer bytes, 12,352 telemetry
bytes, 852,016 staging bytes, 165,889,024 additional guided-denoise bytes and
82,944,000 cached-budget host bytes. Use the same category/VRAM cautions above.

The actual raw and cleaned PNGs were visually inspected. Wood colour remains
visible beneath the new surface reflection, with no whole-object tint override.
Fine scene noise remains; this is a local reference, not photographic sign-off.
The browser raw/clean controls work on the same camera samples. Reset restores
both coating switches off; a wood variant with the renderer off and out-of-range
coating strength were rejected. Labels and controls were checked in the desktop
fixture, not a full-site/mobile accessibility qualification.

## Private retained artifacts

The additional private model bytes and combined HDR/PNG images remain local;
this task does not expand asset-publication permissions. Each directory is under
`output/playwright/eames-environments/`
in the local workspace; the identifiers and hashes below bind the audit without
publishing private material.

### 1080p authored

Capture: `room-reference-2026-10-06T18-00-31-118Z-08ad8483-428e-4cfb-b1ac-4d5b4128374d`.

- Receipt: `454bd39eff158f582b35b1007ebd7c18692c5d08c16e3397985a89952b686dd9`.
- Raw HDR: `29931169314fa96d7e6ab4ee31f56e710ddc5287393415bb5ac1ed0be523141f`.
- Clean HDR: `6a8421c38e89a057c06d88369295048e5080fc027e08928f86533afc964f307b`.
- Clean PNG: `c5e7fa50e1d2691d17b0571994d862fdc41d0e5889ede85fffdda02f80a826e0`.

### 1080p varnished

Capture: `room-reference-2026-10-07T08-22-32-046Z-2692c265-4cc7-4d77-9582-53ad5331a257`.

- Receipt: `0535c8bb0ac911f4eb86115f985d53199c0d2527271aaf14809b2c8da2720b7a`.
- Raw HDR: `226cd26842ba874d99cbf1f431abd66d290bc39973c3b0c9df41232427b69b9f`.
- Clean HDR: `fbe85c0eb56b3b58a5ce31456b912b80ec2591d71f2d169af3d520322447f432`.
- Clean PNG: `f5ce1fbd3959ffa10a4333550ad2f459f51a53d775e7f671b61988fe679aee1d`.

### 4K varnished

Capture: `room-reference-2026-10-07T08-28-41-955Z-1f99c9c4-7b3b-42cf-9eb0-4d1034e65805`.

- Receipt: `3494433698ee38a56d38d95e81e679ec759621420739097efcf1cf7c4e5ff44d`.
- Raw HDR: `5037b54e697fe9dd55bce929b2648e239649d457f2392240de258abdc417beb8`.
- Clean HDR: `36844058d43265a4343528fc8f7cb11e8423d0a6615aae5aacd1be5a1d7daa07`.
- Clean PNG: `3b49fd5431900d11761c465f56cebf10ede9ef628910690b2548e3ed5a0acd1d`.

## Rollout boundary

Keep `renderer.materials.layeredClearcoat.enabled` and the local wood variant
off by default. Disable both to restore authored-material GPU-native behavior.
No production flag, package publication, main merge or CD change was performed.
PR review and release gates remain outstanding. This does not close the broader
adaptive qualification Feature or authorize white-paper performance claims.
