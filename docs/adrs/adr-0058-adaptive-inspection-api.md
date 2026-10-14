# ADR 0058: Owned adaptive inspection API

Accepted for experimental implementation, 2026-10-14.

Expose `createAdaptiveWavefrontRenderer` from `@plasius/gpu-renderer/adaptive`. It requires an explicit positive `renderer.sampling.adaptivePerPixel.enabled` decision. Regular renderer instances do not expose adaptive rendering or allocate adaptive buffers. The experimental instance owns its buffers, shared-round pipelines and count readback directly; the diagnostic runner is not a runtime dependency.

`renderAdaptiveFrame({budgets,signal,onProgress})` copies and validates Uint8/Uint16 budgets before GPU work. Dimensions are bounded to 3840 per axis and native UHD total pixels; sample ceilings are 1–256 and depth 1–20. It uses 128px tiles, stable-pattern sample addresses, deferred complete-path resolution and strict physical lighting. Rough splitting is disabled. Other optical/material experiment flags remain caller-controlled; merely using this entrypoint does not activate every diagnostic experiment.

Each tile resolves with actual completed counts, checks every pixel and control failure word, then presents. Completion returns actual mean/minimum/maximum SPP and adaptive allocation bytes. Partial tiles cannot report completion. The runtime uses a single reusable staging buffer, a total adaptive-allocation cap of 128MiB, 60-second initialization/readback/submission deadlines, single-flight admission and explicit cancellation between drained submissions. Camera/scene mutation is rejected while an adaptive job runs; ordinary asynchronous frames and adaptive frames exclude one another. Aborted work may restart; fatal errors dispose adaptive resources. Idempotent destruction handles partial initialization.

Denoising runs after all validated linear tiles and never becomes an accumulation input. This is prescribed per-pixel allocation, not variance convergence or temporal reuse. Pixel-budget policy stays in gpu-lighting; scene/camera lifecycle stays in gpu-shared. No production enablement or visual-quality qualification is implied. Roll back a host by removing its positive decision and recreating a fixed renderer. Publish only after upstream PR216 and normal CD/released-consumer checks.

See [integration design](../adaptive-model-inspection.md).
