# TDR 0005: Feedback Diagnostic Bucketing

## Summary

The renderer converts exact, transient CSS viewport and frame measurements into
the closed `@plasius/gpu-shared/feedback-diagnostics` vocabulary only after
flag, capability and consent checks.

## Contract

- Disabled, unauthorized or unconsented input returns `null` before renderer
  observations are read.
- Viewport buckets use 600/900/1,440 CSS-pixel thresholds.
- FPS buckets use 15/30/60 thresholds.
- Frame-time buckets use 17/34/67 millisecond thresholds.
- Invalid or unavailable numbers map to `unknown`.
- Enabled input must use plain own data properties; accessors/proxy failures
  become one fixed safe error.
- Provenance is derived from the registered surface.
- Exact measurements are not returned or retained.
- Final packet validation is delegated to the shared closed parser.
- The helper has no automatic invocation, diagnostic capture, transport or
  persistence.
