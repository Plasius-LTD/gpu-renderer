# TDR 0006: Instanced scene qualification

Date: 2026-10-27. Task #264; Story plasius-ltd-site #2336; Feature #1170.
Controls: gpu-demo.scene-fidelity.enabled and site.studio-coming-soon.view.

## Acceptance

- One, fifty and one hundred references retain identical unique triangle/BLAS
  storage. Instance records cost 144 bytes each; balanced TLAS nodes cost 48 bytes.
- Multiple sources preserve material and geometry identity. Invalid mesh/instance
  IDs, missing references, non-finite/non-affine/singular transforms fail closed.
- Real WebGPU compilation and transformed-vs-expanded rendering agree for identity,
  rotated, reflected and nonuniform transforms. Include normal maps and shadow
  rays in regression qualification; retain all existing composite scenes.
- Memory admission checks requested buffers/textures against device limits and
  the total byte budget. Exact-boundary allocation succeeds; one byte over fails.
  Failed initialization, scene teardown and transient readback release resources.
- Runtime tests, types, build, lint, package/security checks, changed-source LCOV
  and >=80% line coverage pass before release.

## Evidence and limits

The first local real-GPU crowd test rendered 100 astronaut placements, six tree
placements and twelve authored shrub-group placements at 800x500, one sample and
four bounces. It retained 528,922 unique triangles in 25 mesh primitives and 365
mesh instances. Requested resources totalled 471,616,948 bytes; instance records
were 52,560 bytes. Loading, preparation and that first frame took 10.5 seconds on
this test machine. This is initial evidence, not a portable performance promise.

Saved evidence: output/dense-scene-2026-10-27/first-instanced-crowd.json and
transform-equivalence.json in the delivery workspace. Continue progressive,
1080p/UHD, recovery, package release and public showcase qualification before
closing the delivery hierarchy. Do not describe requested resource storage as
measured physical VRAM. Immutable package/release evidence belongs on the issues.

The 800x500 crowd subsequently completed 64 progressive samples at six bounces
with denoising in 29.4 seconds including loading/preparation, using the same shared
geometry. Evidence: crowd-64spp-800.json and crowd-64spp-800.png.
