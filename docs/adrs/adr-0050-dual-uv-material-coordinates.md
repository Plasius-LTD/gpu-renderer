# ADR0050: Preserve authored dual-UV material coordinates

Status: accepted for implementation; physical qualification recorded separately.
Tracking: site#2256 / renderer#220 / shared#133 / lighting#103; Feature site#2114.

Previously every material texture sampled TEXCOORD_0. Preserve `uvs1` and each
texture selector, use hit barycentrics to interpolate UV1, and use the selected
normal UVs to construct the tangent frame. Reject unsupported UV sets and absent
or invalid referenced UV1. Preserve normalized extension texture selectors across
repeated normalization and shared-loader flattened material fields.

Semantic ABI: MeshVertex remains 48 bytes, UV XY is UV0 and ZW is UV1 (not the
previous redundant UV-present flag). TriangleRecord remains 576 bytes; vN.w is
UV1.u and nN.w is UV1.v at vertex N. XYZ stays geometric. textureSettings.w stores
an exactly representable 17-bit mask: baseColor, metallicRoughness, normal,
occlusion, emissive, clearcoat, clearcoatRoughness, clearcoatNormal, transmission,
thickness, sheenColor, sheenRoughness, specular, specularColor, iridescence,
iridescenceThickness, anisotropy. Zero selects UV0. CPU-upload and GPU preparation
must agree. No buffer-size growth or additional production dispatches; CPU source
arrays retain the extra authored UVs. Do not mix old/new geometry packers/shaders.

Task220 intentionally changes the canonical assembled shader hash from
`c0a78da83cb60ed59a1bc56ead48d7e258c01ce402836d464c5b713b24c38fcb` to
`96888b7e397ec7218d66651474bfff14925e39d2f5131c66d7a283428a601c3f`.
This is a material input correction shared by fixed/adaptive paths, not an
adaptive transport change. Existing BSDF/MIS, sample accounting and denoising
are unchanged. Preserve regression checks and recapture physical evidence.

Tests: strided/normalized loader inputs, selector precedence, missing/invalid
sets, each slot, CPU packing, canonical assembled WGSL and physical UV/tangent
sampling with CPU/GPU preparation parity. The room fixture retains the analytic
probe, native captures, hashes, camera and material selectors. Small probes are
not performance evidence. Broader extension-lobe and texture-transform filtering
fidelity are not newly qualified by UV support.

Rollout inherits renderer.sampling.adaptivePerPixel.enabled and
gpu-demo.scene-fidelity.enabled. Existing GPU-native release rollback only;
never discard UV1 silently or introduce Three.js. Reference assets/captures remain
private until approved. No local publishing or main/CD change.
