# Completion-driven frame verification — 26 September 2026

Task [gpu-renderer#169](https://github.com/Plasius-LTD/gpu-renderer/issues/169),
Story site#2119, Feature site#2114. Experimental opt-in implementation, not site
activation, release qualification or a white-paper performance claim.

## Immutable implementation and retained receipt

- Renderer [13a8902aaaba6732c1e1a6ea30b16e94cf38f269](https://github.com/Plasius-LTD/gpu-renderer/commit/13a8902aaaba6732c1e1a6ea30b16e94cf38f269).
- Lighting fixture sources `b23af8d4c79ce23c28c5134886569b84a73c9079`.
- Physical Apple / metal-3, non-fallback WebGPU adapter, Codex in-app browser.
- Scene: diffuse-silhouette, 128×128, depth 4, maximum 32 SPP, stationary seed 7,
  denoise off. Adaptive budgets remain synthetic 2/8/32, not a qualified policy.
- Served committed source objects unchanged; page `tests/fixtures/frame-loop.html`.
- [Raw JSON and summary PNG archive](completion-driven-frames-2026-09-26.tar.gz):
  SHA-256 `966e543e61d1164a67273b5fa50bc4013a4becb698f706b19b4cbee72fa40b3c`.
- Receipt within archive:
  `frame-loop-2026-09-26T10-41-41-621Z/frame-loop-1790419317795.json`.

Four served-source hashes were independently checked against the commit. Baseline
HDR hashes were recomputed from retained float data, all 21 GPU timestamp pairs
recomputed, and all loop-frame counts/commands/ratios checked independently.
The browser compared each loop frame's full HDR hash to its direct baseline.

## Observations

Each lane first renders directly, then renders six frames through the new loop.
All 18 loop frames match their own direct baseline exactly in HDR image hash,
completed sample counts, bounce histogram and every recorded GPU API count.
Every loop stops after six frames and drains readbacks before releasing resources.

| Mode | Primary rays/frame | Path segments/frame | Passes / dispatches | CPU heartbeats during GPU waits, across six frames |
| --- | ---: | ---: | ---: | ---: |
| Fixed32 | 524,288 | 717,183 | 192 / 448 | 33 |
| Shared | 144,680 | 229,338 | 206 / 462 | 46 |
| Fused | 144,680 | 229,338 | 206 / 334 | 32 |

All modes have one render submission/wait per frame. Fixed uploads remain
32 / 10,240 bytes; adaptive uploads remain 3 / 82,688 bytes. No shader/transport
or GPU allocation changes. Fixed HDR SHA-256:
`22ec030407d4d1d5da7daad3ec4f8a828ae631b3ad5d95fbee237f1c37eab32b`.
Shared and fused HDR SHA-256:
`40285797f27e9a1467ff81740e03523f107c3091bcf80a2d3d930b13d60f1b5d`.

The heartbeat is independent JavaScript work running while the loop reports
waiting-gpu. It proves the wait does not occupy the JavaScript thread, not that
the entire wait duration is spare CPU capacity. Timer throttling, browser task
scheduling and callback work affect heartbeat counts; do not compare them as
performance metrics. The current 1.5 ms budget calculation/packing is unchanged.

Example final fused snapshot: elapsed 21.30 ms / observational 16.67 ms target =
1.278 budget ratio, 4.63 ms over budget, confirmed tile fraction 1. GPU-time
completion fraction is null, never guessed. This elapsed time includes the
diagnostic readback/preparation path; it is not GPU-only time or CPU busy time.
This is one sample illustrating the API, not a representative performance result.

## Validation and limitations

- 295 unit/integration tests pass. Coverage: 96.00% lines, 79.80% branches;
  new loop 100% lines/branches, compute 98.15% lines. All changed executable source
  files appear in combined LCOV. Existing shader coverage exception applies.
- Tests cover pending promises allowing unrelated work, next-frame boundaries,
  single-flight/start sharing, safe stop during preparation/render/observers/yield,
  restart after clean stop, failure rejection/no automatic restart, timer fallback,
  progress values, acceleration/tile waits, readback and deferred observer errors.
- Lint, source/type/clean packed consumer checks, build, package validation,
  all nine Zero-Three checks pass; full npm audit reports zero vulnerabilities.
- Existing GPU timeout/device-loss waits and the default fixed shader remain
  unchanged. Progress adds no polling, atomics, GPU buffers or GPU readbacks.
- Physical run is sequential identity/scheduling verification with diagnostics
  enabled, not randomized before/after throughput or observer-overhead evidence.
  No improvement in GPU time, CPU packing time, quality or memory is claimed.
- Existing adaptive image-quality failures and full matrix/site/CI/release gates
  remain open. No main/CD, local publication or site activation attempted.

## Reproduction

Use the lighting-owned source-bound [replay setup](https://github.com/Plasius-LTD/gpu-lighting/blob/b23af8d4c79ce23c28c5134886569b84a73c9079/docs/paired-adaptive-replay.md)
with the renderer commit above, then open `tests/fixtures/frame-loop.html` and
choose **Verify frame loop**. Preserve failed receipts as failures. Stop requests
drain a frame but deliberately fail an incomplete verification. Repeat runs use
unique receipt filenames. Do not reuse this receipt for edited implementation.

See [ADR 0043](../adrs/adr-0043-completion-driven-frame-loop.md) and
[API/ownership documentation](../../README.md#completion-driven-frames-opt-in).
