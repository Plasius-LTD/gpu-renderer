import { WAVEFRONT_DEFERRED_PATH_ENABLED_WGSL } from "./wavefront-primary-shared-shader.js";
import { SHEEN_WGSL } from "./wavefront-sheen.js";
export const WAVEFRONT_SHADER_MATERIALS_WGSL = `
${SHEEN_WGSL}
fn srgb_to_linear_channel(value: f32) -> f32 {
  if (value <= 0.04045) {
    return value / 12.92;
  }
  return pow((value + 0.055) / 1.055, 2.4);
}

fn srgb_to_linear_vec3(value: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(
    srgb_to_linear_channel(value.x),
    srgb_to_linear_channel(value.y),
    srgb_to_linear_channel(value.z)
  );
}

fn wrap_uv(uv: vec2<f32>) -> vec2<f32> {
  return fract(fract(uv) + vec2<f32>(1.0));
}

fn atlas_sample_uv(rect: vec4<f32>, uv: vec2<f32>) -> vec2<f32> {
  let local = wrap_uv(uv);
  let clamped = clamp(local, vec2<f32>(0.001), vec2<f32>(0.999));
  return rect.xy + clamped * rect.zw;
}

fn sample_atlas(textureRef: texture_2d<f32>, rect: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
  return textureSampleLevel(textureRef, materialAtlasSampler, atlas_sample_uv(rect, uv), 0.0);
}

fn texture_affine_uv(uv: vec2<f32>, materialSlot: u32, slot: u32) -> vec2<f32> {
  let row = i32(materialSlot);
  let a = textureLoad(materialTextureMetadata, vec2<i32>(i32(1u + slot * 3u), row), 0);
  let b = textureLoad(materialTextureMetadata, vec2<i32>(i32(2u + slot * 3u), row), 0);
  return vec2<f32>(dot(a.xy, uv) + a.z, dot(b.xy, uv) + b.z);
}

fn texture_wrap(value: f32, mode: f32) -> f32 {
  if (mode == 1.0) { return clamp(value, 0.0, 1.0); }
  if (mode == 2.0) { return 1.0 - abs(fract(value * 0.5) * 2.0 - 1.0); }
  return fract(value);
}

fn sample_material_atlas(textureRef: texture_2d<f32>, oldRect: vec4<f32>,
  uv: vec2<f32>, materialSlot: u32, slot: u32, transformMask: u32) -> vec4<f32> {
  var rect = oldRect;
  // GPU-built triangles have no extension rectangles; both geometry paths use
  // this same per-material record instead of duplicating extension state.
  if (slot >= 5u) {
    rect = textureLoad(materialTextureMetadata, vec2<i32>(i32(3u + slot * 3u), i32(materialSlot)), 0);
  }
  if ((transformMask & (1u << slot)) == 0u) { return sample_atlas(textureRef, rect, uv); }
  let a = textureLoad(materialTextureMetadata, vec2<i32>(i32(1u + slot * 3u), i32(materialSlot)), 0);
  let b = textureLoad(materialTextureMetadata, vec2<i32>(i32(2u + slot * 3u), i32(materialSlot)), 0);
  let transformed = vec2<f32>(dot(a.xy, uv) + a.z, dot(b.xy, uv) + b.z);
  let wrapped = vec2<f32>(texture_wrap(transformed.x, a.w), texture_wrap(transformed.y, b.w));
  return textureSampleLevel(textureRef, materialAtlasSampler, rect.xy + wrapped * rect.zw, 0.0);
}

fn build_triangle_tangent_basis(
  triangle: TriangleRecord,
  fallbackNormal: vec3<f32>
) -> TangentBasis {
  let edge1 = triangle.v1.xyz - triangle.v0.xyz;
  let edge2 = triangle.v2.xyz - triangle.v0.xyz;
  let secondary = (u32(triangle.textureSettings.w) & 4u) != 0u;
  var uv0 = select(triangle.uv0uv1.xy, vec2<f32>(triangle.v0.w, triangle.n0.w), secondary);
  var uv1 = select(triangle.uv0uv1.zw, vec2<f32>(triangle.v1.w, triangle.n1.w), secondary);
  var uv2 = select(triangle.uv2Pad.xy, vec2<f32>(triangle.v2.w, triangle.n2.w), secondary);
  let transformMask = u32(textureLoad(materialTextureMetadata, vec2<i32>(0, i32(triangle.materialSlot)), 0).x);
  if ((transformMask & 4u) != 0u) {
    // Unwrapped coordinates: wrapping before derivatives destroys seam tangents.
    uv0 = texture_affine_uv(uv0, triangle.materialSlot, 2u);
    uv1 = texture_affine_uv(uv1, triangle.materialSlot, 2u);
    uv2 = texture_affine_uv(uv2, triangle.materialSlot, 2u);
  }
  let deltaUv1 = uv1 - uv0;
  let deltaUv2 = uv2 - uv0;
  let determinant = deltaUv1.x * deltaUv2.y - deltaUv1.y * deltaUv2.x;
  if (abs(determinant) <= 0.000001) {
    let tangentFallback = select(vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(1.0, 0.0, 0.0), abs(fallbackNormal.y) >= 0.999);
    let tangent = safe_normalize(cross(tangentFallback, fallbackNormal), vec3<f32>(1.0, 0.0, 0.0));
    let bitangent = safe_normalize(cross(fallbackNormal, tangent), vec3<f32>(0.0, 0.0, 1.0));
    return TangentBasis(tangent, bitangent);
  }
  let inverse = 1.0 / determinant;
  let rawTangent = inverse * (edge1 * deltaUv2.y - edge2 * deltaUv1.y);
  let rawBitangent = inverse * (-edge1 * deltaUv2.x + edge2 * deltaUv1.x);
  let axis = select(vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(1.0, 0.0, 0.0), abs(fallbackNormal.y) >= 0.999);
  let fallback = safe_normalize(cross(axis, fallbackNormal), vec3<f32>(1.0, 0.0, 0.0));
  let tangent = safe_normalize(rawTangent - fallbackNormal * dot(rawTangent, fallbackNormal), fallback);
  let handedness = select(-1.0, 1.0, dot(cross(tangent, rawBitangent), fallbackNormal) >= 0.0);
  let bitangent = handedness * safe_normalize(cross(fallbackNormal, tangent), vec3<f32>(0.0, 0.0, 1.0));
  return TangentBasis(tangent, bitangent);
}

fn material_uv(primary: vec2<f32>, secondary: vec2<f32>, mask: u32, slot: u32) -> vec2<f32> {
  return select(primary, secondary, (mask & (1u << slot)) != 0u);
}

fn sample_surface_material(
  triangle: TriangleRecord,
  uv: vec2<f32>,
  barycentric: vec3<f32>,
  geometricNormal: vec3<f32>,
  shadingNormal: vec3<f32>
) -> SurfaceMaterialSample {
  let secondaryUv = vec2<f32>(triangle.v0.w, triangle.n0.w) * barycentric.x +
    vec2<f32>(triangle.v1.w, triangle.n1.w) * barycentric.y +
    vec2<f32>(triangle.v2.w, triangle.n2.w) * barycentric.z;
  let uvMask = u32(triangle.textureSettings.w);
  let textureMetadata = textureLoad(materialTextureMetadata, vec2<i32>(0, i32(triangle.materialSlot)), 0);
  let transformMask = u32(textureMetadata.x);
  let baseColorTexel = sample_material_atlas(baseColorAtlasTexture, triangle.baseColorAtlas, material_uv(uv, secondaryUv, uvMask, 0u), triangle.materialSlot, 0u, transformMask);
  let baseColor = vec4<f32>(
    clamp(triangle.color.rgb * srgb_to_linear_vec3(baseColorTexel.rgb), vec3<f32>(0.0), vec3<f32>(1.0)),
    clamp(triangle.color.a * baseColorTexel.a, 0.0, 1.0)
  );
  let metallicRoughnessTexel = sample_material_atlas(
    metallicRoughnessAtlasTexture,
    triangle.metallicRoughnessAtlas,
    material_uv(uv, secondaryUv, uvMask, 1u), triangle.materialSlot, 1u, transformMask);
  let normalTexel = sample_material_atlas(normalAtlasTexture, triangle.normalAtlas, material_uv(uv, secondaryUv, uvMask, 2u), triangle.materialSlot, 2u, transformMask);
  let occlusionTexel = sample_material_atlas(occlusionAtlasTexture, triangle.occlusionAtlas, material_uv(uv, secondaryUv, uvMask, 3u), triangle.materialSlot, 3u, transformMask);
  let emissiveTexel = sample_material_atlas(emissiveAtlasTexture, triangle.emissiveAtlas, material_uv(uv, secondaryUv, uvMask, 4u), triangle.materialSlot, 4u, transformMask);
  let clearcoatTexel = sample_material_atlas(clearcoatAtlasTexture, triangle.clearcoatAtlas, material_uv(uv, secondaryUv, uvMask, 5u), triangle.materialSlot, 5u, transformMask);
  let clearcoatRoughnessTexel = sample_material_atlas(
    clearcoatRoughnessAtlasTexture,
    triangle.clearcoatRoughnessAtlas,
    material_uv(uv, secondaryUv, uvMask, 6u), triangle.materialSlot, 6u, transformMask);
  let clearcoatNormalTexel = sample_material_atlas(
    clearcoatNormalAtlasTexture,
    triangle.clearcoatNormalAtlas,
    material_uv(uv, secondaryUv, uvMask, 7u), triangle.materialSlot, 7u, transformMask);
  let transmissionTexel = sample_material_atlas(transmissionAtlasTexture, triangle.transmissionAtlas, material_uv(uv, secondaryUv, uvMask, 8u), triangle.materialSlot, 8u, transformMask);
  let thicknessTexel = sample_material_atlas(thicknessAtlasTexture, triangle.thicknessAtlas, material_uv(uv, secondaryUv, uvMask, 9u), triangle.materialSlot, 9u, transformMask);
  let sheenColorTexel = sample_material_atlas(sheenColorAtlasTexture, triangle.sheenColorAtlas, material_uv(uv, secondaryUv, uvMask, 10u), triangle.materialSlot, 10u, transformMask);
  let sheenRoughnessTexel = sample_material_atlas(
    sheenRoughnessAtlasTexture,
    triangle.sheenRoughnessAtlas,
    material_uv(uv, secondaryUv, uvMask, 11u), triangle.materialSlot, 11u, transformMask);
  let specularTexel = sample_material_atlas(specularAtlasTexture, triangle.specularAtlas, material_uv(uv, secondaryUv, uvMask, 12u), triangle.materialSlot, 12u, transformMask);
  let specularColorTexel = sample_material_atlas(
    specularColorAtlasTexture,
    triangle.specularColorAtlas,
    material_uv(uv, secondaryUv, uvMask, 13u), triangle.materialSlot, 13u, transformMask);
  let iridescenceTexel = sample_material_atlas(iridescenceAtlasTexture, triangle.iridescenceAtlas, material_uv(uv, secondaryUv, uvMask, 14u), triangle.materialSlot, 14u, transformMask);
  let iridescenceThicknessTexel = sample_material_atlas(
    iridescenceThicknessAtlasTexture,
    triangle.iridescenceThicknessAtlas,
    material_uv(uv, secondaryUv, uvMask, 15u), triangle.materialSlot, 15u, transformMask);
  let anisotropyTexel = sample_material_atlas(anisotropyAtlasTexture, triangle.anisotropyAtlas, material_uv(uv, secondaryUv, uvMask, 16u), triangle.materialSlot, 16u, transformMask);
  let normalScale = clamp(triangle.textureSettings.x, 0.0, 1.0);
  let windingNormal = cross(triangle.v1.xyz - triangle.v0.xyz, triangle.v2.xyz - triangle.v0.xyz);
  let side = select(-1.0, 1.0, dot(windingNormal, geometricNormal) >= 0.0);
  let authoredNormal = shadingNormal * side;
  let tangentBasis = build_triangle_tangent_basis(triangle, authoredNormal);
  let tangentNormal = safe_normalize(
    vec3<f32>(
      (normalTexel.x * 2.0 - 1.0) * normalScale,
      (normalTexel.y * 2.0 - 1.0) * normalScale,
      1.0 + ((normalTexel.z * 2.0 - 1.0) - 1.0) * normalScale
    ),
    vec3<f32>(0.0, 0.0, 1.0)
  );
  let mappedNormal = safe_normalize(
    tangentBasis.tangent * tangentNormal.x +
      tangentBasis.bitangent * tangentNormal.y +
      authoredNormal * tangentNormal.z,
    authoredNormal
  ) * side;
  let emission = vec4<f32>(
    max(
      triangle.emission.rgb *
        srgb_to_linear_vec3(emissiveTexel.rgb) *
        max(triangle.textureSettings.z, 0.0),
      vec3<f32>(0.0)
    ),
    clamp(triangle.emission.a * emissiveTexel.a, 0.0, 1.0)
  );
  return SurfaceMaterialSample(
    baseColor,
    emission,
    vec4<f32>(
      clamp(triangle.material.x * metallicRoughnessTexel.y, 0.0, 1.0),
      clamp(triangle.material.y * metallicRoughnessTexel.z, 0.0, 1.0),
      clamp(triangle.material.z * baseColor.a, 0.0, 1.0),
      clamp(triangle.material.w, 1.0, 3.0)
    ),
    vec4<f32>(
      triangle.materialResponse.rgb * select(sheenColorTexel.rgb, srgb_to_linear_vec3(sheenColorTexel.rgb), sheen_enabled()),
      triangle.materialResponse.w * clearcoatTexel.r * clearcoatNormalTexel.r
    ),
    vec4<f32>(
      triangle.materialExtension.x * clearcoatRoughnessTexel.r * select(0.5 + 0.5 * sheenRoughnessTexel.r, 1.0, sheen_enabled()),
      triangle.materialExtension.y * specularTexel.r * (0.5 + 0.5 * iridescenceTexel.r),
      triangle.materialExtension.z * transmissionTexel.r,
      triangle.materialExtension.w * thicknessTexel.r * (0.5 + 0.5 * iridescenceThicknessTexel.r)
    ),
    vec4<f32>(
      triangle.specularColor.rgb * specularColorTexel.rgb * (0.5 + 0.5 * anisotropyTexel.r),
      textureMetadata.y * sheenRoughnessTexel.a
    ),
    repair_shading_normal(geometricNormal, mappedNormal),
    clamp(
      mix(1.0, occlusionTexel.x, clamp(triangle.textureSettings.y, 0.0, 1.0)),
      0.0,
      1.0
    )
  );
}

fn saturate(value: f32) -> f32 {
  return clamp(value, 0.0, 1.0);
}

fn max_component(value: vec3<f32>) -> f32 {
  return max(max(value.x, value.y), value.z);
}

fn radiance_luminance(value: vec3<f32>) -> f32 {
  return dot(value, vec3<f32>(0.2126, 0.7152, 0.0722));
}

fn environment_map_enabled() -> bool {
  return config.environmentMapSettings.x > 0.5;
}

${WAVEFRONT_DEFERRED_PATH_ENABLED_WGSL}

fn strict_physical_low_spp_lighting_enabled() -> bool {
  return config.pathResolveSettings.z > 0.5;
}

fn sanitize_path_throughput_component(value: f32) -> f32 {
  if (value != value || value <= 0.0) {
    return 0.0;
  }
  return min(value, 65504.0);
}

fn sanitize_path_throughput(value: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(
    sanitize_path_throughput_component(value.x),
    sanitize_path_throughput_component(value.y),
    sanitize_path_throughput_component(value.z)
  );
}

fn record_deferred_terminal_source(ray: RayRecord, sourceRadiance: vec3<f32>, sourceKind: u32) {
  // Preserve the existing deferred source/terminal clamp before fixed weighting.
  // Changing the HDR storage/presentation policy is a separate qualification.
  if (!path_radiance_valid(sourceRadiance)) { fail_path_node(ray); return; }
  let rawTerminal = ray.throughput.xyz * sanitize_linear_radiance(sourceRadiance);
  if (!path_radiance_valid(rawTerminal)) { fail_path_node(ray); return; }
  record_weighted_terminal(ray, sanitize_linear_radiance(rawTerminal) * sample_weight(), sourceKind);
}

fn record_weighted_terminal(ray: RayRecord, rawRadiance: vec3<f32>, sourceKind: u32) {
  record_radiance_diagnostics(rawRadiance);
  if (!path_radiance_valid(rawRadiance)) { fail_path_node(ray); return; }
  let radiance = sanitize_linear_radiance(rawRadiance);
  record_path_terminal(ray, radiance, sourceKind);
  record_termination_metrics(sourceKind, radiance);
  if (deferred_path_resolve_enabled()) {
    record_transport_contribution(TRANSPORT_BUCKET_STOCHASTIC_RESIDUAL, radiance);
  }
}
`;
