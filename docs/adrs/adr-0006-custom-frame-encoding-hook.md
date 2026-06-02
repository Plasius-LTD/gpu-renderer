# ADR 0006: Custom Frame Encoding Hook

- Status: Accepted
- Date: 2026-05-19

## Context

Some renderer consumers need more than a single swapchain render pass. Examples
include offscreen scene buffers, ray-query resolve passes, temporal or spatial
denoise, and final composition into the acquired canvas texture. The existing
`onBeforeEncode(...)` hook runs after the renderer has already opened the
swapchain pass, so callers cannot insert those passes without leaving the
renderer lifecycle.

## Decision

Add `onEncodeFrame(...)` to `createGpuRenderer(...)`.

- The hook receives the command encoder, acquired texture, texture view, clear
  color, device, context, canvas, and frame metadata before the default render
  pass starts.
- When supplied, the hook owns frame command encoding.
- Returning `false` explicitly falls back to the legacy default render pass and
  `onBeforeEncode(...)`.
- Existing lifecycle hooks and renderer snapshots remain unchanged.

## Consequences

- Positive: consumers can implement explicit multi-pass WebGPU pipelines while
  retaining renderer frame IDs, XR state, resize ownership, and submit lifecycle.
- Positive: existing `onBeforeEncode(...)` consumers remain source-compatible.
- Negative: applications that use `onEncodeFrame(...)` must correctly end every
  render pass they open before the renderer submits the command buffer.

## Alternatives Considered

- Add a postprocess-only hook after the default pass: Rejected because the
  renderer would still own the first pass target and block offscreen-first
  pipelines.
- Require consumers to fork renderer command submission: Rejected because frame
  lifecycle, XR state, and debug correlation would drift across packages.
