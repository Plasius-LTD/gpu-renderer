# ADR 0067: Stream bounded zero-direct optical chains

Status: accepted for implementation, not image/performance qualified. Task234,
site Story2291 / Feature2114. 27 October 2026. Refines ADR0066's experimental
per-interface node allocation; retain its implementation and failed captures.

## Evidence

The original central furnace gates pass at optical64, but an additional5% RGB
gate over all pixels reproduces severe filled-glass edge loss. Original-ray GPU
diagnostics, now using captured primary packets rather than regenerating rays,
match every retained canonical prefix exactly. Six formerly truncated samples
escape after86–235 interfaces and recover the .75 source. Independent128/1024
references confirm the depth trend but are not full-image convergence passes.
Do not remove physical pedestal reflections or fabricate terminal radiance.

## Decision

Keep the existing default-off opticalInterfaceBudget flag and ordinary maxDepth.
Stream only smooth, fully transmitting valid-medium zero-direct optical chains
locally on the GPU. Preserve each collision, medium update, Fresnel/PDF/IOR
weight, roulette draw and physical ray.bounce. Rough/partial, ordinary and
emissive surfaces are not collapsed. Rough splitting remains incompatible.

Separate physical event ordinal from logical deferred-node depth. Logical depth
is completed ordinary scattering (the existing reserved high flag byte). A chain
with no direct source needs one logical node, not a node per zero contribution.
Terminal/direct radiance retains cumulative physical throughput and one completed
camera sample. Queue/node capacity and host iterations remain ordinary-depth
bounded. Disabled behavior/payload/allocations/dispatch remain the old path.

Keep an explicit finite per-ray allowance; extend its validated safety range to
1–2048, keeping default64. Select qualification allowances explicitly and admit
them only after the complete furnace gate. Physical metadata is ordinary plus
optical; GPU maxDepth describes logical capacity. CameraRight.w carries optical
allowance, CameraUp.w ordinary limit, and CameraForward.w enables diagnostics
only. Their XYZ camera values,320-byte frame,96-byte ray and64-byte node stay
unchanged. Added path-node allocation is zero; retain the configured additional-
allocation cap and account separately for diagnostic/staging memory.

Use counter offset27 (previous pad2, unchanged record size) to accumulate actual
extra optical queries only when diagnostics are enabled. Copy it once per camera
sample into lazy telemetry storage. Sum queue segments and optical additions for
actual secondary rays/path segments. Queue-iteration histograms must be explicitly
labelled and never advertised as physical-ordinal histograms. Missing/overflowed
optical records fail telemetry. No additional debug atomics/readbacks when off.

## Qualification

Requirements-first tests cover logical ownership, complete-count resolve, bounded
physical/ordinary counters, byte/memory admission, disabled equivalence, mixed
materials, invalid media, roulette and faithful segment accounting. Verify final
assembled layouts/compilation and hardware execution. Reproduce the64-interface
prototype before evaluating higher bounds, preserving every failing image and
diagnostic attempt. Require the original mean2%/row5% AND additional whole-pixel
RGB5% gates. Then run all six native1080p/4K uniform32 lanes and inspect retained
HDR/PNG with provenance/count/preflight/cleanup evidence. No adaptive work resumes
or white-paper improvement claim follows until correctness passes. No Three.js,
local publication, unapproved merge or production deployment is permitted.
