# BSDF proposal / reported-density consistency

Feature site#2114 / Story site#2291; a correctness prerequisite for renderer#234.
Adaptive performance remains paused. Three.js is prohibited, including fallback.

## Evidence and problem

The2-November fixed32-SPP sky experiment leaves every continuation count fixed,
but its first seed changes scene energy by-1.59%, exceeding the frozen1% screen.
That is diagnostic evidence, not proof of a root cause. Independent code review
finds two unreported changes to the ordinary continuation proposal in
`scatter_direction`:

- A rejected GGX proposal becomes a cosine proposal unless layered clearcoat is
  active. `evaluate_surface_bsdf_pdf` still reports the original diffuse/GGX/coat
  mixture. The extra cosine probability is absent from that density.
- Emissive/portal-directed heuristic continuations also report the ordinary BSDF
  mixture density rather than their complete direction/selection distribution.

The existing complementary-MIS algebra probes cannot establish that generated
directions actually follow their reported density. Preserve all old controls;
do not change transport to resemble a paper or promote the sky flag.

## Selected correction and public contract

Keep continuation sampling equal to the BSDF mixture already evaluated by its
PDF. A rejected GGX/coat proposal is a zero-contribution null event, with PDF0;
do not resample it into another lobe. Remove the unaccounted guided-continuation
heuristic, retaining the existing explicit emissive/environment next-event
sampling and matching PDFs. No competing sampling system or PDF shortcut.

Smooth delta reflection and glass/water refraction, collisions, sidedness,
normals, offsets, medium/IOR state, ordinary/optical limits, sample identities,
camera-sample normalization and resource layout stay unchanged. Null paths
still complete their original camera sample. No temporal radiance, denoise,
clamp, extra rays, queue growth, new GPU buffers or production rollout. This is
an unconditional estimator correction, not an adaptive feature toggle; existing
adaptive/environment/material flags remain independent and default off.

## Requirements-first qualification

Execute production WGSL sampler and PDF, not a copied sampling implementation.
At normal incidence with roughness1 and a pure GGX proposal, half the proposals
are null and the admitted hemisphere density integrates to.5. Independently
integrate a unit Lambertian test function using the returned directions/PDFs:
the expectation must be1 including nulls. Keep the rejected cosine-fallback
counterexample. Test both clearcoat modes and rotated normals; ordinary diffuse
sampling remains normalized. Confirm emissive/portal metadata cannot silently
change continuation proposal density; explicit NEE remains present.

Add physical assembled-WGSL execution with the same analytic requirements,
including invalid/back-facing GGX half vectors. Exercise canonical/independent
rough-child/fused consumers and complete-count resolve. Fixed sampling points
remain fixed, but corrected radiance/secondary counts may change. Record a new
source-pinned baseline; never relabel earlier captures or loosen screens.

Run unit/integration/reflection/WGSL gates, full native1080p/4K scene integrity
and HDR energy/convergence/banding checks with all reference assets. Retain
failures, previous sky comparison, error/row maps, ray counts and memory. Keep
the30-second bound, cancellation/error precedence and cleanup. No performance
claim from fewer rays or instrumented jobs. Null events may reduce queue work;
variance and total GPU/job time require subsequent measurement.

Update README/Unreleased and architecture documentation; run tests, changed-file
LCOV and80%+ combined coverage, lint/types/build/package/Zero-Three/audits, then
push and verify exact-head CI. No merge/main-CD/local publication. Rollback must
remain GPU-native and cannot restore an estimator known to report the wrong
proposal density as a qualified release.

## Residual ordinary variance attribution — 2 November 2026

Task renderer#271 / Story site#2291 / Feature site#2114. The completed six1080p
reference lanes retain correct counts and pass energy, but fail the unchanged3%
convergence screen (128→256 about4.38%, independent256 pair6.19%). The full
12-lane capture remains running; preserve all images and failures. No adaptive
performance work or threshold change is admitted by these partial results.

An independent source audit finds that the canonical rough non-metal with
specularWeight1/clearcoat0 uses normalized diffuse/GGX probabilities0.4/0.6,
although its normal-incidence dielectric F0 is0.04. This is a variance hypothesis,
not a demonstrated PDF bug or a material response change. Test it numerically
before proposing a production experiment.

Build a CPU WGSL diagnostic using unchanged production `scatter_direction`,
`evaluate_surface_bsdf_pdf`, `evaluate_surface_bsdf` and GGX/cosine functions.
Only deterministic quadrature inputs and, in explicitly labelled controls,
the shared lobe-probability function may change. Sampling and PDF must use the
same controlled weights. Freeze512 midpoint samples per conditional lobe and
an independent uniform-solid-angle hemisphere integral, mean error<=0.0001.
Initially isolate isotropic roughness1, view/normal aligned, non-metal,
no coat/sheen/transmission, albedo0.75/1 and occlusion1. This is a smooth analytic
case where azimuth is irrelevant; do not claim general angular/material coverage.

Integrate each conditional lobe with its actual probability, including nulls.
Report first/second moments, variance and weighted null fraction, alongside the
independent physical BSDF integral. Compare canonical weights to diffuse
probabilities0.8/0.95 as diagnostic controls, retaining support and identical
BSDF values. Never resample nulls, alter radiance/PDF/MIS/roulette or suppress
sample completion. A variance reduction in this isolated test is neither proof
of the whole-room cause nor a GPU-time/quality improvement.

Requirements-first portable regressions cover original function preservation,
configuration/output validation, independent-integral agreement, conditional
probability accounting, nulls and the predicted variance reduction. Keep the
production shader/defaults byte-identical and do not add a runtime flag/path in
this diagnostic. Physical execution must wait for the active native capture;
do not contend for its GPU or claim CPU execution is physical qualification.
Any later runtime policy needs a separate named default-off flag, tracked
acceptance, material/grazing/metal/coat safeguards and matched native experiments.

Retain the failed1080p report and new diagnostic data, update README/Unreleased,
run full local gates/coverage/changed-file LCOV and exact-head CI. No local
publishing, main/CD/release or white-paper improvement claim. Three.js remains
prohibited, including tools and rollback.
