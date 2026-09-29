# Same-frame cloth close-up — 29 September 2026

Task #225, Story site#2268, Feature site#2114. Diagnostic comparison, **not a
photorealism, convergence, material-conformance or performance qualification**.
Private model/image bytes remain local; hashes below identify retained evidence.

## Immutable implementation and capture

- Renderer `fe057d6e431fbfeeaf04caaf439ec7d80a8b6a71` (fixture-only changes;
  packaged runtime/material/transport unchanged).
- Shared `b68f8682735fa8bffb5179d5e11342521a2f9446`.
- Lighting `48823cd969a89296332ae4643104d986bf3eb9a9`.
- Site source `21d43a9b63722f1ce69175a5a42b53304ee79102`.
- Capture ID `room-reference-2026-09-29T09-51-30-889Z-f9ffa931-dbd9-4c2d-b7e7-67a7013cec7e`.
- Receipt SHA-256 `ededc6b6630091ed6b61991d3ab4ac7075adfa5f154591eede698b2b6fc497e6`.

1920×1080, **uniform 128 SPP**, six bounces, stable sampler, rough splitting at
the first two bounces, sheen on, guided presentation on. Original room, Eames,
seating and standing model composition: 352,710 triangles. Sofa remains uniformly
scaled to 1.5 m width; no authored texture, material, lighting or geometry edits.
Close-up distance 0.85 m, elevation 50°, normalized target [0.5,0.55,0.65], FOV45°.
Camera position [2.2961084265,-0.0079926513,-0.6038915735], target
[1.9097668705,-0.6591304279,-0.9902331295].

All 2,073,600 pixels completed exactly 128 camera samples: 265,420,800 primaries,
789,556,694 secondary rays, 1,054,977,494 total segments. All 135 tiles verified;
all retained HDR/guide values finite; HDR alpha one; no GPU validation errors;
resource cleanup passed. Apple metal-3 physical adapter, not fallback.

## Observations and limitations

At genuine close-up scale the base-colour view shows fine authored variation.
Mapped world normals show both fine detail and larger irregular fabric structure.
That signal reaches the canonical hit/guide path; it is not simply absent from
the uploaded asset. The lit raw and cleaned images still show much less of that
structure than the normal view. Switching denoising off does not restore the
reference application's appearance. This rules out *denoising alone* as the
explanation, not every possible filtering or sampling defect.

The current close-up does **not** establish equivalence to the user's reference
image: its lighting, exposure and camera are not calibrated to that image. Do not
add artificial weave or boost normal strength to obtain an apparent match. Next
isolate angular lighting response, colour/display response and sample-footprint
effects under controlled matched conditions. Code inspection also identifies a
pre-existing ambient-dependent lower bound on base colour in
`evaluate_surface_bsdf`; its influence on colour fidelity needs a separate
qualified transport fix, not an unmeasured claim that it explains the weave.

Guides are one primary sample: RGBA8 linear albedo (authored tint included),
RGBA16 mapped world normals/depth. They are quantized diagnostics, not
antialiased beauty images. Magenta indicates missing/protected normal guides.
Displaying either guide leaves raw and filtered radiance hashes unchanged.
Display probe: 4 known pixels × 2 modes, maximum byte error **0**. Existing
assembled material, UV/sidedness and cloth-denoise physical probes also passed.

Clean/raw mean RGB ratio 0.9996598716, linear RMSE difference 0.0046382292;
these measure filter change, **not error against converged truth**.

## Cost and memory

One diagnostic render: GPU tile intervals 222,663.672 ms; readback-inclusive
render job 229,328.900 ms (about 3 min 49 s). Setup, subsequent guide retention and
PNG/HDR export are outside this job interval. Guided filter/presentation-stage
GPU median 4.58752 ms over five interleaved rounds, excluding guide capture and
final presentation. This is not a real-time result or matched-quality benchmark.

The inspection reuses existing guide textures, adds a lazy 16-byte uniform buffer
and no textures, and runs after rendering. Guided-denoiser allocated bytes at
1080p are 41,473,024. CPU readback arrays/retained PNG strings and staging are
diagnostic overhead; none is described as reduced or exact physical VRAM.

## Retained hashes

| Artifact | SHA-256 |
| --- | --- |
| Raw HDR | `90e1a47dc71c16048dda23db70a86f2c4c33f14cfa6383f3307e26c14ccb7362` |
| Cleaned HDR | `387872876bf2c503ec8f4288d75864e297bacb04634af609a383ef9573d08f40` |
| Albedo guide | `028bf65eb55186f2425435857ac85402f9ec8565aba270279f9d66eeb87da6e9` |
| Normal guide | `cb5fa9fd23596e209080cc06e54d5c92603f73f012b59270d7ac3f6e710c8ef1` |
| Raw PNG | `6ef75927af729c74e1ee9289f0fd52fae38dfb1dd00fb9045cbe10276e2fdd2e` |
| Cleaned PNG | `d8602c0140141fb0d0ebbbfc29e75fb52850c44904cd17475aadea5f76a41c05` |
| Albedo PNG | `1dc80c62ede7c9bafdd155a6d4fee2d2e4d9063d6e568c2c5fb24d9488bf7019` |
| Normal PNG | `525a0ed9e1c03c1cae29ff0de1db8171902b16407e0955c2b973fd3519c6f6bd` |

## Validation and delivery

- The new requirement-driven test suite failed on the missing implementation,
  then all four new tests passed; 362 total tests pass, 96.2% runtime line
  coverage. No packaged source file changed.
- Type checks, lint, build, package validation, complete Zero-Three and production
  dependency audit pass (zero reported vulnerabilities).
- Browser: invalid 257-SPP and guide-off/inspection-on combinations rejected;
  default/reset controls verified; colour/normal/raw/clean keyboard round-trip
  verified with correct download names; cancellation during the UV preflight
  restored Render/Reset and disabled Stop; 720px layout has no horizontal overflow.
- Implementation-head CI passed:
  https://github.com/Plasius-LTD/gpu-renderer/actions/runs/36552342689.
- README, Unreleased CHANGELOG and comparison design updated. No architecture,
  production flags, release, package publishing or white-paper claims changed.

The PR and parent Feature remain experimental; no merge/CD completion is claimed.
