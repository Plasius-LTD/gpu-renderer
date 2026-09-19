import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { WAVEFRONT_COMPUTE_WGSL } from "../src/wavefront-shaders.js";
import { WAVEFRONT_MAKE_CAMERA_RAY_WGSL } from "../src/wavefront-camera-shared-shader.js";
import { WAVEFRONT_SAMPLE_SEQUENCE_WGSL, WAVEFRONT_STABLE_SAMPLE_ROUTING_WGSL } from "../src/wavefront-sampling-dimensions.js";
import { ADAPTIVE_CAMERA_WGSL } from "../src/wavefront-adaptive-camera-shader.js";
import { createAdaptiveCameraRayPipeline, encodeAdaptiveCameraRays } from "../src/wavefront-adaptive-camera.js";
import { reflectAdaptiveCameraInterface } from "../scripts/adaptive-camera-interface.js";
import { reflectAdaptivePrimaryInterface } from "../scripts/adaptive-primary-interface.js";
import { CONFIG_BUFFER_BYTES, RAY_RECORD_BYTES } from "../src/wavefront-core.js";

test("compacted camera rays reuse camera WGSL without changing fixed transport or make_ray", () => {
  assert.ok(ADAPTIVE_CAMERA_WGSL.includes(WAVEFRONT_MAKE_CAMERA_RAY_WGSL));
  assert.ok(WAVEFRONT_COMPUTE_WGSL.includes(WAVEFRONT_MAKE_CAMERA_RAY_WGSL));
  for (const shader of [ADAPTIVE_CAMERA_WGSL, WAVEFRONT_COMPUTE_WGSL]) {
    assert.ok(shader.includes(WAVEFRONT_SAMPLE_SEQUENCE_WGSL));
    assert.ok(shader.includes(WAVEFRONT_STABLE_SAMPLE_ROUTING_WGSL));
    assert.equal(shader.match(/fn sample_dimension_2d\(/g)?.length, 1);
  }
  assert.equal(createHash("sha256").update(WAVEFRONT_COMPUTE_WGSL).digest("hex"), "6314e7ac17898b87cd8fc0b9bce46743237b8c5f8099ca31b8040c49726564d0");
  const entry = ADAPTIVE_CAMERA_WGSL.slice(ADAPTIVE_CAMERA_WGSL.indexOf("fn generateCompactedCameraRays"));
  assert.match(entry, /activeQueue\[slot\] = make_ray\(localPixelId\);/);
  assert.doesNotMatch(entry, /sample_dimension_2d\(/);
  assert.match(entry, /slot >= cameraControl.count/);
  assert.match(entry, /localPixelId >= config.tilePixelCount/);
});

test("assembled camera ABI matches existing ray, frame, worklist and control buffers", async () => {
  const manifest = await reflectAdaptiveCameraInterface();
  const primary = await reflectAdaptivePrimaryInterface();
  const record = (name) => manifest.records.find((item) => item.name === name);
  assert.equal(record("RayRecord").byteSize, RAY_RECORD_BYTES);
  assert.equal(record("FrameConfig").byteSize, CONFIG_BUFFER_BYTES);
  for (const [camera, original] of [["AdaptiveCameraTile", "AdaptivePrimaryConfig"], ["AdaptiveCameraControl", "AdaptivePrimaryControl"]]) {
    const a = record(camera), b = primary.records.find((item) => item.name === original);
    assert.equal(a.byteSize, b.byteSize);
    assert.deepEqual(a.members.map(({ name, offset }) => [name, offset]), b.members.map(({ name, offset }) => [name, offset]));
  }
});

test("camera pipeline is lazy, uses explicit layouts and propagates compilation failures", async () => {
  assert.equal(await createAdaptiveCameraRayPipeline(new Proxy({}, { get() { throw new Error("disabled"); } }), null), null);
  const layouts = [];
  const device = {
    createShaderModule: () => ({ getCompilationInfo: async () => ({ messages: [] }) }),
    createBindGroupLayout: (layout) => { layouts.push(layout); return layout; },
    createPipelineLayout: (layout) => layout,
    createComputePipelineAsync: async (descriptor) => descriptor,
  };
  const result = await createAdaptiveCameraRayPipeline(device, { COMPUTE: 4 }, { enabled: true });
  assert.deepEqual(layouts[0].entries.map(({ binding }) => binding), [0, 5]);
  assert.equal(layouts[0].entries[1].buffer.hasDynamicOffset, true);
  assert.deepEqual(layouts[1].entries.map(({ binding }) => binding), [0, 1, 2]);
  assert.equal(layouts[1].entries[2].buffer.hasDynamicOffset, true);
  assert.equal(result.pipeline.compute.entryPoint, "generateCompactedCameraRays");
  await assert.rejects(createAdaptiveCameraRayPipeline({ ...device, createShaderModule: () => ({ getCompilationInfo: async () => ({ messages: [{ type: "error", message: "bad shader" }] }) }) }, { COMPUTE: 4 }, { enabled: true }), /bad shader/);
  await assert.rejects(createAdaptiveCameraRayPipeline({ ...device, createComputePipelineAsync: async () => { throw new Error("pipeline rejected"); } }, { COMPUTE: 4 }, { enabled: true }), /pipeline rejected/);
});

test("camera dispatch preserves immutable frame/tile slots and uses indirect arguments", () => {
  const calls = [];
  const encoder = { beginComputePass: (d) => { calls.push(d); return {
    setPipeline: (p) => calls.push(p), setBindGroup: (...args) => calls.push(args),
    dispatchWorkgroupsIndirect: (...args) => calls.push(args), end: () => calls.push("end"),
  }; } };
  encodeAdaptiveCameraRays(encoder, { pipeline: "camera" }, "rays", "worklist", "indirect", 512, 256);
  assert.deepEqual(calls.slice(1), ["camera", [0, "rays", [512]], [1, "worklist", [256]], ["indirect", 0], "end"]);
  for (const offset of [-1, 1, 1.5, NaN, 0x100000000]) {
    assert.throws(() => encodeAdaptiveCameraRays(encoder, {}, null, null, null, offset, 0));
    assert.throws(() => encodeAdaptiveCameraRays(encoder, {}, null, null, null, 0, offset));
  }
});
