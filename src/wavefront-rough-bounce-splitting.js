import {hashUint32} from './wavefront-progressive-sampling.js';

export function resolveRoughBounceSplitting(options={}) {
  const flag='renderer.sampling.roughBounceSplitting.enabled',flags=options.featureFlags;
  const enabled=(options[flag]??flags?.[flag]??flags?.enabled?.[flag]??flags?.flags?.[flag]??flags?.renderer?.sampling?.roughBounceSplitting?.enabled??false)===true;
  if(!enabled)return Object.freeze({enabled:false,splitDepth:0,queueFactor:1,maximumAdditionalBytes:0});
  const splitDepth=options.roughBounceSplitting?.splitDepth??1;
  const maximumAdditionalBytes=options.roughBounceSplitting?.maximumAdditionalBytes??128*1024**2;
  if(![1,2].includes(splitDepth)||!Number.isSafeInteger(maximumAdditionalBytes)||maximumAdditionalBytes<1)throw new RangeError('Invalid rough splitting depth/allocation cap.');
  return Object.freeze({enabled:true,splitDepth,queueFactor:2**splitDepth,maximumAdditionalBytes});
}

export function roughSplitAdditionalBytes(tilePixels,maxDepth,splitting) {
  if(!splitting?.enabled)return 0;
  if(![1,2].includes(splitting.splitDepth)||maxDepth>8)throw new RangeError('Rough splitting requires depth <= 8.');
  const bytes=(2**splitting.splitDepth-1)*tilePixels*(96*2+256+(maxDepth+1)*64);
  if(!Number.isSafeInteger(bytes)||bytes>splitting.maximumAdditionalBytes)throw new RangeError('Rough splitting allocation exceeds cap.');
  return bytes;
}

export function roughBranchPixel(pixel,key) {
  return (pixel ^ (key===0?0:hashUint32(Math.imul(key,0x9e3779b9))))>>>0;
}

function replaceRequired(source,from,to) {
  if(!source.includes(from))throw new Error('Rough splitting source contract changed: '+from);
  return source.replaceAll(from,to);
}

// Specialize canonical source only when enabled; record layouts and off bytes stay intact.
export function withRoughBounceSplitting(source,splitting,trace=false) {
  if(!splitting?.enabled)return source;
  if(![1,2].includes(splitting.splitDepth))throw new RangeError('Invalid rough splitting depth.');
  const factor=2**splitting.splitDepth,stride=`(config.tilePixelCount * ${factor}u)`;
  source=replaceRequired(source,'input.bounce * config.tilePixelCount',`input.bounce * ${stride}`);
  source=replaceRequired(source,'(ray.bounce + 1u) * config.tilePixelCount',`(ray.bounce + 1u) * ${stride}`);
  if(!trace)return source;
  source=replaceRequired(source,'let ray = begin_path_node(activeQueue[index], index);',`let ray = begin_path_node(activeQueue[index], index);
  rough_branch_key = ray.flags >> 8u;`);
  source=replaceRequired(source,'mix_seed(pixelId,', 'mix_seed(split_pixel_id(pixelId),');
  source=replaceRequired(source,'let scatter = scatter_direction(ray, hit);',`if (rough_split_eligible(ray, hit)) { spawn_rough_children(ray, hit, segmentTransmittance); return; }
  let scatter = scatter_direction(ray, hit);`);
  source=replaceRequired(source,'nextIndex >= config.tilePixelCount','nextIndex >= rough_queue_capacity()');
  source=replaceRequired(source,'secondaryIndex < config.tilePixelCount','secondaryIndex < rough_queue_capacity()');
  source=replaceRequired(source,'min(nextCount, config.tilePixelCount)','min(nextCount, rough_queue_capacity())');
  source=replaceRequired(source,'    scatter.flags,\n    nextMediumStackDepth,',`    scatter.flags | (select(rough_branch_key, rough_branch_key * 2u + 1u, splitDielectric) << 8u),
    nextMediumStackDepth,`);
  source=replaceRequired(source,'        scatter.flags,\n        secondaryDepth,',`        scatter.flags | ((rough_branch_key * 2u + 2u) << 8u),
        secondaryDepth,`);
  return source+`
var<private> rough_branch_key: u32;
fn split_pixel_id(pixel: u32) -> u32 {
  return pixel ^ select(0u, hash_u32(rough_branch_key * 0x9e3779b9u), rough_branch_key != 0u);
}
fn rough_queue_capacity() -> u32 { return ${stride}; }
fn rough_split_eligible(ray: RayRecord, hit: HitRecord) -> bool {
  return ray.bounce < ${splitting.splitDepth}u && hit.materialKind == 0u
    && hit.material.x >= 0.5 && hit.material.y < 0.5 && hit.material.z >= 0.999
    && hit.materialExtension.z <= 0.001 && max_component(hit.materialResponse.xyz) == 0.0
    && hit.materialResponse.w == 0.0;
}
fn spawn_rough_children(ray: RayRecord, hit: HitRecord, transmittance: vec3<f32>) {
  let parentKey = rough_branch_key;
  let normal = surface_shading_normal(hit);
  let view = safe_normalize(-ray.direction.xyz, normal);
  for (var branch = 0u; branch < 2u; branch = branch + 1u) {
    rough_branch_key = parentKey * 2u + 1u + branch;
    let scatter = scatter_direction(ray, hit);
    let weight = surface_continuation_throughput(hit, view,
      safe_normalize(scatter.direction.xyz, normal), scatter) * transmittance;
    let slot = atomicAdd(&counters.nextCount, 1u);
    if (slot >= rough_queue_capacity()) {
      fail_path_node(ray);
      record_termination_metrics(TERMINAL_SOURCE_KIND_AMBIENT_QUEUE_OVERFLOW, vec3<f32>(0.0));
      atomicAdd(&counters.terminatedCount, 1u);
      return;
    }
    link_path_child(ray, slot, branch == 1u);
    nextQueue[slot] = RayRecord(ray.rayId, ray.parentRayId, ray.sourcePixelId, ray.sampleId,
      ray.bounce + 1u, ray.mediumRefId, scatter.flags | (rough_branch_key << 8u), ray.mediumStackDepth,
      vec4<f32>(offset_origin(hit.position.xyz, hit.geometricNormal.xyz, hit.shadingNormal.xyz, scatter.direction.xyz), 1.0),
      scatter.direction, vec4<f32>(ray.throughput.xyz * weight * 0.5, scatter.pdf), ray.mediumStack);
  }
}
`;
}
