# ADR 0038: Progressive linear-radiance accumulation

Status: Accepted for implementation (2026-10-14).

Feature: Plasius-LTD/plasius-ltd-site#1170, Story #2303, renderer Task #241. Flag: `gpu-demo.scene-fidelity.enabled`, evaluated by the host. The local review override is localhost-only; no public capability changes.

## Decision

Add `progressive: true` as an opt-in renderer allocation. A separate compute pass reads each batch's unfiltered linear radiance and updates a full-image float32 mean, weighted by batch sample count. Copy the accumulated image back to the existing radiance texture, then use the existing denoise/presentation pipeline. Never average tone-mapped or denoised pixels. This preserves the trace pipeline's binding limits and existing default behavior. History uses 16 bytes per pixel, a resolve texture another 8, plus a 16-byte uniform; no extra resources when disabled.

`resetAccumulation()`, `updateCamera()` and `updateSceneObjects()` invalidate history. `getSnapshot().accumulatedSamplesPerPixel` counts submitted samples; consumers must await GPU completion before claiming completed progress. Render batches serially. Progressive mode uses changing frame seeds even when stable sample routing is requested, avoiding repeated identical samples. Existing static-frame routing remains unchanged when progressive mode is off.

## Consequences

The host owns idle scheduling and target limits, which keeps the renderer framework-independent. Shared inspection uses one-sample previews followed by batches of at most four, up to 256 samples. Resource allocation remains bounded by device limits. The copy adds GPU bandwidth but avoids increasing trace-stage storage bindings or changing material transport. Reset retains allocations and overwrites history on the next pass.

Rollback: omit `progressive` to restore independent frames, or disable the inherited host feature flag. Production consumers must wait for the approved renderer CD release before updating dependencies. See [design and tests](../progressive-model-inspection.md).
