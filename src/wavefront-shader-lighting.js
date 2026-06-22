export const WAVEFRONT_SHADER_LIGHTING_WGSL = `
fn environment_map_uv(direction: vec3<f32>) -> vec2<f32> {
  let rayDirection = safe_normalize(direction, vec3<f32>(0.0, 1.0, 0.0));
  let rotationTurns = config.environmentMapSettings.z / 6.28318530718;
  let u = fract(atan2(rayDirection.z, rayDirection.x) / 6.28318530718 + 0.5 + rotationTurns);
  let v = acos(clamp(rayDirection.y, -1.0, 1.0)) / 3.14159265359;
  return vec2<f32>(u, clamp(v, 0.0, 1.0));
}

fn environment_map_radiance(direction: vec3<f32>) -> vec3<f32> {
  let uv = environment_map_uv(direction);
  let texel = max(textureSampleLevel(environmentMapTexture, environmentMapSampler, uv, 0.0).rgb, vec3<f32>(0.0));
  return texel * max(config.environmentMapSettings.y, 0.0);
}

fn procedural_environment_radiance(direction: vec3<f32>) -> vec3<f32> {
  let rayDirection = safe_normalize(direction, vec3<f32>(0.0, 1.0, 0.0));
  let upFactor = saturate(rayDirection.y * 0.5 + 0.5);
  let sunDirection = safe_normalize(
    config.environmentSunDirectionIntensity.xyz,
    vec3<f32>(0.0, 1.0, 0.0)
  );
  let sunGlow = pow(saturate(dot(rayDirection, sunDirection)), 192.0);
  let gradient =
    config.environmentHorizonColor.xyz * (1.0 - upFactor) +
    config.environmentZenithColor.xyz * upFactor;
  return (
    gradient +
    config.environmentSunColor.xyz * sunGlow
  ) * max(config.environmentSunDirectionIntensity.w, 0.0001);
}

fn base_environment_radiance(direction: vec3<f32>) -> vec3<f32> {
  if (environment_map_enabled()) {
    return environment_map_radiance(direction);
  }
  return procedural_environment_radiance(direction);
}

fn environment_portal_radiance_scale(origin: vec3<f32>, direction: vec3<f32>) -> vec3<f32> {
  if (config.environmentPortalCount == 0u || config.environmentPortalMode == 0u) {
    return vec3<f32>(1.0);
  }
  var scale = vec3<f32>(0.0);
  for (var portalIndex = 0u; portalIndex < config.environmentPortalCount; portalIndex = portalIndex + 1u) {
    let portal = environmentPortals[portalIndex];
    if (portal.kind == 1u) {
      let portalNormal = safe_normalize(portal.normal.xyz, vec3<f32>(0.0, 0.0, 1.0));
      let denominator = dot(direction, portalNormal);
      let twoSided = (portal.flags & 1u) != 0u;
      var facing = abs(denominator) > 0.0001;
      if (!twoSided && denominator <= 0.0001) {
        facing = false;
      }
      if (facing) {
        let distance = dot(portal.position.xyz - origin, portalNormal) / denominator;
        if (distance > 0.001) {
          let hitPosition = origin + direction * distance;
          let local = hitPosition - portal.position.xyz;
          let tangent = safe_normalize(portal.tangent.xyz, vec3<f32>(1.0, 0.0, 0.0));
          let bitangent = safe_normalize(portal.bitangent.xyz, vec3<f32>(0.0, 1.0, 0.0));
          let u = dot(local, tangent);
          let v = dot(local, bitangent);
          if (abs(u) <= portal.tangent.w && abs(v) <= portal.bitangent.w) {
            let areaWeight = clamp(sqrt(max(portal.position.w, 0.0001)), 0.25, 4.0);
            let angleWeight = max(abs(denominator), 0.08);
            let portalScale = portal.color.rgb * portal.normal.w * portal.color.a * areaWeight * angleWeight;
            scale = max(scale, portalScale);
          }
        }
      }
    }
  }
  return scale;
}

fn environment_radiance(origin: vec3<f32>, direction: vec3<f32>) -> vec3<f32> {
  let rayDirection = safe_normalize(direction, vec3<f32>(0.0, 1.0, 0.0));
  let portalScale = environment_portal_radiance_scale(origin, rayDirection);
  let portalHit = max_component(portalScale) > 0.0001;
  return base_environment_radiance(rayDirection) *
    select(vec3<f32>(1.0), portalScale, portalHit);
}

fn direct_environment_radiance(origin: vec3<f32>, direction: vec3<f32>) -> vec3<f32> {
  let rayDirection = safe_normalize(direction, vec3<f32>(0.0, 1.0, 0.0));
  let portalScale = environment_portal_radiance_scale(origin, rayDirection);
  let portalHit = max_component(portalScale) > 0.0001;
  if (
    config.environmentPortalCount > 0u &&
    config.environmentPortalMode == 2u &&
    !portalHit
  ) {
    return vec3<f32>(0.0);
  }
  return base_environment_radiance(rayDirection) *
    select(vec3<f32>(1.0), portalScale, portalHit);
}

fn radical_inverse_vdc(bitsValue: u32) -> f32 {
  var bits = bitsValue;
  bits = (bits << 16u) | (bits >> 16u);
  bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xaaaaaaaau) >> 1u);
  bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xccccccccu) >> 2u);
  bits = ((bits & 0x0f0f0f0fu) << 4u) | ((bits & 0xf0f0f0f0u) >> 4u);
  bits = ((bits & 0x00ff00ffu) << 8u) | ((bits & 0xff00ff00u) >> 8u);
  return f32(bits) * 2.3283064365386963e-10;
}

fn hammersley_2d(index: u32, count: u32) -> vec2<f32> {
  return vec2<f32>(f32(index) / max(f32(count), 1.0), radical_inverse_vdc(index));
}

fn build_basis_tangent(normal: vec3<f32>) -> vec3<f32> {
  let tangentFallback = select(vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(1.0, 0.0, 0.0), abs(normal.y) >= 0.999);
  return safe_normalize(cross(tangentFallback, normal), vec3<f32>(1.0, 0.0, 0.0));
}

fn local_to_world(local: vec3<f32>, normal: vec3<f32>) -> vec3<f32> {
  let tangent = build_basis_tangent(normal);
  let bitangent = safe_normalize(cross(normal, tangent), vec3<f32>(0.0, 0.0, 1.0));
  return safe_normalize(tangent * local.x + bitangent * local.y + normal * local.z, normal);
}

fn cosine_sample_hemisphere(sample: vec2<f32>, normal: vec3<f32>) -> vec3<f32> {
  let phi = 6.28318530718 * sample.x;
  let radius = sqrt(sample.y);
  let x = cos(phi) * radius;
  let y = sin(phi) * radius;
  let z = sqrt(max(0.0, 1.0 - sample.y));
  return local_to_world(vec3<f32>(x, y, z), normal);
}

fn importance_sample_ggx(sample: vec2<f32>, roughness: f32, normal: vec3<f32>) -> vec3<f32> {
  let alpha = max(roughness * roughness, 0.0001);
  let phi = 6.28318530718 * sample.x;
  let cosTheta = sqrt((1.0 - sample.y) / max(1.0 + (alpha * alpha - 1.0) * sample.y, 0.0001));
  let sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));
  let localHalf = vec3<f32>(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);
  return local_to_world(localHalf, normal);
}

fn distribution_ggx(normal: vec3<f32>, halfVector: vec3<f32>, roughness: f32) -> f32 {
  let alpha = max(roughness * roughness, 0.0001);
  let alpha2 = alpha * alpha;
  let nDotH = saturate(dot(normal, halfVector));
  let denominator = nDotH * nDotH * (alpha2 - 1.0) + 1.0;
  return alpha2 / max(3.14159265359 * denominator * denominator, 0.000001);
}

fn geometry_schlick_ggx(nDotValue: f32, roughness: f32) -> f32 {
  let k = ((roughness + 1.0) * (roughness + 1.0)) / 8.0;
  return nDotValue / max(nDotValue * (1.0 - k) + k, 0.000001);
}

fn geometry_smith(normal: vec3<f32>, viewDirection: vec3<f32>, lightDirection: vec3<f32>, roughness: f32) -> f32 {
  let nDotV = saturate(dot(normal, viewDirection));
  let nDotL = saturate(dot(normal, lightDirection));
  return geometry_schlick_ggx(nDotV, roughness) * geometry_schlick_ggx(nDotL, roughness);
}

fn fresnel_schlick(cosine: f32, f0: vec3<f32>) -> vec3<f32> {
  return f0 + (vec3<f32>(1.0) - f0) * pow(1.0 - cosine, 5.0);
}

fn sample_brdf_lut(nDotV: f32, roughness: f32) -> vec2<f32> {
  let uv = vec2<f32>(clamp(nDotV, 0.0, 1.0), clamp(roughness, 0.0, 1.0));
  return textureSampleLevel(brdfLutTexture, brdfLutSampler, uv, 0.0).xy;
}

fn prefiltered_environment_radiance(direction: vec3<f32>, roughness: f32) -> vec3<f32> {
  let uv = environment_map_uv(direction);
  let maxLevel = max(config.environmentMapMeta.z - 1.0, 0.0);
  let lod = clamp(roughness, 0.0, 1.0) * maxLevel;
  let texel = max(textureSampleLevel(environmentMapTexture, environmentMapSampler, uv, lod).rgb, vec3<f32>(0.0));
  return texel * max(config.environmentMapSettings.y, 0.0);
}

fn environment_pdf_dimensions() -> vec2<u32> {
  return vec2<u32>(
    max(u32(config.environmentMapMeta.x), 1u),
    max(u32(config.environmentMapMeta.y), 1u)
  );
}

fn environment_importance_sampling_enabled() -> bool {
  return config.environmentMapMeta.w > 0.5;
}

fn uniform_sphere_pdf() -> f32 {
  return 1.0 / (4.0 * 3.14159265359);
}

fn sample_uniform_sphere_direction(sample: vec2<f32>) -> vec3<f32> {
  let z = 1.0 - 2.0 * sample.y;
  let radial = sqrt(max(1.0 - z * z, 0.0));
  let phi = sample.x * 6.28318530718;
  return vec3<f32>(cos(phi) * radial, z, sin(phi) * radial);
}

fn environment_sampling_texel(x: u32, y: u32) -> vec4<f32> {
  return textureLoad(environmentSamplingTexture, vec2<i32>(i32(x), i32(y)), 0);
}

fn environment_pdf_texel(x: u32, y: u32) -> f32 {
  return environment_sampling_texel(x, y).x;
}

fn environment_row_cdf_texel(y: u32) -> f32 {
  return environment_sampling_texel(0u, y).z;
}

fn environment_column_cdf_texel(x: u32, y: u32) -> f32 {
  return environment_sampling_texel(x, y).y;
}

fn environment_direction_pdf(direction: vec3<f32>) -> f32 {
  if (!environment_importance_sampling_enabled()) {
    return uniform_sphere_pdf();
  }
  let rayDirection = safe_normalize(direction, vec3<f32>(0.0, 1.0, 0.0));
  let uv = environment_map_uv(rayDirection);
  let dimensions = environment_pdf_dimensions();
  let width = max(f32(dimensions.x), 1.0);
  let height = max(f32(dimensions.y), 1.0);
  let x = min(u32(uv.x * width), dimensions.x - 1u);
  let y = min(u32(uv.y * height), dimensions.y - 1u);
  let discretePdf = max(environment_pdf_texel(x, y), 0.0);
  let sinTheta = sqrt(max(1.0 - rayDirection.y * rayDirection.y, 0.0));
  let solidAngle = max((2.0 * 3.14159265359 * 3.14159265359 * sinTheta) / (width * height), 0.000001);
  return discretePdf / solidAngle;
}

fn sample_row_cdf(count: u32, sampleValue: f32) -> u32 {
  if (count == 0u) {
    return 0u;
  }
  var low = 0u;
  var high = count - 1u;
  loop {
    if (low >= high) {
      break;
    }
    let mid = (low + high) / 2u;
    let cdfValue = environment_row_cdf_texel(mid);
    if (sampleValue <= cdfValue) {
      high = mid;
    } else {
      low = mid + 1u;
    }
  }
  return min(low, count - 1u);
}

fn sample_column_cdf(row: u32, count: u32, sampleValue: f32) -> u32 {
  if (count == 0u) {
    return 0u;
  }
  var low = 0u;
  var high = count - 1u;
  loop {
    if (low >= high) {
      break;
    }
    let mid = (low + high) / 2u;
    let cdfValue = environment_column_cdf_texel(mid, row);
    if (sampleValue <= cdfValue) {
      high = mid;
    } else {
      low = mid + 1u;
    }
  }
  return min(low, count - 1u);
}

struct EnvironmentSample {
  direction: vec3<f32>,
  radiance: vec3<f32>,
  pdf: f32,
};

struct DirectLightSample {
  direction: vec4<f32>,
  radiance: vec4<f32>,
  pdf: f32,
  maxDistance: f32,
  flags: u32,
  valid: u32,
};

fn sample_environment_importance(sample: vec2<f32>) -> EnvironmentSample {
  if (!environment_importance_sampling_enabled()) {
    let direction = sample_uniform_sphere_direction(sample);
    return EnvironmentSample(direction, base_environment_radiance(direction), uniform_sphere_pdf());
  }
  let dimensions = environment_pdf_dimensions();
  let row = sample_row_cdf(dimensions.y, sample.y);
  let column = sample_column_cdf(row, dimensions.x, sample.x);
  let uv = vec2<f32>(
    (f32(column) + 0.5) / max(f32(dimensions.x), 1.0),
    (f32(row) + 0.5) / max(f32(dimensions.y), 1.0)
  );
  let theta = uv.y * 3.14159265359;
  let phi = (uv.x - 0.5 - config.environmentMapSettings.z / 6.28318530718) * 6.28318530718;
  let sinTheta = sin(theta);
  let direction = vec3<f32>(cos(phi) * sinTheta, cos(theta), sin(phi) * sinTheta);
  let pdf = environment_direction_pdf(direction);
  return EnvironmentSample(direction, base_environment_radiance(direction), pdf);
}

fn triangle_surface_normal(triangle: TriangleRecord) -> vec3<f32> {
  let edge1 = triangle.v1.xyz - triangle.v0.xyz;
  let edge2 = triangle.v2.xyz - triangle.v0.xyz;
  return safe_normalize(cross(edge1, edge2), vec3<f32>(0.0, 1.0, 0.0));
}

fn triangle_surface_area(triangle: TriangleRecord) -> f32 {
  let edge1 = triangle.v1.xyz - triangle.v0.xyz;
  let edge2 = triangle.v2.xyz - triangle.v0.xyz;
  return max(length(cross(edge1, edge2)) * 0.5, 0.000001);
}

fn solid_angle_pdf_from_area_pdf(
  areaPdf: f32,
  shadingPoint: vec3<f32>,
  lightPoint: vec3<f32>,
  lightNormal: vec3<f32>
) -> f32 {
  let offset = lightPoint - shadingPoint;
  let distanceSquared = max(dot(offset, offset), 0.000001);
  let lightDirection = safe_normalize(offset, lightNormal);
  let geometry = max(dot(lightNormal, -lightDirection), 0.0);
  if (geometry <= 0.000001) {
    return 0.0;
  }
  return areaPdf * distanceSquared / max(geometry, 0.000001);
}

fn power_heuristic(pdfA: f32, pdfB: f32) -> f32 {
  let a2 = pdfA * pdfA;
  let b2 = pdfB * pdfB;
  return a2 / max(a2 + b2, 0.000001);
}

fn visible_environment_radiance(origin: vec3<f32>, direction: vec3<f32>) -> vec3<f32> {
  let rayDirection = safe_normalize(direction, vec3<f32>(0.0, 1.0, 0.0));
  let visible = !scene_visibility_blocked(origin, rayDirection, 1000000.0);
  return select(vec3<f32>(0.0), direct_environment_radiance(origin, rayDirection), visible);
}

fn glossy_environment_direction(
  incidentDirection: vec3<f32>,
  normal: vec3<f32>,
  roughness: f32,
  normalBlendScale: f32
) -> vec3<f32> {
  let reflectionDirection = reflect(incidentDirection, normal);
  let blend = clamp(roughness * roughness * normalBlendScale, 0.0, 0.92);
  return safe_normalize(mix(reflectionDirection, normal, blend), normal);
}

fn surface_glossiness(hit: HitRecord) -> f32 {
  let roughness = clamp(hit.material.x, 0.0, 1.0);
  let metallic = clamp(hit.material.y, 0.0, 1.0);
  let sheen = clamp(max_component(hit.materialResponse.xyz), 0.0, 1.0);
  let clearcoat = clamp(hit.materialResponse.w, 0.0, 1.0);
  let specularWeight = clamp(hit.materialExtension.y, 0.0, 1.0);
  let transmission = clamp(hit.materialExtension.z, 0.0, 1.0);
  let baseGloss =
    max(
      clearcoat,
      max(sheen * 0.72, max(specularWeight * (0.38 + metallic * 0.62), transmission))
    );
  return clamp(baseGloss * (1.0 - roughness * 0.72) + metallic * (1.0 - roughness) * 0.35, 0.0, 1.0);
}

fn surface_specular_f0(hit: HitRecord, surfaceColor: vec3<f32>) -> vec3<f32> {
  let metallic = clamp(hit.material.y, 0.0, 1.0);
  let specularWeight = clamp(hit.materialExtension.y, 0.0, 1.0);
  let specularColor = clamp(hit.specularColor.xyz, vec3<f32>(0.0), vec3<f32>(1.0));
  let dielectricF0 = vec3<f32>(0.04) * specularWeight * specularColor;
  return mix(dielectricF0, surfaceColor, metallic);
}

fn surface_bsdf_sampling_weights(hit: HitRecord) -> vec3<f32> {
  let metallic = clamp(hit.material.y, 0.0, 1.0);
  let clearcoat = clamp(hit.materialResponse.w, 0.0, 1.0);
  let specularWeight = clamp(hit.materialExtension.y, 0.0, 1.0);
  let diffuseWeight = clamp(
    (1.0 - metallic) * max(1.0 - specularWeight * 0.5 - clearcoat * 0.25, 0.15),
    0.0,
    1.0
  );
  let specWeight = clamp(max(metallic, specularWeight * 0.75) * (1.0 - clearcoat * 0.5), 0.0, 1.0);
  let clearcoatWeight = clamp(clearcoat, 0.0, 1.0);
  let totalWeight = max(diffuseWeight + specWeight + clearcoatWeight, 0.000001);
  return vec3<f32>(
    diffuseWeight / totalWeight,
    specWeight / totalWeight,
    clearcoatWeight / totalWeight
  );
}

fn evaluate_surface_bsdf(hit: HitRecord, viewDirection: vec3<f32>, lightDirection: vec3<f32>) -> vec3<f32> {
  let normal = safe_normalize(hit.shadingNormal.xyz, vec3<f32>(0.0, 1.0, 0.0));
  let surfaceColor = clamp(max(hit.color.xyz, config.ambientColor.xyz * 0.35), vec3<f32>(0.0), vec3<f32>(1.0));
  let roughness = clamp(hit.material.x, 0.0, 1.0);
  let metallic = clamp(hit.material.y, 0.0, 1.0);
  let clearcoat = clamp(hit.materialResponse.w, 0.0, 1.0);
  let clearcoatRoughness = clamp(hit.materialExtension.x, 0.0, 1.0);
  let occlusion = clamp(hit.occlusion, 0.0, 1.0);
  let nDotV = saturate(dot(normal, viewDirection));
  let nDotL = saturate(dot(normal, lightDirection));
  if (nDotV <= 0.0 || nDotL <= 0.0) {
    return vec3<f32>(0.0);
  }
  let halfVector = safe_normalize(viewDirection + lightDirection, normal);
  let vDotH = saturate(dot(viewDirection, halfVector));
  let f0 = surface_specular_f0(hit, surfaceColor);
  let fresnel = fresnel_schlick(vDotH, f0);
  let distribution = distribution_ggx(normal, halfVector, roughness);
  let geometry = geometry_smith(normal, viewDirection, lightDirection, roughness);
  let specular = (distribution * geometry * fresnel) / max(4.0 * nDotV * nDotL, 0.000001);
  let diffuseWeight = (1.0 - metallic) * (1.0 - clearcoat * 0.24) * (1.0 - clamp(max_component(fresnel), 0.0, 0.98));
  let diffuse = surfaceColor * diffuseWeight / 3.14159265359;
  let clearcoatHalf = safe_normalize(viewDirection + lightDirection, normal);
  let clearcoatDistribution = distribution_ggx(normal, clearcoatHalf, max(clearcoatRoughness, 0.02));
  let clearcoatGeometry = geometry_smith(normal, viewDirection, lightDirection, max(clearcoatRoughness, 0.02));
  let clearcoatFresnel = fresnel_schlick(saturate(dot(viewDirection, clearcoatHalf)), vec3<f32>(0.04));
  let clearcoatTerm =
    (clearcoatDistribution * clearcoatGeometry * clearcoatFresnel) /
    max(4.0 * nDotV * nDotL, 0.000001) *
    clearcoat;
  return (diffuse + specular + clearcoatTerm) * mix(0.42, 1.0, occlusion);
}

fn diffuse_pdf(normal: vec3<f32>, lightDirection: vec3<f32>) -> f32 {
  return saturate(dot(normal, lightDirection)) / 3.14159265359;
}

fn ggx_pdf(normal: vec3<f32>, viewDirection: vec3<f32>, lightDirection: vec3<f32>, roughness: f32) -> f32 {
  let halfVector = safe_normalize(viewDirection + lightDirection, normal);
  let nDotH = saturate(dot(normal, halfVector));
  let vDotH = saturate(dot(viewDirection, halfVector));
  let distribution = distribution_ggx(normal, halfVector, roughness);
  return (distribution * nDotH) / max(4.0 * vDotH, 0.000001);
}

fn evaluate_surface_bsdf_pdf(hit: HitRecord, viewDirection: vec3<f32>, lightDirection: vec3<f32>) -> f32 {
  let normal = safe_normalize(hit.shadingNormal.xyz, vec3<f32>(0.0, 1.0, 0.0));
  let roughness = clamp(hit.material.x, 0.0, 1.0);
  let weights = surface_bsdf_sampling_weights(hit);
  let diffuseTerm = diffuse_pdf(normal, lightDirection);
  let specTerm = ggx_pdf(normal, viewDirection, lightDirection, max(roughness, 0.02));
  let clearcoatTerm = ggx_pdf(normal, viewDirection, lightDirection, max(clamp(hit.materialExtension.x, 0.0, 1.0), 0.02));
  return weights.x * diffuseTerm + weights.y * specTerm + weights.z * clearcoatTerm;
}

fn gated_environment_radiance(origin: vec3<f32>, direction: vec3<f32>) -> vec3<f32> {
  let portalScale = environment_portal_radiance_scale(origin, safe_normalize(direction, vec3<f32>(0.0, 1.0, 0.0)));
  if (
    config.environmentPortalCount > 0u &&
    config.environmentPortalMode == 2u &&
    max_component(portalScale) <= 0.0001
  ) {
    return config.ambientColor.xyz * 0.65;
  }
  return environment_radiance(origin, direction);
}

fn medium_dimensions() -> vec2<u32> {
  return textureDimensions(mediumTableTexture);
}

fn medium_valid(mediumRefId: u32) -> bool {
  let dimensions = medium_dimensions();
  return mediumRefId > 0u && mediumRefId < dimensions.x;
}

fn medium_absorption(mediumRefId: u32) -> vec3<f32> {
  if (!medium_valid(mediumRefId)) {
    return vec3<f32>(0.0);
  }
  return max(
    textureLoad(mediumTableTexture, vec2<i32>(i32(mediumRefId), 0), 0).xyz,
    vec3<f32>(0.0)
  );
}

fn medium_scattering(mediumRefId: u32) -> vec3<f32> {
  if (!medium_valid(mediumRefId)) {
    return vec3<f32>(0.0);
  }
  return max(
    textureLoad(mediumTableTexture, vec2<i32>(i32(mediumRefId), 1), 0).xyz,
    vec3<f32>(0.0)
  );
}

fn medium_transmittance(mediumRefId: u32, distance: f32) -> vec3<f32> {
  if (!medium_valid(mediumRefId) || distance <= 0.000001) {
    return vec3<f32>(1.0);
  }
  let extinction = medium_absorption(mediumRefId) + medium_scattering(mediumRefId);
  return vec3<f32>(
    exp(-extinction.x * distance),
    exp(-extinction.y * distance),
    exp(-extinction.z * distance)
  );
}

fn transmitted_medium_ref_id(ray: RayRecord, hit: HitRecord) -> u32 {
  if (hit.mediumRefId == 0u) {
    return ray.mediumRefId;
  }
  if (hit.frontFace == 1u) {
    return hit.mediumRefId;
  }
  if (ray.mediumRefId == hit.mediumRefId) {
    return 0u;
  }
  return ray.mediumRefId;
}

fn surface_delta_reflection_throughput(hit: HitRecord, viewDirection: vec3<f32>) -> vec3<f32> {
  let normal = safe_normalize(hit.shadingNormal.xyz, vec3<f32>(0.0, 1.0, 0.0));
  let surfaceColor = clamp(hit.color.xyz, vec3<f32>(0.0), vec3<f32>(1.0));
  let fresnel = fresnel_schlick(saturate(dot(normal, viewDirection)), surface_specular_f0(hit, surfaceColor));
  return sanitize_path_throughput(fresnel);
}

fn surface_delta_transmission_throughput(hit: HitRecord, viewDirection: vec3<f32>) -> vec3<f32> {
  let normal = safe_normalize(hit.shadingNormal.xyz, vec3<f32>(0.0, 1.0, 0.0));
  let surfaceColor = clamp(hit.color.xyz, vec3<f32>(0.0), vec3<f32>(1.0));
  let transmission = clamp(hit.materialExtension.z, 0.0, 1.0);
  let fresnel = fresnel_schlick(saturate(dot(normal, viewDirection)), surface_specular_f0(hit, surfaceColor));
  let transmissionTint = mix(vec3<f32>(1.0), surfaceColor, transmission);
  return sanitize_path_throughput(max(vec3<f32>(1.0) - fresnel, vec3<f32>(0.0)) * transmissionTint);
}

fn surface_continuation_throughput(
  hit: HitRecord,
  viewDirection: vec3<f32>,
  lightDirection: vec3<f32>,
  scatter: ScatterResult
) -> vec3<f32> {
  if ((scatter.flags & RAY_FLAG_DELTA_SAMPLE) != 0u) {
    if (scatter.lobeKind == SCATTER_LOBE_DELTA_TRANSMISSION) {
      return surface_delta_transmission_throughput(hit, viewDirection);
    }
    return surface_delta_reflection_throughput(hit, viewDirection);
  }
  if (scatter.pdf <= 0.000001) {
    return vec3<f32>(0.0);
  }
  let normal = safe_normalize(hit.shadingNormal.xyz, vec3<f32>(0.0, 1.0, 0.0));
  let bsdf = evaluate_surface_bsdf(hit, viewDirection, lightDirection);
  let nDotL = saturate(dot(normal, lightDirection));
  return sanitize_path_throughput(bsdf * (nDotL / scatter.pdf));
}

fn sunlit_baseline_radiance(normal: vec3<f32>) -> vec3<f32> {
  let baseline = max(config.pathResolveSettings.y, 0.0);
  if (baseline <= 0.000001) {
    return vec3<f32>(0.0);
  }
  let sunDirection = safe_normalize(
    config.environmentSunDirectionIntensity.xyz,
    vec3<f32>(0.0, 1.0, 0.0)
  );
  let sunFacing = saturate(dot(normal, sunDirection));
  let skyFacing = 0.35 + saturate(normal.y * 0.5 + 0.5) * 0.65;
  let directionalWeight = 0.38 + sunFacing * 0.62;
  let sunTint = max(config.environmentSunColor.xyz, vec3<f32>(0.0));
  return clamp_sample_radiance(sunTint * baseline * skyFacing * directionalWeight * 0.04);
}

fn terminal_surface_environment_source(ray: RayRecord, hit: HitRecord) -> vec3<f32> {
  let normal = safe_normalize(hit.shadingNormal.xyz, vec3<f32>(0.0, 1.0, 0.0));
  let origin = hit.position.xyz + normal * 0.003;
  let roughness = clamp(hit.material.x, 0.0, 1.0);
  let glossiness = surface_glossiness(hit);
  let normalEnvironment = gated_environment_radiance(origin, normal);
  let viewDirection = safe_normalize(-ray.direction.xyz, normal);
  let reflectionDirection = glossy_environment_direction(
    ray.direction.xyz,
    normal,
    roughness,
    mix(0.88, 0.38, glossiness)
  );
  let reflectionEnvironment = prefiltered_environment_radiance(reflectionDirection, roughness);
  let surfaceColor = clamp(max(hit.color.xyz, config.ambientColor.xyz * 0.35), vec3<f32>(0.0), vec3<f32>(1.0));
  let f0 = surface_specular_f0(hit, surfaceColor);
  let brdfTerm = sample_brdf_lut(saturate(dot(normal, viewDirection)), roughness);
  let specularEnvironment = reflectionEnvironment * (f0 * brdfTerm.x + vec3<f32>(brdfTerm.y));
  let sunlitFloor = sunlit_baseline_radiance(normal);
  let ambientFloor = select(
    max(config.ambientColor.xyz, sunlitFloor * 0.82),
    max(config.ambientColor.xyz * 0.35, sunlitFloor * 0.58),
    environment_map_enabled()
  );
  let environmentInfluence = select(
    max(0.12, config.pathResolveSettings.y * 0.42),
    max(config.environmentMapSettings.w, max(0.12, config.pathResolveSettings.y * 0.42)),
    environment_map_enabled()
  );
  let glossyEnvironment = max(
    normalEnvironment,
    max(reflectionEnvironment * mix(0.24, 0.92, glossiness), specularEnvironment)
  );
  let environmentFloor = max(ambientFloor, max(sunlitFloor, glossyEnvironment * environmentInfluence));
  let materialFloor = select(0.7, 1.0, hit.materialKind == 0u || hit.materialKind == 3u);
  return clamp_sample_radiance(environmentFloor * materialFloor);
}

fn terminal_surface_environment_contribution(
  ray: RayRecord,
  throughput: vec3<f32>,
  hit: HitRecord
) -> vec3<f32> {
  let surfaceColor = max(hit.color.xyz, config.ambientColor.xyz);
  let occlusion = mix(0.75, 1.0, clamp(hit.occlusion, 0.0, 1.0));
  return clamp_sample_radiance(
    throughput *
    surfaceColor *
    terminal_surface_environment_source(ray, hit) *
    occlusion
  );
}

fn direct_environment_portal_irradiance(origin: vec3<f32>, normal: vec3<f32>) -> vec3<f32> {
  if (config.environmentPortalCount == 0u || config.environmentPortalMode == 0u) {
    return vec3<f32>(0.0);
  }

  var irradiance = vec3<f32>(0.0);
  for (var portalIndex = 0u; portalIndex < config.environmentPortalCount; portalIndex = portalIndex + 1u) {
    let portal = environmentPortals[portalIndex];
    if (portal.kind != 1u) {
      continue;
    }

    let toPortal = portal.position.xyz - origin;
    let distanceSquared = max(dot(toPortal, toPortal), 0.01);
    let direction = safe_normalize(toPortal, normal);
    let surfaceFacing = saturate(dot(normal, direction));
    if (surfaceFacing <= 0.0001) {
      continue;
    }

    let portalNormal = safe_normalize(portal.normal.xyz, vec3<f32>(0.0, 0.0, 1.0));
    let twoSided = (portal.flags & 1u) != 0u;
    let portalFacing = select(
      saturate(dot(-direction, portalNormal)),
      max(abs(dot(direction, portalNormal)), 0.15),
      twoSided
    );
    let area = max(portal.position.w, 0.0001);
    let distanceFalloff = clamp(area / max(distanceSquared, area * 0.25), 0.0, 2.5);
    let traceDistance = max(sqrt(distanceSquared) - 0.01, 0.01);
    if (scene_visibility_blocked(origin, direction, traceDistance)) {
      continue;
    }
    irradiance = irradiance +
      portal.color.rgb *
      portal.normal.w *
      portal.color.a *
      surfaceFacing *
      portalFacing *
      distanceFalloff;
  }
  return irradiance;
}

fn visibility_test_ray(origin: vec3<f32>, direction: vec3<f32>) -> RayRecord {
  let rayDirection = safe_normalize(direction, vec3<f32>(0.0, 1.0, 0.0));
  return RayRecord(
    0u,
    0u,
    0u,
    0u,
    0u,
    0u,
    0u,
    0u,
    vec4<f32>(origin, 1.0),
    vec4<f32>(rayDirection, 0.0),
    vec4<f32>(1.0, 1.0, 1.0, 1.0)
  );
}

fn scene_visibility_blocked(origin: vec3<f32>, direction: vec3<f32>, maxDistance: f32) -> bool {
  let testRay = visibility_test_ray(origin, direction);
  let nearest = max(maxDistance, 0.001);

  for (var objectIndex = 0u; objectIndex < config.sceneObjectCount; objectIndex = objectIndex + 1u) {
    let object = sceneObjects[objectIndex];
    var current = no_candidate();
    if (object.kind == 1u) {
      current = intersect_sphere(testRay, object);
    } else if (object.kind == 2u) {
      current = intersect_box(testRay, object);
    }
    if (current.hit == 1u && current.distance < nearest) {
      return true;
    }
  }

  let meshCandidate = intersect_bvh(testRay, nearest);
  return meshCandidate.hit == 1u && meshCandidate.distance < nearest;
}

fn sample_emissive_triangle_light(hit: HitRecord, seed: u32) -> DirectLightSample {
  if (config.emissiveTriangleCount == 0u) {
    return DirectLightSample(vec4<f32>(0.0), vec4<f32>(0.0), 0.0, 0.0, 0u, 0u);
  }
  let lightSlot = min(
    u32(random01(seed + 71u) * f32(config.emissiveTriangleCount)),
    config.emissiveTriangleCount - 1u
  );
  let lightMetadata = bvhNodes[config.bvhNodeCapacity + lightSlot];
  let triangleIndex = lightMetadata.childOrFirst;
  if (triangleIndex >= config.triangleCount) {
    return DirectLightSample(vec4<f32>(0.0), vec4<f32>(0.0), 0.0, 0.0, 0u, 0u);
  }

  let lightTriangle = triangles[triangleIndex];
  let triangleArea = triangle_surface_area(lightTriangle);
  let lightNormal = triangle_surface_normal(lightTriangle);
  let r1 = random01(seed + 101u);
  let r2 = random01(seed + 193u);
  let root = sqrt(r1);
  let b0 = 1.0 - root;
  let b1 = root * (1.0 - r2);
  let b2 = root * r2;
  let lightPoint =
    lightTriangle.v0.xyz * b0 +
    lightTriangle.v1.xyz * b1 +
    lightTriangle.v2.xyz * b2;
  let lightDirection = safe_normalize(lightPoint - hit.position.xyz, lightNormal);
  let traceDistance = max(distance(lightPoint, hit.position.xyz) - 0.01, 0.01);
  let areaPdf = 1.0 / max(triangleArea * f32(config.emissiveTriangleCount), 0.000001);
  let lightPdf = solid_angle_pdf_from_area_pdf(areaPdf, hit.position.xyz, lightPoint, lightNormal);
  if (lightPdf <= 0.000001) {
    return DirectLightSample(vec4<f32>(0.0), vec4<f32>(0.0), 0.0, 0.0, 0u, 0u);
  }
  let radiance = max(lightTriangle.emission.xyz, lightTriangle.color.xyz);
  if (max_component(radiance) <= 0.000001) {
    return DirectLightSample(vec4<f32>(0.0), vec4<f32>(0.0), 0.0, 0.0, 0u, 0u);
  }
  return DirectLightSample(vec4<f32>(lightDirection, 0.0), vec4<f32>(radiance, 0.0), lightPdf, traceDistance, 0u, 1u);
}

fn sample_direct_light(hit: HitRecord, ray: RayRecord, normal: vec3<f32>) -> DirectLightSample {
  let environmentSelectionProbability = select(1.0, 0.5, config.emissiveTriangleCount > 0u);
  let selector = random01(mix_seed(ray.sourcePixelId, ray.sampleId, ray.bounce, config.frameIndex, 41u));
  if (selector < environmentSelectionProbability) {
    let environmentSample = sample_environment_importance(vec2<f32>(
      selector / max(environmentSelectionProbability, 0.000001),
      random01(mix_seed(ray.sourcePixelId, ray.sampleId, ray.bounce, config.frameIndex, 43u))
    ));
    let lightDirection = safe_normalize(environmentSample.direction, normal);
    let radiance = direct_environment_radiance(hit.position.xyz + normal * 0.003, lightDirection);
    return DirectLightSample(
      vec4<f32>(lightDirection, 0.0),
      vec4<f32>(radiance, 0.0),
      environmentSample.pdf * environmentSelectionProbability,
      1000000.0,
      0u,
      1u
    );
  }
  let emissiveSample = sample_emissive_triangle_light(hit, mix_seed(
    ray.sourcePixelId,
    ray.sampleId,
    ray.bounce,
    config.frameIndex,
    47u
  ));
  if (emissiveSample.valid == 0u) {
    return emissiveSample;
  }
  return DirectLightSample(
    emissiveSample.direction,
    emissiveSample.radiance,
    emissiveSample.pdf * (1.0 - environmentSelectionProbability),
    emissiveSample.maxDistance,
    emissiveSample.flags,
    emissiveSample.valid
  );
}

fn surface_direct_light_contribution(ray: RayRecord, hit: HitRecord) -> vec3<f32> {
  let normal = safe_normalize(hit.shadingNormal.xyz, vec3<f32>(0.0, 1.0, 0.0));
  let origin = hit.position.xyz + normal * 0.003;
  let viewDirection = safe_normalize(-ray.direction.xyz, normal);
  let lightSample = sample_direct_light(hit, ray, normal);
  if (lightSample.valid == 0u) {
    return vec3<f32>(0.0);
  }
  if (lightSample.pdf <= 0.000001) {
    return vec3<f32>(0.0);
  }
  let lightDirection = safe_normalize(lightSample.direction.xyz, normal);
  let nDotL = saturate(dot(normal, lightDirection));
  if (nDotL <= 0.000001) {
    return vec3<f32>(0.0);
  }
  if (scene_visibility_blocked(origin, lightDirection, lightSample.maxDistance)) {
    return vec3<f32>(0.0);
  }
  let incidentRadiance = lightSample.radiance.xyz;
  if (max_component(incidentRadiance) <= 0.000001) {
    return vec3<f32>(0.0);
  }
  let bsdf = evaluate_surface_bsdf(hit, viewDirection, lightDirection);
  if (max_component(bsdf) <= 0.000001) {
    return vec3<f32>(0.0);
  }
  let bsdfPdf = evaluate_surface_bsdf_pdf(hit, viewDirection, lightDirection);
  let misWeight = power_heuristic(lightSample.pdf, bsdfPdf);
  let contribution =
    ray.throughput.xyz *
    bsdf *
    incidentRadiance *
    (nDotL * misWeight / max(lightSample.pdf, 0.000001));
  return clamp_sample_radiance(contribution);
}
`;
