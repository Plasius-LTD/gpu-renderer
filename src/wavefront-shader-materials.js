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
  let uv0 = triangle.uv0uv1.xy;
  let uv1 = triangle.uv0uv1.zw;
  let uv2 = triangle.uv2Pad.xy;
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
  let tangent = safe_normalize(
    inverse * (edge1 * deltaUv2.y - edge2 * deltaUv1.y),
    vec3<f32>(1.0, 0.0, 0.0)
  );
  let bitangent = safe_normalize(
    inverse * (-edge1 * deltaUv2.x + edge2 * deltaUv1.x),
    vec3<f32>(0.0, 0.0, 1.0)
  );
  return TangentBasis(tangent, bitangent);
}

fn sample_surface_material(
  triangle: TriangleRecord,
  uv: vec2<f32>,
  geometricNormal: vec3<f32>,
  shadingNormal: vec3<f32>
) -> SurfaceMaterialSample {
  let baseColorTexel = sample_atlas(baseColorAtlasTexture, triangle.baseColorAtlas, uv);
  let baseColor = vec4<f32>(
    clamp(triangle.color.rgb * srgb_to_linear_vec3(baseColorTexel.rgb), vec3<f32>(0.0), vec3<f32>(1.0)),
    clamp(triangle.color.a * baseColorTexel.a, 0.0, 1.0)
  );
  let metallicRoughnessTexel = sample_atlas(
    metallicRoughnessAtlasTexture,
    triangle.metallicRoughnessAtlas,
    uv
  );
  let normalTexel = sample_atlas(normalAtlasTexture, triangle.normalAtlas, uv);
  let occlusionTexel = sample_atlas(occlusionAtlasTexture, triangle.occlusionAtlas, uv);
  let emissiveTexel = sample_atlas(emissiveAtlasTexture, triangle.emissiveAtlas, uv);
  let normalScale = clamp(triangle.textureSettings.x, 0.0, 1.0);
  let tangentBasis = build_triangle_tangent_basis(triangle, geometricNormal);
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
      shadingNormal * tangentNormal.z,
    shadingNormal
  );
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
    triangle.materialResponse,
    triangle.materialExtension,
    triangle.specularColor,
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

fn deferred_path_resolve_enabled() -> bool {
  return config.pathResolveSettings.x > 0.5;
}

fn path_vertex_count_per_ray() -> u32 {
  return config.maxDepth + 1u;
}

fn path_vertex_index(rayId: u32, depth: u32) -> u32 {
  return rayId * path_vertex_count_per_ray() + min(depth, config.maxDepth);
}

fn clear_deferred_path(rayId: u32) {
  if (!deferred_path_resolve_enabled()) {
    return;
  }

  for (var depth = 0u; depth <= config.maxDepth; depth = depth + 1u) {
    pathVertices[path_vertex_index(rayId, depth)] = vec4<f32>(0.0);
    if (depth == config.maxDepth) {
      break;
    }
  }
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

fn record_deferred_path_throughput(ray: RayRecord, throughput: vec3<f32>) {
  if (!deferred_path_resolve_enabled() || ray.rayId >= config.tilePixelCount || ray.bounce >= config.maxDepth) {
    return;
  }
  pathVertices[path_vertex_index(ray.rayId, ray.bounce)] =
    vec4<f32>(sanitize_path_throughput(throughput), 1.0);
}

fn record_deferred_terminal_source(ray: RayRecord, sourceRadiance: vec3<f32>, sourceKind: u32) {
  if (!deferred_path_resolve_enabled() || ray.rayId >= config.tilePixelCount) {
    return;
  }
  pathVertices[path_vertex_index(ray.rayId, config.maxDepth)] =
    vec4<f32>(sanitize_linear_radiance(sourceRadiance), f32(sourceKind));
}
`;
