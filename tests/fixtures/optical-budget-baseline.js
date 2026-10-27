import {OPTICAL_INTERFACE_BUDGET_WGSL} from '../../src/wavefront-optical-interface-budget.js';
import {OPTICAL_CHAIN_WGSL} from '../../src/wavefront-optical-chain-shader.js';
// Reverse only the deliberate, independently tested optical-budget extension.
// The preceding IOR correction keeps its own original immutable hash guard.
export function withoutOpticalBudget(source){return source.replace(OPTICAL_INTERFACE_BUDGET_WGSL+'\n','')
 .replace(OPTICAL_CHAIN_WGSL+'\n','')
 .replace(`fn path_logical_depth(ray: RayRecord) -> u32 {
  return select(ray.bounce, ray.flags >> 24u, (config.transportExperimentFlags & 131072u) != 0u);
}

`,'')
 .replace('  let depth = path_logical_depth(input);\n','')
 .replace('select(depth * config.tilePixelCount + queueIndex, input.rayId, depth == 0u)','select(input.bounce * config.tilePixelCount + queueIndex, input.rayId, input.bounce == 0u)')
 .replace('node.depth = depth;','node.depth = input.bounce;')
 .replace('(path_logical_depth(ray) + 1u) * config.tilePixelCount','(ray.bounce + 1u) * config.tilePixelCount')
 .replace('  var ray = begin_path_node(activeQueue[index], index);','  let ray = begin_path_node(activeQueue[index], index);')
 .replace('  var hit = hits[index];','  let hit = hits[index];')
 .replace(`  if (optical_interface_budget_enabled()) {
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
`,'')
 .replace(`  if (!path_budget_state_valid(ray)) {
    fail_path_node(ray);
    pathNodes[ray.parentRayId].reserved = 8u;
    atomicAdd(&counters.termination.invalidSampleCount, 1u);
    atomicAdd(&counters.terminatedCount, 1u);
    return;
  }
`,'')
 .replace('if (path_budget_exhausted(ray, hit)) {','if (ray.bounce + 1u >= config.maxDepth) {')
 .replace('    continuation_budget_flags(ray, hit, scatter.flags),','    scatter.flags,');}
