# Collision, sampling and optical contract corrections

Date: 2026-10-20. Task gpu-renderer#234, Story site#2291, Feature site#2114,
Epic site#2113. User approved implementation of all four review findings.
The evidence at renderer c90e706/dabe0af and all prior captures remains retained.

## Requirements and implementation order

1. C1: remove the absolute determinant floor from nested collision admission.
   Keep true parallel/degenerate rejection and single-sided/occupied-exit culling.
   Test scale, grazing incidence, winding, misses and current edge/order/rim cases.
   Ordinary disabled collision results remain pinned by the frozen oracle.
2. C2: replace the fixed optical-origin displacement floor with an explicit
   geometry reconstruction error projected onto the geometric normal. Carry the
   scalar projection in the existing successful-hit pad2 slot; invalid-hit reason
   codes retain their meaning. Keep the HitRecord ABI and allocation sizes.
   Exact constant-coordinate planes have zero normal reconstruction error and
   need no displacement. Otherwise offset past the bounded error and round in
   the outgoing direction. Test representable thin neighbours at zero and
   translated planes, self hits, grazing corners and roundoff. This does not
   promise distinguishable geometry inside an unresolved error interval.
3. T1: include the transmission fraction and authored tint in the smooth
   transmitted weight; preserve its diffuse remainder by reusing the existing
   dielectric-mixture implementation for tracked partial surfaces. Roughness
   sampling stays controlled by the existing rough-optical flag. Enforce the
   same medium/material admission constraints for any newly active mixture.
   Test T=0/.25/.5/1, white/tinted, entry/exit, reflection, diffuse and PDF/energy.
4. S1: correct the existing fixed-pattern sampling selection to use fixed
   camera coordinates plus existing independently keyed transport draws.
   Share camera-pattern helpers to avoid a second sampling implementation.
   Keep the centre first camera sample, absolute ordinals and frame/budget
   stability. Freeze the rejected transport pattern only in test fixtures;
   retain its correlation/slab failure as historical evidence. Validate joint
   dimensions/bounces, CPU/WGSL parity, analytic slab means and assembled source.

Existing remote controls remain default off: nestedMediaRefraction,
boundedDielectricBranching, roughDielectricTransport, fixedPattern and the
adaptivePerPixel parent. No new production capability or allocation is added.
The fixed dispatcher remains the disabled adaptive path. Three.js is prohibited
and cannot be a fallback. Record intentional corrected behavior separately from
the frozen rejected implementation; do not retain a biased production fallback.

## Acceptance and delivery

Add failing acceptance tests before runtime changes, preserving rejected cases.
Run relevant numerical tests, assembled WGSL/reflection, complete-count/sibling
accounting, tests/coverage (>=80%; changed runtime files in LCOV), lint, types,
build, package and Zero-Three gates. Update README, CHANGELOG and an ADR for
the successful-hit error contract and sampling/material boundary refinements.
Commit/push and verify CI before requesting a qualification result.

Prepare a repeatable full-scene qualification path with fixed configuration,
provenance, actual count checks and retained output at 1080p/4K. Do not substitute
software shader execution for physical GPU execution. Existing browser access
restrictions remain; do not bypass them. Avoid further repetitive manual render
requests. If physical execution cannot run through an approved available path,
report that verification as incomplete and keep adaptive performance work gated.
No release, image-quality or performance success claim before its evidence.

## C2 physical follow-up — 21 October

Normal browser automation now reaches the unchanged physical build. The first
1080p uniform32/20-depth empty-glass capture fails at pixel1535086/sample9.
Canonical journal: wall hit353199 is one y-ULP above the bottom; its tiny normal-y
component (1.2064723e-10) makes per-component outward rounding move y onto that
bottom although the normal displacement there is below representable precision.
The bottom exit disappears; the ray hits the pedestal while still in glass, then
fails duplicate entry (reason2). The failed capture/summary remain preserved.

Refine the C2 displacement, not hit/count tolerances: clear the same projected
error using only the largest-magnitude normal axis, then round that axis outward.
For k=argmax(abs(n)), delta[k]=side*projectedError/n[k], so its normal projection
is the required signed error without gratuitously stepping tiny other axes.
Retain zero-error points and all existing numerical limits. This is still an
offset error estimate, not a promise about indistinguishable adjacent geometry.

Before implementation, add the exact captured-origin/next-bottom test and
dominant-axis/sign/permutation/projection tests; extend the physical preflight.
Require current edge/rim/corner/ordering, energy, sampling, complete-count,
disabled, ABI and allocation checks, full local gates and exact-head CI. Retain
the failed physical attempt and rerun the six native lanes on a new clean source
pin. No adaptive timing work or band-removal claim before valid images/review.

## Corrected rerun and remaining boundary — 21 October

Build `7002c0e` passes all three 1080p uniform-32-SPP/20-bounce lane integrity checks, but
filled-glass banding remains visible. The 4K empty-glass lane fails at
pixel 2747573/sample 14/bounce 1. Reconstructed in-plane x shifts ~140 nm outside the
admitted rim's neighbouring wall; its normal-projected error is correctly zero.
Independent original-binary32 geometry finds the missing inner-wall exit before
the canonical far-wall duplicate entry. The current position function reproduces
the captured bad point exactly in numerical execution. No new runtime correction
is included in this evidence follow-up. A normal-only offset/error contract is
insufficient: preserve incident-triangle interior/topology under tangential
reconstruction uncertainty before another native rerun. No hit/count tolerance,
SPP/depth, medium reset or skipped interface may conceal this case.
Full source-bound results and limits: docs/evidence/room-qualification-2026-10-21.md.
