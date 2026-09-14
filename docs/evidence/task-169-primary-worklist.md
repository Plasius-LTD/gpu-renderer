# Task 169: internal primary-worklist evidence

Status: local stage implemented; not live adaptive rendering.
Base: `77ae5fb81f98c563b2c5aabfa4a497b76e096f19` (PR 211).
Primary WGSL SHA-256:
`3e81bf23c8f30f2bc7d7a62faf4837153eebfaec0c94daf84d60bf0a875fea75`.
The assembled fixed transport remains byte-identical to the base, verified by
the existing pinned-hash test. No public renderer or site consumer changed.

## Local verification on 2026-09-13

Node 24.14.0. Requirements-first primary-stage tests failed with the missing
implementation. Final full suite: 225 pass, zero skipped. Combined coverage:
95.51% lines / 76.16% branches; no claim of 80% overall branch coverage. Every
changed runtime source appears in LCOV at 100% lines; metadata branches 96.66%,
new primary runtime 100%. Shader-string coverage is not WGSL execution.

Reflection checks the complete primary module and per-entry-point interfaces.
It generates the 32-byte config, 16-byte control and 12-byte dispatch constants;
CPU packing matches the generated codec. Tests verify empty/mixed/full 16,384
pixel workloads, tiers 1..256, ownership mapping, capacity/error vetoes, all
pipeline failure stages, dynamic config offsets, disabled no-touch behavior,
uniform limits and resource cleanup. The old byte-accounting test was extended
with the two new zero-valued categories; its existing byte totals are unchanged.

Lint, types including a clean packed consumer, build, public package checks,
all nine package Zero-Three checks and dependency audit passed. Zero-Three also
passed before adaptive implementation. No dependency/workflow change was needed;
audit reports zero vulnerabilities. CI remains pending on approved runners.

## Allocations

The stage reuses existing worklist, indirect and packed pixel-state buffers.
When requested internally, it adds 16 bytes of control and 256 bytes per immutable
configuration slot. Example: nine slots add 2,320 bytes, accounted under the
existing 128 MiB cap before allocation. These are application-visible buffer
allocations, not physical VRAM residency. Disabled mode adds zero allocated bytes.

## Physical fixture and outstanding gates

`tests/fixtures/adaptive-primary.html` is prepared to run the actual compaction
pipelines and an indirect identity-consumer probe on a non-fallback adapter.
It checks all power-of-two tiers through 256, empty/full/mixed edge tiles,
invalid GPU configuration, failed/reused counts and overflow. The receipt
separates GPU-read local IDs from CPU-expected full-screen mappings and records
cleanup. It draws no rays and is not a render or benchmark.

The Mac was locked on 2026-09-13. On 2026-09-14 the fixture compiled and executed
on a non-fallback Apple Metal-3 adapter: all 16 cases passed. Every full-tier
case visited exactly 16,384 unique pixels; the mixed edge tile visited 51 and
the empty tier visited zero. Invalid state/configuration and overflow produced
zero indirect dispatch and no visited pixels. No WebGPU validation errors were
reported. Adaptive buffers allocated 139,292 bytes and returned to zero on cleanup.

The [revision-bound observed receipt](task-169-physical-webgpu-2026-09-14.json)
retains the unmodified compact on-page results, source/fixture hashes and clean
implementation commit. Full per-pixel arrays offered by the download link were
not independently retained. This is physical worklist/indirect execution evidence,
not transport, rendered-image, performance or exact physical VRAM evidence.

Task 169 stays In Progress. Remaining: qualified producer integration (#210 and
#212), camera bridge/bounce coordination and per-sample commit/resolve integration, public options/focus,
GPU-shared/site forwarding, HDR/image/stability/performance evidence and CI/CD.
No adaptive enablement, speedup, memory saving or release is claimed.
Three.js remains permanently prohibited.

## Compacted camera generation on 2026-09-14

The new internal camera bridge shares canonical camera and sampling WGSL with
fixed generation. Its complete camera-only module is reflected and the fixed
assembled shader remains SHA-256
`6314e7ac17898b87cd8fc0b9bce46743237b8c5f8099ca31b8040c49726564d0`.

The first physical run at `c49841dd9303f5ef8203025a4a0aa95e7f0505fa` failed
compilation because the camera module omitted the sampling helper body. This is
retained as [rejected evidence](task-169-camera-rejected-2026-09-14.json), not a pass.
The fix shares the entire canonical sequence helper block; it changes neither
the original sequence nor the fixed assembled shader. No tolerance was relaxed.

At clean revision `ac1bd4cc89ec27a3520f7681541d9ee5d2e6ab71`, all 49 physical
cases passed on non-fallback Apple Metal-3. The GPU-generated compacted records
matched 18,594 dense production-camera records bit-for-bit, across tiers 1..256,
epochs 0/7, ordinals through 255, mixed/full/empty tiles and 13 veto cases. Padding
was untouched; there were zero WebGPU validation errors or unexpected device
losses. The [observed receipt](task-169-camera-physical-webgpu-2026-09-14.json)
records the shader/fixture hashes and each case. It is identity evidence, not
bounce/radiance/image or speedup evidence.

The bridge itself allocates no buffers. The fixture's reused adaptive owner
allocated 214,560 bytes for its 257x129 state and 64 configuration slots, returning
to zero on cleanup. Additional test-owned queue/reference/staging buffers totaled
6,455,328 bytes, separately reported. These are allocated bytes, not exact VRAM.

The [count-resolve recapture](task-169-count-resolve-physical-webgpu-2026-09-14.json)
also passed on the preceding worklist revision: 32,896 synthetic complete samples
across 1..256 SPP, twelve rejection cases and 102,786,060-byte 4K allocation with
zero bytes after destruction. It does not exercise the real transport producer.

Local final validation: 229 tests, zero failures/skips; coverage above 95% lines.
Every changed runtime file appears in LCOV; the camera runtime/shared shader,
assembled camera source and modified layout/BVH sources have 100% lines. Existing
sampling-dimension code has 98.77% lines. Lint, types including a clean packed
consumer, build, package checks, all nine Zero-Three gates and production dependency
audit passed (zero reported vulnerabilities). CI/release qualification remains
pending. The full-transport reflection identifier defect is tracked in gpu-shader#31;
the camera-only reflection pass is not a substitute for fixing it.

## Tier-qualified sample commit, 14 September 2026

Two new requirements-first tests reproduced the dense-commit integration gap:
unselected pixels were poisoned when a compacted pass had no sample for them,
and tier configuration was not validated. The version-2 internal count ABI now
selects exact-budget pixels before consuming samples. The payload grows from 32
to 48 bytes inside unchanged 256-byte allocations. Full-tile resolve still covers
every valid completed pixel; fixed assembled transport remains byte-identical.

At clean commit `ec6176de8d02e2ca6e9e6a3d7f9ac5172f1bd2e0`, Apple Metal-3
executed ascending and descending mixed tiers [1,3,8,256], with 17,152 synthetic
completed records in each order. Unselected counts/sums and non-tile pixels were
preserved; all-tier resolve and invalid-tier/ordinal rejection passed. The
existing 32,896-record dense arithmetic, twelve failure cases and 4K allocation
checks also passed. There were no validation errors or device loss, and allocated
bytes returned to zero. The [revision-bound receipt](task-169-tier-resolve-physical-webgpu-2026-09-14.json)
retains the observed values. These are synthetic complete samples, not traced rays.

Local unit suite: 231 tests pass. Overall line coverage is 95.55%; overall branch
coverage is 76.42%, not an 80% branch claim. The changed resolve runtime, shader
and generated ABI have 100% lines in LCOV; the runtime has 97% branches. Lint,
types/clean packed consumer, build, public package, all nine Zero-Three checks
and production audit pass (zero vulnerabilities). CI/CD and full real-producer,
adaptive scheduler, site, image and performance qualification remain outstanding.
