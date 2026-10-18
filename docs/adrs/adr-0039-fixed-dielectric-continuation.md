# ADR 0039: One continuation for fixed wavefront paths

Status: accepted for implementation; production qualification pending.
Task: gpu-renderer#245. Feature: site#1170, inherited remote host flag
`gpu-demo.scene-fidelity.enabled`; Story site#2303.

## Context

The fixed renderer allocates one queued ray and one accumulation/deferred path
identity per tile pixel. Appending both dielectric lobes violates that bound,
drops arbitrary continuation records and permits concurrent writes to one path.
The original Amber fixture exhibits an almost-black shell and bands.

## Decision

Select one dielectric lobe using the existing sampler and divide its throughput
by the chosen lobe probability. Total internal reflection has probability one
and throughput one. Keep a single delta-metal reflection. Remove the untracked
sibling emission; no capacity or ABI change is required. The CPU branch reference
API is unchanged. This is a correctness repair of the published fixed path,
independent of the experimental adaptive branching and nested-media work.

## Consequences

At most one continuation is emitted per incoming path, preserving queue capacity
and a single writer for each history identity. Sampling variance can change;
matched raw and denoised fixture captures and opaque/metal regressions are
required. Higher sample counts alone cannot repair a queue race. This decision
does not claim rough-dielectric or nested optical correctness. Original assets
and materials remain unchanged. Production can be rolled back using the stored
host rollout gate or a previous approved deployment.
