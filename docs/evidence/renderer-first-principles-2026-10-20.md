# Renderer correctness review — 20 October 2026

Review baseline: [`c90e7067981f3ac615f2c34ed4c8ea2a1f6e568d`](https://github.com/Plasius-LTD/gpu-renderer/commit/c90e7067981f3ac615f2c34ed4c8ea2a1f6e568d).
Task #234, Story site#2291, Feature site#2114; sampling review also relates to
Task #203. [Review requirements](../design/renderer-first-principles-review.md).
Runtime source and all earlier evidence are preserved. This report is a review,
not acceptance of the renderer for release or adaptive performance measurement.

## Result

The current build completes a new physical 1080p filled-glass capture and passes
the retained rim, ordering, optics and sampling preflights. The receipt records
radial budgets with a 32-SPP ceiling, not uniform 32 SPP. Keep it as the radial
control; it cannot close the fixed-reference requirement.

Independent review reproduces a collision-admission defect, an origin-offset
feature-size gap and incorrect smooth partial-transmission weighting. The
retained fast fixed transport sampler also remains a rejected quality control.
None is newly established as the cause of every visible water band. The full
scene and adaptive performance gates remain open.

## Reproduced contract failures

### C1 — valid triangle hits are discarded before the precision fallback

Priority: high. [Canonical admission, lines 480–503](https://github.com/Plasius-LTD/gpu-renderer/blob/c90e7067981f3ac615f2c34ed4c8ea2a1f6e568d/src/wavefront-shader-bvh.js#L480).

`intersect_triangle` rejects `abs(det)<1e-7` before invoking
`optical_triangle_coordinates`. The determinant scales with triangle area and
ray incidence. A fixed absolute cutoff is not a test for exact parallelism.

Use a right triangle `(0,0,0),(s,0,0),(0,s,0)` and ray
`origin=(s/4,s/4,s), direction=(0,0,-1)`. For every positive tested scale,
the analytic intersection is at `t=s`, barycentrics `(1/2,1/4,1/4)`.

| Scale s | Canonical hit | Precision helper t |
| --- | --- | --- |
| 1 | yes | 1 |
| 0.01 | yes | 0.009999999776482582 |
| 0.0001 | **no** | 0.00009999999747378752 |

A unit triangle also fails for the valid grazing ray
`origin=(-0.75,0.25,5e-8), direction=(1,0,-5e-8)`; the helper finds `t=1`.
This is independent of medium priority, sample budgets, normal maps and water.
It can remove an exit before the new integer predicate has any opportunity to
help. Corrective work needs scale/incidence, sidedness and degeneracy contracts,
with enabled/disabled behaviour explicitly accounted for; reducing the magic
constant would not establish that contract.

### C2 — origin displacement can skip representable neighbouring geometry

Priority: medium; feature-size admission/error-bound gap.
[Optical origins, lines 119–133](https://github.com/Plasius-LTD/gpu-renderer/blob/c90e7067981f3ac615f2c34ed4c8ea2a1f6e568d/src/wavefront-dielectric-shader.js#L119).

At an exact hit `(0,0,0)` with normal `+Z` and outgoing direction `-Z`, the
minimum optical offset launches at approximately `z=-1e-6`. A distinct plane
at `z=-5e-7` is representable and lies ahead of the actual hit, but behind the
new origin. The canonical next query returns the miss sentinel `-1`.

The existing documentation acknowledges numerical limitations, but an offset
floor is not an error bound for this geometry and the general renderer does not
admit/reject feature sizes against it. The room fixture's millimetre-scale wall
settings exclude this particular thin slab; this counterexample therefore does
not prove the room's remaining bands come from this offset. Corrective direction:
derive reconstruction/error bounds and/or enforce an explicit supported geometry
contract, then test neighbours and grazing contacts. Preserve failed evidence.

### T1 — smooth partial transmission ignores the transmission fraction

Priority: medium; applies when rough optical transport is off.
[Smooth weight, lines 79–84](https://github.com/Plasius-LTD/gpu-renderer/blob/c90e7067981f3ac615f2c34ed4c8ea2a1f6e568d/src/wavefront-dielectric-shader.js#L79).

For white material at normal incidence, air/glass IOR 1/1.5 and transmission
fraction T, the transmitted radiance weight is `(1-0.04)*T*(1/1.5)^2`.
The smooth path instead uses T only to interpolate a tint, which is white for
every T. These admitted inputs therefore all produce the same weight:

| T | Expected transmitted weight | Canonical smooth weight |
| --- | --- | --- |
| 0.25 | 0.10666667 | 0.42666671 |
| 0.5 | 0.21333333 | 0.42666671 |
| 1 | 0.42666667 | 0.42666671 |

The rough-optical path already includes T and its diffuse remainder. General
partial-transmission correctness cannot be claimed for both configurations.
The reference glass/water has T=1, so this is not evidence of its band cause.
Corrective work should unify/admit the material contract rather than silently
change flags or merely multiply T while losing the diffuse remainder.

### S1 — the shared fixed transport pattern has a biased joint distribution

Priority: high for quality-control selection. Existing retained evidence, newly
rechecked: `tests/fixed-pattern-correlation.test.js` and
`tests/optical-path-sampling.test.js`.

Two distinct scalar dimensions visit only two of four unit-square quadrants;
uniform one-dimensional marginals do not establish the required joint integral.
The retained physical slab probe's grazing mean error is 0.04583045 for the
fixed pattern, versus 0.00152928 for independent transport against the same
finite-depth reference. Treat those as probe results, not whole-room errors.

The independent transport control preserves the requested camera pattern and
pixel-centre first sample. Stable camera coordinates do not require correlated
lighting, lobe, Fresnel and roulette decisions. Qualify images with that existing
control; keep the fast fixed sampler as rejected comparison evidence. No sampler
default is changed by this review.

## Supported checks and remaining risks

The canonical-WGSL numerical review verifies normal-incidence Fresnel ~0.04;
air-to-glass and glass-to-air radiance weights ~0.42666671 and ~2.15999985;
their product ~0.92160004 agrees with two surface transmission factors 0.96².
The eta² terms cancel across the pair. Their per-interface values are therefore
not evidence of an energy bug. A glass-to-air ray beyond the critical angle
has Fresnel one. Lower-priority water entry leaves glass selected; after glass
exit, water is selected with eta ~1.12528133 and no transition failure.

Existing tests also pass the frozen edge/corner/order/cursor cases, normal
hemispheres, bounded occupancy and optical estimator tests: 42 relevant tests
passed before adding the review detector. Complete sample accounting still
rejects invalid occupancy/overflow; a primary-count mismatch can be a consequence
of that rejection, rather than an error in primary-ray generation.

Further qualification is still required for:

- A consistent accuracy contract across coverage, original-plane distance,
  hit reconstruction and continuation origins. Integer edge signs do not prove
  a correct floating-point distance or conservative origin displacement.
- The arithmetic uncertainty filter's bound under permitted WGSL expression
  evaluation, and the frequency/register/spill cost of its integer fallback.
- General scene energy. Non-dielectric guided-emitter and portal proposals in
  `scatter_direction` return an ordinary BSDF PDF although their directions are
  drawn from another distribution; the terminal guided-emitter weight is 0.24.
  These paths need a separate mixture-PDF/energy review. The slab control excludes
  them, so it cannot establish their correctness. Scope and scene activation
  must be measured before attributing a room artifact to them.
- Rough optical transport at oblique angles, tinted/absorbing nested volumes,
  and same-build convergence of the final image. Camera-inside initialization,
  unrestricted coincident surfaces, participating media and caustic convergence
  remain unsupported. Actual Fresnel scattering consumes scattering depth;
  hidden occupancy-only crossings preserve it.

## New physical control

Local receipt directory:
`room-reference-2026-10-20T19-39-28-896Z-ded9ad66-1592-47fc-b2bb-8ea80b4d85af`.
Receipt SHA-256: `e998101cdecd540d20bc26457e08802c52d3c55ff0b4344432525135d9293dd1`.
Raw linear HDR SHA-256: `4f5b42dda7682c05171fa7704c993f0d0953564b97f43a71c61104a0256c16ec`.
Private images/assets are retained locally, not included in this publication.

Source provenance: renderer c90e706, lighting bac0d5c, shared b68f868, site
asset pin 21d43a9. Physical adapter reports Apple / metal-3, non-fallback; its
receipt does not identify a specific chip model. 1920×1080, 20 bounces,
`stable-camera-random`, denoise and splitting off, bounded/nested on, rough
optical off; filled glass close-up, fill 0.55, support clearance 0.0001 m.

All 12,337,920 requested camera samples completed, with identical observed
primary-ray total; 35,491,156 secondary rays. No reported failure; cleanup passed.
Actual histogram: 103,680 pixels at 32 SPP; 207,360 at 16; 311,040 at 8;
414,720 at 4; 518,400 at 2; 518,400 at 1. Mean 5.95 SPP. **This is radial**.
The true uniform-32 requirement is 66,355,200 samples at 1080p.

The receipt's physical dielectric/rim preflight and optical slab probe pass.
Recorded diagnostic GPU intervals sum to 49,173.364736 ms; readback-inclusive
render interval is 51,330 ms. These are diagnostic-run measurements with no
matched baseline, not performance-improvement or real-time evidence.

Visual inspection shows visible grain and broad horizontal changes around the
water region. Their correctness needs matched empty/filled, uniform-budget and
converged references; no band-removal claim follows from completion. Current-build
uniform filled/empty controls were requested, then deferred after the user
challenged the repeated manual workload. Finish the automated contract review
and corrective work before requesting another costly scene run. Browser access
was previously blocked; no alternative browser-control route was used.
Full room and 4K verification remain pending. Adaptive performance work follows
those correctness gates.

## Repeatable review and limitations

Run `node scripts/review-renderer-contracts.mjs` under Node 24. The tool executes
canonical shader functions, with only flags and medium-table resource lookups
supplied as explicit test inputs. Exit code 2 means it reproduced a contract
failure; JSON retains the cases. The added characterization test asserts that
the review detects the rejected baseline behaviour. Its passing status is not
an assertion that those renderer contracts are satisfied.

The software executor uses the existing unsigned-semantics adapter and does
not implement every device floating-point transformation. Existing fixed-sampler
and slab regressions plus retained physical results supply separate evidence.
JS/LCOV percentages describe module execution, not device shader coverage.

Local review validation: all 448 tests pass (including the detector that
reproduces the rejected behaviour), 96.41% lines / 83.16% branches. The review
script appears in LCOV. Lint, types, build, package and Zero-Three gates pass.
No runtime source file changed during the review. Physical completion above
qualifies only its recorded lane; the full-scene acceptance remains unsatisfied.

Primary references: [PBRT dielectric transport](https://pbr-book.org/4ed/Reflection_Models/Dielectric_BSDF),
[PBRT conservative ray origins](https://pbr-book.org/4ed/Shapes/Managing_Rounding_Error),
[WGSL evaluation rules](https://www.w3.org/TR/2026/CRD-WGSL-20260921/#floating-point-evaluation),
[glTF transmission-factor meaning](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_transmission/README.md#transmissionfactor).
