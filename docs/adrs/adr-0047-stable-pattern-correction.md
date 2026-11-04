# ADR 0047: Stable pattern correction candidate

Status: experimental, not approved as production default.

The shared-point sampler in ADR 0046 has measured coherent lighting patches and
brightness failures. Preserve it as an explicit rejected control. Temporal
stability does not require identical lighting decisions at different pixels.

Keep centre-first fixed camera points, but independently key a fast Sobol-pair
permutation by pixel, event, bounce and component. Exclude frame, seed, budget
and sample ordinal from the key. This is PBRT's fast prefix-preserving scramble,
not full nested Owen or a full high-dimensional Sobol generator. Reuse existing
sequence helpers and the frame flag word; no new memory/pass architecture.

Use default-off renderer.sampling.stablePattern.enabled, mutually exclusive with
other samplers. Renderer creation specializes source; turning all flags off and
recreating restores the unchanged GPU-native path. Three.js is prohibited.

The internal stable-camera-random control combines the fixed camera with stable
independent lighting and dedicated 1D selectors; it does not isolate camera cost
from the historical random implementation. Production promotion requires converged image, local,
temporal and matched-quality performance qualification; passing a regional
brightness screen alone is insufficient. See
[design and frozen checks](../design/stable-pattern-correction.md).
