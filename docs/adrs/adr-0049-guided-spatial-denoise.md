# ADR 0049: independent guided spatial reconstruction

Status: experimental, default off. Story site#2249, Tasks renderer#218 and
lighting#101; parent Feature site#2114.

The room lane needs low-SPP rough-surface reconstruction. Adopt the bounded
[guided spatial design](../design/guided-spatial-denoise.md), not a transport
change or temporal accumulation. The renderer owns shaders/resources; lighting
owns analytic reference inputs, metrics and retained scene evidence.

Capture existing primary hits once per tile. Use fixed three-level a-trous
filtering in linear HDR, geometry/albedo safeguards and actual completed counts.
Protected material/environment pixels retain raw input. Keep source radiance and
presentation separate; don't infer transport accuracy from a cleaned screenshot.

`renderer.denoise.guidedSpatial.enabled` is supplied by the host remote flag
snapshot, default false, with an explicit local validation override. No site
production activation or public boolean-denoise behaviour changes. Disable the
child and recreate to restore no extra allocation/capture/filter pipeline.

Cost: one extra dispatch per tile and four full-frame postprocessing dispatches;
20 bytes/pixel additional storage when borrowing existing scratch, plus 1 KiB
uniforms, capped at 192 MiB. Without borrowed scratch, 28 bytes/pixel must meet
the same admission cap. Bounded diagnostic staging is accounted separately.

Trade-offs: spatial bias, lost fine detail and single-primary-hit ambiguity at
silhouettes remain possible. No guarantee of reflection reconstruction or room
convergence; no automatic white-paper/performance claim. Preserve raw evidence
and existing structural/detail gates. Three.js is permanently prohibited.
