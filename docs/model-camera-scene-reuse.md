# Camera movement reuses loaded scene resources

Feature site#1170, Story site#2308, renderer Task #245. Inherited flag
`gpu-demo.scene-fidelity.enabled`; public access and adaptive controls unchanged.

Large kit/shrub qualification shows slow main-thread camera input. `updateCamera`
currently calls the full configuration constructor, re-normalizing meshes and
rebuilding CPU acceleration/material tables even though only the camera changes.
Resolve only camera vectors/projection from the existing dimensions and keep
all immutable scene/configuration resource identities. Continue resetting
progressive accumulation. Scene mutation still uses its existing full rebuild.

Requirements-first tests must verify mesh/material/acceleration/lighting identity,
correct camera normalization, invalid/default input behavior, frozen config and
accumulation reset. Preserve existing runtime API. Run relevant tests, complete
coverage/LCOV, lint/types/build/package checks and real large-model camera review.
CI/CD and exact registry publication are required before production consumption.

## Validation — 18 October 2026

The runtime identity regression failed before the fix (gpuMeshSource was rebuilt)
and passes after it. All 240 tests pass. Overall line coverage is 95.51%; changed
wavefront-compute.js is 97.16%, wavefront-config.js 96.78%, both present in LCOV.
Lint, typechecking/clean packed consumer, build, package and Zero-Three checks pass.

In the real WebGPU viewer, Searsia Lucida (377,192 triangles, 21 primitives)
completed fixed64 at 800×523. A keyboard camera action using the same browser
control returned in 10 ms and reset progress to zero; the earlier released path
repeatedly exceeded the browser control's three-second deadline. This single
local observation confirms the removed stall, not a cross-device performance SLA.
