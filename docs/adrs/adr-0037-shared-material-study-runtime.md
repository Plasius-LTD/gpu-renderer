# ADR-0037: Shared production material-study runtime

- Status: Accepted
- Date: 2026-10-11
- Task: #230; shared Task #140; site Task #2300; Feature #1170 / Story #2272
- Rollout: gpu-demo.scene-fidelity.enabled and existing GPU route capability

The reviewed source-only camera, ageing and CC0 fixture helpers must be reusable
by the production site. Shared-runtime governance assigns common 3D demos to
gpu-shared, not the renderer or a site-local copy. Transfer the six helpers and
all four test files to gpu-shared's isolated material-study entry. Their existing
behaviour and tests are preserved, including corrected vertical grab, exact bare
wood endpoint, deterministic fraying, bounds and gesture disposal.

Expose the renderer's existing material validator as the additive public
validateNativeSurfaceMaterials API, including types and packed-consumer tests.
It is the same implementation used before GPU allocation, not a second validator.
The renderer root does not import fixture or DOM helper code. The existing camera
controls development dependency transfers to the shared demo owner. This supersedes
source-only ownership statements in ADR-0034 and ADR-0036, without changing the
future general-purpose ageing-package decision or accepted rendering behaviour.

Preserve current main's canonical model ingestion and pipeline-owned version and
release notes. Release the renderer first through main cd.yml, then the shared
runtime, then site registry adoption and production CD. Retain tests and LCOV in
the new owner; this transfer is not an exemption from coverage. Roll back via the
existing remote rollout flag or an approved prior production release.
