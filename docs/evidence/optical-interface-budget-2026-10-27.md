# Separate optical budget — 27 October 2026

Status: **original central gates pass, but the additional whole-pixel check fails
at a filled-glass edge. Native4K qualification is stopped; adaptive performance
and publication remain paused.** This is a correctness
checkpoint, not a claim that every visible room band should disappear or that
the renderer has become faster. Task234 remains In progress; PR216 remains draft.
See the [versioned ledger](optical-interface-budget-2026-10-27.json).

## Implemented contract and cost

User-approved [ADR0066](../adrs/adr-0066-separate-optical-interface-budget.md)
is implemented at renderer `62f23df28c4200e9483ccc7fe99b2625ce91e9c2`.
The default-off flag adds an independent 1–64 smooth, fully transmitting,
valid-medium interface allowance; ordinary `maxDepth` remains 1–32. Strict,
deferred bounded+nested transport is required; rough splitting is rejected.
Every actual surface event advances the original sampling ordinal and consumes
bounded path storage/dispatch. No collision, reflection or transmission is free.

At ordinary20/optical64 the physical capacity is84. Ordinary32/optical64 admits
96, the absolute maximum. A 128² tile adds64 MiB of path-node allocation under
the configurable128 MiB additional-byte cap; device storage limits also apply.
This is allocated storage, not exact physical VRAM residency. The 320-byte frame,
96-byte ray and64-byte node remain unchanged. Disabled payloads/memory/dispatch
are pinned; reversing only the new WGSL policy reconstructs the exact preceding
shader hash. Low flag bits, source pixels, camera samples and complete-count
normalization are preserved. No temporal radiance history is added.

## Physical furnace results

Reuse the original package geometry, camera, .75 radiance, uniform256 samples,
512×288 diagnostic extent and .0001m pedestal clearance. Denoise, rough optical
transport and splitting remain off. These are **not native performance tests**.
All8 lanes complete301,989,888 camera samples. Read-only verification reconstructs
HDR chunks/hashes, checks source/cleanup/counts, the enabled budget and every
physical-event telemetry record. The mean2%/worst-row5% tolerances are unchanged.

| Control | Before budget, worst row | Optical64, worst row | Optical64, mean error |
|---|---:|---:|---:|
| Filled |1.270% at ordinary20|0.0366%|0.000763%|
| Empty |6.531% — failed|0.3906%|0.008681%|
| Index-one water |6.531% — failed|0.3906%|0.007801%|

Both ordinary20 and32 give the same errors, and **all four lane HDR hashes are
bit-identical across these ordinary limits**, including the contrast pedestal.
The latter remains a lighting/refraction attribution control, not a furnace pass.
Old failures are retained and never promoted. A finite64-interface allowance can
still truncate rare paths: passing the frozen tolerances is not a proof of zero
finite-horizon bias or arbitrary-scene convergence.

## Original path proof and canonical regression

### Additional whole-image failure (not hidden by the central ROI)

All-pixel inspection finds75 filled-furnace pixels losing more than20% of the
expected light. Worst pixel(230,187) returns.0820312947 instead of.75 (89.0625%
loss), outside the historical central ROI. The new gate requires every RGB
channel at every pixel to remain within5%, in addition to the unchanged original
mean/row gates. A requirements-first regression reproduces the ROI omission;
the read-only verifier now rejects this control with gate version2/exit1. The
earlier version1 positive reports and raw receipts remain preserved, explicitly
limited to their original region checks. They are not whole-glass passes.

At this exact edge,6 of8 original samples reach optical64 with zero terminal
radiance, while2 reflect directly to the emissive pedestal. Independent filled
references show the same depth trend: at128 events this pixel is.5799517; at1024
actual events it is.7501887. The1024 reference still has2 pixels losing>5%, so
it is not a convergence pass. It confirms long tails, not permission to clip or
invent light. Reference scripts now validate supported API bounds and actual
applied depths. See the [streaming design](../design/streamed-optical-interface-budget.md)
before choosing a larger bounded qualification allowance.

### Earlier central-tail correction

The same8 selected original samples at pixel90374 previously terminated with
`MAX_DEPTH_STRICT` at20 events and zero terminal light. They now reach the
environment/emissive pedestal after34–64 events, return .75 within4.77e-7, and
spend zero ordinary scattering events. Their first20 optical records match
bit-for-bit after excluding temporary atomic queue slots/parent node addresses;
identities, geometry, media, directions, weights and selected paths are preserved.

The additional assembled GPU probe executes16,384 air-entry-conditioned paths
with40 forced analytic TIR wall interactions and canonical Fresnel selection,
BSDF/PDF, budget and roulette. All escape in41–44 events, mean1 and maximum
escaped-weight error0. The old20-event policy truncates the portable numerical
control. This analytic proof is not a substitute for BVH/room qualification.
The existing slab and13-mode lighting/MIS regressions remain required.

## Native gate and delivery

All six **before-budget** native uniform32/event20 captures at70e02d7 have now
passed independent integrity checks:995,328,000 camera samples,120 HDR chunks,
1,935 tiles and3,473,073,413 physical path segments. This does not reverse their
failed furnace gates or certify band removal.

The **new** six-lane run started automatically at16:05UTC on immutable62f23df:
1080p then4K, empty glass, filled glass and full room, uniform32, ordinary20 plus
64 optical interfaces. It must retain native PNG/linear HDR, exact counts,84-event
telemetry, source identity, all physical preflights and cleanup, then pass image
review. All three1080p lanes completed (199,065,600 camera samples and698,207,900
physical segments); their integrity/preflights pass. The sequence was deliberately
cancelled after pending work at4K start once the additional edge failure was
identified. No new4K lane is complete; cancellation is retained as a failure, not
silently skipped. The broad pedestal-reflection region already reproduced independently;
removing physical reflections is not the acceptance criterion.

520 tests pass,96.43% line/83.46% branch coverage; all62 changed executable source
files versus the PR base appear in combined LCOV. Lint, types/clean consumer,
build/package, Zero-Three and runtime audit pass. Exact-head CI40535217735 passes
every job/step. These gates do not certify pending native images or performance.
No merge, release, local publication or main/CD deployment was attempted.
