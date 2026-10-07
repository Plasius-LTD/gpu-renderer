# Glass/water transport qualification follow-up

Parent Epic: Plasius-LTD/plasius-ltd-site#2113.
Parent Feature: Plasius-LTD/plasius-ltd-site#2114.
Parent Story: Plasius-LTD/plasius-ltd-site#2291.
Diagnostic integration: gpu-lighting#105 and gpu-renderer#233.
Proposed transport follow-up: gpu-renderer#234 (not started; approval pending).

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

## Proposed scope, not implementation authority

The user was asked whether to expand this scene addition into transport fixes.
No runtime transport correction is included in the diagnostic commits. Before
implementation, refine the design, acceptance and remotely controllable flags,
assign the active Task and move it to In Progress. Candidate independent controls
are `renderer.transport.boundedDielectricBranching.enabled` and
`renderer.transport.nestedMediaRefraction.enabled`, both default off. These are
proposed names, not implemented flags. Existing failure checks remain unconditional.

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
