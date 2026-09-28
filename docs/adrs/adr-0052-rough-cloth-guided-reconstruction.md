# ADR 0052: Rough cloth guided reconstruction

Status: experimental; 2026-09-28. Task #222, Story site #2256, Feature #2114.

Extend ADR 0049's opt-in spatial postprocessor with a separate rough-cloth guide
class. Sheen colour alone previously excluded velvet completely. Restrict the
new class to uncoated, opaque, nonmetallic base roughness >= 0.7. Smooth and
protected materials keep raw radiance. Use geometric normals for this class,
and bounded per-channel albedo demodulation/remodulation. Keep colour and depth
edge gates and prohibit cross-class mixing. Preserve ordinary diffuse behavior.

The existing rgba8 guide alpha holds class 0 / approximately 0.5 / 1; no ABI size,
texture count, filter pass count, rays or sample changes. Reconstruction stays
on the GPU behind `renderer.denoise.guidedSpatial.enabled`, default false from
the host's remote evaluator. The local fixture is an explicit test override.
Rollback disables that flag. Three.js cannot be a fallback.

This is presentation reconstruction, not convergence or complete velvet BSDF
support. Total radiance is not split into lobes; dark channels use a 0.1 divisor
floor, so the approximation can soften lighting/normal details and introduce
bias. The existing transport has no dedicated energy-compensated Charlie layer;
revalidate eligibility when independent sheen roughness affects a real lobe.
Full material conformance and texture minification are separate work. Never
claim this changes physical transport, recovers missing detail or matches the
other renderer's lighting. Preserve raw HDR for inspection and qualification.

See [design, frozen tests and scope](../design/rough-cloth-denoise.md).
