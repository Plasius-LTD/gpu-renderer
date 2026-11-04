# Authored map audit and colour correction — 5 October 2026

Task renderer#226 / Story site#2268 / Feature site#2114. Correctness evidence,
**not** cloth photo-equivalence, convergence, adaptive or performance qualification.
Private asset and image bytes remain local; only metadata/hashes are committed.

## What was missing?

No additional image map was found missing from the default fabric. Source GLB
texture slots were compared against the existing gpu-shared decoded material:

| Fabric map | Dimensions | UV | Transform | Strength |
| --- | --- | --- | --- | --- |
| Base colour | 512×512 | 0 | offset [-3,3], scale [7,7] | authored tint [0.883,0.035,0] |
| Normal | 1024×1024 | 0 | offset [-0.5,0.5], scale [2,2] | 0.6 |
| Occlusion | 512×512 | 1 | identity | 1 |

All wrap modes repeat; rotations are zero. Fabric roughness 0.8, sheen roughness
0.8 and sheen colour [1,0.329,0.1] are factors, not missing image maps. This
default material has no metallic/roughness, sheen, displacement or second normal
texture. Other model materials do have other slots; they are audited separately.
The audit verifies decoded slots, UV availability, transforms/strengths, dimensions
and retained pixel hashes. It is not an independent PNG decoder or proof of every
GPU texture lookup. Existing physical UV/material probes remain required.

Asset SHA-256: `438b0c98b8d08a1ac79d0b75af7bd445e2e71a4743a9d62d60350e299a43f1e4`.
Decoded RGBA hashes:

- Base colour: `caa1424928826a61dd01d083835e00dd78ab8b5756a9608b2d183e12aafc5eeb`.
- Normal: `3af36778c85f43df888809fc476aa2ecc7c941cf1e12e44ab6122897bb715402`.
- Occlusion: `67d396033790d34043931f5be10aadd03b1960a14aa235d7ebf97c8f24cbea51`.

## Corrected implementation and independent physical check

Renderer `798822458dc55d4de5736705c02c8525301b22a7` removes the ambient-dependent
material-colour floor from canonical BSDF and terminal helpers, with matching CPU
references. Ambient illumination remains radiance. The runtime delta from the
September 29 full-render reference is confined to those two source files; sampling,
PDF/MIS equations, authored texture bytes, normal policy and denoising are unchanged.
No extra runtime buffers, passes, texture samples or ray branches are introduced.

Unchanged capture dependencies:

- Lighting `48823cd969a89296332ae4643104d986bf3eb9a9`.
- Shared `b68f8682735fa8bffb5179d5e11342521a2f9446`.
- Site source `21d43a9b63722f1ce69175a5a42b53304ee79102`.

On the physical Apple metal-3 adapter, the assembled shader passed independent
normal-incidence Lambert/GGX checks for black, dark, saturated and white colours,
and ambient invariance with sheen off/on (12 cases, four runs). Maximum analytic
absolute error **4.745746357004421e-8**, below the predeclared **2e-6** threshold;
maximum change from altering ambient **0**. PDF/output validity passed. The probe
uses the canonical packed/reflected frame configuration. Small analytic probes
are correctness evidence, never native-resolution or timing qualification.

## Matched 4K lighting-only experiment

New capture `room-reference-2026-10-05T20-49-45-803Z-028c9edb-a0c9-4e34-bf63-4bd21c28e93b`;
receipt SHA-256 `40df19288d3f1c1a984e98b4d2a9b464b40f6cb2623b0d88623982a0734a4f35`.
3840×2160, uniform 128 SPP, stable camera samples, white light intensity 3,
elevation 60°, same camera/geometry as the prior
[lighting-only capture](cloth-response-2026-10-05.md).

All 1,061,683,200 primary samples verified, no validation errors, cleanup passed.
Fine normal-map signal RMS changed from 0.0077367932 to 0.0077538331 (about 0.22%).
Multi-sample/centre detail retention is 0.9447244. This is a **small** response
change, not evidence that the missing-weave concern is solved. Normal correction
statistics are unchanged. The experiment excludes shadows, indirect bounces and
denoising and cannot establish full-render appearance.

Sampled-normal-on HDR: `65c05b170def811b8c47b68426830909cf6fc9d6c6eddabfb367506593e4e5d3`.
PNG: `2d633013e093d587e5176ddf8a62915d68e4086cdf83f30e52a807ebf073be55`.
All four HDR streams and native PNG dimensions were independently decoded/hashed.
Diagnostic job 17,083.1 ms; diagnostic extra GPU buffers 3,146,064 bytes, host
image/mask arrays 564,019,200 bytes, tile readback 1,572,864 bytes. Not a benchmark.

## Matched full six-bounce render

Capture `room-reference-2026-10-05T20-51-47-755Z-80d3dd3f-96cc-490f-9b3a-32e980a9b5a1`;
receipt SHA-256 `b716d2dfd1184f0f0c2fd9fad340f811318a326af806064668383b3132f5302a`.
1920×1080, uniform 128 SPP, six bounces, stable sampler, first-two-bounce splitting,
sheen and guided denoising on. Original room and all three reference models,
352,710 triangles, sofa uniformly 1.5 m wide. Same close-up camera, lighting,
placement and settings as the [September 29 reference](cloth-closeup-2026-09-29.md).

All 2,073,600 pixels completed 128 samples: 265,420,800 primaries, 789,556,396
secondaries, 1,054,977,196 segments. All 135 tiles verified; retained raw/clean/guide
arrays finite, radiance nonnegative and alpha one, no GPU validation errors,
all UV/material/surface/cloth/display probes passed, cleanup passed.

| Artifact | SHA-256 |
| --- | --- |
| Raw HDR | `d239e35c592e9a2903e2b9ee85974a40f5af382e95de4b9bb99eec509a1aa19d` |
| Cleaned HDR | `a84252e5fd3e5712d39734e7619ad055e83148820a66aae46df95105c47f0cbc` |
| Albedo guide | `028bf65eb55186f2425435857ac85402f9ec8565aba270279f9d66eeb87da6e9` |
| Normal guide | `cb5fa9fd23596e209080cc06e54d5c92603f73f012b59270d7ac3f6e710c8ef1` |
| Raw PNG | `07d429a9bc15cc4d4bbab8d157fa9b5cbf3736c23a7968e6f9aeda24ecf0e208` |
| Cleaned PNG | `1604b6b81c2cc0081548887f2fa5dd0a401e9998a45ef0cfe432f7c912248ca7` |

Both guide arrays match the earlier reference byte-for-byte. Raw RGB RMSE
**difference** is 0.0037859273; mean RGB ratio after/before is 0.9951068. Cleaned
RMSE difference is 0.0037802296. These are measured changes, not accuracy scores
against converged or photographic truth. Visual inspection still finds the lit
cloth considerably flatter than its normal guide/reference application; the colour
fix is not presented as a complete fabric-detail solution.

GPU tile intervals total 206,214.332 ms; readback-inclusive job 213,355.5 ms.
The earlier single job was 229,328.9 ms; different-day single captures do **not**
support a speedup claim. Setup and subsequent PNG/HDR export are outside that
interval. Guided allocation remains 41,473,024 bytes; inspection adds 16 bytes,
no textures. Diagnostic readback/host retention is additional. These are visible
allocations, not exact physical VRAM residency. Full 4K transport was not recaptured.

## Validation, delivery and remaining issue

- Seven new tests, fail-first checks observed; all **373** tests pass. Overall
  runtime line coverage 96.2004%; both changed runtime source files appear in LCOV
  (reference 737/755 lines; lighting shader module 1143/1143).
- Types, lint, build, package validation, complete Zero-Three and production
  dependency audit pass; zero reported production vulnerabilities.
- Browser: raw/clean/colour/normal keyboard view changes verified; invalid 257-SPP
  and inspection-without-guides rejected; reset restored 32 SPP; cancellation in
  material preflight restored Render/Reset and disabled Stop. Cancellation currently
  displays an aborted-signal failure message, not a polished cancellation message.
  720px control layout and 1280px result layout have no horizontal overflow.
- README, Unreleased CHANGELOG and design updated. No production flag, package
  publication, main merge, CD or white-paper advancement performed.
- Implementation-head [CI](https://github.com/Plasius-LTD/gpu-renderer/actions/runs/37372180227)
  is queued, not passed. Task #226 remains In Progress.

One further concrete material-policy deviation remains: occlusion multiplies the
whole BSDF and therefore affects direct illumination. The
[glTF additional-texture specification](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#additional-textures)
restricts occlusion to indirect ambient light. Correct and qualify this separately,
including independent direct/indirect and energy tests; do not assert it explains
all missing fine detail. No invented weave map, normal-strength boost, relaxed
tolerance or Three.js fallback is acceptable.
