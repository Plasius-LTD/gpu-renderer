// Optical helpers shared by the staged and fused canonical transport. No new
// ray fields: the four existing stack slots hold occupied volumes, not IORs.
export const DIELECTRIC_TRANSPORT_WGSL = `
fn bounded_dielectric_enabled() -> bool {
  return transport_experiment_enabled(16384u);
}
fn nested_media_enabled() -> bool {
  return transport_experiment_enabled(32768u);
}
fn medium_optics(id: u32) -> vec2<f32> {
  if (id == 0u) { return vec2<f32>(1.0, 0.0); }
  return textureLoad(mediumTableTexture, vec2<i32>(i32(id), 2), 0).xy;
}
fn occupied_medium(stack: vec4<u32>) -> u32 {
  var selected = 0u;
  var priority = -1.0;
  for (var i = 0u; i < MAX_MEDIUM_STACK_DEPTH; i++) {
    let id = stack[i];
    if (id != 0u) {
      let p = medium_optics(id).y;
      if (p >= priority) { selected = id; priority = p; }
    }
  }
  return selected;
}
fn medium_stack_contains(ray: RayRecord, id: u32) -> bool {
  return id != 0u && any(ray.mediumStack == vec4<u32>(id));
}
fn medium_transition_failure(ray: RayRecord, hit: HitRecord) -> u32 {
  if (!nested_media_enabled() || !dielectric_event(hit) || hit.mediumRefId == 0u) { return 0u; }
  let present = medium_stack_contains(ray, hit.mediumRefId);
  if (!medium_valid(hit.mediumRefId)) { return 1u; }
  if (hit.frontFace == 1u && present) { return 2u; }
  if (hit.frontFace == 1u && ray.mediumStackDepth >= MAX_MEDIUM_STACK_DEPTH) { return 3u; }
  if (hit.frontFace == 0u && !present) { return 4u; }
  return 0u;
}
fn medium_transition_invalid(ray: RayRecord, hit: HitRecord) -> bool {
  return medium_transition_failure(ray, hit) != 0u;
}
fn dielectric_ratio(ray: RayRecord, hit: HitRecord) -> f32 {
  if (nested_media_enabled() && medium_valid(hit.mediumRefId)) {
    return medium_optics(medium_stack_current_id(ray)).x /
      medium_optics(transmitted_medium_ref_id(ray, hit)).x;
  }
  return dielectric_eta(hit);
}
// Unpolarised Fresnel with actual eta_i / eta_t, including TIR and equal media.
fn interface_fresnel(cosine: f32, eta: f32) -> f32 {
  if (eta == 1.0) { return 0.0; }
  let ci = clamp(abs(cosine), 0.0, 1.0);
  let st2 = eta * eta * max(0.0, 1.0 - ci * ci);
  if (st2 >= 1.0) { return 1.0; }
  let ct = sqrt(1.0 - st2);
  let rs = (eta * ci - ct) / (eta * ci + ct);
  let rp = (ci - eta * ct) / (ci + eta * ct);
  return clamp(0.5 * (rs * rs + rp * rp), 0.0, 1.0);
}
fn dielectric_reflection_weight(ray: RayRecord, hit: HitRecord) -> vec3<f32> {
  if (nested_media_enabled() && medium_valid(hit.mediumRefId)) {
    return vec3<f32>(interface_fresnel(dot(-ray.direction.xyz, surface_shading_normal(hit)), dielectric_ratio(ray, hit)));
  }
  return surface_delta_reflection_throughput(hit, -ray.direction.xyz);
}
fn dielectric_transmission_weight(ray: RayRecord, hit: HitRecord) -> vec3<f32> {
  if (nested_media_enabled() && medium_valid(hit.mediumRefId)) {
    let eta = dielectric_ratio(ray, hit);
    let fresnel = interface_fresnel(dot(-ray.direction.xyz, surface_shading_normal(hit)), eta);
    let tint = mix(vec3<f32>(1.0), clamp(hit.color.xyz, vec3<f32>(0.0), vec3<f32>(1.0)), clamp(hit.materialExtension.z, 0.0, 1.0));
    return (1.0 - fresnel) * tint * eta * eta;
  }
  return surface_delta_transmission_throughput(hit, -ray.direction.xyz);
}
fn dielectric_reflection_probability(ray: RayRecord, hit: HitRecord) -> f32 {
  if (dielectric_cannot_refract(ray, hit)) { return 1.0; }
  let r = max_component(dielectric_reflection_weight(ray, hit));
  let t = max_component(dielectric_transmission_weight(ray, hit));
  if (r + t == 0.0) { return 1.0; }
  return r / (r + t);
}
fn scatter_dielectric(ray: RayRecord, hit: HitRecord) -> ScatterResult {
  let normal = surface_shading_normal(hit);
  let etaRatio = dielectric_ratio(ray, hit);
  let transmission = clamp(hit.materialExtension.z, 0.0, 1.0);
  let cannotRefract = dielectric_cannot_refract(ray, hit);
  let reflectChance = schlick(min(dot(-ray.direction.xyz, normal), 1.0), etaRatio);
  var transmissionReflectChance = select(reflectChance, max(reflectChance, 1.0 - transmission), transmission > 0.001);
  if (bounded_dielectric_enabled()) { transmissionReflectChance = dielectric_reflection_probability(ray, hit); }
  let selector = sample_dimension_1d(ray.sourcePixelId, ray.sampleId, ray.bounce, config.frameIndex, SAMPLE_DIM_TRANSMISSION_SELECTOR);
  if (cannotRefract || transmissionReflectChance >= 1.0 || selector < transmissionReflectChance) {
    return ScatterResult(vec4<f32>(reflect(ray.direction.xyz, normal), 0.0),
      select(1.0, transmissionReflectChance, bounded_dielectric_enabled()),
      ray.mediumRefId, RAY_FLAG_DELTA_SAMPLE, SCATTER_LOBE_DELTA_REFLECTION);
  }
  return ScatterResult(vec4<f32>(refract_direction(ray.direction.xyz, normal, etaRatio), 0.0),
    select(1.0, 1.0 - transmissionReflectChance, bounded_dielectric_enabled()),
    transmitted_medium_ref_id(ray, hit), RAY_FLAG_DELTA_SAMPLE, SCATTER_LOBE_DELTA_TRANSMISSION);
}
// In optical mode a 1 mm t-min would erase the authored 0.2 mm overlap.
// This is a local-scale numerical policy, not arbitrary-precision geometry.
fn transport_ray_minimum() -> f32 {
  return select(0.001, 0.0000001, nested_media_enabled());
}
fn optical_offset(position: vec3<f32>, normal: vec3<f32>, direction: vec3<f32>) -> vec3<f32> {
  let scale = max(max(abs(position.x), abs(position.y)), abs(position.z));
  let epsilon = max(0.000001, scale * 0.00000047683716);
  return position + normal * select(-epsilon, epsilon, dot(normal, direction) >= 0.0);
}
`;
