# Task 210 evidence ledger

Status: experimental, not release-qualified; Task 210 remains In Progress.
No adaptive mode, noise improvement or speedup is claimed.

## Supported, narrowly

- The old assembled terminal helper aliases sibling storage: eight physical
  trials retained [1,2,3] instead of [3,6,9]. See the immutable transport
  commit/hash in [the rejection receipt](task-210-collision-2026-09-08.json).
- The new assembled helper preserves [3,6,9] in eight trials and rejects an
  injected failed child. Reflection checks the final assembled 64-byte ABI.
- A 16 × 16, two-bounce physical renderer run completes exactly 32 camera
  samples per pixel in both resolve modes, verified from the actual storage
  buffer, not inferred from the requested target.
- Focused mesh-BVH probes exercise real glass siblings and non-splitting
  ideal metal against a white environment. Centre linear RGB is [1,1,1].
  The fixture freezes a 0.00001 absolute tolerance for these controlled probes;
  this is not a tolerance for the broader image programme.
- An intentionally full-screen refractive mesh exceeds the queue capacity.
  The frame fails, count storage remains invalid through all 32 samples,
  and denoise preserves invalid alpha/magenta. A subsequent clear frame
  recovers. This is failure handling, not capacity robustness.

## Implemented, insufficiently qualified

Nested lineage, one-child/black terminals, mismatch rejection, shared roulette
compensation, total internal reflection, full-screen/local/queue identity,
sticky failure and both per-sample dispatcher variants have requirements-first
unit/source tests. The primary and secondary refraction conventions are shared.
Physical nested scattering, roulette variance and all reference scenes still
need retained image evidence before integration is accepted.

The two unused EnvironmentPortal padding fields were renamed without changing
their offsets so the released reflection package accepts the assembled module.
The GPU is still the compilation/execution authority; reflection is additional
ABI evidence, not a substitute.

## Known baseline defect, not hidden

Passing frameTimeBudgetMs: 0 to the base renderer selected an effective 1 SPP
target despite requesting 32. This is renderer #199 / PR #205. The fixed
ownership fixture omits that option, the existing unambiguous fixed dispatcher.
Its initial attempt to copy a storage-only buffer was also corrected to use
a test-only bit-preserving GPU storage copy; renderer allocation usage is
unchanged. Neither failed attempt is qualification evidence.

## Reproduce

Serve the repository source and tests locally, then open
`tests/fixtures/split-path-ownership.html` on a physical WebGPU browser.
The fixture needs the repository's /src/ URL mapping, has a 60-second deadline,
rejects a fallback adapter, checks assembled compilation/validation, and destroys
its resources. It runs actual renderer pipelines and mesh traversal; a separate
test-only shader copies raw storage bits for completed-count inspection.

For the old collision, serve the original source from commit
`3382f8226c312f06903adbd1f8f37a737de8a97f` with
`split-path-collision.html`; its source-hash guard rejects the fixed shader.
Do not substitute an edited reproduction and retain the old provenance.

## Outstanding completion gates

- Linear-HDR images/variance for Eames, furnace, small emissive, dark-terminal,
  dielectric and reflected/transmitted paths; investigate the reported noise.
- Approved 1080p/1440p/4K × depth 1/4/8 × SPP 4/32/128 stress lanes, allocated
  bytes, GPU/job/pass costs, ray counts, overflow/timeouts/device loss.
- Baseline recapture with schema-2 provenance; schema-1 timing remains rejected.
- Post-push CI, review and approved main/CD before release. The canonical paper
  audit ledger must be updated in its owning site Task before publication.

Three.js remains prohibited. Task 168/169 and the GPU tab must not claim an
adaptive success from this limited producer evidence.
