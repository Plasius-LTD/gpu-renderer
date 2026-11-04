# ADR 0056: Rough optical transmission keeps real surface collisions

Status: Accepted for experimental implementation; physical qualification pending.
Date: 2026-10-11. Parent: Feature site #2114, Story #2291, renderer Task #234.

## Decision

Implement the [rough optical design](../rough-dielectric-transport.md) under
`renderer.transport.roughDielectricTransport.enabled`, default off, requiring
explicit nested-media transport. Reuse the existing material factors, medium
table, sample dimensions, tile queues and 96-byte ray record. Do not implement
transparency by discarding geometry or substituting alpha for transmission.

The experimental volume model uses GGX reflection/refraction, exact dielectric
Fresnel, Smith masking and matched densities/Jacobians. A Fresnel-attenuated
Lambertian component represents the non-transmitted fraction. Sampling chooses
one continuation; only geometric transmission updates occupied media. Rejected
microfacet proposals and depth limits terminate with zero, not ambient fill.
Reflection/diffuse next-event estimation shares the continuation BSDF and PDF.
Transmission has no straight-line NEE competitor and records that fact for MIS.

Lighting visibility rays retain occupied media, preventing single-sided exit
faces from vanishing from internal lighting checks. Unblocked segments account
for existing Beer attenuation. Curved refractors are not shadow-ray passthroughs.
Missing volume metadata and alpha-covered optical surfaces fail closed (GPU
diagnostic codes 6 and 7 respectively). Existing occupancy/capacity failures remain.

## Consequences and limits

No extra runtime buffers or queue expansion. Additional per-interaction arithmetic
and variance must be measured. No acceleration, memory-saving or image-quality
claim is made. GGX here is single-scattering surface roughness, not subsurface or
volumetric translucency. Thin sheets, alpha coverage (tracked separately in #237),
camera-inside initialization and general delta-light caustics remain unsupported.
The default-off path keeps existing behavior; all new physical and scene probes
must pass before rollout. Never restore Three.js as a fallback.
