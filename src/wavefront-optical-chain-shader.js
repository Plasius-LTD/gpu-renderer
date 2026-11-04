// Shared bounded zero-direct chain traversal, qualified first against retained
// original-ray canonical prefixes. Physical ordinal and logical node differ.
export const OPTICAL_CHAIN_WGSL=`
struct OpticalChainResult {
  ray: RayRecord,
  hit: HitRecord,
  termination: u32,
  additionalSegments: u32,
};
// A diagnostic module replaces this no-op, not the optical transport functions.
fn record_optical_chain_step(ray: RayRecord, hit: HitRecord) {}
fn resolve_optical_chain(input: RayRecord, first: HitRecord, maximumInterfaces: u32) -> OpticalChainResult {
  var ray = input;
  var hit = first;
  var additional = 0u;
  let ordinary = ordinary_path_events(input);
  loop {
    record_optical_chain_step(ray, hit);
    if (hit.hitType == 5u || medium_transition_invalid(ray, hit)) {
      return OpticalChainResult(ray, hit, 9u, additional);
    }
    if (hit.hitType == 1u || hit.hitType == 2u) {
      return OpticalChainResult(ray, hit, 0u, additional);
    }
    if (!optical_interface_eligible(hit)) {
      return OpticalChainResult(ray, hit, 0u, additional);
    }
    if (ray.bounce < ordinary || ray.bounce - ordinary >= maximumInterfaces) {
      return OpticalChainResult(ray, hit, 7u, additional);
    }
    let segment = medium_transmittance(medium_stack_current_id(ray), hit.distance);
    let scatter = scatter_dielectric(ray, hit);
    let transmission = scatter_is_transmission(scatter);
    var weight = select(dielectric_reflection_weight(ray, hit),
      dielectric_transmission_weight(ray, hit), transmission) * segment / scatter.pdf;
    if (dielectric_cannot_refract(ray, hit)) { weight = segment; }
    if (max_component(weight) <= 0.000001) {
      return OpticalChainResult(ray, hit, 5u, additional);
    }
    let rouletteStart = select(2u, 6u,
      transport_experiment_enabled(TRANSPORT_EXPERIMENT_DEFER_LOW_SPP_RUSSIAN_ROULETTE) && config.samplesPerPixel <= 8u);
    if (ray.bounce >= rouletteStart) {
      let survival = continuation_survival_probability(ray, hit, weight, vec3<f32>(0.0), transmission);
      if (sample_dimension_1d(ray.sourcePixelId, ray.sampleId, ray.bounce,
          config.frameIndex, SAMPLE_DIM_RUSSIAN_ROULETTE) > survival) {
        return OpticalChainResult(ray, hit, 6u, additional);
      }
      weight /= survival;
    }
    let stack = select(transitioned_medium_stack(ray, hit), ray.mediumStack, !transmission);
    let stackDepth = select(transitioned_medium_stack_depth(ray, hit), ray.mediumStackDepth, !transmission);
    let medium = select(transmitted_medium_ref_id(ray, hit), ray.mediumRefId, !transmission);
    ray = RayRecord(ray.rayId, ray.parentRayId, ray.sourcePixelId, ray.sampleId,
      ray.bounce + 1u, medium, continuation_budget_flags(ray, hit, scatter.flags), stackDepth,
      vec4<f32>(offset_hit_origin(hit, scatter.direction.xyz), 1.0),
      continuation_environment_direction(ray, hit, scatter),
      vec4<f32>(ray.throughput.xyz * weight, scatter.pdf), stack);
    let intersection = intersect_nested_ray(ray);
    ray = intersection.ray;
    hit = intersection.hit;
    additional += 1u;
  }
}
`;
