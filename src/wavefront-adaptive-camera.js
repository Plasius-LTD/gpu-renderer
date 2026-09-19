import { ADAPTIVE_CAMERA_WGSL } from "./wavefront-adaptive-camera-shader.js";
import { CONFIG_BUFFER_BYTES, RAY_RECORD_BYTES } from "./wavefront-core.js";
import { ADAPTIVE_PRIMARY_CONFIG_BYTE_SIZE, ADAPTIVE_PRIMARY_CONTROL_BYTE_SIZE } from "./wavefront-adaptive-primary-constants.js";
import { assertShaderModuleCompiles, createComputePipeline } from "./wavefront-runtime-support.js";

export async function createAdaptiveCameraRayPipeline(device, shaderStage, { enabled = false } = {}) {
  if (!enabled) return null;
  const shader = device.createShaderModule({ label: "wavefront-adaptive-camera", code: ADAPTIVE_CAMERA_WGSL });
  await assertShaderModuleCompiles(shader, "wavefront-adaptive-camera");
  const entry = (binding, type, minBindingSize) => ({ binding, visibility: shaderStage.COMPUTE,
    buffer: { type, minBindingSize, ...(type === "uniform" ? { hasDynamicOffset: true } : {}) },
  });
  const rayLayout = device.createBindGroupLayout({ label: "adaptive-camera-ray-frame", entries: [
    entry(0, "storage", RAY_RECORD_BYTES), entry(5, "uniform", CONFIG_BUFFER_BYTES),
  ] });
  const worklistLayout = device.createBindGroupLayout({ label: "adaptive-camera-worklist", entries: [
    entry(0, "read-only-storage", 4), entry(1, "read-only-storage", ADAPTIVE_PRIMARY_CONTROL_BYTE_SIZE),
    entry(2, "uniform", ADAPTIVE_PRIMARY_CONFIG_BYTE_SIZE),
  ] });
  const layout = device.createPipelineLayout({ bindGroupLayouts: [rayLayout, worklistLayout] });
  const pipeline = await createComputePipeline(device, shader, layout, "generateCompactedCameraRays", "adaptive-camera-rays");
  return Object.freeze({ pipeline, rayLayout, worklistLayout });
}

export function encodeAdaptiveCameraRays(encoder, pipelines, rayGroup, worklistGroup, indirect, frameOffset, tileOffset) {
  for (const offset of [frameOffset, tileOffset]) {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 0xffffffff || offset % 256 !== 0) {
      throw new RangeError("Invalid immutable camera config offset.");
    }
  }
  const pass = encoder.beginComputePass({ label: "wavefront-adaptive-camera-rays" });
  pass.setPipeline(pipelines.pipeline);
  pass.setBindGroup(0, rayGroup, [frameOffset]);
  pass.setBindGroup(1, worklistGroup, [tileOffset]);
  pass.dispatchWorkgroupsIndirect(indirect, 0);
  pass.end();
}
