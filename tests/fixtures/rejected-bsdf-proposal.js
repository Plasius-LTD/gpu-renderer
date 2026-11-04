// Rejected historical control from de7f09b. Tests only; never renderer guidance.
import {functionSource} from './rough-dielectric-numerical-harness.js';
const rejectedScatter=String.raw`fn scatter_direction(ray: RayRecord, hit: HitRecord) -> ScatterResult {
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
}`;
export function restoreRejectedBsdfProposal(source){
 const current=functionSource('scatter_direction');
 if(!source.includes(current)||!source.includes('    var sourceRadiance = max(hit.emission.xyz, hit.color.xyz);'))throw Error('Missing proposal correction for historical reconstruction');
 return source.replace(current,rejectedScatter).replace('    var sourceRadiance = max(hit.emission.xyz, hit.color.xyz);',
  '    let guidedLightWeight = select(1.0, 0.24, (ray.flags & RAY_FLAG_GUIDED_EMISSIVE) != 0u);\n    var sourceRadiance = max(hit.emission.xyz, hit.color.xyz) * guidedLightWeight;');
}

