import { ADAPTIVE_COMPLETION_WGSL } from "./wavefront-adaptive-completion-shader.js";
import { CONFIG_BUFFER_BYTES, COUNTER_BUFFER_BYTES, PATH_VERTEX_RECORD_BYTES } from "./wavefront-core.js";
import { ADAPTIVE_CAMERA_SAMPLE_BYTE_SIZE, ADAPTIVE_RESOLVE_CONFIG_BYTE_SIZE } from "./wavefront-adaptive-resolve-constants.js";
import { assertShaderModuleCompiles, createComputePipeline } from "./wavefront-runtime-support.js";

export async function createAdaptiveCompletionPipeline(device, shaderStage, { enabled = false } = {}) {
  if (!enabled) return null;
  const module = device.createShaderModule({ label: "adaptive-complete-camera-sample", code: ADAPTIVE_COMPLETION_WGSL });
  await assertShaderModuleCompiles(module, "adaptive-complete-camera-sample");
  const entries = [[0, "uniform", CONFIG_BUFFER_BYTES], [1, "storage", PATH_VERTEX_RECORD_BYTES],
    [2, "read-only-storage", 4], [3, "storage", ADAPTIVE_CAMERA_SAMPLE_BYTE_SIZE],
    [4, "read-only-storage", 16], [5, "storage", COUNTER_BUFFER_BYTES], [6, "uniform", ADAPTIVE_RESOLVE_CONFIG_BYTE_SIZE]];
  const layout = device.createBindGroupLayout({ label: "adaptive-complete-camera-sample", entries: entries.map(([binding, type, minBindingSize]) => ({
    binding, visibility: shaderStage.COMPUTE, buffer: { type, minBindingSize, ...(type === "uniform" ? { hasDynamicOffset: true } : {}) },
  })) });
  const pipeline = await createComputePipeline(device, module, device.createPipelineLayout({ bindGroupLayouts: [layout] }),
    "produce_complete_camera_sample", "adaptive-complete-camera-sample");
  return Object.freeze({ layout, pipeline });
}

export function encodeAdaptiveSampleCompletion(encoder, { producer, resolve, producerGroup, resolveGroup, frameOffset, resolveOffset, tilePixelCount }) {
  for (const offset of [frameOffset, resolveOffset]) {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 0xffffffff || offset % 256 !== 0) throw new RangeError("Invalid immutable completion offset.");
  }
  if (!Number.isSafeInteger(tilePixelCount) || tilePixelCount < 1 || tilePixelCount > 16384) throw new RangeError("Invalid completion tile size.");
  for (const [pipeline, group, offsets, label] of [[producer.pipeline, producerGroup, [frameOffset, resolveOffset], "adaptive-produce-complete-sample"],
    [resolve.commit, resolveGroup, [resolveOffset], "adaptive-commit-complete-sample"]]) {
    const pass = encoder.beginComputePass({ label }); pass.setPipeline(pipeline); pass.setBindGroup(0, group, offsets);
    pass.dispatchWorkgroups(Math.ceil(tilePixelCount / 64)); pass.end();
  }
}
