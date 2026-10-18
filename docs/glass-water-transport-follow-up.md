# Glass/water transport qualification follow-up

## Remaining band isolation (2026-10-18)

The physical `f94f2f7` 4K/256-ceiling/20-depth filled capture completes all
394,813,440 requested samples. Its broad grey/dark water bands remain unqualified.
Do not change Fresnel, IOR, absorption, geometry, depth or tone mapping to hide them.

The retained fast fixed sampler has uniform scalar marginals but correlated
cross-event decisions. A white parallel glass slab isolates successive optical
choices and roulette: with constant unit incident radiance, its exiting mean
must approach one (apart from the explicitly bounded remaining-path tail).
Single-interface probes cannot qualify this conditional path expectation.

Under Task #234 / Feature site#2114 / Story site#2291, add a portable analytic
path test and an assembled-WGSL slab probe, and expose the existing
`stable-camera-random` diagnostic specialization in the room. It keeps the exact
fixed camera pattern (including the first pixel-centre sample) and uses the
existing frame-stable independent transport draws; it is not a new production
sampler or an automatic replacement for the retained fast control. Existing
default-off sampling/transport flags remain, with explicit specialization recorded
in receipts. Lighting Task #105 owns settings admission. No new dependency or
production buffer/pass/API is required. Three.js remains prohibited.

Acceptance: preserve camera sample points, budgets, identity and normalization;
test frame/budget independence and conditional means, reject invalid modes, retain
the fast control's failing distribution as evidence, compile/run the probe on the
physical device and compare empty/filled room captures with only sampler changed.
Use native 1080p/4K, raw HDR, actual counts and full-job/GPU timings. Analytic probe
results alone do not identify the cause of every room band or qualify performance.
Keep rough splitting off for this control. Record costs and failures; no denoise,
relaxed image tolerance, occupancy reset or extra bounce allowance. Update
README/CHANGELOG, run tests/coverage/lint/types/build/package/Zero-Three and exact
head CI; final image and release gates stay open until measured.

Parent Epic: Plasius-LTD/plasius-ltd-site#2113.
Parent Feature: Plasius-LTD/plasius-ltd-site#2114.
Parent Story: Plasius-LTD/plasius-ltd-site#2291.
Diagnostic integration: gpu-lighting#105 and gpu-renderer#233.
Active transport follow-up: gpu-renderer#234 (user approved; assigned and In Progress).

## Problem and immutable evidence

The new original parametric glass/water scene is admitted, but physical capture
fails closed. Renderer `7557ead5694fe43687f3f367f26f9c867c65f6af`, lighting
`50ce73aa1de01b9fe52a352449407df6a28e5c88`: 1080p, six bounces, stable sampler,
64-SPP radial ceiling, room camera, filled glass. With rough splitting depth two,
a tile observed 16,384 primary rays versus 377,936 requested; without splitting,
a later tile observed 16,384 versus 643,744. Neither capture is a valid image or
performance result.

Failure-only diagnostics in renderer `996917116b2bbf8d5917443ea3133e4a47e63815`
retain tile/queue evidence without weakening the rejection. A 1080p uniform
one-SPP, six-bounce filled-glass close-up failed at tile 21 (768,128,128,128):
16,384 requested/observed primaries, 46,817 secondary rays, 267 continuation queue
overflow events, no invalid-radiance samples. Adaptive control failure word is
64. The legacy `pathCompletionValid` counter was true, but is not proof of sample
completion: the adaptive path-tree/count gate correctly rejected the frame.

An empty-glass close-up with the same one-SPP setup failed at the same tile with
290 overflow events. The failure therefore does not require a water interface.
Retained local receipt SHA-256 values (private images/assets not published):

| Capture UTC on 2026-10-07 | Result | Receipt SHA-256 |
| --- | --- | --- |
| 15:35:28.008, radial 64, split depth 2 | Incomplete filled room | `c63b523fedbbabb734fcf0ec89ec30561a1304e96d5bb437032fe27cc34be464` |
| 15:38:23.777, radial 64, splitting off | Incomplete filled room | `774e917f6bdd314047bbb320be686d24422acfdf7ba9c80c62f04f351117878c` |
| 15:43:54.427, uniform 1, filled | 267 overflows | `7535e5ea6769c9bbe759527ab009d211125f4e8697c283c50612e77fb51bac31` |
| 15:45:02.126, uniform 1, empty | 290 overflows | `70a4257e27701182a9138f1e54d40a5e0f4d21cfbeb5bb6d11f17b396f7750cf` |

## Historical diagnostic delivery validation (before transport fixes)

Local renderer tests: 391 passing, 96.23% line coverage. Lighting tests: 171
passing, 81.17% line coverage; added geometry module 100% lines and 96.15% branches.
Lint, type/syntax checks, build, package and complete Zero-Three gates passed for
both packages. Exact implementation-head CI passed: renderer run 37646277013 at
`996917116b2bbf8d5917443ea3133e4a47e63815`, lighting run 37645195281 at
`50ce73aa1de01b9fe52a352449407df6a28e5c88` (explicit normal CI dispatch because
draft PR 99 targets another feature branch, not main). No merge, publication or CD.

Browser controls exercised: off/empty/filled, all glass numeric fields, close-up,
reset, invalid off+close-up and outside-room placement. Reset restored defaults;
both invalid cases were rejected. Nondefault numeric values were verified in the
UI, not qualified by a completed image. GPU material/UV/sidedness probes passed
before transport failure. No complete glass image exists, so visual QA, final HDR
retention, smaller viewport visual qualification, 4K, and performance comparisons
are not passed. Tasks remain open. No successful water/rendering claim is made.

The canonical surface kernel emits both dielectric branches, but ordinary
continuation capacity is tilePixelCount. The current rough-splitting factor is
not a worst-case bound for additional dielectric branching. `dielectric_eta(hit)`
also assumes air on one side; medium records do not include IOR. These are runtime
transport limitations, not material alpha, missing water geometry or denoising.

## Approved implementation design

The user approved both transport fixes on 2026-10-07. Task 234 is assigned to
zephod111r and In Progress. Independent remotely supplied controls are
`renderer.transport.boundedDielectricBranching.enabled` and
`renderer.transport.nestedMediaRefraction.enabled`, both default off.
Existing failure checks remain unconditional.

Bounded branching selects one dielectric continuation with the existing dedicated
sample dimension and divides its throughput by the selected discrete probability.
This preserves the expected sum of the two branches, camera sample identity and
the existing queue capacity; it trades deterministic splitting for variance.
TIR has probability one. It does not drop an already weighted sibling.

Nested refraction extends the existing four-entry occupancy stack, not ray size.
An optional third medium-texture row stores IOR and integer priority (larger wins;
equal priorities use latest entry). Glass has higher priority than overlapping
water. Entering/exiting a hidden lower-priority volume updates occupancy in a
bounded traversal loop without a bounce, roulette event or surface contribution.
Exits may target any occupied medium. Stack overflow, duplicate entry, unmatched
exit and exhausted null-crossing bounds reject the sample; no stack eviction.
The ray starts in air; camera-inside-volume initialization remains unsupported.

Actual incident/outgoing IOR determines exact dielectric Fresnel, Snell/TIR and
radiance-mode transmission scaling by the squared IOR ratio. Reflection retains
occupancy. Untracked surfaces retain their existing thin-surface contract.
Position-scaled offsets and traversal minima in this mode must resolve the
0.2 mm contact overlap; their numerical limit is tested, not a general guarantee
for arbitrarily thin/large-coordinate geometry. The third texture row is allocated
only when nested transport is enabled; queues and path-tree allocation do not grow.

The estimator follows the dielectric sampling and radiance convention in
[PBRT 4e](https://pbr-book.org/4ed/Reflection_Models/Dielectric_BSDF).

- Choose and prove an unbiased bounded dielectric branching/scheduling policy;
  do not discard weighted siblings or simply remove the overflow/count gates.
- Evaluate refraction, Fresnel, total internal reflection and medium transitions
  using actual incident/transmitted media, including overlapping glass/water
  contact, reflection retaining its medium, and exiting backfaces.
- Keep camera sample identity and count-once semantics, deterministic sampling,
  tile-bounded queues and explicit allocation admission. Qualify any ABI change.
- Out of scope: liquid motion, caustic convergence claims, spectral dispersion,
  unrestricted volume transport, original model rewrites and renderer fallback.

## Acceptance and qualification

- Derive red unit/BDD tests for the retained failures; assembled WGSL/layout tests,
  real WebGPU Snell/Fresnel/TIR/energy tests, nested entry/exit and overlap tests.
- Empty and filled glass in the actual room and close-up, off/on individually and
  together; rough splitting off/first/first-two; unequal SPP normalization and
  sibling accounting. Include deliberate capacity/failure injections.
- 1080p minimum and 4K qualification, six/eight bounces, configured adaptive tiers;
  retain raw linear HDR, actual counts, error/energy metrics, queue high-water and
  overflow, device/timeout results, full-job and GPU timings. Do not infer quality
  or performance from incomplete images or one-sample fault-isolation tests.
- Record buffers/textures/staging and CPU/GPU costs; keep memory bounded. No
  unbounded branching, CPU path tracing or hidden readback in ordinary rendering.
- README, ADR in docs/adrs, Unreleased CHANGELOG and evidence; >=80% line coverage,
  changed runtime files in LCOV, lint/types/build/package/Zero-Three and exact-head
  CI. No release until approved main/CD gates. Rollback to the existing GPU-native
  renderer; the diagnostic may fail closed until the fixes are qualified.
- Three.js is prohibited in source/dependencies/artifacts and cannot be a fallback.

Private scene assets and screenshots stay local; retain public hashes and
metadata only. The existing white paper must not claim glass/water qualification.

## Current QA inventory

### Retained numerical regressions during implementation

The first combined one-SPP 1080p filled close-up completed at renderer
`0cf5d65b379942981a4114a70eab7a9ca498bf89`, lighting
`94c43f78c1f340bdb01a2dc01cf17e2485ec99fb`. All 2,073,600 camera samples completed,
with no validation error. This was fault isolation, not a quality baseline.

Higher-SPP empty-glass captures then exposed two distinct rim failures:

- Renderer `ae92a55e1f5792f23a44e3e368be8c9e72ba7f57`, pixel 692199,
  ordinal 14, bounce 1: the new ray origin lay approximately 0.3 micrometres
  above the top face after an outer-wall hit. Reconstructing the optical hit
  from the triangle's barycentrics removes ray-distance cancellation at the rim.
  Rejected receipt SHA-256:
  `56f4c9fc17556100e02f6f97fffda6d16ba6dd9dd065b8a319c23c565947485c`.
- Renderer `a6bb07432dc4a2e12051c5a82b31c84b60f2f0b6`, pixel 1734496,
  ordinal 29, bounce 3: an immediately adjacent inner-wall exit was closer
  than the positive 0.1 micrometre traversal cutoff. A dedicated assembled
  GPU test of a 0.06 micrometre triangle hit failed before the correction.
  Nested mode now accepts every positive intersection distance; it still
  offsets origins from their source face and validates occupancy.
  Rejected receipt SHA-256:
  `afc8b85e92ae78dc80a2f1c277989ff509a3723245f850cd08d5012766399ffb`.

Both failures retained a duplicate-entry reason, with no queue overflow in
the final counter snapshot. Later skipped samples reset ordinary counters,
so that snapshot alone is not an all-samples overflow measurement. The sticky
completed-sample failure still rejects the entire capture. Failure-only GPU
gathering retains up to 32 records using 3,592 bytes of temporary storage plus
staging, destroyed on success or error; ordinary rendering allocates none.
Numerical context: [PBRT's rounding-error treatment](https://pbr-book.org/4ed/Shapes/Managing_Rounding_Error).

### Hidden-boundary cursor correction (2026-10-11)

The retained 4K, eight-bounce, first-two-bounce rough-split failure at pixel
6779635 / sample 0 / bounce 2 was reproduced with a one-SPP ceiling at renderer
`ca77552`. Failure-only GPU replay traced a hidden water entry and exit that
spatially offset the ray past an adjacent glass exit; a later glass entry then
failed occupancy validation. The one-SPP reproduction is fault isolation, not
image-quality or performance evidence. The normal-validity correction alone did
not resolve this failure.

The correction preserves the original ray origin/direction and advances a
strictly-exclusive last-hit distance cursor through hidden boundaries. Occupancy and
incremental absorption still update; actual scattering still uses an offset.
Every query resets the cursor before returning. A new assembled GPU probe
checks repeated-hit exclusion, adjacent-hit retention and reset, and the
failure-only replay uses the same cursor. No count, overflow or rejection
threshold is relaxed. Physical recapture of this correction is pending.

### Completed earlier 1080p captures (not final-source qualification)

Both used the stable sampler, uniform 32 SPP, six bounces, both transport flags
on, no rough splitting and no denoise. Each retained receipt reports all
66,355,200 samples completed (2,073,600 pixels at exactly 32), no validation
failures and successful cleanup. These are count-integrity results only.

| Scene | Renderer / lighting commits | Receipt SHA-256 |
| --- | --- | --- |
| Empty tumbler | `c605bd3b831ba504692def40e02f0e0025e6c87b` / `1d76fa54d70741172f36fc328eebfd8d1bb65c69` | `3565a91f6c58853638a3ab704e795043eacdcbfbda941b60c84093dde6ca6dd0` |
| Filled tumbler | `a68a2e7b5c91af4eec204b5f13fab4ecc73c1d1a` / `2852eec116443594394a859550a991b7f84ca995` | `f3b0b427d2d2ea9b7c0f04fbdd3ff3921a46f0d126738dfc08befdad07b78b95` |

Recorded linear HDR hashes respectively:
`e2b3682554b2cfefabe004a8ec053f3380928cec042689e6931708eb726f497d` and
`ee0fa8e6acbf6abb89f88c17f827113ae706e6fb9bf4d57b36114082d061e2f2`.
Summed diagnostic GPU intervals were 58,873.02 / 63,593.45 ms; readback-inclusive
intervals were 62,391.00 / 66,840.20 ms. These are not timing-only benchmarks,
matched-quality comparisons or real-time claims. Visible grain and reflected/base
patterns still require convergence and appearance validation.

On 2026-10-11, local renderer validation passed 401 tests (96.33% lines), and
lighting passed 172 (81.17% lines), plus lint, types, builds, package checks and
Zero-Three gates. The new physical cursor probe, 4K reproducer/full capture,
final-source 1080p recapture, isolated-flag image lanes and viewport/screenshot
QA remain pending: the browser control session is unavailable. The server can
serve the committed code, but an HTTP response is not GPU execution evidence.

### Remaining acceptance lanes

### High-SPP missing-exit investigation (2026-10-14)

At renderer `29e24c2709e71ffbf1367f97b5d75ecfc5ab0b39`, the 4K/256-SPP
radial ceiling/20-bounce filled-glass capture rejects tile 162 after sample 92:
1,523,712 / 2,097,152 primary rays. Pixel 2470753 reaches a new glass entry at
bounce 6 while still carrying glass occupancy after a pedestal reflection.
Repeating with 0.0001 m pedestal clearance preserves this failure, so separating
the contact is not a correction. The geometry-only replay follows a different
path and cannot identify the first incorrect canonical transition.

Task #234 now requires a failure-only replay using the already-compiled camera,
intersection and surface pipelines, original tile worklist, absolute sample
ordinal and unchanged configuration. Record bounded read-only ray/hit snapshots
between intersection and surface resolution, without changing ordinary shaders,
accepting a failed image or reporting replay time as rendering performance.
No radiance resolve or sample-count commit belongs to this diagnostic. Preserve
the original failure even if replay fails; destroy temporary buffers on every
exit. Reject unsupported branching rather than mixing sibling histories.

Acceptance: test command ordering, exact ordinal/config reuse, record bounds,
decoding and cleanup; compile the diagnostic WGSL; obtain physical evidence of
the first incorrect transition before selecting a collision correction. Then
add a failing transport regression and recapture the original 4K configuration.
Existing count, medium and overflow rejection remains mandatory. No Three.js,
dependency addition, permanent gap, silent occupancy reset or performance claim.

The canonical journal subsequently reproduced a separate 4K/256-SPP capture at
six bounces (settings reset after refresh): pixel 2862715 / sample 198 enters
outer glass triangle 353209, then reports a duplicate far-side entry at triangle
353689. The retained ray should first hit inner-wall triangles 353593/353594 at
approximately 0.0040711072 m. Its near hit lies on their shared edge. This capture
is not the original 20-bounce case and is retained separately.

ADR 0057 adds consistent ray-aligned edge tests under the existing nested-media
flag, with no tolerance widening, medium reset, path-count relaxation or added
runtime allocation. Frozen legacy-function software comparisons check flag-off
results; the device preflight includes the captured near-wall ray and an
outer-wall binary32 seam stress case. Full-frame recapture, conservative BVH
qualification and incremental arithmetic-cost measurement remain pending.

### Grazing exit/entry ordering regression (2026-10-14)

Renderer `522b9db901ba2ed7c87f3e07777d8e09720d5f45` passes the physical
shared-edge probes but rejects the original 4K/256-SPP/20-depth lane at pixel
2601331 / sample 76 / bounce 7: 1,261,568 / 2,097,152 primaries. Both zero
and 0.0001 m pedestal clearance reproduce it. The canonical ray grazes the
inner-wall corner at triangles 353681/353682 after a hidden water entry.
The binary32 geometry's double-precision reference places the glass exit at
0.03073182165 m, then entry at 0.03073210213 m. Normalizing the projected
edge functions before interpolating ray distance reverses this order in the
software WGSL executor; physical traversal likewise selects the entry first.

Refine only nested triangle distance evaluation: keep shared-edge admission,
but evaluate distance against the original unprojected triangle plane. Do not
reorder by medium state, widen tolerances, skip optical events or alter bounce
accounting. Add a failing numerical test of the exact retained pair and a
physical probe exercising both traversal orders and an exclusive exit cursor.
Preserve the flag-off implementation, allocations and all failure gates. Test
axis/winding changes and earlier seam regressions. Physical full-frame, energy
and timing qualification remain required; this is not a universal precision
guarantee for arbitrarily close surfaces.

### Contracted plane-dot regression (2026-10-14)

The physical preflight on `e4d2ed847d8166e7087330bb55564c87686db45a`
preserves exit-before-entry but rejects entry distance 0.030732138082385063 m
against 0.030732102132163742 m (unchanged 20 nm tolerance). Explicit binary32
simulation reproduces the physical value exactly when the plane dot product
contracts from the last component. The software executor's built-in dot hides
this case by using wider intermediate arithmetic.

Refine the two nested plane dot products with split-product accumulation: mask
the low twelve significand bits of each rounded product into a high part, compute
its remainder with `fma`, and sum high and low parts separately. The bit split
keeps the cancellation-sensitive sum separate from a contracted multiply/add;
it is a numerical precision constant, not a scene/material tuning value. WGSL
does not guarantee fused `fma`, so test both fused and non-fused evaluations,
axis/winding permutations and the original event/cursor checks. Do not claim
exact arithmetic, universal cross-device precision, or faster rendering.

Retain the 20 nm gate and record both complete ordering-probe records if it
fails again. No new buffers, public contracts, occupancy recovery, SPP/depth
change or flag-off arithmetic changes. Physical preflight and the original
4K/256-SPP/20-depth full image still gate qualification.

The `4dc8f0347ce668f1b3bd4eb51e06ca40252b3d58` physical rerun passes
the 20 nm direct distances and both event/cursor identities, but fails the probe's
zero-ULP equality between direct and loop-selected distance: 0.030731819570064545
versus 0.030731821432709694 m. The latter is only 0.218 nm from the reference.
WGSL permits different evaluation at different call sites; bitwise equality
between those sites is not the traversal contract. Refine the diagnostic to
query the same bounds/nearest loop twice with its own first-hit cursor, requiring
exit then entry identities and both distances against the unchanged 20 nm
reference. Retain the direct strict-cursor checks too. A repeated exit, missing
entry, wrong face or reference-distance violation must still reject. No runtime
shader change or high-SPP success claim belongs to this diagnostic refinement.

### Interior hit rounded onto the bottom edge (2026-10-14)

Renderer `8b21f4f1ce87627502a3d01e61bc83527ab9c1e8` passes physical
dielectric, seam, ordering and successive-cursor preflight. The full 4K/256-SPP/
20-depth render reaches tile 223 (1664,896), then stops at sample 80:
1,327,104 / 4,194,304 primaries. Pixel 3718874 reflects from outer-glass wall
353337 at bounce 7, then reaches pedestal 353071 still carrying glass occupancy;
bounce 9 rejects duplicate glass entry 353167. No queue overflow is recorded.

The exact original binary32 wall triangle and incoming ray intersect at
y=-0.6940840303552064, approximately 17.916 nm above the glass bottom
(-0.6940840482711792). Its positive barycentric interior weight is about
9.9533e-8. The reconstructed f32 hit rounds onto the bottom bounding plane;
the wall-normal reflection offset cannot move its y coordinate. The next
downward ray therefore misses the distinct bottom exit at zero distance.

Before correction add a frozen exact-ray/triangle/continuation regression. For
strictly interior barycentrics only, keep reconstructed coordinates strictly
inside nondegenerate triangle bounds when a one-representable-step interior
value exists. Preserve true edge/vertex hits, planar axes and ordinary interior
coordinates. Derive the correction from binary32 adjacency and primitive bounds,
not a scene epsilon, volume reset, gap or relaxed t-min. For zero, use the smallest
normal f32 step because WGSL may flush subnormals; do not cross the opposite bound.
If no representable interior exists, retain the original bounded coordinate and
do not claim support for that unresolved geometry.

Test lower/upper bounds, signed coordinates, axis/winding permutations, planar
and unrepresentable intervals, flag-off equivalence and the actual next bottom
exit through canonical offset/intersection. Add physical preflight with exact
event identities and a positive bounded exit distance. No additional allocations,
passes, BSDF/medium transitions or camera counts. Update ADR/README/CHANGELOG,
full local/CI gates, then original high-SPP physical recapture; no performance or
image success claim until those pass.

Before signoff, exercise each new flag off/on/reset, individual and combined;
empty/filled and room/close-up; completed counts/queue integrity; the analytic
GPU probe's IOR/Fresnel/TIR/estimator/occupancy checks. Inspect initial controls,
rendering progress, completed image and receipts, including a smaller viewport.
Exploratory checks: glass-off close-up rejection and an invalid optical priority;
legacy-overflow rejection must remain intact. Capture raw HDR and PNG evidence.
Any unexecuted lane stays explicitly pending; a functional pass is not visual
quality or performance signoff.
