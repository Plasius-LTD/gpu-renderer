# ADR 0053: Preserve cloth texture and layered response

Status: experimental implementation, qualification pending. Task #224, Story
site#2268, Feature site#2114; coordinated with gpu-shared#135.

Do not bake UV transforms into unchanged-size images. Preserve decoded texels;
select UV0/UV1, apply the per-slot affine transform, then wrap and address the
atlas. Normal tangents use transformed, unwrapped coordinates. Per-material
RGBA32F metadata uses binding 45 (22 sampled bindings in the complete layout):
one header plus three texels per existing slot (52 texels, 832 bytes/material).
It also supplies extension rectangles to both CPU and GPU geometry paths.
Queues, triangle/hit sizes and dispatch counts do not grow. Admission rejects
invalid transforms or metadata exceeding the device texture dimension limit.
Report metadata allocation separately; do not claim exact VRAM residency.

The default-off remote snapshot flag `renderer.materials.sheen.enabled` enables
a layered Charlie NDF. Preserve flattened/nested sheen roughness; multiply its
texture alpha, and decode sheen-colour RGB from sRGB. Do not couple it to coat
roughness. HitRecord.specularColor.w carries independent sheen roughness.
The existing full-support cosine/GGX/coat proposal evaluates the same total
BSDF and PDF for direct and bounced paths; no extra rays or bounce are added.

Use numerically integrated Smith masking for the Charlie distribution instead
of the fitted Charlie lambda approximation (which failed low-roughness energy
checks). Integrate projected microfacet area and matching directional albedo
once into unused alpha/blue lanes of the existing 128-square RGBA16F BRDF LUT.
The upload is cached, keyed by flag state; existing GGX channels remain unchanged.
Base attenuation uses both view and light directional albedo, with clearcoat
above sheen. Numerical alpha floor 0.001 bounds a singular zero-width fibre
distribution. This is an experimental numerical approximation, not a claim of
full glTF conformance. No per-frame CPU integration or extra lookup texture.

Supersede ADR0052's geometric-only cloth normal guide and compulsory 25%
smoothing floor. Preserve mapped normals, retain colour demodulation and all
material/depth/normal boundary gates. High-SPP blending is strength/sqrt(count),
with configurable strength (default 2) and minimumBlend (default 0), validated
before allocations. Sharp active sheen stays protected. Raw HDR is untouched;
guide memory/pass counts are unchanged. Three.js remains prohibited, including
rollback. Disable sheen or guided reconstruction independently; texture-format
rollback requires a coordinated native consumer release.

Specification references:
[KHR_texture_transform](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_texture_transform),
[KHR_materials_sheen](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_sheen).
See the [design and acceptance programme](../design/cloth-material-fidelity.md).
Mipmap/ray-footprint filtering and authored tangents remain separate work.
