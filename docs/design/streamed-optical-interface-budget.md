# Streamed bounded optical interfaces — correctness continuation

27 October 2026. Task234 / site Story2291 / Feature2114. This follows the
user-approved separate optical-interface budget. Adaptive performance remains
paused. This design precedes the streaming implementation and does not claim a
qualified renderer or performance gain. Keep62f23df and all raw evidence intact.

## Evidence and reason

The64-interface prototype fixes the central furnace rows, but all-pixel RGB
inspection finds filled-glass edge loss: pixel(230,187), uniform256, returns
.0820313 instead of.75. Six of eight original samples terminate at optical64;
the other two reflect to the emissive pedestal immediately. Empty/index-one
maximum pixel error is2.34375%, but filled is89.062494%. The historical central
mean2%/row5% gate is retained unchanged; a new all-pixel/all-channel5% gate
prevents this omission. It is an additional requirement, not a relaxed baseline.

Independent filled references at128 and1024 actual events show the same tail
trend: the target pixel returns.5799517 and.7501887 respectively. At1024 the
reference still has two pixels below95% expected radiance; it is attribution,
not an image convergence pass. Reference metadata now checks actual API limits
and applied depths, rather than silently clamping. No production ceiling is
raised from this reference alone.

All three new1080p lanes completed and are preserved. The six-lane sequence was
cancelled after pending work at4K start because the all-pixel check reproduced a
correctness failure. That cancellation and the incomplete matrix are retained,
never marked as a successful4K qualification.

## Selected implementation direction

Smooth fully transmitting optical interfaces have no direct-light term and one
weighted continuation under bounded branching. Stream those zero-direct linear
chains locally on the GPU, retaining every intersection, medium transition,
Fresnel/PDF/IOR weight, roulette draw and actual physical sampling ordinal.
Do not stream rough/partial or ordinary scattering. Do not fabricate tail light,
skip surfaces, reuse radiance history or increase ordinary scattering budgets.

First factor a shared bounded chain helper and a diagnostic-only original-ray
tail trace. It must match the existing canonical prefix after excluding temporary
queue/node addresses, then measure the long tail before choosing qualification
limits. A caller-supplied bounded diagnostic allowance is not production admission
or an image sample. Default-off diagnostic recording may reuse post-readback
scratch; it must not change accepted radiance/counts or silently add stage bindings.

Then integrate the same helper into canonical staged/fused surface transport.
Separate physical ray.bounce from logical deferred-node depth: logical depth is
completed ordinary scattering. The root and source/sample identities remain
stable. Collapse only zero-direct optical vertices; terminal/direct sources still
use the original cumulative throughput and complete-camera-sample normalization.
Node allocation/host queue iterations stay ordinary-depth bounded, instead of
growing with optical allowance. Keep the off payload, shader transport behavior,
queues, memory and dispatch equivalent to the established control.

Continue using the existing default-off opticalInterfaceBudget flag and explicit
validated maximumInterfaces. Any expanded safety bound must be justified by the
tail trace, accounted independently of ordinary maxDepth, checked before use and
kept finite. Do not silently enable a larger default or remove memory admission.

Report all additional physical segments. Queue-iteration histograms must not be
presented as physical-event histograms after streaming. Use lazy diagnostic
counter readback, and avoid additional debug atomics when diagnostics are off.
Preserve record byte sizes and distinguish configured physical capacity, logical
node capacity, actual interface work and application-visible allocated bytes.

## Requirements-first qualification

1. Canonical helper numerical/assembled tests: mixed ordinary/optical limits,
   ordered IOR stacks, TIR/reflection/transmission, absorption/roulette, invalid
   interfaces, absolute ordinals and explicit bounded termination.
2. Physical diagnostic prefix equality to all original captured states; no image
   count/radiance commits. Retain complete tails or explicit logging truncation.
3. Node ownership/parent depth/resolve and disabled-path equivalence tests; count
   one completed camera sample regardless of optical-chain length. Rough/partial
   exclusions and split incompatibility remain explicit.
4. At optical64, reproduce the prototype output before testing higher allowances;
   retain the known failing edge control. Prove actual physical segment totals,
   queue histogram domain, cleanup, timeout and device-loss behavior.
5. Pass the original furnace gates AND additional all-pixel RGB gate at the chosen
   bounded allowance. Only then rerun all six native uniform32 lanes at1080p/4K,
   retain HDR/PNG/source/count/preflight/memory evidence and inspect the images.
6. Full tests/coverage/changed-file LCOV, lint/types, package/Zero-Three, docs/ADR/
   Unreleased and post-push CI. No local package publication or main/CD action.

Three.js is prohibited and cannot be a fallback. No adaptive or white-paper
performance/memory improvement claim follows merely from this design.
