# ADR0068: Ordinary continuation proposals must match their reported density

Status: accepted for implementation; full-scene qualification pending.
Date:2 November2026. Task renderer#271; Feature site#2114 / Story site#2291.

## Context

The fixed32 sky-NEE A/B experiment does not reduce pair variance and shifts
energy by approximately-1.59% for both keys. That does not prove its cause.
Separately, an independent production-WGSL quadrature exposes an unconditional
sampling-law defect: roughness1 pure-GGX reflection at normal incidence should
have null mass.5 and return1 for a unit-Lambertian integrand. The ordinary path
returns2.33336, while the coated null-event path returns1. The former replaces
rejected GGX draws with cosine draws but reports the original mixture PDF.
Emissive/portal heuristic continuations likewise report an unrelated BSDF PDF.

## Decision

Use the already evaluated diffuse/GGX/coat mixture for ordinary continuations.
Rejected proposals retain their null-event probability; return PDF0 rather than
resampling another lobe. Remove continuation guidance with unreported density
and its arbitrary emissive discount. Preserve explicit light/environment NEE,
BSDF values, MIS, optical/delta transport, sample identities, camera-sample
normalization, collision contracts and all record/buffer sizes. This estimator
correction is unconditional and does not activate adaptive or material flags.
Three.js is prohibited and cannot be a fallback.

## Consequences and evidence boundary

Corrected radiance and secondary counts intentionally change. Fewer null-path
continuations is not measured performance or memory improvement. The frozen
rejected sampler reconstructs the exact previous assembled shader SHA256
`1679475a3e08f26ea681c7bb0ea056c640a315936b91e9dbb8e23c86de23b733`;
historical optical/MIS reconstruction tests keep their original pins. Corrected
default assembly is
`b50d988d92d0af5867fc3355cadad89ad8b1affe9c88bf051298df2c8acaf7b4`.
Camera sampling points and dimensions do not change. Old captures remain valid
historical evidence, not a qualified baseline for the corrected estimator.

Portable production-function quadrature, assembled physical GPU probes and full
native1080p/4K HDR/energy/convergence verification are required. Keep1% energy,
3% reference-convergence, cleanup, counts and operation bounds unchanged.
Adaptive performance and publication claims stay paused until correctness
passes; no new baseline, universal banding fix or release is asserted here.
