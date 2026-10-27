import {OPTICAL_INTERFACE_BUDGET_WGSL} from '../../src/wavefront-optical-interface-budget.js';
// Reverse only the deliberate, independently tested optical-budget extension.
// The preceding IOR correction keeps its own original immutable hash guard.
export function withoutOpticalBudget(source){return source.replace(OPTICAL_INTERFACE_BUDGET_WGSL+'\n','')
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
