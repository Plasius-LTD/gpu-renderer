// Canonical bodies shared by staged and experimental immediate-hit execution.
export const WAVEFRONT_INTERSECTION_BODY_WGSL = `  var nearest = 1000000.0;
  var hitObject = SceneObject(
    0u,
    0u,
    0u,
    0u,
    0u,
    0u,
    0u,
    0u,
    vec4<f32>(0.0),
    vec4<f32>(0.0),
    vec4<f32>(0.0),
    vec4<f32>(0.0),
    vec4<f32>(1.0, 0.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 0.0, 0.08),
    vec4<f32>(0.08, 1.0, 0.0, 0.0),
    vec4<f32>(1.0, 1.0, 1.0, 1.0)
  );
  var candidate = no_candidate();
  var hitTriangle = TriangleRecord();

  for (var objectIndex = 0u; objectIndex < config.sceneObjectCount; objectIndex = objectIndex + 1u) {
    let object = sceneObjects[objectIndex];
    var current = no_candidate();
    if (object.kind == 1u) {
      current = intersect_sphere(ray, object);
    } else if (object.kind == 2u) {
      current = intersect_box(ray, object);
    }
    if (current.hit == 1u && current.distance < nearest) {
      nearest = current.distance;
      hitObject = object;
      candidate = current;
    }
  }

  let meshCandidate = intersect_bvh(ray, nearest);
  if (meshCandidate.hit == 1u && meshCandidate.distance < nearest) {
    nearest = meshCandidate.distance;
    candidate = meshCandidate;
    hitTriangle = triangles[meshCandidate.triangleIndex];
  }

  if (candidate.hit == 0u) {
    hits[index] = make_miss(ray);
    return;
  }

  var position = ray.origin.xyz + ray.direction.xyz * candidate.distance;
  var positionError = 0.0;
  var unresolvedOpticalPosition = false;
  if (nested_media_enabled()) {
    if (candidate.triangleIndex != 0xffffffffu) {
      position = optical_triangle_position(hitTriangle, candidate.barycentric);
      if (hitTriangle.mediumRefId != 0u && all(candidate.barycentric > vec3<f32>(0.0))) {
        var reconstructed = optical_triangle_projected_position(hitTriangle,position);
        if (reconstructed.w == 0.0) {
          reconstructed = optical_coplanar_neighbor_position(hitTriangle,candidate.triangleIndex,position);
        }
        position = reconstructed.xyz;
        unresolvedOpticalPosition = reconstructed.w == 0.0;
      }
      positionError = optical_triangle_error(hitTriangle,candidate.barycentric,candidate.geometricNormal);
    } else {
      let error = optical_rounding_gamma(12.0) * (abs(ray.origin.xyz) + abs(ray.direction.xyz*candidate.distance));
      positionError = dot(abs(candidate.geometricNormal),error);
    }
  }
  let hitMaterialKind = select(hitObject.materialKind, hitTriangle.materialKind, candidate.triangleIndex != 0xffffffffu);
  let hitObjectId = select(hitObject.objectId, hitTriangle.meshId, candidate.triangleIndex != 0xffffffffu);
  let meshSurface = sample_surface_material(
    hitTriangle,
    candidate.uv,
    candidate.barycentric,
    candidate.geometricNormal,
    candidate.shadingNormal
  );
  let hitColor = select(hitObject.color, meshSurface.color, candidate.triangleIndex != 0xffffffffu);
  let hitEmission = select(hitObject.emission, meshSurface.emission, candidate.triangleIndex != 0xffffffffu);
  let hitMaterial = select(hitObject.material, meshSurface.material, candidate.triangleIndex != 0xffffffffu);
  let hitMaterialResponse = select(hitObject.materialResponse, meshSurface.materialResponse, candidate.triangleIndex != 0xffffffffu);
  let hitMaterialExtension = select(hitObject.materialExtension, meshSurface.materialExtension, candidate.triangleIndex != 0xffffffffu);
  let hitSpecularColor = select(hitObject.specularColor, meshSurface.specularColor, candidate.triangleIndex != 0xffffffffu);
  let hitShadingNormal = valid_surface_normal(candidate.geometricNormal,
    select(candidate.shadingNormal, meshSurface.shadingNormal, candidate.triangleIndex != 0xffffffffu), -ray.direction.xyz);
  let hitClearcoatNormal = valid_surface_normal(candidate.geometricNormal,
    select(candidate.shadingNormal, meshSurface.clearcoatNormal, candidate.triangleIndex != 0xffffffffu), -ray.direction.xyz);
  let hitPrimitiveId = select(candidate.primitiveId, hitTriangle.triangleId, candidate.triangleIndex != 0xffffffffu);
  let hitMaterialRefId = select(candidate.materialRefId, hitTriangle.materialRefId, candidate.triangleIndex != 0xffffffffu);
  let hitMediumRefId = select(candidate.mediumRefId, hitTriangle.mediumRefId, candidate.triangleIndex != 0xffffffffu);
  let hitMaterialSlot = select(0u, hitTriangle.materialSlot, candidate.triangleIndex != 0xffffffffu);
  let hitOcclusion = select(1.0, meshSurface.occlusion, candidate.triangleIndex != 0xffffffffu);
  var hitType = 0u;
  if (hitMaterialKind == 4u || emission_power(hitEmission) > 0.0001) {
    hitType = 1u;
  } else if (hitMaterialKind == 3u || hitMaterial.z < 0.999 || hitMaterialExtension.z > 0.001) {
    hitType = 3u;
  }
  if (unresolvedOpticalPosition) { hitType = 5u; positionError = 8.0; }
  atomicAdd(&counters.hitCount, 1u);
  hits[index] = HitRecord(
    ray.rayId,
    ray.sourcePixelId,
    hitType,
    hitObjectId,
    hitMaterialKind,
    candidate.frontFace,
    hitPrimitiveId,
    hitMaterialRefId,
    hitMediumRefId,
    hitMaterialSlot,
    hitClearcoatNormal.xy,
    candidate.distance,
    hitOcclusion,
    hitClearcoatNormal.z,
    positionError,
    vec4<f32>(position, 1.0),
    vec4<f32>(candidate.geometricNormal, 0.0),
    vec4<f32>(hitShadingNormal, 0.0),
    vec4<f32>(candidate.barycentric, 0.0),
    vec4<f32>(candidate.uv, 0.0, 0.0),
    hitColor,
    hitEmission,
    hitMaterial,
    hitMaterialResponse,
    hitMaterialExtension,
    hitSpecularColor
  );`;

export const WAVEFRONT_SURFACE_BODY_WGSL = `  if (!path_budget_state_valid(ray)) {
    fail_path_node(ray);
    pathNodes[ray.parentRayId].reserved = 8u;
    atomicAdd(&counters.termination.invalidSampleCount, 1u);
    atomicAdd(&counters.terminatedCount, 1u);
    return;
  }
  if (optical_interface_budget_enabled()) {
    let chain = resolve_optical_chain(ray, hit, u32(config.cameraRight.w));
    ray = chain.ray;
    hit = chain.hit;
    if (config.cameraForward.w == 1.0 && chain.additionalSegments > 0u) {
      atomicAdd(&counters.termination.transportPad2, chain.additionalSegments);
    }
    if (chain.termination == 5u || chain.termination == 6u || chain.termination == 7u) {
      terminate_optical_path(ray, chain.termination);
      return;
    }
  }
  if (hit.hitType == 5u || medium_transition_invalid(ray, hit)) {
    fail_path_node(ray);
    pathNodes[ray.parentRayId].reserved = (hit.primitiveId << 4u) | max(u32(hit.pad2), medium_transition_failure(ray, hit));
    // Rejected nodes cannot resolve radiance; retain the optical failure ray.
    pathNodes[ray.parentRayId].directRadiance = ray.origin.xyz;
    pathNodes[ray.parentRayId].terminalRadiance = ray.direction.xyz;
    pathNodes[ray.parentRayId].terminalKind = bitcast<u32>(hit.distance);
    atomicAdd(&counters.termination.invalidSampleCount, 1u);
    atomicAdd(&counters.terminatedCount, 1u);
    return;
  }
  let segmentTransmittance = medium_transmittance(medium_stack_current_id(ray), hit.distance);
  let arrivingThroughput = ray.throughput.xyz * segmentTransmittance;

  if (hit.hitType == 1u) {
    let guidedLightWeight = select(1.0, 0.24, (ray.flags & RAY_FLAG_GUIDED_EMISSIVE) != 0u);
    var sourceRadiance = max(hit.emission.xyz, hit.color.xyz) * guidedLightWeight;
    if (layered_clearcoat_active(hit)) {
      sourceRadiance *= 1.0 - coating_fresnel(hit.materialResponse.w, surface_clearcoat_normal(hit), -ray.direction.xyz);
    }
    if (terminal_mis_enabled(ray)) {
      let bsdfPdf = max(ray.throughput.w, 0.000001);
      let lightPdf = terminal_emissive_light_pdf(ray, hit);
      if (lightPdf > 0.000001) {
        sourceRadiance = sourceRadiance * power_heuristic(bsdfPdf, lightPdf);
      }
    }
    if (deferred_path_resolve_enabled()) {
      record_deferred_terminal_source(
        ray,
        sourceRadiance * segmentTransmittance,
        TERMINAL_SOURCE_KIND_EMISSIVE
      );
    } else {
      let rawWeightedContribution = arrivingThroughput * sourceRadiance * sample_weight();
      record_weighted_terminal(ray, rawWeightedContribution, TERMINAL_SOURCE_KIND_EMISSIVE);
    }
    atomicAdd(&counters.terminatedCount, 1u);
    return;
  }

  if (hit.hitType == 2u) {
    var sourceRadiance = hit.color.xyz;
    sourceRadiance = terminal_environment_source(ray, sourceRadiance);
    if (deferred_path_resolve_enabled()) {
      record_deferred_terminal_source(
        ray,
        sourceRadiance * segmentTransmittance,
        TERMINAL_SOURCE_KIND_ENVIRONMENT
      );
    } else {
      let rawWeightedContribution = arrivingThroughput * sourceRadiance * sample_weight();
      record_weighted_terminal(ray, rawWeightedContribution, TERMINAL_SOURCE_KIND_ENVIRONMENT);
    }
    atomicAdd(&counters.terminatedCount, 1u);
    return;
  }

  let shouldEstimateDirectLight = surface_supports_direct_lighting(hit);
  if (shouldEstimateDirectLight) {
    let directLight = surface_direct_light_contribution(
      RayRecord(
        ray.rayId,
        ray.parentRayId,
        ray.sourcePixelId,
        ray.sampleId,
        ray.bounce,
        ray.mediumRefId,
        ray.flags,
        ray.mediumStackDepth,
        ray.origin,
        ray.direction,
        vec4<f32>(arrivingThroughput, ray.throughput.w),
        ray.mediumStack
      ),
      hit
    );
    let sunLight = surface_procedural_sun_contribution(
      RayRecord(
        ray.rayId,
        ray.parentRayId,
        ray.sourcePixelId,
        ray.sampleId,
        ray.bounce,
        ray.mediumRefId,
        ray.flags,
        ray.mediumStackDepth,
        ray.origin,
        ray.direction,
        vec4<f32>(arrivingThroughput, ray.throughput.w),
        ray.mediumStack
      ),
      hit
    );
    let rawDirectLight = (directLight + sunLight) * sample_weight();
    record_radiance_diagnostics(rawDirectLight);
    let weightedDirectLight = sanitize_linear_radiance(rawDirectLight);
    record_transport_contribution(TRANSPORT_BUCKET_DIRECT_EXPLICIT, weightedDirectLight);
    if (!path_radiance_valid(rawDirectLight)) { fail_path_node(ray); }
    record_path_direct(ray, weightedDirectLight);
  }

  if (path_budget_exhausted(ray, hit)) {
    if (rough_dielectric_active(hit)) {
      terminate_optical_path(ray, TERMINAL_SOURCE_KIND_MAX_DEPTH_STRICT);
      return;
    }
    if (deferred_path_resolve_enabled()) {
      if (strict_physical_low_spp_lighting_enabled()) {
        record_deferred_terminal_source(
          ray,
          vec3<f32>(0.0),
          TERMINAL_SOURCE_KIND_MAX_DEPTH_STRICT
        );
      } else {
        record_deferred_terminal_source(
          ray,
          terminal_surface_environment_source(ray, hit),
          TERMINAL_SOURCE_KIND_AMBIENT_MAX_DEPTH
        );
      }
    } else {
      let terminalEnvironment = terminal_surface_environment_contribution(
        ray,
        arrivingThroughput,
        hit
      );
      let rawWeightedContribution = terminalEnvironment * sample_weight();
      record_weighted_terminal(ray, rawWeightedContribution, TERMINAL_SOURCE_KIND_AMBIENT_MAX_DEPTH);
    }
    atomicAdd(&counters.terminatedCount, 1u);
    return;
  }

  let scatter = scatter_direction(ray, hit);
  let continuationNormal = surface_shading_normal(hit);
  let continuationViewDirection = safe_normalize(-ray.direction.xyz, continuationNormal);
  let continuationLightDirection = safe_normalize(scatter.direction.xyz, continuationNormal);
  var continuationThroughput = vec3<f32>(0.0);
  if (rough_dielectric_active(hit)) {
    continuationThroughput = rough_dielectric_throughput(ray, hit, scatter) * segmentTransmittance;
  } else {
    continuationThroughput = surface_continuation_throughput(
      hit,
      continuationViewDirection,
      continuationLightDirection,
      scatter
    ) * segmentTransmittance;
  }
  let transmissionBranch = scatter_is_transmission(scatter);
  let totalInternalReflection = dielectric_event(hit) && !rough_dielectric_active(hit) && dielectric_cannot_refract(ray, hit);
  let splitDielectric = dielectric_event(hit) && !totalInternalReflection && !bounded_dielectric_enabled() && !rough_dielectric_active(hit);
  var secondaryThroughput = vec3<f32>(0.0);
  if (dielectric_event(hit) && !rough_dielectric_active(hit) && (nested_media_enabled() || bounded_dielectric_enabled())) {
    continuationThroughput = select(dielectric_reflection_weight(ray, hit),
      dielectric_transmission_weight(ray, hit), transmissionBranch) * segmentTransmittance;
    if (bounded_dielectric_enabled()) { continuationThroughput /= scatter.pdf; }
  }
  if (totalInternalReflection) {
    continuationThroughput = segmentTransmittance;
  }
  if (splitDielectric) {
    secondaryThroughput = select(
      surface_delta_transmission_throughput(hit, continuationViewDirection),
      surface_delta_reflection_throughput(hit, continuationViewDirection),
      transmissionBranch
    ) * segmentTransmittance;
    if (nested_media_enabled()) {
      secondaryThroughput = select(dielectric_transmission_weight(ray, hit),
        dielectric_reflection_weight(ray, hit), transmissionBranch) * segmentTransmittance;
    }
  }
  if (max(max_component(continuationThroughput), max_component(secondaryThroughput)) <= 0.000001) {
    if (rough_dielectric_active(hit)) {
      terminate_optical_path(ray, TERMINAL_SOURCE_KIND_ABSORPTION_NULL);
      return;
    }
    if (deferred_path_resolve_enabled()) {
      if (strict_physical_low_spp_lighting_enabled()) {
        record_deferred_terminal_source(
          ray,
          vec3<f32>(0.0),
          TERMINAL_SOURCE_KIND_ABSORPTION_NULL
        );
      } else {
        record_deferred_terminal_source(
          ray,
          terminal_surface_environment_source(ray, hit),
          TERMINAL_SOURCE_KIND_AMBIENT_MAX_DEPTH
        );
      }
    } else {
      let terminalEnvironment = terminal_surface_environment_contribution(
        ray,
        arrivingThroughput,
        hit
      );
      let rawWeightedContribution = terminalEnvironment * sample_weight();
      record_weighted_terminal(ray, rawWeightedContribution, TERMINAL_SOURCE_KIND_AMBIENT_MAX_DEPTH);
    }
    atomicAdd(&counters.terminatedCount, 1u);
    return;
  }
  let rouletteStartBounce = select(
    2u,
    6u,
    transport_experiment_enabled(TRANSPORT_EXPERIMENT_DEFER_LOW_SPP_RUSSIAN_ROULETTE) &&
      config.samplesPerPixel <= 8u
  );
  if (strict_physical_low_spp_lighting_enabled() && ray.bounce >= rouletteStartBounce) {
    let survivalProbability = continuation_survival_probability(ray, hit, continuationThroughput, secondaryThroughput, transmissionBranch);
    let roulette = sample_dimension_1d(
      ray.sourcePixelId,
      ray.sampleId,
      ray.bounce,
      config.frameIndex,
      SAMPLE_DIM_RUSSIAN_ROULETTE
    );
    if (roulette > survivalProbability) {
      if (deferred_path_resolve_enabled()) {
        record_deferred_terminal_source(
          ray,
          vec3<f32>(0.0),
          TERMINAL_SOURCE_KIND_RUSSIAN_ROULETTE
        );
      } else {
        record_weighted_terminal(ray, vec3<f32>(0.0), TERMINAL_SOURCE_KIND_RUSSIAN_ROULETTE);
      }
      atomicAdd(&counters.terminatedCount, 1u);
      return;
    }
    continuationThroughput = continuationThroughput / survivalProbability;
    secondaryThroughput = secondaryThroughput / survivalProbability;
  }
  let nextIndex = atomicAdd(&counters.nextCount, 1u);
  if (nextIndex >= config.tilePixelCount) {
    fail_path_node(ray);
    record_weighted_terminal(ray, vec3<f32>(0.0), TERMINAL_SOURCE_KIND_AMBIENT_QUEUE_OVERFLOW);
    atomicAdd(&counters.terminatedCount, 1u);
    return;
  }
  link_path_child(ray, nextIndex, false);
  let throughput = ray.throughput.xyz * continuationThroughput;
  let nextMediumStack = select(
    transitioned_medium_stack(ray, hit),
    ray.mediumStack,
    !transmissionBranch
  );
  let nextMediumStackDepth = select(
    transitioned_medium_stack_depth(ray, hit),
    ray.mediumStackDepth,
    !transmissionBranch
  );
  let nextMediumRefId = select(
    transmitted_medium_ref_id(ray, hit),
    ray.mediumRefId,
    !transmissionBranch
  );
  nextQueue[nextIndex] = RayRecord(
    ray.rayId,
    ray.parentRayId,
    ray.sourcePixelId,
    ray.sampleId,
    ray.bounce + 1u,
    nextMediumRefId,
    continuation_budget_flags(ray, hit, scatter.flags),
    nextMediumStackDepth,
    vec4<f32>(
      offset_hit_origin(hit, scatter.direction.xyz),
      1.0
    ),
    continuation_environment_direction(ray, hit, scatter),
    vec4<f32>(throughput, scatter.pdf),
    nextMediumStack
  );

  // Both non-TIR dielectric branches belong to the same camera sample.
  // Capacity failure rejects the sample rather than losing a weighted branch.
  if (splitDielectric) {
    let secondaryIndex = atomicAdd(&counters.nextCount, 1u);
    if (secondaryIndex < config.tilePixelCount) {
      let secondaryIsReflection = transmissionBranch;
      let secondaryDirection = select(
        refract_direction(ray.direction.xyz, optical_shading_normal(ray, hit),
          dielectric_ratio(ray, hit)),
        reflect(ray.direction.xyz, optical_shading_normal(ray, hit)),
        secondaryIsReflection
      );
      let secondaryStack = select(
        transitioned_medium_stack(ray, hit),
        ray.mediumStack,
        secondaryIsReflection
      );
      let secondaryDepth = select(
        transitioned_medium_stack_depth(ray, hit),
        ray.mediumStackDepth,
        secondaryIsReflection
      );
      let secondaryMedium = select(
        transmitted_medium_ref_id(ray, hit),
        ray.mediumRefId,
        secondaryIsReflection
      );
      nextQueue[secondaryIndex] = RayRecord(
        ray.rayId,
        ray.parentRayId,
        ray.sourcePixelId,
        ray.sampleId,
        ray.bounce + 1u,
        secondaryMedium,
        scatter.flags,
        secondaryDepth,
        vec4<f32>(
          offset_hit_origin(hit, secondaryDirection),
          1.0
        ),
        vec4<f32>(secondaryDirection, 0.0),
        vec4<f32>(ray.throughput.xyz * secondaryThroughput, scatter.pdf),
        secondaryStack
      );
      link_path_child(ray, secondaryIndex, true);
    } else {
      fail_path_node(ray);
      record_termination_metrics(TERMINAL_SOURCE_KIND_AMBIENT_QUEUE_OVERFLOW, vec3<f32>(0.0));
      atomicAdd(&counters.terminatedCount, 1u);
    }
  }`;

const localIntersection = WAVEFRONT_INTERSECTION_BODY_WGSL
  .replace("hits[index] = make_miss(ray);\n    return;", "return make_miss(ray);")
  .replace("hits[index] = HitRecord(", "return HitRecord(")
  // Local trace queries already reconstructed mesh positions even when nested
  // transport was disabled. Preserve that behavior, calculating the error only
  // for nested transport; do not reconstruct twice in that branch.
  .replace("      position = optical_triangle_position(hitTriangle, candidate.barycentric);\n", "")
  .replace("var position = ray.origin.xyz + ray.direction.xyz * candidate.distance;",
    `var position = ray.origin.xyz + ray.direction.xyz * candidate.distance;
  if (candidate.triangleIndex != 0xffffffffu) { position = optical_triangle_position(hitTriangle, candidate.barycentric); }`);

export const WAVEFRONT_SHADER_KERNELS_WGSL = `
fn trace_material_hit_raw(ray: RayRecord) -> HitRecord {
${localIntersection}
}
fn trace_material_after(ray: RayRecord, minimumDistance: f32) -> HitRecord {
  optical_query_minimum = minimumDistance;
  let hit = trace_material_hit_raw(ray);
  optical_query_minimum = 0.0;
  return hit;
}
fn trace_material_hit(ray: RayRecord) -> HitRecord {
  return trace_material_after(ray, 0.0);
}
struct NestedIntersection { ray: RayRecord, hit: HitRecord, };
fn intersect_nested_ray(input: RayRecord) -> NestedIntersection {
  var ray = input;
  var hit = HitRecord();
  var travelled = 0.0;
  var minimumDistance = 0.0;
  // Numerical safety bound; exhausted traversal is rejected, never shaded.
  for (var crossing = 0u; crossing < 32u; crossing++) {
    hit = trace_material_after(ray, minimumDistance);
    if (hit.hitType == 5u) { return NestedIntersection(ray, hit); }
    if (hit.hitType != 2u && rough_dielectric_active(hit) && !medium_valid(hit.mediumRefId)) {
      hit.pad2 = 6.0; hit.hitType = 5u; return NestedIntersection(ray, hit);
    }
    if (hit.hitType != 2u && rough_dielectric_active(hit) && hit.material.z < 1.0) {
      hit.pad2 = 7.0; hit.hitType = 5u; return NestedIntersection(ray, hit);
    }
    if (hit.hitType == 2u || !dielectric_event(hit) || !medium_valid(hit.mediumRefId)) {
      if (hit.distance > 0.0) { hit.distance -= travelled; }
      return NestedIntersection(ray, hit);
    }
    if (recoverable_optical_entry(ray, hit)) {
      // Retry a numerically repeated adjacent entry without changing occupancy
      // or drawing another BSDF event. The shared crossing bound still applies.
      ray.throughput = vec4<f32>(ray.throughput.xyz * medium_transmittance(medium_stack_current_id(ray), hit.distance - travelled), ray.throughput.w);
      travelled = hit.distance;
      minimumDistance = hit.distance;
      continue;
    }
    if (medium_transition_invalid(ray, hit)) { hit.pad2 = f32(medium_transition_failure(ray, hit)); hit.hitType = 5u; return NestedIntersection(ray, hit); }
    if (medium_stack_current_id(ray) != transmitted_medium_ref_id(ray, hit)) {
      hit.distance -= travelled;
      return NestedIntersection(ray, hit);
    }
    // Hidden overlap boundary: account for distance, update occupancy, keep
    // sample ordinal/depth/direction/parent and all previous BSDF state intact.
    ray.throughput = vec4<f32>(ray.throughput.xyz * medium_transmittance(medium_stack_current_id(ray), hit.distance - travelled), ray.throughput.w);
    let nextId = transmitted_medium_ref_id(ray, hit);
    let nextDepth = transitioned_medium_stack_depth(ray, hit);
    ray.mediumStack = transitioned_medium_stack(ray, hit);
    ray.mediumStackDepth = nextDepth;
    ray.mediumRefId = nextId;
    travelled = hit.distance;
    minimumDistance = hit.distance;
  }
  hit.hitType = 5u;
  hit.pad2 = 5.0;
  return NestedIntersection(ray, hit);
}

fn emission_power(emission: vec4<f32>) -> f32 {
  return emission.x + emission.y + emission.z;
}

fn sample_weight() -> f32 {
  return max(config.projectionAndSampling.z, 0.000001);
}

fn sanitize_linear_radiance_component(value: f32) -> f32 {
  let resolved = select(0.0, value, value == value);
  return clamp(resolved, 0.0, 65504.0);
}

fn sanitize_linear_radiance(value: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(
    sanitize_linear_radiance_component(value.x),
    sanitize_linear_radiance_component(value.y),
    sanitize_linear_radiance_component(value.z)
  );
}

fn radiance_sample_is_invalid(value: vec3<f32>) -> bool {
  return
    value.x != value.x || value.y != value.y || value.z != value.z ||
    value.x < 0.0 || value.y < 0.0 || value.z < 0.0 ||
    abs(value.x) > 65504.0 || abs(value.y) > 65504.0 || abs(value.z) > 65504.0;
}

fn radiance_sample_exceeds_legacy_clamp(value: vec3<f32>) -> bool {
  return value.x > 4.0 || value.y > 4.0 || value.z > 4.0;
}

fn record_radiance_diagnostics(sample: vec3<f32>) {
  if (radiance_sample_is_invalid(sample)) {
    atomicAdd(&counters.termination.invalidSampleCount, 1u);
  }
  if (radiance_sample_exceeds_legacy_clamp(sample)) {
    atomicAdd(&counters.termination.legacyClampEquivalentCount, 1u);
  }
}

fn tone_map_radiance(value: vec3<f32>) -> vec3<f32> {
  let mapped = value / (vec3<f32>(1.0) + value);
  return pow(clamp(mapped, vec3<f32>(0.0), vec3<f32>(1.0)), vec3<f32>(1.0 / 2.2));
}

fn present_radiance(value: vec3<f32>) -> vec3<f32> {
  let linearOutput = clamp(sanitize_linear_radiance(value), vec3<f32>(0.0), vec3<f32>(1.0));
  return select(tone_map_radiance(value), linearOutput, config.pathResolveSettings.w > 0.5);
}

fn scaled_termination_luminance(radiance: vec3<f32>) -> u32 {
  let averageLuminance =
    radiance_luminance(max(radiance, vec3<f32>(0.0))) / max(f32(config.tilePixelCount), 1.0);
  return u32(min(4294967295.0, round(averageLuminance * TERMINATION_LUMINANCE_SCALE)));
}

fn record_transport_contribution(kind: u32, radiance: vec3<f32>) {
  let scaledLuminance = scaled_termination_luminance(radiance);
  if (kind == TRANSPORT_BUCKET_DIRECT_EXPLICIT) {
    atomicAdd(&counters.termination.transportDirectExplicitLuminanceScaled, scaledLuminance);
    return;
  }
  if (kind == TRANSPORT_BUCKET_CACHED_INDIRECT) {
    atomicAdd(&counters.termination.transportCachedIndirectLuminanceScaled, scaledLuminance);
    return;
  }
  if (kind == TRANSPORT_BUCKET_STOCHASTIC_RESIDUAL) {
    atomicAdd(&counters.termination.transportResidualLuminanceScaled, scaledLuminance);
  }
}

fn record_transport_checksum(pixelIndex: u32, radiance: vec3<f32>) {
  let scaledLuminance = scaled_termination_luminance(radiance);
  let weighted = (pixelIndex + 1u) * 2654435761u + (scaledLuminance + 1u) * 2246822519u;
  atomicAdd(&counters.termination.transportChecksum, weighted);
}

fn record_termination_metrics(kind: u32, radiance: vec3<f32>) {
  let scaledLuminance = scaled_termination_luminance(radiance);
  atomicAdd(&counters.termination.totalTerminalLuminanceScaled, scaledLuminance);
  if (
    max_component(radiance) <= 0.000001 &&
    (
      kind == TERMINAL_SOURCE_KIND_ABSORPTION_NULL ||
      kind == TERMINAL_SOURCE_KIND_RUSSIAN_ROULETTE ||
      kind == TERMINAL_SOURCE_KIND_MAX_DEPTH_STRICT ||
      kind == TERMINAL_SOURCE_KIND_AMBIENT_QUEUE_OVERFLOW ||
      kind == TERMINAL_SOURCE_KIND_DETERMINISTIC_RESIDUAL_ZERO
    )
  ) {
    atomicAdd(&counters.termination.transportZeroTerminationCount, 1u);
  }
  if (kind == TERMINAL_SOURCE_KIND_EMISSIVE) {
    atomicAdd(&counters.termination.emissiveCount, 1u);
    return;
  }
  if (kind == TERMINAL_SOURCE_KIND_ENVIRONMENT) {
    atomicAdd(&counters.termination.environmentCount, 1u);
    return;
  }
  if (kind == TERMINAL_SOURCE_KIND_AMBIENT_MAX_DEPTH) {
    atomicAdd(&counters.termination.ambientMaxDepthCount, 1u);
    atomicAdd(&counters.termination.ambientResidualLuminanceScaled, scaledLuminance);
    return;
  }
  if (kind == TERMINAL_SOURCE_KIND_AMBIENT_QUEUE_OVERFLOW) {
    atomicAdd(&counters.termination.ambientQueueOverflowCount, 1u);
    atomicAdd(&counters.termination.ambientResidualLuminanceScaled, scaledLuminance);
    return;
  }
  if (kind == TERMINAL_SOURCE_KIND_ABSORPTION_NULL) {
    atomicAdd(&counters.termination.absorptionNullCount, 1u);
    return;
  }
  if (kind == TERMINAL_SOURCE_KIND_RUSSIAN_ROULETTE) {
    atomicAdd(&counters.termination.russianRouletteCount, 1u);
    return;
  }
  if (kind == TERMINAL_SOURCE_KIND_MAX_DEPTH_STRICT) {
    atomicAdd(&counters.termination.strictMaxDepthCount, 1u);
    return;
  }
  if (kind == TERMINAL_SOURCE_KIND_DETERMINISTIC_RESIDUAL_ZERO) {
    atomicAdd(&counters.termination.deterministicResidualZeroCount, 1u);
    return;
  }
}

fn ray_workgroups_for_count(rayCount: u32) -> u32 {
  return max(1u, (rayCount + 63u) / 64u);
}

fn write_active_dispatch_args(activeCount: u32) {
  counters.dispatchX = ray_workgroups_for_count(activeCount);
  counters.dispatchY = 1u;
  counters.dispatchZ = 1u;
  counters.dispatchPad = 0u;
}

fn denoise_range_space(value: vec3<f32>) -> vec3<f32> {
  return value / (vec3<f32>(1.0) + value);
}

fn denoise_sample_count() -> f32 {
  return clamp(1.0 / max(config.projectionAndSampling.z, 0.000001), 1.0, 256.0);
}

fn denoise_strength() -> f32 {
  let spp = denoise_sample_count();
  return clamp(0.44 / sqrt(spp), 0.08, 0.44);
}

fn denoise_kernel_radius() -> i32 {
  return select(1i, 2i, denoise_sample_count() < 2.5);
}

@compute @workgroup_size(64)
fn generatePrimaryRays(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let index = globalId.x;
  if (index == 0u) {
    atomicStore(&counters.activeCount, config.tilePixelCount);
    atomicStore(&counters.nextCount, 0u);
    atomicStore(&counters.terminatedCount, 0u);
    atomicStore(&counters.hitCount, 0u);
    atomicStore(&counters.termination.emissiveCount, 0u);
    atomicStore(&counters.termination.environmentCount, 0u);
    atomicStore(&counters.termination.ambientMaxDepthCount, 0u);
    atomicStore(&counters.termination.ambientQueueOverflowCount, 0u);
    atomicStore(&counters.termination.ambientResidualLuminanceScaled, 0u);
    atomicStore(&counters.termination.totalTerminalLuminanceScaled, 0u);
    atomicStore(&counters.termination.invalidSampleCount, 0u);
    atomicStore(&counters.termination.legacyClampEquivalentCount, 0u);
    atomicStore(&counters.termination.absorptionNullCount, 0u);
    atomicStore(&counters.termination.russianRouletteCount, 0u);
    atomicStore(&counters.termination.strictMaxDepthCount, 0u);
    atomicStore(&counters.termination.deterministicResidualZeroCount, 0u);
    atomicStore(&counters.termination.transportDirectExplicitLuminanceScaled, 0u);
    atomicStore(&counters.termination.transportCachedIndirectLuminanceScaled, 0u);
    atomicStore(&counters.termination.transportResidualLuminanceScaled, 0u);
    atomicStore(&counters.termination.transportZeroTerminationCount, 0u);
    atomicStore(&counters.termination.transportChecksum, 0u);
    atomicStore(&counters.termination.transportPad0, 0u);
    if (config.tileX == 0u && config.tileY == 0u && u32(config.projectionAndSampling.w) == 0u) {
      atomicStore(&counters.termination.transportPad1, 0u);
    }
    atomicStore(&counters.termination.transportPad2, 0u);
    write_active_dispatch_args(config.tilePixelCount);
  }
  if (index >= config.tilePixelCount) {
    return;
  }
  activeQueue[index] = make_ray(index);
  if (u32(config.projectionAndSampling.w) == 0u) {
    accumulation[index] = vec4<f32>(0.0);
  }
}

@compute @workgroup_size(64)
fn intersectActiveQueue(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let index = globalId.x;
  let activeCount = atomicLoad(&counters.activeCount);
  if (index >= activeCount) {
    return;
  }
  let ray = activeQueue[index];
  if (nested_media_enabled()) {
    let result = intersect_nested_ray(ray);
    activeQueue[index] = result.ray;
    hits[index] = result.hit;
    return;
  }
${WAVEFRONT_INTERSECTION_BODY_WGSL}
}

fn surface_shading_normal(hit: HitRecord) -> vec3<f32> {
  let geometric = safe_normalize(hit.geometricNormal.xyz, vec3<f32>(0.0, 1.0, 0.0));
  return repair_shading_normal(geometric, hit.shadingNormal.xyz);
}

fn offset_origin(
  position: vec3<f32>,
  geometricNormal: vec3<f32>,
  shadingNormal: vec3<f32>,
  rayDirection: vec3<f32>
) -> vec3<f32> {
  let geometric = safe_normalize(geometricNormal, vec3<f32>(0.0, 1.0, 0.0));
  if (nested_media_enabled()) { return optical_offset(position, geometric, rayDirection); }
  let shading = repair_shading_normal(geometric, shadingNormal);
  let raySide = select(-1.0, 1.0, dot(rayDirection, geometric) >= 0.0);
  let orientedGeometric = geometric * raySide;
  var orientedShading = shading * raySide;
  if (dot(orientedShading, orientedGeometric) <= 0.0) {
    orientedShading = orientedGeometric;
  }
  let offsetNormal = safe_normalize(orientedGeometric + orientedShading, orientedGeometric);
  let positionScale = max(max(abs(position.x), abs(position.y)), abs(position.z));
  let positionAwareEpsilon = positionScale * 0.00000047683716;
  let offsetDistance = clamp(max(0.00025, positionAwareEpsilon), 0.00025, 0.01);
  return position + offsetNormal * offsetDistance;
}

fn offset_hit_origin(hit: HitRecord, direction: vec3<f32>) -> vec3<f32> {
  if (nested_media_enabled()) { return optical_offset_error(hit.position.xyz,hit.geometricNormal.xyz,direction,hit.pad2); }
  return offset_origin(hit.position.xyz,hit.geometricNormal.xyz,hit.shadingNormal.xyz,direction);
}

fn schlick(cosine: f32, refractionRatio: f32) -> f32 {
  var r0 = (1.0 - refractionRatio) / (1.0 + refractionRatio);
  r0 = r0 * r0;
  return r0 + (1.0 - r0) * pow(1.0 - cosine, 5.0);
}

fn refract_direction(unitDirection: vec3<f32>, normal: vec3<f32>, etaRatio: f32) -> vec3<f32> {
  let cosTheta = min(dot(-unitDirection, normal), 1.0);
  let rOutPerp = etaRatio * (unitDirection + cosTheta * normal);
  let rOutParallel = -sqrt(abs(1.0 - dot(rOutPerp, rOutPerp))) * normal;
  return safe_normalize(rOutPerp + rOutParallel, reflect(unitDirection, normal));
}

fn surface_supports_direct_lighting(hit: HitRecord) -> bool {
  if (rough_dielectric_active(hit)) {
    // A purely smooth dielectric has no continuous lobe for direct-light NEE.
    return hit.material.x > 0.02 || hit.materialExtension.z < 1.0;
  }
  let roughness = clamp(hit.material.x, 0.0, 1.0);
  let transmission = clamp(hit.materialExtension.z, 0.0, 1.0);
  let deltaMetal = hit.materialKind == 1u && roughness <= 0.02;
  let refractive = hit.materialKind == 2u || hit.materialKind == 3u || transmission > 0.001;
  return !(deltaMetal || refractive);
}

fn sample_emissive_triangle_direction(
  hit: HitRecord,
  pixelId: u32,
  sampleId: u32,
  bounce: u32,
  frameIndex: u32,
  fallback: vec3<f32>
) -> vec3<f32> {
  let lightSample = sample_emissive_triangle_light(
    hit,
    pixelId,
    sampleId,
    bounce,
    frameIndex,
    SAMPLE_DIM_GUIDED_EMISSIVE_SELECTION,
    SAMPLE_DIM_GUIDED_EMISSIVE_SURFACE
  );
  if (lightSample.valid == 0u) {
    return fallback;
  }
  return safe_normalize(lightSample.direction.xyz, fallback);
}

fn sample_environment_portal_direction(
  hit: HitRecord,
  pixelId: u32,
  sampleId: u32,
  bounce: u32,
  frameIndex: u32,
  fallback: vec3<f32>
) -> vec3<f32> {
  if (config.environmentPortalCount == 0u || config.environmentPortalMode == 0u) {
    return fallback;
  }
  let portalSlot = min(
    u32(
      sample_dimension_1d(pixelId, sampleId, bounce, frameIndex, SAMPLE_DIM_GUIDED_PORTAL_SELECTION) *
      f32(config.environmentPortalCount)
    ),
    config.environmentPortalCount - 1u
  );
  let portal = environmentPortals[portalSlot];
  let portalUv = sample_dimension_2d(
    pixelId,
    sampleId,
    bounce,
    frameIndex,
    SAMPLE_DIM_GUIDED_PORTAL_SURFACE,
    config.samplesPerPixel
  ) * 2.0 - vec2<f32>(1.0);
  let u = portalUv.x * portal.tangent.w;
  let v = portalUv.y * portal.bitangent.w;
  let portalTarget = portal.position.xyz + portal.tangent.xyz * u + portal.bitangent.xyz * v;
  return safe_normalize(portalTarget - hit.position.xyz, fallback);
}

fn dielectric_event(hit: HitRecord) -> bool {
  // Match scatter precedence: an ideal metal is reflective, never refractive.
  if (hit.materialKind == 1u && clamp(hit.material.x, 0.0, 1.0) <= 0.02) { return false; }
  return hit.materialKind == 2u || hit.materialKind == 3u || clamp(hit.materialExtension.z, 0.0, 1.0) > 0.001;
}

fn dielectric_eta(hit: HitRecord) -> f32 {
  let ior = max(hit.material.w, 1.01);
  return select(ior, 1.0 / ior, hit.frontFace == 1u);
}

fn dielectric_cannot_refract(ray: RayRecord, hit: HitRecord) -> bool {
  let cosTheta = min(dot(-ray.direction.xyz, optical_shading_normal(ray, hit)), 1.0);
  return dielectric_ratio(ray, hit) * sqrt(max(0.0, 1.0 - cosTheta * cosTheta)) > 1.0;
}

fn scatter_direction(ray: RayRecord, hit: HitRecord) -> ScatterResult {
  let normal = surface_shading_normal(hit);
  let viewDirection = safe_normalize(-ray.direction.xyz, normal);
  let roughness = clamp(hit.material.x, 0.0, 1.0);
  let transmission = clamp(hit.materialExtension.z, 0.0, 1.0);
  if (hit.materialKind == 1u && roughness <= 0.02) {
    return ScatterResult(
      vec4<f32>(reflect(ray.direction.xyz, normal), 0.0),
      1.0,
      ray.mediumRefId,
      RAY_FLAG_DELTA_SAMPLE,
      SCATTER_LOBE_DELTA_REFLECTION,
    );
  }

  if (dielectric_event(hit)) {
    if (rough_dielectric_active(hit)) { return scatter_rough_dielectric(ray, hit); }
    return scatter_dielectric(ray, hit);
  }

  let guidedEmissiveAvailable = config.emissiveTriangleCount > 0u;
  let guidedPortalAvailable =
    config.environmentPortalCount > 0u && config.environmentPortalMode != 0u;
  let guidedSelector = sample_dimension_1d(
    ray.sourcePixelId,
    ray.sampleId,
    ray.bounce,
    config.frameIndex,
    SAMPLE_DIM_GUIDED_LIGHT_SELECTOR
  );
  if (guidedEmissiveAvailable && guidedSelector < 0.18) {
    let guidedDirection = sample_emissive_triangle_direction(
      hit,
      ray.sourcePixelId,
      ray.sampleId,
      ray.bounce,
      config.frameIndex,
      normal
    );
    if (dot(normal, guidedDirection) > 0.000001) {
      let guidedPdf = max(evaluate_surface_bsdf_pdf(hit, viewDirection, guidedDirection), 0.000001);
      return ScatterResult(
        vec4<f32>(guidedDirection, 0.0),
        guidedPdf,
        ray.mediumRefId,
        RAY_FLAG_GUIDED_EMISSIVE,
        SCATTER_LOBE_DIFFUSE,
      );
    }
  }
  if (guidedPortalAvailable && guidedSelector < 0.32) {
    let guidedDirection = sample_environment_portal_direction(
      hit,
      ray.sourcePixelId,
      ray.sampleId,
      ray.bounce,
      config.frameIndex,
      normal
    );
    if (dot(normal, guidedDirection) > 0.000001) {
      let guidedPdf = max(evaluate_surface_bsdf_pdf(hit, viewDirection, guidedDirection), 0.000001);
      return ScatterResult(
        vec4<f32>(guidedDirection, 0.0),
        guidedPdf,
        ray.mediumRefId,
        0u,
        SCATTER_LOBE_DIFFUSE
      );
    }
  }

  let weights = surface_bsdf_sampling_weights(hit);
  let selector = sample_dimension_1d(
    ray.sourcePixelId,
    ray.sampleId,
    ray.bounce,
    config.frameIndex,
    SAMPLE_DIM_BSDF_LOBE_SELECTOR
  );
  var lightDirection = normal;
  var lobeKind = SCATTER_LOBE_DIFFUSE;
  if (selector < weights.x) {
    let diffuseSample = sample_dimension_2d(
      ray.sourcePixelId,
      ray.sampleId,
      ray.bounce,
      config.frameIndex,
      SAMPLE_DIM_DIFFUSE_HEMISPHERE,
      config.samplesPerPixel
    );
    lightDirection = cosine_sample_hemisphere(
      diffuseSample,
      normal
    );
    lobeKind = SCATTER_LOBE_DIFFUSE;
  } else if (selector < weights.x + weights.y) {
    let specularSample = sample_dimension_2d(
      ray.sourcePixelId,
      ray.sampleId,
      ray.bounce,
      config.frameIndex,
      SAMPLE_DIM_SPECULAR_HALF_VECTOR,
      config.samplesPerPixel
    );
    let halfVector = importance_sample_ggx(
      specularSample,
      max(roughness, 0.02),
      normal
    );
    lightDirection = safe_normalize(reflect(-viewDirection, halfVector), normal);
    lobeKind = SCATTER_LOBE_SPECULAR;
  } else {
    let clearcoatSample = sample_dimension_2d(
      ray.sourcePixelId,
      ray.sampleId,
      ray.bounce,
      config.frameIndex,
      SAMPLE_DIM_CLEARCOAT_HALF_VECTOR,
      config.samplesPerPixel
    );
    let halfVector = importance_sample_ggx(
      clearcoatSample,
      max(clamp(hit.materialExtension.x, 0.0, 1.0), 0.02),
      surface_clearcoat_normal(hit)
    );
    if (layered_clearcoat_active(hit) && dot(viewDirection, halfVector) <= 0.0) {
      return ScatterResult(vec4<f32>(normal, 0.0), 0.0, ray.mediumRefId, 0u, SCATTER_LOBE_CLEARCOAT);
    }
    lightDirection = safe_normalize(reflect(-viewDirection, halfVector), normal);
    lobeKind = SCATTER_LOBE_CLEARCOAT;
  }
  if (dot(normal, lightDirection) <= 0.000001) {
    // A rejected GGX proposal is a null event, not a different cosine proposal.
    if (layered_clearcoat_active(hit)) {
      return ScatterResult(vec4<f32>(lightDirection, 0.0), 0.0, ray.mediumRefId, 0u, lobeKind);
    }
    let fallbackSample = sample_dimension_2d(
      ray.sourcePixelId,
      ray.sampleId,
      ray.bounce,
      config.frameIndex,
      SAMPLE_DIM_FALLBACK_HEMISPHERE,
      config.samplesPerPixel
    );
    lightDirection = cosine_sample_hemisphere(
      fallbackSample,
      normal
    );
    lobeKind = SCATTER_LOBE_DIFFUSE;
  }
  let pdf = max(evaluate_surface_bsdf_pdf(hit, viewDirection, lightDirection), 0.000001);
  return ScatterResult(vec4<f32>(lightDirection, 0.0), pdf, ray.mediumRefId, 0u, lobeKind);
}

// Camera visibility has no competing next-event sample. Preserve the existing
// terminal MIS only for non-delta secondary rays.
fn terminal_mis_enabled(ray: RayRecord) -> bool {
  return ray.bounce > 0u && (ray.flags & (RAY_FLAG_DELTA_SAMPLE | RAY_FLAG_NO_COMPETING_NEE)) == 0u;
}

fn continuation_environment_direction(ray: RayRecord, hit: HitRecord, scatter: ScatterResult) -> vec4<f32> {
  var pdf = 0.0;
  if (surface_supports_direct_lighting(hit) &&
      (scatter.flags & (RAY_FLAG_DELTA_SAMPLE | RAY_FLAG_NO_COMPETING_NEE)) == 0u) {
    var normal = surface_shading_normal(hit);
    if (rough_dielectric_active(hit)) { normal = optical_shading_normal(ray, hit); }
    pdf = environment_nee_direction_pdf(normal, scatter.direction.xyz);
  }
  return vec4<f32>(scatter.direction.xyz, pdf);
}

@compute @workgroup_size(64)
fn resolveSurfaceRecords(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let index = globalId.x;
  let activeCount = atomicLoad(&counters.activeCount);
  if (index >= activeCount) {
    return;
  }

  var ray = begin_path_node(activeQueue[index], index);
  var hit = hits[index];
${WAVEFRONT_SURFACE_BODY_WGSL}
}

@compute @workgroup_size(1)
fn compactAndSwapQueues(@builtin(global_invocation_id) globalId: vec3<u32>) {
  if (globalId.x > 0u) {
    return;
  }
  let nextCount = atomicLoad(&counters.nextCount);
  let activeCount = min(nextCount, config.tilePixelCount);
  atomicStore(&counters.activeCount, activeCount);
  atomicStore(&counters.nextCount, 0u);
  write_active_dispatch_args(activeCount);
}

@compute @workgroup_size(64)
fn accumulateTerminalRadiance(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let index = globalId.x;
  if (index >= config.tilePixelCount) { return; }
  let localX = index % config.tileWidth;
  let localY = index / config.tileWidth;
  let pixel = vec2<i32>(i32(config.tileX + localX), i32(config.tileY + localY));
  let sourcePixelId = (config.tileY + localY) * config.canvasWidth + config.tileX + localX;
  let sampleId = u32(config.projectionAndSampling.w);
  let completed = resolve_complete_path_tree(index, sourcePixelId, sampleId);
  let failed = completed.w != 1.0 || accumulation[index].w < 0.0;
  if (failed) {
    // Sticky across all samples of this tile. Invalid paths never become an
    // accepted darker camera sample, even if subsequent samples succeed.
    accumulation[index] = vec4<f32>(0.0, 0.0, 0.0, -1.0);
    atomicStore(&counters.termination.transportPad1, 1u);
    textureStore(radianceImage, pixel, vec4<f32>(0.0));
    textureStore(outputImage, pixel, vec4<f32>(1.0, 0.0, 1.0, 0.0));
    return;
  }
  let radiance = sanitize_linear_radiance(accumulation[index].xyz + completed.xyz);
  accumulation[index] = vec4<f32>(radiance, accumulation[index].w + 1.0);
  record_transport_checksum(index, radiance);
  textureStore(radianceImage, pixel, vec4<f32>(radiance, 1.0));
  if (config.denoise == 0u) {
    textureStore(outputImage, pixel, vec4<f32>(present_radiance(radiance), 1.0));
  }
}

@compute @workgroup_size(8, 8)
fn denoiseLinearRadiance(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let x = globalId.x;
  let y = globalId.y;
  if (x >= config.canvasWidth || y >= config.canvasHeight) {
    return;
  }

  let pixel = vec2<i32>(i32(x), i32(y));
  let centerSample = textureLoad(denoiseInputRadiance, pixel, 0);
  if (centerSample.w == 0.0) {
    textureStore(denoisedRadianceImage, pixel, vec4<f32>(0.0));
    return;
  }
  let center = centerSample.xyz;
  let strength = denoise_strength();
  let kernelRadius = denoise_kernel_radius();
  let centerWeight = 1.7 - strength * 0.35;
  var sum = center * centerWeight;
  var totalWeight = centerWeight;
  let centerRange = denoise_range_space(center);

  for (var oy = -2i; oy <= 2i; oy = oy + 1i) {
    for (var ox = -2i; ox <= 2i; ox = ox + 1i) {
      if (ox == 0i && oy == 0i) {
        continue;
      }
      if (abs(ox) > kernelRadius || abs(oy) > kernelRadius) {
        continue;
      }
      let sx = clamp(i32(x) + ox, 0i, i32(config.canvasWidth) - 1i);
      let sy = clamp(i32(y) + oy, 0i, i32(config.canvasHeight) - 1i);
      let neighbour = textureLoad(denoiseInputRadiance, vec2<i32>(sx, sy), 0);
      if (neighbour.w == 0.0) { continue; }
      let sampleColor = neighbour.xyz;
      let colorDistance = length(denoise_range_space(sampleColor) - centerRange);
      let rangeWeight = 1.0 / (1.0 + colorDistance * (11.0 + strength * 6.0));
      let distanceWeight = 1.0 / (1.0 + f32(ox * ox + oy * oy) * (0.62 + strength * 0.24));
      let diagonalWeight = select(1.0, 0.92, abs(ox) + abs(oy) > 1i);
      let weight = rangeWeight * diagonalWeight * distanceWeight;
      sum = sum + sampleColor * weight;
      totalWeight = totalWeight + weight;
    }
  }

  let filtered = sum / max(totalWeight, 0.0001);
  let outlier = saturate(length(denoise_range_space(center) - denoise_range_space(filtered)) * 2.1);
  let blend = min(0.3, strength * (0.62 + outlier * 0.12));
  let color = min(mix(center, filtered, blend), vec3<f32>(16.0));
  textureStore(denoisedRadianceImage, pixel, vec4<f32>(color, 1.0));
}

@compute @workgroup_size(8, 8)
fn resolveDenoisedOutputImage(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let x = globalId.x;
  let y = globalId.y;
  if (x >= config.canvasWidth || y >= config.canvasHeight) {
    return;
  }

  let pixel = vec2<i32>(i32(x), i32(y));
  let centerSample = textureLoad(finalDenoiseInputRadiance, pixel, 0);
  if (centerSample.w == 0.0) {
    textureStore(denoisedOutputImage, pixel, vec4<f32>(1.0, 0.0, 1.0, 0.0));
    return;
  }
  let center = centerSample.xyz;
  let strength = denoise_strength();
  let centerWeight = 1.35 - strength * 0.25;
  var sum = center * centerWeight;
  var totalWeight = centerWeight;
  let centerRange = denoise_range_space(center);

  for (var oy = -1i; oy <= 1i; oy = oy + 1i) {
    for (var ox = -1i; ox <= 1i; ox = ox + 1i) {
      if (ox == 0i && oy == 0i) {
        continue;
      }
      let sx = clamp(i32(x) + ox, 0i, i32(config.canvasWidth) - 1i);
      let sy = clamp(i32(y) + oy, 0i, i32(config.canvasHeight) - 1i);
      let neighbour = textureLoad(finalDenoiseInputRadiance, vec2<i32>(sx, sy), 0);
      if (neighbour.w == 0.0) { continue; }
      let sampleColor = neighbour.xyz;
      let colorDistance = length(denoise_range_space(sampleColor) - centerRange);
      let rangeWeight = 1.0 / (1.0 + colorDistance * (12.0 + strength * 8.0));
      let distanceWeight = 1.0 / (1.0 + f32(ox * ox + oy * oy) * (0.82 + strength * 0.28));
      let weight = rangeWeight * distanceWeight;
      sum = sum + sampleColor * weight;
      totalWeight = totalWeight + weight;
    }
  }

  let filtered = sum / max(totalWeight, 0.0001);
  let outlier = saturate(length(denoise_range_space(center) - denoise_range_space(filtered)) * 2.2);
  let blend = min(0.18, strength * (0.42 + outlier * 0.08));
  let radiance = min(mix(center, filtered, blend), vec3<f32>(16.0));
  textureStore(denoisedOutputImage, pixel, vec4<f32>(present_radiance(radiance), 1.0));
}
`;
