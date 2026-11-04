# ADR 0058: Separate optical edge admission from hit-distance ordering

Status: Accepted for experimental implementation; physical qualification pending.
Date: 2026-10-14. Task: #234; parent Feature: plasius-ltd-site#2114.

## Evidence

ADR 0057's shared-edge GPU probes pass at renderer
`522b9db901ba2ed7c87f3e07777d8e09720d5f45`, but the full 4K/256-SPP/20-depth
filled-glass capture still rejects pixel 2601331 / sample 76 / bounce 7.
The canonical ray crosses hidden water entry 354063, then selects glass entry
353682 while glass is already occupied. Changing pedestal clearance from zero
to 0.0001 m preserves the failure.

The original binary32 geometry has two valid, very close corner crossings:
exit 353681 at 0.030731821650255987 m and entry 353682 at
0.030732102132163742 m (independent double-precision reference). The software
WGSL executor reproduces the distance inversion: approximately 0.030732865 m
and 0.030731229 m respectively. Physical traversal likewise chooses the entry.
Normalizing nearly cancelling projected edge functions and using those weights
to interpolate distance is ill-conditioned for this ray. Correct edge coverage
alone is insufficient to preserve nearest-hit order.

## Decision and compatibility

Keep ADR 0057's consistent projected-edge inclusion test. Calculate accepted
triangle distance using the original, unnormalized triangle plane:
`dot(cross(v1-v0, v2-v0), v0-origin) / dot(cross(v1-v0, v2-v0), direction)`.
Reject a zero denominator and retain the strict positive/exclusive cursor test.
Do not sort by expected occupancy, merge nearby events, add a geometry gap,
alter the material or consume fewer bounces. Barycentric material/position
interpolation remains unchanged; its accuracy at extreme scales remains a
separate qualification concern.

Only the existing default-off `renderer.transport.nestedMediaRefraction.enabled`
path changes. Flag-off arithmetic, public contracts, ray/buffer ABI and allocation
sizes are unchanged. This adds arithmetic to the accepted nested triangle path,
not CPU traversal or a new pass. Incremental GPU cost must be measured. Three.js
remains prohibited and is not a rollback option.

## Validation and limits

The retained exact-ray numerical regression fails before this correction. Require
exit-before-entry in both candidate traversal orders, correct closest selection,
an exclusive exit cursor retaining the entry, winding/axis variants, original seam
cases and flag-off equivalence. The assembled physical preflight includes both
orders and the cursor checks. Full 4K/256-SPP/20-depth empty/filled captures,
linear HDR, energy, device stability and timing remain mandatory. Do not claim
complete transport qualification from the software test or analytic GPU probe.

This is not exact arithmetic or a general guarantee for arbitrarily close or
grazing surfaces. Hardware floating-point evaluation and more extreme scenes
remain qualification risks; no occupancy or sample-count gate is weakened.
