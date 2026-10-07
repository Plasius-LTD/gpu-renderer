# Sofa-centred native 4K inspection — 2026-09-29

Scope: lighting#103 / renderer#220, site Story#2256 / Feature#2114. A local
diagnostic composition change, not a cloth-material fix or performance claim.
Three.js remains prohibited. Private model and image binaries remain local.

## Immutable capture

- Renderer: `163163191ad362b6a6a3c1c29b34dc1e7dafc44a`.
- Lighting: `eeb25faa1ed6cdca371350c8852158ac140956e8`.
- Shared: `861005966d3af7dea4613130ae8b96310ec09ead`.
- Site asset source: `21d43a9b63722f1ce69175a5a42b53304ee79102`.
- Capture: `room-reference-2026-09-29T08-02-26-277Z-fa7a8a29-97a4-4796-b239-c0c470fd447a`.
- Stem: `room-eames-3840x2160-stable-pattern-6-bounces-split2-spp256-seating-centre`.

Local retention is under `output/playwright/eames-environments/<capture>/`,
with `-guided.png`, `-raw.png`, `-guided.json` and raw/filtered HDR chunks.
The local `output/verify-sofa-centre.mjs` validation produced
`output/sofa-centre-verification.json`. Neither contains a release qualification.

## Configuration and integrity

3840×2160, six bounces, stable-pattern sampler, rough splitting depth two,
guided spatial denoise; legacy denoise is off. Tiers remain
256/128/64/32/16/8 over 5/10/15/20/25/25% of screen pixels. All 510 tiles
completed, with 394,813,440 camera samples and the exact requested histogram.
There are 414,720 pixels at 256 SPP; the whole sofa is not asserted to occupy
that tier. Remaining counts are 829,440 at 128; 1,244,160 at 64; 1,658,880 at
32; 2,073,600 each at 16 and 8.

Sofa X/Z is now 1.8/−1.1, yaw 45°, uniform width 1.5 m. Standing reference
X/Z is 0.35/0.2, yaw 40°. Each retains its original scale, materials, UVs
and floor contact. Eames placement and camera position/target are unchanged.
The existing browser control was 45° vertical FOV before reload; it was
preserved for this capture. The earlier retained high-SPP image used 52°.
Consequently this is not a same-scene/camera paired timing or image comparison.
Scene admission remains 352,710 triangles / 90 meshes, no proxy geometry.

Surface, dual-UV and cloth-denoiser physical probes passed. No reported
validation errors or capture failures; all per-tile primary-ray totals matched,
cleanup passed. Both complete linear-HDR images were reconstructed and their
chunk/full SHA256 checked, with finite nonnegative RGB and alpha one throughout.

- Cleaned native PNG SHA256: `34ebd49f99dffecdd7d0436d7f28addf93aa9d0ab6f6cba78b003f65369fcc38`.
- Raw HDR SHA256: `bc3ed8608e4eaf8c8f546725230cf1ac0d5ee61e2e36eca10df07bee3c281863`.
- Filtered HDR SHA256: `9f0b7b63f861f3f6f3a24fd22b85539e6ed7f3b2a4d8c86e7f76dce2ccde5cd6`.

## Diagnostic cost, not a benchmark

Observed primary rays: 394,813,440; secondary rays: 2,121,809,087; total path
segments: 2,516,622,527. Summed GPU tile intervals: 434,763.334 ms. Readback-
inclusive render job: 449,005 ms (7 min 29 s). Median filtered GPU presentation
pass timing: 22.938 ms. Asset loading, probe execution and artifact encoding
are not the render-job interval. One capture establishes neither variance nor
matched-quality performance; production and full matrix qualification were not run.

Application-visible allocations: renderer buffers 355,975,492 bytes, adaptive
buffers 34,361,628, telemetry 12,352, fixture staging 852,016, cached host budgets
82,944,000; guided denoise adds 165,889,024 bytes. Texture inventory is retained
separately in the receipt. These are allocated bytes, not physical VRAM residency.

## UI and visual inspection

Verified subject selection, Eames-only/all selection, Reset to standing reference,
rejection of 257 SPP before GPU work, busy locking and same-frame raw/clean toggle.
Pure composition tests cover no extras, one extra, exact slot exchange, unchanged
rotations/scales/materials/UVs/camera, and invalid selection. No extra full
Eames-only render or new cancellation run was performed for this placement change.

The new image shows the sofa centrally, standing reference left and Eames right.
Fine cloth detail still appears subdued in the raw image as well as the cleaned
presentation. This visual observation does not identify its cause or establish
fidelity against the other renderer. Full sheen layering and texture-minification
qualification remain separate work; no material, shader or denoiser changed here.

Automated validation: lighting 168 tests, renderer 349 tests; line coverage
81.05% / 96.15%; changed composer source present in LCOV with 105/105 lines.
Lint, types, build, package contents, Zero-Three and runtime dependency audits pass.
Capture implementation CI: renderer run 36540071059, lighting run 36540262058.
README/CHANGELOG and composition design document the selectable layout. No
main/CD, production flag activation or package publication was performed.
