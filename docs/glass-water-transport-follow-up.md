# Glass/water transport qualification follow-up

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

## Diagnostic delivery validation

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

### Remaining acceptance lanes

Before signoff, exercise each new flag off/on/reset, individual and combined;
empty/filled and room/close-up; completed counts/queue integrity; the analytic
GPU probe's IOR/Fresnel/TIR/estimator/occupancy checks. Inspect initial controls,
rendering progress, completed image and receipts, including a smaller viewport.
Exploratory checks: glass-off close-up rejection and an invalid optical priority;
legacy-overflow rejection must remain intact. Capture raw HDR and PNG evidence.
Any unexecuted lane stays explicitly pending; a functional pass is not visual
quality or performance signoff.
