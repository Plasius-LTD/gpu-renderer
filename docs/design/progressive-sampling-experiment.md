# Controlled progressive sampling experiment — 27 September 2026

Tasks renderer#169 and lighting#87; Stories site#2119/#2125; Feature site#2114.
This tests the concrete ordered-prefix defect, not a production performance claim.

## Hypothesis and controls

With maximum32, legacy two-dimensional sample x=(ordinal+jitter)/32 confines
reduced prefixes to a slice of the sample domain. Shared normalization is already
sum/completed-count. Changing exposure, PDFs, brightness or denoising is not a fix.

Add independent remote snapshot keys renderer.sampling.owenSobol.enabled and
renderer.sampling.independentRandom.enabled, both false by default and mutually
exclusive (reject simultaneous true). Reuse existing featureFlags forms and
FrameConfig experiment bits; no ABI size/resource change. Parent adaptive flag
still governs public adaptive rollout; the sampler may be tested with fixed
dispatch independently. Disabling both restores the legacy sequence exactly.

Implement pixel-local two-dimensional Sobol (first two generator dimensions)
with hash-driven nested binary Owen scrambling of all 24 output bits. Scramble
key depends on pixel/bounce/frame/event/component, never ordinal, tier or budget.
Do not apply sample-count-dependent index shuffling. Generate both components
directly in WGSL; no lookup texture, per-pixel memory, pass or CPU sample cache.
All existing 1D selectors remain unchanged to isolate the defective 2D mapping.
The independent-random control generates two separately keyed uniform components
in [0,1). Neither control changes BSDF/PDF/MIS, count resolve or path identity.

## Frozen diagnostic programme

First unit checks: known Sobol words, power-of-two elementary interval occupancy,
prefix/budget invariance, key separation, half-open float bounds, analytic
integrals across independent keys, legacy defect reproduction, default/false/
conflicting flags, public types and unchanged flag-off sequence. Physical WGSL
probe compares CPU/GPU sample words and known-integral coverage.

Then use original source Eames at native1080p, same room/camera/materials,
four-bounce ceiling, denoise off, sequence maximum32 and exact prescribed
5.95-SPP circular map. Keep hard boundaries. Three predetermined seeds7/19/43
for every sampler, fixed32 and radial; compare like seed/sampler pairs.
At seed7 also check adaptive uniform32 against fixed32 for every sampler,
including exact flag-off image hash against the retained original Eames image.
Rotate sampler/mode execution order; one warmup and three timing-only frames
per sampler/mode at seed7, separate diagnostic GPU/CPU/count/HDR frames.
Retain full HDR for seed7 and all per-seed regional/global metrics and hashes.

Predeclare the primary falsification screen: for each reduced-SPP ring, absolute
mean signed luminance difference relative to same-sampler fixed32 across the
three seeds must be <=1%; the former16-SPP ~9.7% brightness error should improve
at least80% for both the random control and Sobol. Report per-seed and aggregate
results even on failure. This tests systematic bands, not converged-reference
quality: no 1SPP cleanliness, unbiased-estimator proof, full transport correctness
or matched-quality/60Hz claim. RMSE and tails are reported, never hidden by
regional means. Existing full qualification tolerances are not replaced.

Native4K seed7 fixed/radial and uniform control for Sobol follow the1080p
diagnostic. If runtime/device constraints block, retain the failure and do not
substitute lower resolution. Broader reference convergence/depth matrix remains
separate. No tolerance changes after seeing results.

## Delivery and risk

True nested scrambling costs integer work; measure total jobs and separate GPU
spans at equal budgets. No promised speed or memory reduction. Rollback disables
sampler flags without restoring Three.js. Three.js remains prohibited. Update
README/CHANGELOG, ADR, retained evidence and issue/PR status. Run full coverage/
changed-source LCOV, lint/types/build/package/dependency gates, physical checks,
push/CI. No production flag enablement, local publishing or release bypass.
Source reference: https://pbr-book.org/4ed/Sampling_and_Reconstruction/Sobol_Samplers

## Pre-comparison correction: preserve compiled flag-off control

The initial physical probe rejected the legacy CPU hash's floating multiplication;
the new CPU reference now uses exact u32 operations. A subsequent native run
rejected the historical flag-off HDR hash with dormant sampler helpers present.
Keep both failed capture receipts. Do not use their timings for sampler claims.

Select progressive shader source at renderer creation, leaving default shader
bytes exactly unchanged. Keep the same buffer ABI and pipeline count, recreating
the renderer when sampler flags change. The fixture rotates sampler/mode order
with one live renderer at a time and records recreation outside frame timings.
The frozen seeds, budgets, thresholds and full-fidelity scope remain unchanged.
