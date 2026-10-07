import { ADAPTIVE_BOOTSTRAP_WGSL } from "./wavefront-adaptive-bootstrap-shader.js";
import { CONFIG_BUFFER_BYTES, COUNTER_BUFFER_BYTES, RAY_RECORD_BYTES, PATH_VERTEX_RECORD_BYTES } from "./wavefront-core.js";
import { ADAPTIVE_PRIMARY_CONFIG_BYTE_SIZE, ADAPTIVE_PRIMARY_CONTROL_BYTE_SIZE } from "./wavefront-adaptive-primary-constants.js";
import { assertShaderModuleCompiles, createComputePipeline } from "./wavefront-runtime-support.js";

export async function createAdaptiveBootstrapPipelines(device, shaderStage, { enabled = false } = {}) {
  if (!enabled) return null;
  const shader = device.createShaderModule({ label: "wavefront-adaptive-bootstrap", code: ADAPTIVE_BOOTSTRAP_WGSL });
  await assertShaderModuleCompiles(shader, "wavefront-adaptive-bootstrap");
  const entry = (binding, type, minBindingSize) => ({ binding, visibility: shaderStage.COMPUTE,
    buffer: { type, minBindingSize, ...(type === "uniform" ? { hasDynamicOffset: true } : {}) },
  });
  const frameLayout = device.createBindGroupLayout({ label: "adaptive-bootstrap-frame", entries: [
    entry(0, "read-only-storage", RAY_RECORD_BYTES), entry(3, "storage", 16),
    entry(5, "uniform", CONFIG_BUFFER_BYTES), entry(6, "storage", COUNTER_BUFFER_BYTES), entry(22, "storage", PATH_VERTEX_RECORD_BYTES),
  ] });
  const worklistLayout = device.createBindGroupLayout({ label: "adaptive-bootstrap-worklist", entries: [
    entry(0, "read-only-storage", 4), entry(1, "storage", ADAPTIVE_PRIMARY_CONTROL_BYTE_SIZE),
    entry(2, "uniform", ADAPTIVE_PRIMARY_CONFIG_BYTE_SIZE),
  ] });
  const layout = device.createPipelineLayout({ bindGroupLayouts: [frameLayout, worklistLayout] });
  const validate = await createComputePipeline(device, shader, layout, "validate_compacted_sample", "adaptive-bootstrap-validate");
  const initialize = await createComputePipeline(device, shader, layout, "initialize_compacted_sample", "adaptive-bootstrap-initialize");
  return Object.freeze({ frameLayout, worklistLayout, validate, initialize });
}

export function encodeAdaptiveBootstrap(encoder, pipelines, frameGroup, worklistGroup, counterBuffer, frameOffset, tileOffset, tilePixelCount) {
  for (const offset of [frameOffset, tileOffset]) {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 0xffffffff || offset % 256 !== 0) {
      throw new RangeError("Invalid immutable bootstrap config offset.");
    }
  }
  if (!Number.isSafeInteger(tilePixelCount) || tilePixelCount < 1 || tilePixelCount > 16384) {
    throw new RangeError("Invalid bootstrap tile pixel count.");
  }
  encoder.clearBuffer(counterBuffer, 0, COUNTER_BUFFER_BYTES);
  for (const [pipeline, label] of [[pipelines.validate, "adaptive-bootstrap-validate"], [pipelines.initialize, "adaptive-bootstrap-initialize"]]) {
    const pass = encoder.beginComputePass({ label });
    pass.setPipeline(pipeline); pass.setBindGroup(0, frameGroup, [frameOffset]); pass.setBindGroup(1, worklistGroup, [tileOffset]);
    pass.dispatchWorkgroups(Math.ceil(tilePixelCount / 64)); pass.end();
  }
}
