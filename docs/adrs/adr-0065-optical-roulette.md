# ADR 0065: IOR-compensated cumulative optical roulette

Date: 2026-10-27. Status: accepted for implementation; image qualification pending.
Task234, Story site2291, Feature site2114. Supersedes only the local roulette
decision for smooth bounded+nested dielectric events, not ADR0055's collision,
branch/PDF or medium contracts.

## Evidence and decision

The retained diagnostic d97578d batch reproduces all four previous32-event HDR
hashes exactly. At empty-furnace pixel90374 four of eight selected original
samples die on bounce2 glass entry; surviving .75-source paths return ~1.74.
All eight are short. This is evidence of unnecessary finite-sample variance,
not proof that unbiased roulette changes infinite-sample energy. Aggregate
optical tails and finite-depth loss remain distinct possible causes of bands.

For smooth bounded+nested events, use max(beta * continuation * eta_out^2)
clamped to [.05,1] for survival. Air-initialized camera transport makes the
product of radiance-mode relative IOR squares telescope to 1/eta_out^2; removing
it only from roulette avoids treating reversible refraction as absorption.
The existing priority-resolved outgoing medium supplies eta_out, including
reflection/TIR (unchanged occupancy). Actual surviving radiance still divides
by survival; BSDF, branch probabilities, PDFs and absorption are unchanged.
This follows the cumulative beta / etaScale distinction described in
[PBRT4 section13.4](https://pbr-book.org/4ed/Light_Transport_I_Surface_Reflection/A_Better_Path_Tracer).

Keep the previous local [.05,.95] policy for non-optical, rough, unbounded/split
or non-nested paths. Existing default-off boundedDielectricBranching and
nestedMediaRefraction flags control the corrected path; no new capability,
allocation, record layout, queue, pass or public configuration is introduced.
Do not restore a biased fallback, bypass optical visibility, or import Three.js.

## Consequences and qualification

More useful optical paths may survive; they still consume the unchanged event
budget. This is not a performance improvement claim or a solution to depth
truncation. No uncounted surfaces or unbounded tail loop is permitted. A future
camera-inside contract would require its initial IOR in the scale derivation.

Numerical tests execute the canonical helper for entry/exit/TIR, attenuation,
outgoing-medium selection, disabled/rough/split behavior and reciprocal
compensation. The physical slab preflight executes that helper with original
GPU sampling and a closed-form finite-horizon reference. Preserve rejected
controls and frozen furnace row/mean tolerances; then independently verify
linear HDR/count/preflight/cleanup evidence at native1080p and4K. Adaptive work
and image/performance publication remain gated until correctness passes.
