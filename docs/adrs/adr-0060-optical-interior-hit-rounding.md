# ADR 0060: Preserve representable interior coordinates at optical corners

Status: Accepted for experimental implementation; physical qualification pending.
Date: 2026-10-14. Task: #234; parent Feature: plasius-ltd-site#2114.

## Evidence

Renderer `8b21f4f1ce87627502a3d01e61bc83527ab9c1e8` passes physical
optical preflight, including the earlier seam, distance ordering and successive
cursor regressions. The full 4K/256-SPP/20-depth capture rejects tile 223 at
sample 80 (1,327,104 / 4,194,304 primaries). The canonical journal identifies
pixel 3718874: wall 353337 reflection at bounce 7, pedestal contact while still
carrying glass occupancy at bounce 8, duplicate bottom entry at bounce 9.

Independent intersection of the original binary32 triangle gives
y=-0.6940840303552064, 17.916 nm above the bottom bound
y=-0.6940840482711792. The positive interior barycentric coordinate is
approximately 9.9533e-8. Reconstruction rounds onto the bottom plane. A
wall-normal offset changes x/z but not y, so the downward reflected ray sees
the bottom exit at t=0 and rejects it. The later count mismatch is a consequence
of the invalid medium transition, not insufficient primary queue capacity.

## Decision

Retain barycentric reconstruction and bounding-box clamping. When all three
barycentric coordinates are strictly positive, a nondegenerate coordinate is
mathematically interior to its triangle bounds. If reconstruction rounds that
coordinate onto a bound, choose one adjacent representable value toward the
interior, only if it remains strictly inside the opposite bound.

Preserve true edge/vertex hits, degenerate axes and already-interior values.
Handle negative coordinates with the reversed binary32 bit ordering. At zero
use the smallest normal binary32 value in the inward direction because WGSL
permits subnormal flushing. If no supported interior value fits, leave the
coordinate unchanged; this does not qualify unresolved geometry.

This is a bounded hit-position precision correction, not a scene gap, changed
triangle mesh, volume reset, skipped exit or tolerance adjustment. Existing
geometric origin offsets, strict positive/exclusive distance cursors, medium
transitions, BSDFs, weights and counts remain unchanged. Only the existing
default-off `renderer.transport.nestedMediaRefraction.enabled` path uses the
modified reconstruction. No new ABI, buffers or render passes; additional
accepted-hit arithmetic still requires GPU cost measurement. Three.js remains
prohibited and cannot be a fallback.

## Tests and limits

The frozen captured wall/continuation test fails before the correction, then
must hit the adjacent bottom as a genuine occupied-medium exit. Cover axis
permutations, winding, signed lower/upper bounds, zero, exact edges/vertices,
flat axes, ordinary points and intervals without representable interiors.
Physical preflight must execute canonical reconstruction, origin offset, bounds
and triangle collision, checking exit identity and a positive sub-0.2-micrometre
distance for this frozen case. Inject lost exits, collapsed origins and invalid
distances to prove rejection remains effective.

Full 4K/256-SPP/20-depth and empty/filled controls, linear HDR, stability and
timing remain unqualified until recaptured. A one-step position adjustment is
not exact geometry, an arbitrary-scale guarantee or a guarantee for exact
multi-face corner hits. Earlier raw double-precision evidence and failure
receipts remain retained; do not describe failed images as successful renders.
