import { WAVEFRONT_COMPUTE_WGSL } from "./wavefront-shaders.js";
import { WAVEFRONT_INTERSECTION_BODY_WGSL, WAVEFRONT_SURFACE_BODY_WGSL } from "./wavefront-shader-kernels.js";
import { assertShaderModuleCompiles, createComputePipeline } from "./wavefront-runtime-support.js";

// Only the output assignment changes: all traversal/material calculations stay
// single-sourced. The two stable assignment seams are checksum/identity-tested.
const localIntersection = WAVEFRONT_INTERSECTION_BODY_WGSL
  .replace("hits[index] = make_miss(ray);\n    return;", "return make_miss(ray);")
  .replace("hits[index] = HitRecord(", "return HitRecord(");
const fusedEntry = `
fn intersect_local_ray(ray: RayRecord) -> HitRecord {
${localIntersection}
}
@compute @workgroup_size(64)
fn intersectAndResolveActiveQueue(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let index = globalId.x;
  if (index >= atomicLoad(&counters.activeCount)) { return; }
  let input = activeQueue[index];
  let hit = intersect_local_ray(input);
  let ray = begin_path_node(input, index);
${WAVEFRONT_SURFACE_BODY_WGSL}
}
`;

export function createPrunedContinuationShader({ fusedHits = false, zeroEmptyDispatch = false } = {}) {
  let source = WAVEFRONT_COMPUTE_WGSL;
  if (zeroEmptyDispatch) source = source.replace("return max(1u, (rayCount + 63u) / 64u);", "return (rayCount + 63u) / 64u;");
  return fusedHits ? source + fusedEntry : source;
}

// Internal prepared-path variants only. No allocations or device access off.
export async function createPrunedContinuationPipelines(device, traceLayout, options = {}) {
  if (!options.fusedHits && !options.zeroEmptyDispatch) return null;
  const module = device.createShaderModule({ label: "wavefront-pruned-continuations", code: createPrunedContinuationShader(options) });
  await assertShaderModuleCompiles(module, "wavefront-pruned-continuations");
  const result = {};
  if (options.fusedHits) result.traceAndResolve = await createComputePipeline(device, module, traceLayout, "intersectAndResolveActiveQueue", "wavefront-fused-hit");
  if (options.zeroEmptyDispatch) result.compactAndSwapQueues = await createComputePipeline(device, module, traceLayout, "compactAndSwapQueues", "wavefront-zero-empty");
  return Object.freeze(result);
}
