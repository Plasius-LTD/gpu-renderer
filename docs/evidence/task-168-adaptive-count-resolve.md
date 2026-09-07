# Task 168: internal complete-camera-sample normalization

Status: automated checks passed; physical execution and end-to-end qualification
pending. This is not evidence of adaptive scene rendering or performance gain.

## Provenance and scope

- Baseline: `3382f8226c312f06903adbd1f8f37a737de8a97f` (merged PR 209).
- Branch: `feat/adaptive-count-resolve-168`.
- Implementation and prepared fixture commit:
  [`b912b9ad02ac48efc43b0040e760f76862bab378`](https://github.com/Plasius-LTD/gpu-renderer/commit/b912b9ad02ac48efc43b0040e760f76862bab378).
- Node: 24.14.0; package: `@plasius/gpu-renderer` 0.2.45 (unreleased changes).
- Final resolve WGSL SHA-256:
  `edde6c39c87de207809be810d866afded7580aba1337d938cc52f14d16b45d70`.
- Fixed assembled transport WGSL SHA-256, unchanged:
  `6314e7ac17898b87cd8fc0b9bce46743237b8c5f8099ca31b8040c49726564d0`.
- Capture date: 2026-09-07. No browser/device receipt has been captured for this
  stage: the browser tool reported that the Mac was locked and required manual
  unlock. The earlier Task 167 device result does not qualify this shader.

## Automated results

Requirements-first tests initially failed because the implementation module did
not exist. After implementation, `npm run test:coverage` passed 216/216 tests,
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

## Pending physical fixture

`tests/fixtures/adaptive-resolve.html` requests a non-fallback physical WebGPU
adapter and executes both runtime pipelines with the explicit reflected layout.
It is prepared to validate budgets 1–256, correct full-screen ownership inside an
offset tile, reused sum reset, HDR means, invalid sample cases, invalid tile bounds,
immutable dynamic uniform offsets and 4K allocation/cleanup. These are test
intentions, not reported results until a receipt is retained.

The allocation plan for 4K with classifiers, two history masks, count-resolve
scratch and 256 config slots is 102,786,060 application-visible buffer bytes.
Physical allocation has not yet been confirmed for this configuration. This
excludes existing renderer buffers, textures, environment assets and telemetry.
Fixture-only upload/readback staging is not runtime allocation or a VRAM measure.

## Unfinished gates

Physical compilation/execution is pending manual Mac unlock. Post-push CI is
pending. No main/CD release has been requested or performed for this change.
The fixed dispatcher and site have not been modified.

Race-free split-path producer integration (Task 210), compact scheduling (169),
actual scene HDR/image/energy evidence, device-failure/overflow integration,
baseline recapture and matched-quality timing remain outstanding. Task 168,
Story 2118 and Feature 2114 must not be marked complete from this stage alone.
Historical rejected schema-1 timing evidence is not reused. Three.js remains
prohibited without an exception or rollback route.
