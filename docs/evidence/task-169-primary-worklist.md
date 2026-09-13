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

The Mac was locked during this work; this fixture has **not** been compiled or
executed on physical WebGPU. Hardware uniformity/bounds/indirect qualification
must pass before integration. Do not treat reflection or mocks as that evidence.

Task 169 stays In Progress. Remaining: qualified producer integration (#210 and
#212), primary-ray generation from the compact list, sample-ordinal/sequence
preservation, per-sample commit and resolve integration, public options/focus,
GPU-shared/site forwarding, HDR/image/stability/performance evidence and CI/CD.
No adaptive enablement, speedup, memory saving or release is claimed.
Three.js remains permanently prohibited.
