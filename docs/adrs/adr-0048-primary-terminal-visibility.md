# ADR 0048: Preserve primary camera source radiance

- Status: Proposed; physical verification required
- Task: gpu-renderer#212; Story: plasius-ltd-site#2168; Feature: #2114
- Inherited adaptive rollout control: `renderer.sampling.adaptivePerPixel.enabled`

A camera miss and a camera hit on an emissive source have no competing
next-event estimate. The primary ray's stored PDF of one is bookkeeping.
Using it in the power heuristic attenuates those sources; a previous
constant-white environment check at 32 SPP returned 0.99370754.

Use the same terminal MIS eligibility predicate for environment and emissive
records: the bounce must be greater than zero and the ray must be non-delta.
Leave secondary PDFs, power heuristic, and sample weighting in place.
Changing the initial PDF or compensating with exposure would obscure the
estimator error and affect unrelated transport.

The bounded fixed path from ADR 0039 already has a single continuation per
camera path. The correction needs no split-tree storage, host dispatch change,
new public interface, or dependency. Adaptive split-path qualification stays
with #210. Keep adaptive rollout off. Roll back only to an approved GPU-native
release.

The [evidence procedure](../evidence/task-212-primary-terminal-visibility.md)
separates the raw physical source check from broader Product Studio reference
qualification. Keep both resolve paths and eligible secondary MIS covered.
