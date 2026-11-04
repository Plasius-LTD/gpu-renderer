# ADR0069: Preserve convergence evidence while resuming performance experiments

Status: accepted for experiments, not release qualification.
Date:3 November2026. Feature site#2114, Tasks renderer#169/#234/#271.

The user explicitly accepts convergence provisionally and requests performance,
fidelity and memory optimisation. Resume controlled experiments using the
retained source-pinned full-fidelity baseline. This supersedes the previous
pause requirement for experimentation, without changing or passing its3%/1%
reference screens. Failed measurements remain failed historical evidence.

For byte-identical host changes, require exact uploads, completed counts,
path identities/counters and HDR output. Report native GPU/job/CPU time and
application-visible allocations separately. Do not silently reduce resolution,
SPP, depth, materials or assets. Sampling-policy changes require independent
default-off controls and new image/energy comparison. Three.js is prohibited.

Provisional acceptance is not convergence certification, sustained60Hz,
matched-quality confidence, production enablement, publication or release
approval. Existing invalid-path/overflow/device/cleanup and CI/CD gates remain.
The existing convergence/adaptive verifiers stay strict; a performance-screen
receipt must disclose provisional acceptance rather than forge a pass. Reuse
gpu-performance for quality/budget policy and the existing native diagnostics.
