# Rough-cloth reconstruction evidence — 2026-09-28

Task #222; draft PR #216. Experimental presentation fix, not a transport,
convergence, material-conformance or performance qualification.

## Provenance and scope

Physical Apple / metal-3 adapter, non-fallback. Source snapshots:

- Renderer after: `ad748343b54cf51e75cae1e032b2789d84bd2eef`.
- Renderer before: `e718af58937693b8f28ce5cb2018ba860e65f32d` (preceding surface fixes).
- Shared: `861005966d3af7dea4613130ae8b96310ec09ead`.
- Lighting: `ed6475648d98ceb46ffebc414f89e893fb56208a`.
- Site assets: `21d43a9b63722f1ce69175a5a42b53304ee79102`.

Original room, Eames, supplied seating and standing-reference assets; private
model files are not included. Camera, uniformly scaled 1.5 m seating, materials,
52-degree vertical FOV, six bounces, stable sampler, depth-two splitting and
radial 32/16/8/4/2/1 sampling (5.95 average) are unchanged. The entire frame is
not 32 SPP. Guided flag on for both before/after; same-input raw/cleaned retained.

Retained local artifact folders under `output/playwright/eames-environments/`:

- 1080p before: `room-reference-2026-09-28T19-25-30-559Z-1b263fbd-a99d-4683-abf5-911d69266389`.
- 1080p after: `room-reference-2026-09-28T19-55-17-320Z-67f2355e-ba0f-4f0f-9ec3-c5fc7a8a58f9`.
- 4K before: `room-reference-2026-09-28T19-27-38-500Z-4e04a811-6c1d-4ac8-b431-79c18441ff58`.
- 4K after: `room-reference-2026-09-28T19-57-32-011Z-db4cc265-d4c3-4dbe-976c-ddb82db8c1a0`.

Each includes native PNG, JSON provenance/counts/timings, original and filtered
linear HDR chunks. Local `output/verify-cloth.mjs` independently checks hashes,
finite/nonnegative values/alpha, settings, scene, budget and allocation equality.
Results: `output/cloth-verification.json`. These private artifacts are not
downloadable from this public document; arrange approved access for reproduction.

## Measurements

| Measurement | 1080p | 4K |
| --- | ---: | ---: |
| Completed camera samples, unchanged | 12,337,920 | 49,351,680 |
| Filter + tone-map GPU median before | 3.408 ms | 13.566 ms |
| Filter + tone-map GPU median after | 4.063 ms | 22.807 ms |
| Added filter cost in these captures | 0.655 ms | 9.241 ms |
| Guided allocation, unchanged | 41,473,024 bytes | 165,889,024 bytes |
| Selected cloth neighbour-difference RMS before | 0.065788 | 0.064114 |
| Selected cloth neighbour-difference RMS after | 0.013127 | 0.011209 |
| Selected patch mean luminance before | 0.197864 | 0.197378 |
| Selected patch mean luminance after | 0.197401 | 0.196711 |

Preselected back-cushion rectangle: 4K x=750, y=820, width=350, height=80;
half coordinates at 1080p. RMS is linear luminance horizontal/vertical neighbour
difference, not error against converged truth: reduced variation includes noise
and potentially lost shading detail. Approximate reductions are 80% and 83%.
Mean patch luminance changes are about -0.23% / -0.34%, not proof of energy
conservation. The physical synthetic texture test independently measures detail.

Five warmed same-input filtered timing rounds are retained, interleaved with
raw resolve. 4K after ranges 19.79–30.28 ms and trends downward, so this is not
a steady-state speed comparison or confidence-bound benchmark. No GPU speedup
is claimed. Diagnostic transport tile-time sums are 15.544→15.614 seconds at
1080p and 55.719→54.458 seconds at 4K; not real-time frame rates. Guide capture
is included there, not in filter time. No extra dispatches, samples or allocations.

Raw float HDR is bit-identical before/after at both resolutions; per-tile ray
counters, every completed count, histogram, budgets and allocation inventory
match. Filtered reflective-visor interior also matches exactly. No validation
errors or accepted-frame failures; cleanup passed. Filtering remains GPU-only.

## Physical probes and QA

Production capture uses permuted slots/source pixels and true hit records.
Eligible rough cloth is admitted; lower roughness, metal, transparency,
transmission, coat, emissive material, misses and later camera samples remain
protected. Deliberately discontinuous micro-normals do not veto macro guidance.
Existing diffuse HDR/edge/count tests still pass.

- Cloth guide failures: 0; invalid-pixel failures: 0.
- Noisy analytic cloth RMSE ratio: 0.010592 (threshold < 0.65).
- Maximum alternating texture relative error: 0.1831% (threshold <= 0.5%).
- Constant HDR error: 0 (threshold <= 0.001).
- Protected input error: 0.000751, within half-float tolerance <= 0.002.

Two preliminary failures were correctly rejected: synthetic material packing
used wrong field offsets, then the filter drifted by one half-float step on a
constant bright patch. Corrected the fixture, added reflected field-layout
verification, and accumulated cloth differences about the centre to preserve
constant HDR. No acceptance thresholds were relaxed and failed runs are not
qualified scene evidence.

Browser skill QA: real controls, 1080p/4K captures, raw/cleaned reversal, busy
locking, reset, invalid sampler/splitting and FOV, cancellation, final image and
1713px viewport with no horizontal overflow. No layout or new controls changed;
no fresh narrow-screen test this turn. Native image review retains seams,
buttons, silhouettes and protected visor; low-frequency mottling and some
surface-detail softening remain. This is not the comparison app's lighting or
full material response.

## Gates and remaining work

346 tests pass, 96.15% line coverage, changed shader source present in LCOV at
100%. Lint, types/clean consumer, build, public package checks, zero-Three
(source/graph/artifacts), and production dependency audit pass (zero reported
vulnerabilities). Implementation CI succeeded:
https://github.com/Plasius-LTD/gpu-renderer/actions/runs/36475719754 . README,
Unreleased CHANGELOG, design and ADR 0052 updated. Default-off flag unchanged.

Full energy-compensated sheen layering and independently authored sheen
roughness are not implemented by this fix; texture minification and true
converged material/temporal comparisons remain open. The
[Khronos sheen definition](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_sheen)
describes a separate cloth response, not simply noise suppression. Revisit
denoiser eligibility when that independent response is added. Optimize the
additional filter cost before claiming efficiency. No white-paper advancement,
production activation, merge, local publication or main/CD release performed.
