# Frame Hook Integration

## Overview

`@plasius/gpu-renderer` now exposes additive frame lifecycle hooks so apps can:

- correlate frames across renderer, XR, and worker packages
- consume negotiated frame targets from `@plasius/gpu-performance`
- opt into frame sampling through `@plasius/gpu-debug`
- pair frame events with explicit renderer worker manifests for DAG scheduling
- own full command encoding for multi-pass render targets through
  `onEncodeFrame(...)`

## Hook Sequence

For each rendered frame:

1. `onFrameStart`
2. `onEncodeFrame` when supplied
3. Default swapchain pass plus `onBeforeEncode` when `onEncodeFrame` is absent
   or returns `false`
4. GPU command submission
5. `onAfterSubmit`
6. `onFrameComplete`

`frameIdFactory(...)` runs before these hooks so the same `frameId` can flow
through the full frame lifecycle.

`onEncodeFrame(...)` receives the command encoder, acquired swapchain texture
view, clear color, device, context, canvas, and frame metadata before any render
pass is opened. This keeps the default path simple while allowing applications
to encode offscreen scene passes, ray-tracing resolve passes, denoise passes,
and final presentation passes without bypassing renderer lifecycle ownership.

## Debug Integration

`createRendererDebugHooks(...)` is intentionally small.

- It validates that a debug session exposes `recordFrame(...)`.
- It resolves target frame time from fixed or dynamic inputs.
- It records frame samples only when a positive frame duration exists.

This avoids fabricating metrics such as GPU busy time, queue depth, or memory
pressure from data the renderer does not actually own.

## Adaptive Performance Integration

The renderer does not negotiate frame targets by itself.

Instead, callers pass in the current target frame time, typically from
`@plasius/gpu-performance`. This keeps device/runtime negotiation in the
governor while the renderer remains a consumer of that target.

## Worker DAG Coordination

Frame hooks solve correlation. Worker manifests solve scheduling.

`getRendererWorkerManifest(...)` publishes renderer stage topology for the same
runtime profile so `@plasius/gpu-worker` and `@plasius/gpu-performance` can
coordinate renderer jobs using the same stage ordering the render loop already
expects.
