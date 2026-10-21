# Public renderer documentation

This correction continues Feature Plasius-LTD/plasius-ltd-site#1170, Story #2303
and gpu-renderer Task #245, inheriting `gpu-demo.scene-fidelity.enabled`.
Documentation changes do not alter runtime rollout or access controls.

Explain the renderer's direct WebGPU APIs, explicit GPU resource lifecycle and
composable rendering paths. Avoid presenting an internal dependency-check name
as a public mission or implying opposition to Three.js. The author's preference
for this WebGPU workflow is not a general judgement about another library.

Keep dependency admission requirements and commands in the linked development
guide, expressed as the scope of this implementation. Preserve enforcement,
existing architecture decisions, public examples and managed release-integrity
text. No architecture or API change is proposed.

Review prose and documentation links and run existing README example/import
checks, lint, types, coverage, build and package checks. Existing dependency-gate
tests remain required. Prose-only edits do not need tests matching exact wording.
Publication, if performed, uses approved main/production CD and exact npm README
verification.
