// Surface-roughness transmission, not alpha coverage or volume scattering.
// Original implementation of GGX reflection/refraction; see the design's equations.
export const ROUGH_DIELECTRIC_WGSL = `
const RAY_FLAG_NO_COMPETING_NEE: u32 = 4u;
const SCATTER_LOBE_ROUGH_TRANSMISSION: u32 = 6u;
fn terminate_optical_path(ray: RayRecord, kind: u32) {
  if (deferred_path_resolve_enabled()) {
    record_deferred_terminal_source(ray, vec3<f32>(0.0), kind);
  } else {
    record_weighted_terminal(ray, vec3<f32>(0.0), kind);
  }
  atomicAdd(&counters.terminatedCount, 1u);
}
fn rough_dielectric_active(hit: HitRecord) -> bool {
  // The existing mixture also owns the diffuse remainder of smooth partial
  // transmission. Actual roughness sampling remains independently flagged.
  let partial = nested_media_enabled() && medium_valid(hit.mediumRefId) && hit.materialExtension.z < 1.0;
  return dielectric_event(hit) && (transport_experiment_enabled(65536u) || partial);
}
fn scatter_is_transmission(scatter: ScatterResult) -> bool {
  return scatter.lobeKind == SCATTER_LOBE_DELTA_TRANSMISSION || scatter.lobeKind == SCATTER_LOBE_ROUGH_TRANSMISSION;
}
fn optical_diffuse_probability(hit: HitRecord) -> f32 {
  return 0.5 * (1.0 - clamp(hit.materialExtension.z, 0.0, 1.0));
}
fn optical_reflection_probability(fresnel: f32, transmission: f32) -> f32 {
  let sum = fresnel + (1.0 - fresnel) * transmission;
  if (sum == 0.0) { return 1.0; }
  return fresnel / sum;
}
fn optical_smooth(ray: RayRecord, hit: HitRecord) -> bool {
  return !transport_experiment_enabled(65536u) || hit.material.x <= 0.02 || dielectric_ratio(ray, hit) == 1.0;
}
fn optical_ggx_d(nh: f32, roughness: f32) -> f32 {
  let a = max(roughness * roughness, 0.0001);
  let a2 = a * a;
  let denominator = (1.0 - nh * nh) + a2 * nh * nh;
  return a2 / (3.14159265359 * denominator * denominator);
}
fn optical_ggx_g1(cosine: f32, roughness: f32) -> f32 {
  let c = abs(cosine);
  let a = max(roughness * roughness, 0.0001);
  return 2.0 * c / max(c + sqrt(a * a + (1.0 - a * a) * c * c), 1e-20);
}
fn optical_sample_half(sample: vec2<f32>, roughness: f32, normal: vec3<f32>) -> vec3<f32> {
  let a = max(roughness * roughness, 0.0001);
  let c = sqrt((1.0 - sample.y) / (1.0 - sample.y + a * a * sample.y));
  let s = sqrt(max(0.0, 1.0 - c * c));
  let phi = 6.28318530718 * sample.x;
  return local_to_world(vec3<f32>(s * cos(phi), s * sin(phi), c), normal);
}
// .xyz = BSDF, .w = full continuous mixture PDF. Discrete smooth events are separate.
fn rough_dielectric_evaluate(ray: RayRecord, hit: HitRecord, light: vec3<f32>) -> vec4<f32> {
  let n = optical_shading_normal(ray, hit);
  let v = -ray.direction.xyz;
  let nv = dot(n, v);
  let nl = dot(n, light);
  let geometricCosine = dot(hit.geometricNormal.xyz, light);
  if (nv <= 0.0 || nl == 0.0 || nl * geometricCosine <= 0.0) { return vec4<f32>(0.0); }
  let eta = dielectric_ratio(ray, hit);
  let transmission = clamp(hit.materialExtension.z, 0.0, 1.0);
  let color = clamp(hit.color.xyz, vec3<f32>(0.0), vec3<f32>(1.0));
  let pd = optical_diffuse_probability(hit);
  var value = vec3<f32>(0.0);
  var pdf = 0.0;
  if (nl > 0.0) {
    value = color * ((1.0 - transmission) * (1.0 - interface_fresnel(nv, eta)) *
      (1.0 - interface_fresnel(nl, eta)) / 3.14159265359);
    pdf = pd * nl / 3.14159265359;
  }
  if (optical_smooth(ray, hit)) { return vec4<f32>(value, pdf); }
  var halfSum = v + light;
  if (nl < 0.0) { halfSum = eta * v + light; }
  if (dot(halfSum, halfSum) == 0.0) { return vec4<f32>(value, pdf); }
  var h = normalize(halfSum);
  h *= select(-1.0, 1.0, dot(n, h) >= 0.0);
  let vh = dot(v, h);
  let lh = dot(light, h);
  if (vh <= 0.0 || lh * nl <= 0.0) { return vec4<f32>(value, pdf); }
  let nh = clamp(dot(n, h), 0.0, 1.0);
  let d = optical_ggx_d(nh, hit.material.x);
  let g = optical_ggx_g1(nv, hit.material.x) * optical_ggx_g1(nl, hit.material.x);
  let f = interface_fresnel(vh, eta);
  let pr = optical_reflection_probability(f, transmission);
  if (nl > 0.0) {
    value += vec3<f32>(f * d * g / (4.0 * nv * nl));
    pdf += (1.0 - pd) * pr * d * nh / (4.0 * vh);
  } else {
    let denominator = lh + eta * vh;
    if (denominator == 0.0) { return vec4<f32>(0.0); }
    let jacobian = abs(lh) / (denominator * denominator);
    value = color * (transmission * (1.0 - f) * d * g * jacobian * vh * eta * eta / abs(nv * nl));
    pdf = (1.0 - pd) * (1.0 - pr) * d * nh * jacobian;
  }
  return vec4<f32>(value, pdf);
}
fn rough_dielectric_bsdf(ray: RayRecord, hit: HitRecord, light: vec3<f32>) -> vec3<f32> {
  return rough_dielectric_evaluate(ray, hit, light).xyz;
}
fn rough_dielectric_pdf(ray: RayRecord, hit: HitRecord, light: vec3<f32>) -> f32 {
  return rough_dielectric_evaluate(ray, hit, light).w;
}
fn scatter_rough_dielectric_samples(ray: RayRecord, hit: HitRecord, component: f32, selector: f32, sample: vec2<f32>) -> ScatterResult {
  let n = optical_shading_normal(ray, hit);
  let pd = optical_diffuse_probability(hit);
  if (component < pd) {
    let light = cosine_sample_hemisphere(sample, n);
    return ScatterResult(vec4<f32>(light, 0.0), rough_dielectric_pdf(ray, hit, light), ray.mediumRefId, 0u, SCATTER_LOBE_DIFFUSE);
  }
  var h = n;
  let isSmooth = optical_smooth(ray, hit);
  if (!isSmooth) { h = optical_sample_half(sample, hit.material.x, n); }
  let vh = dot(-ray.direction.xyz, h);
  if (vh <= 0.0) { return ScatterResult(vec4<f32>(n, 0.0), 0.0, ray.mediumRefId, 0u, SCATTER_LOBE_SPECULAR); }
  let eta = dielectric_ratio(ray, hit);
  let f = interface_fresnel(vh, eta);
  let pr = optical_reflection_probability(f, clamp(hit.materialExtension.z, 0.0, 1.0));
  let reflection = selector < pr || pr == 1.0;
  var light = reflect(ray.direction.xyz, h);
  var lobe = select(SCATTER_LOBE_SPECULAR, SCATTER_LOBE_DELTA_REFLECTION, isSmooth);
  var flags = select(0u, RAY_FLAG_DELTA_SAMPLE, isSmooth);
  var medium = ray.mediumRefId;
  if (!reflection) {
    light = refract_direction(ray.direction.xyz, h, eta);
    lobe = select(SCATTER_LOBE_ROUGH_TRANSMISSION, SCATTER_LOBE_DELTA_TRANSMISSION, isSmooth);
    flags |= RAY_FLAG_NO_COMPETING_NEE;
    medium = transmitted_medium_ref_id(ray, hit);
  }
  // Reject inconsistent microfacets, never turn them into a different proposal.
  let side = select(-1.0, 1.0, reflection);
  if (side * dot(n, light) <= 0.0 || side * dot(hit.geometricNormal.xyz, light) <= 0.0) {
    return ScatterResult(vec4<f32>(light, 0.0), 0.0, ray.mediumRefId, flags, lobe);
  }
  var pdf = (1.0 - pd) * select(1.0 - pr, pr, reflection);
  if (!isSmooth) { pdf = rough_dielectric_pdf(ray, hit, light); }
  return ScatterResult(vec4<f32>(light, 0.0), pdf, medium, flags, lobe);
}
fn scatter_rough_dielectric(ray: RayRecord, hit: HitRecord) -> ScatterResult {
  return scatter_rough_dielectric_samples(ray, hit,
    sample_dimension_1d(ray.sourcePixelId, ray.sampleId, ray.bounce, config.frameIndex, SAMPLE_DIM_BSDF_LOBE_SELECTOR),
    sample_dimension_1d(ray.sourcePixelId, ray.sampleId, ray.bounce, config.frameIndex, SAMPLE_DIM_TRANSMISSION_SELECTOR),
    sample_dimension_2d(ray.sourcePixelId, ray.sampleId, ray.bounce, config.frameIndex, SAMPLE_DIM_SPECULAR_HALF_VECTOR, config.samplesPerPixel));
}
fn rough_dielectric_throughput(ray: RayRecord, hit: HitRecord, scatter: ScatterResult) -> vec3<f32> {
  if (scatter.pdf <= 0.0) { return vec3<f32>(0.0); }
  let n = optical_shading_normal(ray, hit);
  if ((scatter.flags & RAY_FLAG_DELTA_SAMPLE) != 0u) {
    let eta = dielectric_ratio(ray, hit);
    let f = interface_fresnel(dot(-ray.direction.xyz, n), eta);
    if (scatter_is_transmission(scatter)) {
      return clamp(hit.color.xyz, vec3<f32>(0.0), vec3<f32>(1.0)) *
        ((1.0 - f) * clamp(hit.materialExtension.z, 0.0, 1.0) * eta * eta / scatter.pdf);
    }
    return vec3<f32>(f / scatter.pdf);
  }
  return rough_dielectric_bsdf(ray, hit, scatter.direction.xyz) * (abs(dot(n, scatter.direction.xyz)) / scatter.pdf);
}
fn transport_surface_bsdf(ray: RayRecord, hit: HitRecord, view: vec3<f32>, light: vec3<f32>) -> vec3<f32> {
  if (rough_dielectric_active(hit)) { return rough_dielectric_bsdf(ray, hit, light); }
  return evaluate_surface_bsdf(hit, view, light);
}
fn transport_surface_pdf(ray: RayRecord, hit: HitRecord, view: vec3<f32>, light: vec3<f32>) -> f32 {
  if (rough_dielectric_active(hit)) { return rough_dielectric_pdf(ray, hit, light); }
  return evaluate_surface_bsdf_pdf(hit, view, light);
}
`;
