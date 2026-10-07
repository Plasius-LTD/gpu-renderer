# ADR 0055: bounded dielectric continuations and nested optical occupancy

Status: accepted implementation direction; physical qualification pending.
Task: #234; Story: Plasius-LTD/plasius-ltd-site#2291; Feature: #2114.

## Decision

Use independently evaluated remote snapshot flags, default off:

- `renderer.transport.boundedDielectricBranching.enabled`: sample one
  reflection/transmission branch, dividing its radiance weight by the discrete
  probability. The expected contribution remains the sum, without exponential
  continuation growth. TIR is reflection with probability and weight one.
- `renderer.transport.nestedMediaRefraction.enabled`: priority-ordered occupied
  media determine incident/outgoing IOR, exact Fresnel, Snell/TIR and radiance-mode
  squared-IOR transmission scaling. Higher integer priority wins; the most recent
  entry wins ties. Current medium changes only on transmission.

The existing four medium slots and 96-byte ray ABI remain unchanged. A third
rgba16float medium-table row is allocated only with nested optics: IOR in red,
priority in green. An extra row costs `(largestMediumId + 1) * 8` application-visible
texture bytes (plus upload staging), not claimed physical VRAM residency.
IOR is limited to 1..4; priority to exactly representable integers 0..2048.

Hidden overlap boundaries update occupancy and Beer absorption while preserving
direction, sample identity and bounce depth. Thirty-two consecutive hidden
crossings is the bounded safety limit. Occupancy overflow, duplicate entry,
unmatched exit or exhausted traversal fails sample integrity instead of evicting
media, dropping rays or accepting black. The camera starts in air. Untracked
surfaces retain their prior thin-surface convention. The staged and fused paths
share the same material intersection and nested-boundary helper.

Nested mode uses a position-aware geometric-normal offset (minimum 1 micrometre,
four f32 ULPs at the position scale) and 0.1 micrometre traversal minimum. This
supports the reference's 0.2 mm overlap at room coordinates; it is not a universal
precision guarantee. Bounds below numerical resolution remain unsupported.

## Consequences and validation

One branch introduces sampling variance in exchange for bounded work. Null
crossings add traversal and medium lookups, not a CPU ray cache or new dispatch
per crossing. No MIS, opaque BSDF, camera weighting or denoise change is intended.
The original off path, queue overflow and completed-count rejection remain.
Camera-inside-volume initialization, liquid dynamics, participating scattering,
caustic convergence and arbitrary precision are not provided.

See [the acceptance and retained evidence](../glass-water-transport-follow-up.md).
Qualification must cover isolated flags, their combination, rough splitting,
analytic GPU Fresnel/Snell/TIR/energy and completed empty/filled room images.
Shader hash pins change intentionally; they do not substitute for physical tests.
Rollback disables the relevant remote flag; it may restore the known failing
legacy glass diagnostic. Three.js is prohibited and is never a fallback.

Reference: [PBRT dielectric estimator](https://pbr-book.org/4ed/Reflection_Models/Dielectric_BSDF).
