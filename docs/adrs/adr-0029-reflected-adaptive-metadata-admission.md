# ADR 0029: Reflected adaptive metadata and allocation admission

- Status: Accepted for infrastructure; runtime integration and qualification pending
- Date: 2026-09-07
- Task: gpu-renderer#167; Story: plasius-ltd-site#2117; Feature: #2114
- Parent flag: `renderer.sampling.adaptivePerPixel.enabled`, default off

## Decision

Implement the [metadata design](../design/adaptive-metadata.md) as an internal,
independently testable resource boundary. Use final assembled WGSL as layout
authority, checked through released `@plasius/gpu-shader` Node tooling. Generated
byte constants are checked for exact reproducibility in the normal test suite.
The Node reflector is a development dependency, absent from renderer bundles.

Store requested/completed counts in nine bits each, bounded to 0–256, with
14 reserved flag bits. Keep full-screen pixel state separate from reusable
tile-local worklist IDs. The initialization pass clears completed counts only;
it does not choose budgets, count split siblings, normalize radiance, or trace
paths. Those responsibilities remain with their existing tracked Tasks.

Admit the complete buffer set before creating any buffer. Bound it by both the
configured allocation cap (128 MiB default) and device limits. Allocation is
lazy and transactional: concurrent callers share one acquisition, errors clean
up all partially created resources, and disposal is idempotent. Pop device-wide
error scopes before awaiting their results so another caller cannot interleave
its scopes. Do not automatically retry allocation or expose provider messages.
The owning renderer remains responsible for destroying this owner on device
loss; these resources are never reusable on a replacement device.

Depth and normal/material/risk resources are optional. Future history gets two
one-bit-per-pixel masks, not temporal radiance records. Report planned and
allocated bytes separately; fewer paths are not proof of lower memory use.

## Consequences and alternatives

No changes to the fixed dispatcher, transport, public renderer configuration,
or site occur in this increment. Adding a UI toggle now would misrepresent
unimplemented scheduling. A full-frame primary worklist and eagerly allocated
classifier/history state would violate the memory boundary. A handwritten
layout parser would duplicate existing GPU shader tooling.

## Validation and rollout

Exhaustive CPU packing, reflected codecs and shader interface checks, allocation
admission and cleanup tests, and a physical WebGPU metadata-only fixture cover
this boundary. Image/energy/SPP and matched-quality performance qualification
remain dependent integration work. The source API stays internal until the
complete-path count, compact dispatcher and foveation paths exist and qualify.

Remote evaluation belongs to the site. Disabling adaptation returns to the
unchanged fixed GPU-native dispatcher without adaptive allocations or pipelines.
Three.js is prohibited permanently and cannot be a fallback or waiver.
