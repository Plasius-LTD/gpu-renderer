import { WAVEFRONT_DEFERRED_PATH_ENABLED_WGSL } from "./wavefront-primary-shared-shader.js";
export const WAVEFRONT_SHADER_MATERIALS_WGSL = `
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

fn build_triangle_tangent_basis(
  triangle: TriangleRecord,
  fallbackNormal: vec3<f32>
) -> TangentBasis {
  let edge1 = triangle.v1.xyz - triangle.v0.xyz;
  let edge2 = triangle.v2.xyz - triangle.v0.xyz;
  let secondary = (u32(triangle.textureSettings.w) & 4u) != 0u;
  let uv0 = select(triangle.uv0uv1.xy, vec2<f32>(triangle.v0.w, triangle.n0.w), secondary);
  let uv1 = select(triangle.uv0uv1.zw, vec2<f32>(triangle.v1.w, triangle.n1.w), secondary);
  let uv2 = select(triangle.uv2Pad.xy, vec2<f32>(triangle.v2.w, triangle.n2.w), secondary);
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
  let baseColorTexel = sample_atlas(baseColorAtlasTexture, triangle.baseColorAtlas, material_uv(uv, secondaryUv, uvMask, 0u));
  let baseColor = vec4<f32>(
    clamp(triangle.color.rgb * srgb_to_linear_vec3(baseColorTexel.rgb), vec3<f32>(0.0), vec3<f32>(1.0)),
    clamp(triangle.color.a * baseColorTexel.a, 0.0, 1.0)
  );
  let metallicRoughnessTexel = sample_atlas(
    metallicRoughnessAtlasTexture,
    triangle.metallicRoughnessAtlas,
    material_uv(uv, secondaryUv, uvMask, 1u)
  );
  let normalTexel = sample_atlas(normalAtlasTexture, triangle.normalAtlas, material_uv(uv, secondaryUv, uvMask, 2u));
  let occlusionTexel = sample_atlas(occlusionAtlasTexture, triangle.occlusionAtlas, material_uv(uv, secondaryUv, uvMask, 3u));
  let emissiveTexel = sample_atlas(emissiveAtlasTexture, triangle.emissiveAtlas, material_uv(uv, secondaryUv, uvMask, 4u));
  let clearcoatTexel = sample_atlas(clearcoatAtlasTexture, triangle.clearcoatAtlas, material_uv(uv, secondaryUv, uvMask, 5u));
  let clearcoatRoughnessTexel = sample_atlas(
    clearcoatRoughnessAtlasTexture,
    triangle.clearcoatRoughnessAtlas,
    material_uv(uv, secondaryUv, uvMask, 6u)
  );
  let clearcoatNormalTexel = sample_atlas(
    clearcoatNormalAtlasTexture,
    triangle.clearcoatNormalAtlas,
    material_uv(uv, secondaryUv, uvMask, 7u)
  );
  let transmissionTexel = sample_atlas(transmissionAtlasTexture, triangle.transmissionAtlas, material_uv(uv, secondaryUv, uvMask, 8u));
  let thicknessTexel = sample_atlas(thicknessAtlasTexture, triangle.thicknessAtlas, material_uv(uv, secondaryUv, uvMask, 9u));
  let sheenColorTexel = sample_atlas(sheenColorAtlasTexture, triangle.sheenColorAtlas, material_uv(uv, secondaryUv, uvMask, 10u));
  let sheenRoughnessTexel = sample_atlas(
    sheenRoughnessAtlasTexture,
    triangle.sheenRoughnessAtlas,
    material_uv(uv, secondaryUv, uvMask, 11u)
  );
  let specularTexel = sample_atlas(specularAtlasTexture, triangle.specularAtlas, material_uv(uv, secondaryUv, uvMask, 12u));
  let specularColorTexel = sample_atlas(
    specularColorAtlasTexture,
    triangle.specularColorAtlas,
    material_uv(uv, secondaryUv, uvMask, 13u)
  );
  let iridescenceTexel = sample_atlas(iridescenceAtlasTexture, triangle.iridescenceAtlas, material_uv(uv, secondaryUv, uvMask, 14u));
  let iridescenceThicknessTexel = sample_atlas(
    iridescenceThicknessAtlasTexture,
    triangle.iridescenceThicknessAtlas,
    material_uv(uv, secondaryUv, uvMask, 15u)
  );
  let anisotropyTexel = sample_atlas(anisotropyAtlasTexture, triangle.anisotropyAtlas, material_uv(uv, secondaryUv, uvMask, 16u));
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
      triangle.materialResponse.rgb * sheenColorTexel.rgb,
      triangle.materialResponse.w * clearcoatTexel.r * clearcoatNormalTexel.r
    ),
    vec4<f32>(
      triangle.materialExtension.x * clearcoatRoughnessTexel.r * (0.5 + 0.5 * sheenRoughnessTexel.r),
      triangle.materialExtension.y * specularTexel.r * (0.5 + 0.5 * iridescenceTexel.r),
      triangle.materialExtension.z * transmissionTexel.r,
      triangle.materialExtension.w * thicknessTexel.r * (0.5 + 0.5 * iridescenceThicknessTexel.r)
    ),
    vec4<f32>(
      triangle.specularColor.rgb * specularColorTexel.rgb * (0.5 + 0.5 * anisotropyTexel.r),
      triangle.specularColor.a
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
