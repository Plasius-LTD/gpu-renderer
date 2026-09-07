# Task 167 — adaptive metadata evidence

Status: implementation and local metadata-only validation passed; post-push CI,
review and approved merge/release are separate gates. This does not complete
Feature 2114 or make adaptive rendering available in Product Studio.

## Immutable implementation

- Base renderer: `2aaf9c06cb72f160c89fdb0497e5edcba25bef7a` (0.2.45).
- Implementation: `8d172d359da9cc3896696f49c783533006c5308b`.
- Final initialization WGSL SHA-256:
  `2d2782a19c480564ae5bde52123e2dc8de4db3fcab818e26cc7ad743c6934821`.
- Browser fixture SHA-256:
  `9e8525839ac8b0ec48dffcd3bac6d68eb8f92bb2deb7b690334110e6d79e384b`.
- Released reflection tool: `@plasius/gpu-shader@0.1.4`, pinned development-only.

Only new internal modules and their test/build support were added. Fixed shader,
dispatcher, material transport and public export/type sources have no diff
against the base. No live site flag, package resolution or rendering mode changed.

## Local checks

Node 24.14.0; 7 September 2026:

- Requirements-first test run failed with the expected missing implementation.
- 204 package tests pass, including 12 new adaptive-metadata tests.
- Combined c8 LCOV: 95.27% lines overall. The new metadata module has 100%
  lines/functions and 96.84% branches; new shader, generated constants and
  reflection support have 100% line coverage. Every added source module appears
  in the combined report. Overall branch coverage remains 74.73%; it is not
  represented as exceeding 80%.
- LCOV SHA-256:
  `ee1264265bb1a618a50758ecf2afb4f17e9c368b2b5823b39fc0f621a15cdd7d`.
- Lint, typecheck (including clean packed consumer), build, package check and
  full package Zero-Three gate pass. `npm audit` reports zero vulnerabilities.
- Hidden-file workspace scan passes: 370,983 relevant files, 1,040 manifests,
  733 locks, no violations. Inventory digest:
  `a10388f2482cd37c64399d581512ac3ba0f9bce5aab858ed272c9dd5cbf732f8`.
  This is the pre-implementation inventory, not a digest of subsequent edits;
  the post-edit package gate separately covers the new dependency and artifacts.

## Physical metadata execution

Observed in the existing Codex in-app browser at `2026-09-07T13:29:43.972Z`:

- Adapter vendor `apple`, architecture `metal-3`, fallback adapter `false`.
- Browser reports Chrome 152 on macOS; adapter device/description fields blank.
- 132,612 legal count/flag records uploaded, reset in the actual compute shader,
  read back and verified. Counts span every legal requested/completed pair from
  0 through 256, with flags 0, 1, 8192 and 16383.
- Requested counts and flags preserved; every completed count reset to zero.
- Compilation errors: 0; scoped validation errors: 0; device loss detected: no.
- Full 3840 × 2160 adaptive buffer set allocated: **101,671,948 bytes**.
- Owner reports zero allocated bytes after destruction.
- Device limits: max buffer size 268,435,456 bytes; max storage binding size
  134,217,728 bytes.

| Allocation class | Application-visible bytes |
| --- | ---: |
| Packed pixel state | 33,177,600 |
| First-hit distance | 33,177,600 |
| Normal/material/risk | 33,177,600 |
| Tile-local worklist | 65,536 |
| Indirect dispatch | 12 |
| Two one-bit history masks | 2,073,600 |
| Total adaptive state | 101,671,948 |

The fixture additionally uses a 530,448-byte test input buffer and a 530,448-byte
readback staging buffer. These are qualification-fixture overhead, not part of
the runtime adaptive allocation. Browser/driver memory and physical VRAM
residency are not measured. A no-classifier/no-history 4K plan is 33,243,148 bytes.

Reproduce by serving this checkout on loopback and opening
`tests/fixtures/adaptive-metadata.html`. Map `/src/` to this checkout's source;
the fixture has a 20-second timeout and disposes its device/resources. It uses
the WebGPU-generated pipeline layout for the exact final WGSL. The Node test
independently checks the explicit pipeline descriptor against that module's
reflected interface and generated CPU byte constants. Browser validation used
the existing browser because terminal-launched browser access was unavailable;
the browser-validation workflow kept this check separate from Product Studio.

## Not established

No adaptive radiance, unequal-count resolve, primary compaction, foveation,
motion policy, escape-history classification, expanded environment, image
quality, energy drift, fixed-32 convergence, or matched-quality speedup was
measured. Allocating history buffers does not implement history policy. This
local fixture is not the schema-2 fixed-SPP benchmark or a complete trusted
multi-device qualification bundle. Lighting PR 94's provenance-bound recapture
and renderer normalization/dispatch Tasks remain open. Historical schema-1
timings remain rejected.

Task 167 stays open until its delivery gates finish. The next runtime work is
Task 168's complete-camera-sample normalization, then Task 169's compact primary
dispatch and Task 170's foveation, followed by released shared/site integration.
All adaptive flags remain off. Three.js is prohibited and is never a fallback.
