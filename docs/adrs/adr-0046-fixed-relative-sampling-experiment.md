# ADR 0046: Explicit fixed-relative sampling experiment

Status: experimental. Task #169, parent Feature site#2114.

The user requests a test of fixed relative sampling, including camera, light
selection, bounce directions and termination selectors. Use a separate remote
snapshot flag `renderer.sampling.fixedPattern.enabled`, false by default and
mutually exclusive with the existing sampler experiments. Select the shader
source at renderer creation; default source remains exact. No shader-runtime
mode switch, new allocation or pass is necessary.

Reuse existing Sobol pair generation with static event/bounce digital shifts.
Pixel and frame identifiers do not influence samples. The camera's zero ordinal
is centred and remains identical when the budget changes. All 1D selectors also
use fixed event-relative points. Material/PDF/MIS/count transport stays intact.
This is a diagnostic pattern, not a full high-dimensional Sobol construction or
a guarantee of unbiased estimates. Shared point patterns may hide coherent
lighting errors or increase aliasing even if images stop flickering.

The [protocol](../design/fixed-pattern-experiment.md) requires CPU/GPU parity,
native original-Eames output, exact uniform32 control, static repeated frames,
common-reference HDR errors and separate timing lanes. Static repeatability
must not be presented as image accuracy or moving-camera stability. The common
96-sample reference is not certified converged. Production flags stay off;
rollback recreates the legacy GPU-native renderer. Three.js is prohibited.
