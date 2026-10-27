# Collision, sampling and optical contract corrections

## Optical reference and source isolation — 27 October

Depth attribution follow-up (before implementation): retain the failed native
20-event empty/index-one row gates. An independent Cycles empty furnace also
fails the same row gate at20 (5.77%) and passes at64 (0.068%). Add a strictly
validated development-only `opticalDepth=32` comparison, reusing the engine's
existing32-event admission, without increasing room/UI defaults or changing
transport. Same samples, camera, radiance and frozen thresholds; the20-event
failure cannot be reclassified as a pass. Any32-event result is a separately
labelled control, not permission to ignore optical events or claim convergence.

Task234 remains assigned to zephod111r / In progress, under Story2291 and
Feature2114. Preserve all six 4195618 native controls and the rejected offline
startup. The installed Cycles reference now runs outside the sandbox with
explicit approval. Its simplified emissive-pedestal control also contains a
horizontal pedestal-reflection region; this is mechanism evidence, not matched
room truth or a reason to dismiss a remaining defect.

Before any further transport change, add portable requirements-first regressions
and an opt-in automated canonical-renderer fixture. Reuse gpu-lighting's original
glass/water geometry, camera and medium descriptions. Isolate uniform known
radiance, a contrasting known-radiance pedestal, empty/filled/index-one water,
and room sky-only/sun-only illumination. Never bypass optical visibility.
Retain source hashes, settings, linear HDR, counts, cleanup and PNGs in unique
directories; failure or missing lanes cannot qualify the image. Test fixture
dimensions are optical diagnostics, not 1080p/4K performance evidence.

For the uniform .75-radiance furnace, freeze acceptance before measurement:
finite/nonnegative HDR, exact completed counts, interior mean error <=2%, and
row-mean deviation <=5% over the central glass region at 256 SPP. Reject any
missing/invalid pixel or unretained evidence. Different-emission pedestal and
checker controls are attribution, not a uniform-furnace test. An independently
rendered explicit shared-interface reference must retain its differences from
priority-overlap geometry, sample sequence and display transform. Do not compare
tone-mapped PNG brightness as linear energy or relax tolerances after results.

Correct only a demonstrated defect, adding a failing canonical numerical and
assembled-device regression first. Existing transport/sampling flags/defaults,
ABI and Three.js prohibition remain unchanged. Diagnostics are development-only,
not a new production feature or fallback. Then rerun native1080p/4K correctness
and convergence gates before adaptive performance or publication claims resume.

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

## Active rim-reconstruction correction — 21 October

The user approved correcting the frozen 4K case and automatically rerunning the
full native matrix. Task #234 remains assigned/In progress under the same parent
and default-off controls. The new exact-case test fails before runtime changes:
the reconstructed point has a negative projected barycentric weight, and loses
the distinct inner-wall exit. Require all signs, cyclic axes and six vertex
orders, not just agreement with one expected point.

First evaluate the minimal arithmetic correction: interpolate the small edge
offsets before adding the large base coordinate, with explicit fused/non-fused
variants. This reduces reconstruction rounding, not triangle coverage or an
interface threshold. NVIDIA's [hit-point analysis](https://developer.nvidia.com/blog/solving-self-intersection-artifacts-in-directx-raytracing/)
motivates adding the base last; its HLSL precise guarantees must not be assumed
for WGSL. Retain genuine edges/vertices, constant axes, representable interior
bounds and the existing normal-error contract. A counterexample to triangle
interiority must remain a failure, not be hidden by an offset or medium reset.

Add the captured case to final assembled device preflight; run the existing
geometry/order/corner/cursor, ordinary disabled collision, sampling/energy/count
and full local gates, then commit/push/verify CI and serve the immutable source.
Rerun all six uniform-32-SPP/20-bounce native 1080p/4K controls through UI input.
Retain every before/failure/HDR/PNG receipt and review bands separately from
integrity. If bands remain, isolate their transport/sampling cause with matched
controls; no adaptive performance work or success publication until correctness
and image gates pass. Three.js is prohibited; no new allocations or fallback.

### Stronger representable-interior requirement

The 48-case near-edge sweep on the original rim exposes positive-barycentric
points that still round outside with base-last interpolation. Preserve this
intermediate result; the running source-pinned batch cannot qualify the stronger
contract. Before implementation require a red sweep test and explicit unresolved
case. For nested optical-volume triangles only, certify projected interior using
a floating-point error filter and the existing exact integer edge predicate.
If the rounded point fails, search its eight adjacent binary32 neighbours in the
two projected axes and select the nearest strictly interior candidate. Keep the
dominant normal axis unchanged; the existing normal error bound covers these
single-step coordinate changes. Do not move genuine zero-barycentric edges.

If no candidate is certifiably interior, return an unresolved result and reject
the path explicitly (failure reason 8); never widen coverage, silently accept
the point or reset occupancy. No unbounded iteration or new persistent resources.
Test all swept cases, signs/axes/winding, closest valid neighbour, unchanged safe
points, genuinely unresolved narrow triangles, exact filter parity and raw/fused
integration, then extend device preflight and repeat native qualification.

### Shared coplanar optical face acceptance

Physical e2a0922 passes all three native 1080p controls and the original 4K rim
case, then rejects 4K empty glass at tile 319/pixel 5178795/sample 1/bounce 4,
reason 8. Preserve the original receipt and frozen shared-diagonal geometry.
Its projected point is outside the incident triangle but strictly inside the
reverse-shared-edge coplanar neighbour of the same glass wall. A triangulation
diagonal is not an optical domain boundary. Do not expand the point search by
an arbitrary radius or relax the failure gate.

Before implementation add the captured pair as a red regression. On unresolved
points only, query the existing BVH for adjacent candidates in the projected
one-step neighbourhood. Require exact shared-edge topology, matching mesh,
medium/material/flags, consistent orientation and exact binary32 coplanarity.
Use the existing integer accumulator for a 24-term original-coordinate plane
determinant; no rounded plane-distance tolerance. Certify the original point or
its existing eight neighbours in this continuous same-plane optical face,
selecting the nearest certified candidate. Genuine creases, disconnected faces,
domain/material changes, unmatched winding and shared-edge endpoints must not
be accepted by this certificate. No new buffers, ABI, BSDF or sampling policy.

Keep reason 8 for genuinely unresolved geometry, bounded BVH traversal and all
normal-error protections. Add integer-oracle, topology, one-ULP crease, BVH,
identity/disabled and device regressions, then full gates/CI and the full native
matrix. Allow an explicitly validated development qualification order so 4K can
run first without dropping any 1080p lanes; keep the default order unchanged.
Banding/energy correctness and adaptive performance remain unqualified.

## Selected successful-sample diagnostic acceptance

If count-complete uniform images retain bands, capture bounded selected successful
camera-sample journals rather than inventing a failure or inferring transport
from screenshots. Fixture-only, default-off URL selections (at most eight finite
UV/sample triples) must validate before GPU work. Use the original compiled
camera/intersection/surface/bounce pipelines and retained worklist/config in the
selected tile's last phase; unsupported modes or unavailable ordinals fail closed.
No camera resampling, new material model, accepted count/radiance commit or
ordinary rendering allocation. Restore diagnostics mode after the separate replay,
free private journal buffers on every path, and label diagnostic-inclusive times
as unsuitable for performance. Keep the original failure-only API/labels intact.

Requirements-first tests cover selection bounds, unsupported configurations,
original pixel/sample identity, canonical encoder reuse, no completion/output
passes, mode restoration, allocation/compilation/readback failure cleanup and
unchanged default capture behavior. Retain selected per-bounce geometry/medium
records in the receipt; compare bands with clear regions and empty/filled controls.
This is mechanism evidence, not a full image-convergence or energy pass. Existing
default-off transport flags, Task234/Feature2114 ownership and Zero-Three remain.

The selected-success diagnostic also needs canonical per-bounce PathNode values
after surface shading and before queue swap: direct/terminal radiance, terminal
kind, flags and original pixel/sample/depth identity. Add a separate read-only
diagnostic pipeline using the existing queue/counter/path-node buffers and one
bounded tail of the private journal allocation (64 bytes per configured depth).
Do not re-evaluate lighting, add radiance/count commits, overwrite path nodes or
change the original failure-only allocation/API. Validate shader bindings,
post-surface/pre-swap order, exact decoding/identity and failure cleanup before
physical use. These records are diagnostic-inclusive, not performance evidence.

## Absent normal-map identity — 21 October

The selected physical capture completes all 66,355,200 samples and retains all
eight geometry/surface histories. Its HDR and PNG exactly match the frozen
uniform-32 control. Histories show pedestal visibility, base internal reflection,
five roulette and three environment terminations; none reaches depth 20. These
eight paths do not certify the complete band's convergence or physical accuracy.

They also expose a separate material defect: meshes without authored normal maps
still decode the RGBA8 fallback [128,128,255] at strength one. Its tangent x/y
components are 1/255, not zero, tilting glass, water and pedestal shading normals.
Before correction add red portable tests for omitted/null maps through CPU and
packed triangles, GPU materials and GPU mesh sources, including nested material
input. Pack the existing normal scale as zero only for absent maps. Keep authored
images and explicit/default scales unchanged; do not recenter authored byte 128.

Extend assembled physical material preflight with missing-map identity and real
map/zero-scale controls against analytic normals. No ABI/resource/pipeline,
sampling/geometry/BSDF/PDF/MIS or medium change. Existing flags remain unchanged;
this is a material packing correction, not a new performance policy. Require
full local gates, changed-source LCOV and exact-head CI, then native matched
1080p/4K controls and independent image review. Preserve defective controls as
history, not current baselines. Band removal, energy/convergence and adaptive
performance remain unqualified. Acceptance: Task234 comment6316459126.

## Environment next-event / terminal MIS contract — 21 October

Task234 remains assigned to zephod111r / In progress. Before runtime changes:
add failing portable numerical tests against the assembled canonical functions.
The retained d53ced3 six-lane images are before-controls, not converged truth.

Carry the previous surface's actual competing environment solid-angle PDF in
`RayRecord.direction.w`, previously zero and unread by traversal. Keep direction
xyz, throughput.w (BSDF PDF), the 96-byte record, offsets, buffers and dispatches
unchanged. Cameras/visibility/delta/non-competing rays have zero competitor.
Staged/fused continuations and each rough split child compute their own PDF at
the original surface; do not reconstruct its normal at the miss. Smooth optical
siblings remain delta. Include environment class probability (1 with no lights
or the two-estimator deterministic mode; .5 for mixed selection; 0 for emissive-
only source-stable selection), actual hemisphere support and map importance PDF.

Use one shared strategy predicate and PDF evaluator in direct sampling and
continuation packing. Strict procedural sky uses hemisphere/cosine hemisphere;
a texture without importance data uses full-sphere texture sampling, not sky.
The strict procedural estimator samples sky only: terminal MIS weights only that
component, retaining full unsampled finite sun glow. Preserve portal scaling and
exclude portal-blocked ambient fallback from competing radiance. The explicit
directional sun remains a separate delta source; no transparent-shadow bypass,
refracted light connection, BSDF/PDF/IOR/geometry/count or sampling-sequence change.

Test rotated/opposite normals, class mixtures, deterministic/source-stable modes,
map importance/no-importance, portal fallback, primary/delta/no-NEE, rough/partial
reflection/transmission and independent split children. Require an assembled
physical probe with frozen 1e-6 PDF/component and 2e-5 furnace tolerances before
native scenes. Numerical furnace expectations retain the existing heuristic's
1e-6 denominator floor explicitly; do not silently change that separate policy.
Run all six native uniform32/depth20 1080p/4K controls automatically, independently
verify HDR/count/provenance/cleanup and review bands separately from integrity.
Preserve every earlier capture and any new failure; no lowered gates or adaptive
performance/white-paper claim until image correctness passes. No extra production
flag: this corrects estimator consistency under the existing controls. Three.js
remains prohibited. Update ADR/README/Unreleased, coverage/LCOV, all package gates,
push and exact-head CI; no local publication or unauthorized merge/release.
