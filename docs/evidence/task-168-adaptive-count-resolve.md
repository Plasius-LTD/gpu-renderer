# Task 168: internal complete-camera-sample normalization

Status: automated checks and synthetic physical count/resolve execution passed;
end-to-end qualification remains pending. This is not evidence of adaptive scene
rendering or performance gain.

## Provenance and scope

- Baseline: `3382f8226c312f06903adbd1f8f37a737de8a97f` (merged PR 209).
- Branch: `feat/adaptive-count-resolve-168`.
- Implementation and prepared fixture commit:
  [`b912b9ad02ac48efc43b0040e760f76862bab378`](https://github.com/Plasius-LTD/gpu-renderer/commit/b912b9ad02ac48efc43b0040e760f76862bab378).
- Corrected arithmetic fixture and regression oracle:
  [`6ea18361f14077afa1b65e29826e8ddd2eced2cf`](https://github.com/Plasius-LTD/gpu-renderer/commit/6ea18361f14077afa1b65e29826e8ddd2eced2cf).
- Node: 24.14.0; package: `@plasius/gpu-renderer` 0.2.45 (unreleased changes).
- Final resolve WGSL SHA-256:
  `edde6c39c87de207809be810d866afded7580aba1337d938cc52f14d16b45d70`.
- Fixed assembled transport WGSL SHA-256, unchanged:
  `6314e7ac17898b87cd8fc0b9bce46743237b8c5f8099ca31b8040c49726564d0`.
- Physical capture: 2026-09-08T09:24:48.676Z, Apple Metal-3, non-fallback adapter,
  in-app Chromium 152. [Receipt and provenance](task-168-physical-webgpu-2026-09-08.json).
  The earlier 2026-09-07 attempt was blocked by the locked Mac; Task 167's receipt
  was not substituted.

## Automated results

Requirements-first tests initially failed because the implementation module did
not exist. After the fixture correction, `npm run test:coverage` passed 217/217 tests,
zero skipped. Combined line coverage: 95.45%; combined branch coverage: 75.55%
(not claimed to meet an 80% branch threshold). All four changed/new runtime
source files are represented in LCOV at 100% lines. Adaptive metadata branches:
96.39%; resolve runtime branches: 96.59%. WGSL string import coverage is not shader
execution evidence.

The suite covers unequal means through 256 SPP, unweighted HDR values above
half-float range, actual rather than requested denominators, sibling reduction
reference inputs, partial/duplicate/out-of-order samples, failure flags, tile
reuse, reflected records and explicit binding layouts, pipeline failures,
allocation admission and cleanup. The fixed assembled shader hash is pinned.

The following also passed locally:

- `npm run lint`
- `npm run typecheck` (including clean packed-package consumer)
- `npm run build`
- `npm run pack:check`
- `npm run zero-three`: source, manifests, locks, declarations, bundles, active
  documentation, installed graph, tarball and SBOM evidence all passed.
- `npm audit --audit-level=high`: zero vulnerabilities (including development).

## Physical fixture results and rejected assertion

`tests/fixtures/adaptive-resolve.html` requests a non-fallback physical WebGPU
adapter and executes both runtime pipelines with the explicit reflected layout.
Both pipelines compiled and executed with zero compiler/validation errors and no
device loss. All 256 unequal budgets (1–256 SPP; 32,896 completed camera samples)
passed exact count, flag, sum and tile-ownership checks. Twelve negative cases,
invalid tile bounds, reused sum reset and immutable uniform offsets passed.

The original fixture's strict division equality failed at pixel 14: the correct
sum was 555, but the GPU mean was 37.000003814697266 rather than exactly 37.
This failed assertion is retained here; it was not a successful qualification.
The [primary WGSL specification](https://www.w3.org/TR/WGSL/#floating-point-accuracy)
permits division error up to 2.5 ULP in this input range. A tested fixture-only
oracle now applies that bound, using minimum adjacent float32 spacing. Maximum
observed division error was 2 ULP; counts and sums still require exact equality.
No runtime shader, transport, image tolerance or performance gate was changed.

The allocation plan for 4K with classifiers, two history masks, count-resolve
scratch and 256 config slots is 102,786,060 application-visible buffer bytes.
Physical allocation succeeded and owner cleanup returned to zero bytes. This
excludes existing renderer buffers, textures, environment assets and telemetry.
Fixture-only upload/readback staging is not runtime allocation or a VRAM measure.

## Unfinished gates

Post-push CI is pending for the updated head; its exact run and cleanup receipt
will be linked from PR 211 and Task 168. No main/CD release has been requested or performed for this change.
The fixed dispatcher and site have not been modified.

Race-free split-path producer integration (Task 210), compact scheduling (169),
actual scene HDR/image/energy evidence, device-failure/overflow integration,
baseline recapture and matched-quality timing remain outstanding. Task 168,
Story 2118 and Feature 2114 must not be marked complete from this stage alone.
Historical rejected schema-1 timing evidence is not reused. Three.js remains
prohibited without an exception or rollback route.
