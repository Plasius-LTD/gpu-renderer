import assert from "node:assert/strict";
import test from "node:test";
import { createAdaptiveCompletionPipeline, encodeAdaptiveSampleCompletion } from "../src/wavefront-adaptive-completion.js";
import { ADAPTIVE_COMPLETION_WGSL } from "../src/wavefront-adaptive-completion-shader.js";
import { PATH_TREE_WGSL } from "../src/wavefront-path-tree-shader.js";
import { reflectAdaptiveCompletionInterface } from "../scripts/adaptive-completion-interface.js";

test("the real completion module reuses the canonical tree reducer and reflected sample ABI", async () => {
  assert.ok(ADAPTIVE_COMPLETION_WGSL.includes(PATH_TREE_WGSL));
  const manifest = await reflectAdaptiveCompletionInterface();
  for (const [name, size] of [["PathNode", 64], ["AdaptiveCameraSample", 32], ["AdaptiveResolveConfig", 48], ["FrameConfig", 320], ["Counters", 112]]) {
    assert.equal(manifest.records.find((record) => record.name === name).byteSize, size);
  }
  assert.doesNotMatch(ADAPTIVE_COMPLETION_WGSL, /textureStore|bsdf|sample_dimension/u);
});

test("completion pipelines default off, use explicit existing buffers and propagate failures", async () => {
  assert.equal(await createAdaptiveCompletionPipeline(new Proxy({}, { get() { throw new Error("disabled"); } }), null), null);
  const device = { createShaderModule: () => ({ getCompilationInfo: async () => ({ messages: [] }) }),
    createBindGroupLayout: (value) => value, createPipelineLayout: (value) => value,
    createComputePipelineAsync: async (value) => value };
  const result = await createAdaptiveCompletionPipeline(device, { COMPUTE: 4 }, { enabled: true });
  assert.deepEqual(result.layout.entries.map(({ binding, buffer }) => [binding, buffer.minBindingSize, !!buffer.hasDynamicOffset]),
    [[0, 320, true], [1, 64, false], [2, 4, false], [3, 32, false], [4, 16, false], [5, 128, false], [6, 48, true]]);
  assert.equal(result.pipeline.compute.entryPoint, "produce_complete_camera_sample");
  await assert.rejects(createAdaptiveCompletionPipeline({ ...device, createComputePipelineAsync() { throw new Error("pipeline failed"); } }, { COMPUTE: 4 }, { enabled: true }), /pipeline failed/);
  await assert.rejects(createAdaptiveCompletionPipeline({ ...device, createShaderModule: () => ({ getCompilationInfo: async () => ({ messages: [{ type: "error", message: "shader failed" }] }) }) }, { COMPUTE: 4 }, { enabled: true }), /shader failed/);
});

test("completion writes whole samples before tier count commit with immutable bindings", () => {
  const events = [];
  const encoder = { beginComputePass: () => { events.push("begin"); return {
    setPipeline: (value) => events.push(value), setBindGroup: (...args) => events.push(args),
    dispatchWorkgroups: (value) => events.push(value), end: () => events.push("end"),
  }; } };
  const options = { producer: { pipeline: "produce" }, resolve: { commit: "commit" },
    producerGroup: "producer-group", resolveGroup: "resolve-group", frameOffset: 512, resolveOffset: 256, tilePixelCount: 195 };
  encodeAdaptiveSampleCompletion(encoder, options);
  assert.deepEqual(events, ["begin", "produce", [0, "producer-group", [512, 256]], 4, "end", "begin", "commit", [0, "resolve-group", [256]], 4, "end"]);
  const before = events.length;
  for (const tilePixelCount of [0, 16385, NaN, 1.5]) assert.throws(() => encodeAdaptiveSampleCompletion(encoder, { ...options, tilePixelCount }), RangeError);
  for (const key of ["frameOffset", "resolveOffset"]) for (const value of [-1, 1, 0x100000000, NaN]) assert.throws(() => encodeAdaptiveSampleCompletion(encoder, { ...options, [key]: value }), RangeError);
  assert.equal(events.length, before);
  assert.throws(() => encodeAdaptiveSampleCompletion({ beginComputePass() { throw new Error("encoder failed"); } }, options), /encoder failed/);
});
