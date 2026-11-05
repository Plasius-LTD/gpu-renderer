# ADR 0047: Near-first closest-hit traversal with canonical ties

- Status: Accepted for implementation; release qualification required
- Date: 2026-11-05
- Scope: site Story2482 / renderer Task292, Feature1170 / Epic2271

## Context

Fixed-quality profiling of the public forest10000 scene identified closest-hit
intersection and surface/shadow work as the dominant GPU costs. The released
traversal visits right children first regardless of ray direction, often finding
far geometry before a nearer occluder. Instance reuse avoids duplicate geometry
storage but does not eliminate this per-ray traversal cost.

## Decision

Keep existing BVH construction, buffers, public APIs and material arithmetic.
Evaluate both instance-tree child bounds with one cached inverse direction,
push the farther child first, and retain its entry distance on the bounded stack.
Skip pending children only when their bounds lie beyond the accepted hit.
Geometry trees retain their canonical right-first order and reuse one inverse
direction per ray. Each transformed ray remains unnormalized so its distance
parameter is comparable to the world ray.

Preserve the old exact-distance winner: later packed TLAS instances have
right-first priority. Inside each geometry tree, original stack and leaf iteration
order remain unchanged. The initial distance limit remains strict; equality is
admitted only to resolve a tie with an already accepted candidate.

## Alternatives and qualification

Deferred normal/UV/shading reconstruction passed CPU candidate equivalence but
changed 156 displayed colour channels on the physical forest. Combined near-first
TLAS/BLAS traversal matched initial frames but changed one displayed channel by
1/255 at a later camera pose. BLAS-only reordering reproduced that mismatch;
published-vs-published and TLAS-only comparisons passed the same 12-pose sequence.
A widened-bounds experiment also failed exact optical identity. These variants
are excluded; their evidence is retained. This decision trades some potential
throughput for exact tested image behavior without loosening optical gates.

Actual WGSL tests compare candidate records against the immutable renderer0.2.61
oracle, including strict limits, inside bounds, parallel rays, degenerate
triangles, exact ties, GPU heap depth differences and mirrored/nonuniform
instances. Work-count tests cover instance pruning and reciprocal reuse.
Physical WebGPU qualification compares full RGBA and linear HDR moving frames
and alternates warmed timings at identical resolution, samples, depth and camera
keys. Verify disposal and errors independently of timing.

## Consequences and rollout

Stack entries are larger; near-first ordering can add small-scene overhead and
must be measured. This does not promise constant rendering cost from one to one
million objects, or 24 FPS for the forest. Other transport, shadow, storage and
adaptive-budget changes retain separate tracked scope.

Publish only through the approved main production package workflow and adopt
the public artifact through the site's approved gates. Existing
`gpu-demo.scene-fidelity.enabled` and route capabilities govern exposure; there
is no new product entitlement. Roll back through the same approved package/site
path. Preserve optical/UHD holds and dependency-refresh holds.
