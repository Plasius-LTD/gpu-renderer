# ADR 0066: Separate capped optical-interface budget

Status: accepted for experimental implementation; physical image qualification
pending. Task #234, site Story #2291 / Feature #2114. 27 October 2026.

Refinement: [ADR0067](adr-0067-streamed-bounded-optical-chains.md) supersedes
the per-interface node/queue allocation, physical GPU maxDepth and1–64 range
below. Retain this prototype decision/evidence historically; use0067 for current
logical storage,1–2048 admission and physical-segment telemetry. The independent
default-off policy and unchanged ordinary scattering budget remain in force.

## Context

Canonical original-sample journals show valid thin-wall TIR paths terminating
at the strict 20-event cutoff. Corrected roulette and Fresnel importance remove
avoidable variance but cannot restore radiance beyond a finite path horizon.
The user selected a separate capped optical budget, not a higher ordinary limit.
Historical failed image evidence remains rejected and retained.

## Decision

Use default-off `renderer.transport.opticalInterfaceBudget.enabled`. Require
bounded nested transport, strict physical lighting and deferred resolve. Reject
rough-bounce splitting because its lineage overlaps the reserved high flag bits.
Only smooth, fully transmitting valid-medium interfaces qualify, including TIR
and Fresnel reflection. Partial/rough and non-optical scattering remain ordinary.

Keep public `maxDepth` (1–32) as the ordinary limit. An independently configurable
1–64 interface allowance defaults to 64. The physical-event capacity is their
sum (at most 96). Every event advances the actual sampler/node/queue ordinal;
no collision or scattering is skipped. Track completed ordinary events in the
high byte of `RayRecord.flags`; derive optical count from physical minus ordinary.
Preserve ordinary final-vertex semantics and environment/emission handling.

Keep the 320-byte frame, 96-byte ray and 64-byte path-node ABI. Enabled frames
use formerly zero camera vector W lanes for the two limits; GPU admission checks
the flag, prerequisites and exact capacity. Camera XYZ is unchanged. Disabled
payloads, allocations and dispatch counts remain the previous path.

Path storage and telemetry/dispatch cover the physical capacity. Additional
path-node bytes are checked before allocation against a configurable 128 MiB
default cap and device storage limits. A 128² tile with 64 additional interfaces
adds exactly 64 MiB; this is allocated storage, not measured physical residency.

## Consequences and qualification

This bounds work and memory, but does not make optical events free or eliminate
all possible finite-horizon bias. No fabricated radiance, transparent-shadow
bypass, ambient compensation or adaptive success claim is permitted. Three.js
remains prohibited. Disable only this flag to recover the previous GPU-native
depth policy; expanded sampling/performance work stays paused until correctness.

Require canonical numerical counter/eligibility/energy tests, assembled physical
TIR and slab probes, preserved failed off controls, unchanged furnace mean/row
tolerances, and all six uniform-32-SPP native empty/filled/room lanes at 1080p/4K.
Retain linear HDR, actual counts, full physical-event telemetry, provenance and
cleanup. See [design](../design/optical-interface-budget.md) for the complete
acceptance contract. Implementation tests alone do not qualify room banding.
