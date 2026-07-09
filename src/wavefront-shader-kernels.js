export const WAVEFRONT_SHADER_KERNELS_WGSL = `
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
    atomicStore(&counters.termination.transportPad1, 0u);
    atomicStore(&counters.termination.transportPad2, 0u);
    write_active_dispatch_args(config.tilePixelCount);
  }
  if (index >= config.tilePixelCount) {
    return;
  }
  activeQueue[index] = make_ray(index);
  clear_deferred_path(index);
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
  var nearest = 1000000.0;
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
  var hitTriangle = TriangleRecord(
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
    vec4<f32>(0.0, 1.0, 0.0, 0.0),
    vec4<f32>(0.0, 1.0, 0.0, 0.0),
    vec4<f32>(0.0, 1.0, 0.0, 0.0),
    vec4<f32>(0.0),
    vec4<f32>(0.0),
    vec4<f32>(0.0),
    vec4<f32>(0.0),
    vec4<f32>(1.0, 0.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 0.0, 0.08),
    vec4<f32>(0.08, 1.0, 0.0, 0.0),
    vec4<f32>(1.0, 1.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 1.0, 1.0),
    vec4<f32>(1.0, 1.0, 1.0, 0.0)
  );

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

  let position = ray.origin.xyz + ray.direction.xyz * candidate.distance;
  let hitMaterialKind = select(hitObject.materialKind, hitTriangle.materialKind, candidate.triangleIndex != 0xffffffffu);
  let hitObjectId = select(hitObject.objectId, hitTriangle.meshId, candidate.triangleIndex != 0xffffffffu);
  let meshSurface = sample_surface_material(
    hitTriangle,
    candidate.uv,
    candidate.geometricNormal,
    candidate.shadingNormal
  );
  let hitColor = select(hitObject.color, meshSurface.color, candidate.triangleIndex != 0xffffffffu);
  let hitEmission = select(hitObject.emission, meshSurface.emission, candidate.triangleIndex != 0xffffffffu);
  let hitMaterial = select(hitObject.material, meshSurface.material, candidate.triangleIndex != 0xffffffffu);
  let hitMaterialResponse = select(hitObject.materialResponse, meshSurface.materialResponse, candidate.triangleIndex != 0xffffffffu);
  let hitMaterialExtension = select(hitObject.materialExtension, meshSurface.materialExtension, candidate.triangleIndex != 0xffffffffu);
  let hitSpecularColor = select(hitObject.specularColor, meshSurface.specularColor, candidate.triangleIndex != 0xffffffffu);
  let hitShadingNormal = select(candidate.shadingNormal, meshSurface.shadingNormal, candidate.triangleIndex != 0xffffffffu);
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
    0u,
    0u,
    candidate.distance,
    hitOcclusion,
    vec2<f32>(0.0),
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
  );
}

fn surface_shading_normal(hit: HitRecord) -> vec3<f32> {
  let geometric = safe_normalize(hit.geometricNormal.xyz, vec3<f32>(0.0, 1.0, 0.0));
  return repair_shading_normal(geometric, hit.shadingNormal.xyz);
}

fn resolve_indirect_probe_hit(ray: RayRecord) -> HitRecord {
  var nearest = 1000000.0;
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
  var hitTriangle = TriangleRecord(
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
    vec4<f32>(0.0, 1.0, 0.0, 0.0),
    vec4<f32>(0.0, 1.0, 0.0, 0.0),
    vec4<f32>(0.0, 1.0, 0.0, 0.0),
    vec4<f32>(0.0),
    vec4<f32>(0.0),
    vec4<f32>(0.0),
    vec4<f32>(0.0),
    vec4<f32>(1.0, 0.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 0.0, 0.08),
    vec4<f32>(0.08, 1.0, 0.0, 0.0),
    vec4<f32>(1.0, 1.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 1.0, 1.0),
    vec4<f32>(1.0, 1.0, 1.0, 0.0)
  );

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
    return make_miss(ray);
  }

  let position = ray.origin.xyz + ray.direction.xyz * candidate.distance;
  let fromMesh = candidate.triangleIndex != 0xffffffffu;
  let hitMaterialKind = select(hitObject.materialKind, hitTriangle.materialKind, fromMesh);
  let hitObjectId = select(hitObject.objectId, hitTriangle.meshId, fromMesh);
  let meshSurface = sample_surface_material(
    hitTriangle,
    candidate.uv,
    candidate.geometricNormal,
    candidate.shadingNormal
  );
  let hitColor = select(hitObject.color, meshSurface.color, fromMesh);
  let hitEmission = select(hitObject.emission, meshSurface.emission, fromMesh);
  let hitMaterial = select(hitObject.material, meshSurface.material, fromMesh);
  let hitMaterialResponse = select(hitObject.materialResponse, meshSurface.materialResponse, fromMesh);
  let hitMaterialExtension = select(hitObject.materialExtension, meshSurface.materialExtension, fromMesh);
  let hitSpecularColor = select(hitObject.specularColor, meshSurface.specularColor, fromMesh);
  let hitShadingNormal = select(candidate.shadingNormal, meshSurface.shadingNormal, fromMesh);
  let hitPrimitiveId = select(candidate.primitiveId, hitTriangle.triangleId, fromMesh);
  let hitMaterialRefId = select(candidate.materialRefId, hitTriangle.materialRefId, fromMesh);
  let hitMediumRefId = select(candidate.mediumRefId, hitTriangle.mediumRefId, fromMesh);
  let hitMaterialSlot = select(0u, hitTriangle.materialSlot, fromMesh);
  let hitOcclusion = select(1.0, meshSurface.occlusion, fromMesh);
  var hitType = 0u;
  if (hitMaterialKind == 4u || emission_power(hitEmission) > 0.0001) {
    hitType = 1u;
  } else if (hitMaterialKind == 3u || hitMaterial.z < 0.999 || hitMaterialExtension.z > 0.001) {
    hitType = 3u;
  }
  return HitRecord(
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
    0u,
    0u,
    candidate.distance,
    hitOcclusion,
    vec2<f32>(0.0),
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
  );
}

fn offset_origin(
  position: vec3<f32>,
  geometricNormal: vec3<f32>,
  shadingNormal: vec3<f32>,
  rayDirection: vec3<f32>
) -> vec3<f32> {
  let geometric = safe_normalize(geometricNormal, vec3<f32>(0.0, 1.0, 0.0));
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

  if (hit.materialKind == 2u || hit.materialKind == 3u || transmission > 0.001) {
    let ior = max(hit.material.w, 1.01);
    let etaRatio = select(ior, 1.0 / ior, hit.frontFace == 1u);
    let cosTheta = min(dot(-ray.direction.xyz, normal), 1.0);
    let sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));
    let cannotRefract = etaRatio * sinTheta > 1.0;
    let reflectChance = schlick(cosTheta, etaRatio);
    let transmissionReflectChance = select(
      reflectChance,
      max(reflectChance, 1.0 - transmission),
      transmission > 0.001
    );
    let transmissionSelector = sample_dimension_1d(
      ray.sourcePixelId,
      ray.sampleId,
      ray.bounce,
      config.frameIndex,
      SAMPLE_DIM_TRANSMISSION_SELECTOR
    );
    if (cannotRefract || transmissionSelector < transmissionReflectChance) {
      return ScatterResult(
        vec4<f32>(reflect(ray.direction.xyz, normal), 0.0),
        1.0,
        ray.mediumRefId,
        RAY_FLAG_DELTA_SAMPLE,
        SCATTER_LOBE_DELTA_REFLECTION,
      );
    }
    return ScatterResult(
      vec4<f32>(refract_direction(ray.direction.xyz, normal, etaRatio), 0.0),
      1.0,
      transmitted_medium_ref_id(ray, hit),
      RAY_FLAG_DELTA_SAMPLE,
      SCATTER_LOBE_DELTA_TRANSMISSION,
    );
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
      normal
    );
    lightDirection = safe_normalize(reflect(-viewDirection, halfVector), normal);
    lobeKind = SCATTER_LOBE_CLEARCOAT;
  }
  if (dot(normal, lightDirection) <= 0.000001) {
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

fn deterministic_low_spp_indirect_enabled() -> bool {
  return
    strict_physical_low_spp_lighting_enabled() &&
    transport_experiment_enabled(TRANSPORT_EXPERIMENT_DETERMINISTIC_LOW_SPP_INDIRECT) &&
    config.samplesPerPixel <= 4u;
}

fn deterministic_low_spp_probe_count() -> u32 {
  return 2u;
}

fn deterministic_low_spp_probe_direct_radiance(probeRay: RayRecord, probeHit: HitRecord) -> vec3<f32> {
  if (probeHit.hitType == 1u) {
    var sourceRadiance = max(probeHit.emission.xyz, probeHit.color.xyz);
    if ((probeRay.flags & RAY_FLAG_DELTA_SAMPLE) == 0u) {
      let bsdfPdf = max(probeRay.throughput.w, 0.000001);
      let lightPdf = terminal_emissive_light_pdf(probeRay, probeHit);
      if (lightPdf > 0.000001) {
        sourceRadiance = sourceRadiance * power_heuristic(bsdfPdf, lightPdf);
      }
    }
    return sourceRadiance;
  }
  if (probeHit.hitType == 2u) {
    var sourceRadiance = probeHit.color.xyz;
    if ((probeRay.flags & RAY_FLAG_DELTA_SAMPLE) == 0u) {
      let bsdfPdf = max(probeRay.throughput.w, 0.000001);
      let lightPdf = environment_direction_pdf(probeRay.direction.xyz);
      sourceRadiance = sourceRadiance * power_heuristic(bsdfPdf, lightPdf);
    }
    return sourceRadiance;
  }
  if (!surface_supports_direct_lighting(probeHit)) {
    return vec3<f32>(0.0);
  }
  let directRay = RayRecord(
    probeRay.rayId,
    probeRay.parentRayId,
    probeRay.sourcePixelId,
    probeRay.sampleId,
    probeRay.bounce,
    probeRay.mediumRefId,
    probeRay.flags,
    0u,
    probeRay.origin,
    probeRay.direction,
    vec4<f32>(1.0, 1.0, 1.0, probeRay.throughput.w)
  );
  return sanitize_linear_radiance(
    surface_direct_light_contribution(directRay, probeHit) +
    surface_procedural_sun_contribution(directRay, probeHit)
  );
}

fn deterministic_low_spp_cached_indirect(ray: RayRecord, hit: HitRecord, segmentTransmittance: vec3<f32>) -> vec3<f32> {
  if (!deterministic_low_spp_indirect_enabled() || !surface_supports_direct_lighting(hit)) {
    return vec3<f32>(0.0);
  }
  let normal = surface_shading_normal(hit);
  let viewDirection = safe_normalize(-ray.direction.xyz, normal);
  let probeCount = deterministic_low_spp_probe_count();
  var radiance = vec3<f32>(0.0);
  for (var probeIndex = 0u; probeIndex < probeCount; probeIndex = probeIndex + 1u) {
    let sample = hammersley_2d(probeIndex, probeCount);
    let probeDirection = cosine_sample_hemisphere(sample, normal);
    let probePdf = max(cosine_hemisphere_pdf(normal, probeDirection), 0.000001);
    let scatter = ScatterResult(
      vec4<f32>(probeDirection, 0.0),
      probePdf,
      ray.mediumRefId,
      0u,
      SCATTER_LOBE_DIFFUSE
    );
    let continuationThroughput =
      surface_continuation_throughput(hit, viewDirection, probeDirection, scatter) *
      segmentTransmittance;
    if (max_component(continuationThroughput) <= 0.000001) {
      continue;
    }
    let probeOrigin = offset_origin(
      hit.position.xyz,
      hit.geometricNormal.xyz,
      hit.shadingNormal.xyz,
      probeDirection
    );
    let probeRay = RayRecord(
      ray.rayId,
      ray.rayId,
      ray.sourcePixelId,
      ray.sampleId,
      ray.bounce + 1u,
      scatter.mediumRefId,
      0u,
      0u,
      vec4<f32>(probeOrigin, 1.0),
      vec4<f32>(probeDirection, 0.0),
      vec4<f32>(1.0, 1.0, 1.0, probePdf)
    );
    let probeHit = resolve_indirect_probe_hit(probeRay);
    let incoming = deterministic_low_spp_probe_direct_radiance(probeRay, probeHit);
    radiance = radiance + ray.throughput.xyz * continuationThroughput * incoming;
  }
  return sanitize_linear_radiance(radiance / max(f32(probeCount), 1.0));
}

@compute @workgroup_size(64)
fn resolveSurfaceRecords(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let index = globalId.x;
  let activeCount = atomicLoad(&counters.activeCount);
  if (index >= activeCount) {
    return;
  }

  let ray = activeQueue[index];
  let hit = hits[index];
  let segmentTransmittance = medium_transmittance(ray.mediumRefId, hit.distance);
  let arrivingThroughput = ray.throughput.xyz * segmentTransmittance;
  var contribution = vec3<f32>(0.0);

  if (hit.hitType == 1u) {
    let guidedLightWeight = select(1.0, 0.24, (ray.flags & RAY_FLAG_GUIDED_EMISSIVE) != 0u);
    var sourceRadiance = max(hit.emission.xyz, hit.color.xyz) * guidedLightWeight;
    if ((ray.flags & RAY_FLAG_DELTA_SAMPLE) == 0u) {
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
      record_radiance_diagnostics(rawWeightedContribution);
      let weightedContribution = sanitize_linear_radiance(rawWeightedContribution);
      record_termination_metrics(TERMINAL_SOURCE_KIND_EMISSIVE, weightedContribution);
      accumulation[ray.rayId] =
        accumulation[ray.rayId] + vec4<f32>(weightedContribution, 1.0);
    }
    atomicAdd(&counters.terminatedCount, 1u);
    return;
  }

  if (hit.hitType == 2u) {
    var sourceRadiance = hit.color.xyz;
    if ((ray.flags & RAY_FLAG_DELTA_SAMPLE) == 0u) {
      let bsdfPdf = max(ray.throughput.w, 0.000001);
      let lightPdf = environment_direction_pdf(ray.direction.xyz);
      let misWeight = power_heuristic(bsdfPdf, lightPdf);
      sourceRadiance = sourceRadiance * misWeight;
    }
    if (deferred_path_resolve_enabled()) {
      record_deferred_terminal_source(
        ray,
        sourceRadiance * segmentTransmittance,
        TERMINAL_SOURCE_KIND_ENVIRONMENT
      );
    } else {
      let rawWeightedContribution = arrivingThroughput * sourceRadiance * sample_weight();
      record_radiance_diagnostics(rawWeightedContribution);
      let weightedContribution = sanitize_linear_radiance(rawWeightedContribution);
      record_termination_metrics(TERMINAL_SOURCE_KIND_ENVIRONMENT, weightedContribution);
      accumulation[ray.rayId] =
        accumulation[ray.rayId] + vec4<f32>(weightedContribution, 1.0);
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
        0u,
        ray.origin,
        ray.direction,
        vec4<f32>(arrivingThroughput, ray.throughput.w)
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
        0u,
        ray.origin,
        ray.direction,
        vec4<f32>(arrivingThroughput, ray.throughput.w)
      ),
      hit
    );
    let rawDirectLight = (directLight + sunLight) * sample_weight();
    record_radiance_diagnostics(rawDirectLight);
    let weightedDirectLight = sanitize_linear_radiance(rawDirectLight);
    record_transport_contribution(TRANSPORT_BUCKET_DIRECT_EXPLICIT, weightedDirectLight);
    accumulation[ray.rayId] =
      accumulation[ray.rayId] + vec4<f32>(weightedDirectLight, 0.0);
  }

  if (deterministic_low_spp_indirect_enabled() && shouldEstimateDirectLight) {
    let cachedIndirect = deterministic_low_spp_cached_indirect(
      ray,
      hit,
      segmentTransmittance
    );
    let rawCachedIndirect = cachedIndirect * sample_weight();
    record_radiance_diagnostics(rawCachedIndirect);
    let weightedCachedIndirect = sanitize_linear_radiance(rawCachedIndirect);
    record_transport_contribution(TRANSPORT_BUCKET_CACHED_INDIRECT, weightedCachedIndirect);
    accumulation[ray.rayId] =
      accumulation[ray.rayId] + vec4<f32>(weightedCachedIndirect, 0.0);
    if (deferred_path_resolve_enabled()) {
      record_deferred_terminal_source(
        ray,
        vec3<f32>(0.0),
        TERMINAL_SOURCE_KIND_DETERMINISTIC_RESIDUAL_ZERO
      );
    } else {
      record_termination_metrics(
        TERMINAL_SOURCE_KIND_DETERMINISTIC_RESIDUAL_ZERO,
        vec3<f32>(0.0)
      );
    }
    atomicAdd(&counters.terminatedCount, 1u);
    return;
  }

  if (ray.bounce + 1u >= config.maxDepth) {
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
      record_radiance_diagnostics(rawWeightedContribution);
      let weightedContribution = sanitize_linear_radiance(rawWeightedContribution);
      record_termination_metrics(TERMINAL_SOURCE_KIND_AMBIENT_MAX_DEPTH, weightedContribution);
      accumulation[ray.rayId] =
        accumulation[ray.rayId] + vec4<f32>(weightedContribution, 1.0);
    }
    atomicAdd(&counters.terminatedCount, 1u);
    return;
  }

  let scatter = scatter_direction(ray, hit);
  let continuationNormal = surface_shading_normal(hit);
  let continuationViewDirection = safe_normalize(-ray.direction.xyz, continuationNormal);
  let continuationLightDirection = safe_normalize(scatter.direction.xyz, continuationNormal);
  var continuationThroughput = surface_continuation_throughput(
    hit,
    continuationViewDirection,
    continuationLightDirection,
    scatter
  ) * segmentTransmittance;
  if (max_component(continuationThroughput) <= 0.000001) {
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
      record_radiance_diagnostics(rawWeightedContribution);
      let weightedContribution = sanitize_linear_radiance(rawWeightedContribution);
      record_termination_metrics(TERMINAL_SOURCE_KIND_AMBIENT_MAX_DEPTH, weightedContribution);
      accumulation[ray.rayId] =
        accumulation[ray.rayId] + vec4<f32>(weightedContribution, 1.0);
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
    let survivalProbability = clamp(max_component(continuationThroughput), 0.05, 0.95);
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
        record_termination_metrics(TERMINAL_SOURCE_KIND_RUSSIAN_ROULETTE, vec3<f32>(0.0));
      }
      atomicAdd(&counters.terminatedCount, 1u);
      return;
    }
    continuationThroughput = continuationThroughput / survivalProbability;
  }
  let nextIndex = atomicAdd(&counters.nextCount, 1u);
  if (nextIndex >= config.tilePixelCount) {
    if (deferred_path_resolve_enabled()) {
      if (strict_physical_low_spp_lighting_enabled()) {
        record_deferred_terminal_source(
          ray,
          vec3<f32>(0.0),
          TERMINAL_SOURCE_KIND_AMBIENT_QUEUE_OVERFLOW
        );
      } else {
        record_deferred_terminal_source(
          ray,
          terminal_surface_environment_source(ray, hit),
          TERMINAL_SOURCE_KIND_AMBIENT_QUEUE_OVERFLOW
        );
      }
    } else {
      var rawWeightedContribution = vec3<f32>(0.0);
      if (
        !strict_physical_low_spp_lighting_enabled() ||
        !transport_experiment_enabled(TRANSPORT_EXPERIMENT_STRICT_ZERO_OVERFLOW)
      ) {
        let overflowEnvironment = terminal_surface_environment_contribution(
          ray,
          arrivingThroughput,
          hit
        );
        rawWeightedContribution = overflowEnvironment * sample_weight();
      }
      record_radiance_diagnostics(rawWeightedContribution);
      let weightedContribution = sanitize_linear_radiance(rawWeightedContribution);
      record_termination_metrics(
        TERMINAL_SOURCE_KIND_AMBIENT_QUEUE_OVERFLOW,
        weightedContribution
      );
      accumulation[ray.rayId] =
        accumulation[ray.rayId] + vec4<f32>(weightedContribution, 1.0);
    }
    atomicAdd(&counters.terminatedCount, 1u);
    return;
  }
  record_deferred_path_throughput(ray, continuationThroughput);
  let throughput = ray.throughput.xyz * continuationThroughput;
  nextQueue[nextIndex] = RayRecord(
    ray.rayId,
    ray.rayId,
    ray.sourcePixelId,
    ray.sampleId,
    ray.bounce + 1u,
    scatter.mediumRefId,
    scatter.flags,
    0u,
    vec4<f32>(
      offset_origin(
        hit.position.xyz,
        hit.geometricNormal.xyz,
        hit.shadingNormal.xyz,
        scatter.direction.xyz
      ),
      1.0
    ),
    scatter.direction,
    vec4<f32>(throughput, scatter.pdf)
  );
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

fn resolve_deferred_path_radiance(rayId: u32) -> vec3<f32> {
  let terminal = pathVertices[path_vertex_index(rayId, config.maxDepth)];
  if (terminal.w <= 0.0) {
    return vec3<f32>(0.0);
  }

  var radiance = terminal.xyz;
  var depth = config.maxDepth;
  loop {
    if (depth == 0u) {
      break;
    }
    depth = depth - 1u;
    let throughput = pathVertices[path_vertex_index(rayId, depth)];
    if (throughput.w > 0.0) {
      radiance = radiance * throughput.xyz;
    }
  }
  return sanitize_linear_radiance(radiance);
}

@compute @workgroup_size(64)
fn accumulateTerminalRadiance(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let index = globalId.x;
  if (index >= config.tilePixelCount) {
    return;
  }
  let localX = index % config.tileWidth;
  let localY = index / config.tileWidth;
  let pixel = vec2<i32>(i32(config.tileX + localX), i32(config.tileY + localY));
  var radiance = max(accumulation[index].xyz, vec3<f32>(0.0));
  if (deferred_path_resolve_enabled()) {
    let terminal = pathVertices[path_vertex_index(index, config.maxDepth)];
    let resolved = resolve_deferred_path_radiance(index) * sample_weight();
    record_radiance_diagnostics(resolved);
    let safeResolved = sanitize_linear_radiance(resolved);
    record_transport_contribution(TRANSPORT_BUCKET_STOCHASTIC_RESIDUAL, safeResolved);
    record_termination_metrics(u32(terminal.w), safeResolved);
    radiance = sanitize_linear_radiance(radiance + safeResolved);
    accumulation[index] = vec4<f32>(radiance, 1.0);
  }

  let linearOutput = sanitize_linear_radiance(radiance);
  record_transport_checksum(index, linearOutput);
  textureStore(radianceImage, pixel, vec4<f32>(linearOutput, 1.0));
  if (config.denoise == 0u) {
    textureStore(outputImage, pixel, vec4<f32>(present_radiance(linearOutput), 1.0));
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
  let center = textureLoad(denoiseInputRadiance, pixel, 0).xyz;
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
      let sampleColor = textureLoad(denoiseInputRadiance, vec2<i32>(sx, sy), 0).xyz;
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
  let center = textureLoad(finalDenoiseInputRadiance, pixel, 0).xyz;
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
      let sampleColor = textureLoad(finalDenoiseInputRadiance, vec2<i32>(sx, sy), 0).xyz;
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
