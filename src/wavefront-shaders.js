import { WAVEFRONT_COMPUTE_WORKGROUP_SIZE } from "./wavefront-workgroup.js";
import { WAVEFRONT_SHADER_BVH_WGSL } from "./wavefront-shader-bvh.js";
import { WAVEFRONT_SHADER_KERNELS_WGSL } from "./wavefront-shader-kernels.js";
import { WAVEFRONT_SHADER_LAYOUT_WGSL } from "./wavefront-shader-layout.js";
import { WAVEFRONT_SHADER_LIGHTING_WGSL } from "./wavefront-shader-lighting.js";
import { WAVEFRONT_SHADER_MATERIALS_WGSL } from "./wavefront-shader-materials.js";
export { PRESENT_WGSL } from "./wavefront-present-shader.js";

function readPositiveInteger(name, value, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return numeric;
}

export const WAVEFRONT_COMPUTE_WGSL = [
  WAVEFRONT_SHADER_LAYOUT_WGSL,
  WAVEFRONT_SHADER_MATERIALS_WGSL,
  WAVEFRONT_SHADER_LIGHTING_WGSL,
  WAVEFRONT_SHADER_BVH_WGSL,
  WAVEFRONT_SHADER_KERNELS_WGSL,
].join("\n");

export function createWavefrontPathTracingComputeShaderSource(options = {}) {
  const workgroupSize = readPositiveInteger(
    "workgroupSize",
    options.workgroupSize ?? WAVEFRONT_COMPUTE_WORKGROUP_SIZE,
    WAVEFRONT_COMPUTE_WORKGROUP_SIZE
  );
  if (workgroupSize !== WAVEFRONT_COMPUTE_WORKGROUP_SIZE) {
    throw new Error(`wavefront mesh compute currently requires workgroupSize=${WAVEFRONT_COMPUTE_WORKGROUP_SIZE}`);
  }
  return WAVEFRONT_COMPUTE_WGSL;
}
