# ADR 0045: Project animated inspection views with family camera matrices

Status: Accepted. Tracking: Task #272, site Story #2357 / Feature #1170.

The canvas animation preview historically projected only camera position. This
cannot express orbit orientation, a look pan or lens zoom. Add an opt-in
`setInspectionCamera` API and reuse `@plasius/gpu-camera` view/projection matrices
for environment anchors and actual skinned vertices. Keep the follow timeline
running independently and allow null to restore the follow view.

The renderer owns projection and validates/copies poses. Shared demo runtimes own
pointer, touch and keyboard input, avoiding DOM listeners in the renderer. This
does not turn the canvas preview into the separate professional WebGPU animation
renderer or enable that rollout. Existing consumers retain default behaviour.

The consumer retains `gpu-demo.scene-fidelity.enabled` and the
`site.studio-coming-soon.view` capability. Disable the existing rollout or revert
the consumer package pin through the approved release workflow for rollback.
