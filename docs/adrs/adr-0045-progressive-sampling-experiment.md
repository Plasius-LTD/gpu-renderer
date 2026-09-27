# ADR 0045: Opt-in progressive two-dimensional sampling experiment

Status: Accepted for experimental implementation, not production qualification.

The legacy maximum-SPP stratification confines reduced prefixes to a subset of
the 2D domain. Preserve it as the default-off control while testing two mutually
exclusive remote flags: renderer.sampling.owenSobol.enabled and
renderer.sampling.independentRandom.enabled.

Use the first two Sobol generator dimensions with pixel/event/bounce/frame-local
hash-driven nested binary scrambling of 24 bits. Keys exclude ordinal/budget.
No count-dependent index permutation, CPU sampling cache, new pass, buffer or
ABI expansion. Existing experiment word bits 8/9 carry the flags. The independent
random control isolates full-domain coverage from low-discrepancy benefits.
Keep one-dimensional selectors, transport, PDFs and normalization unchanged.

Scrambling costs integer instructions. No speed or memory claim follows from
the algorithm choice. Preserve the original transport hash checks after removing
only the explicitly added sampler branch/helpers; additionally require physical
legacy HDR identity. Native tests are specified in
[the frozen design](../design/progressive-sampling-experiment.md).

Rollback disables the sampler flags. Three.js remains permanently prohibited.
Reference: [PBRT Sobol samplers](https://pbr-book.org/4ed/Sampling_and_Reconstruction/Sobol_Samplers).
Our implementation is pixel-local and hash-driven, not a global image Sobol
sampler or the approximate fast scrambling alternative.
