import assert from "node:assert/strict";
import test from "node:test";
import { createAdaptivePreparedSampleEncoder } from "../src/wavefront-adaptive-prepared-sample.js";
import { createWavefrontFrameEncoder } from "../src/wavefront-frame-encoder.js";
import { createGpuParallelismCounters } from "../src/wavefront-frame-runtime.js";

function fixture(depth = 4) {
  const calls = [], groups = { bootstrapFrame: "bootstrap-frame", bootstrapWorklist: "bootstrap-list",
    cameraFrame: "camera-frame", cameraWorklist: "camera-list" };
  let snapshots = 0;
  const encoder = {
    clearBuffer: (...args) => calls.push(["clear", ...args]),
    copyBufferToBuffer: (...args) => calls.push(["copy", ...args]),
    beginComputePass: ({ label }) => { calls.push(["begin", label]); return {
      setPipeline: (pipeline) => calls.push(["pipeline", pipeline]),
      setBindGroup: (...args) => calls.push(["group", ...args]),
      dispatchWorkgroups: (...args) => calls.push(["direct", ...args]),
      dispatchWorkgroupsIndirect: (...args) => calls.push(["indirect", ...args]),
      end: () => calls.push(["end"]),
    }; },
  };
  const options = { enabled: true, counterBuffer: "counters", primaryDispatchBuffer: "primary-dispatch",
    bootstrapPipelines: { validate: "validate", initialize: "initialize" }, cameraPipeline: { pipeline: "camera" },
    getBindGroups: () => { snapshots += 1; return groups; },
    frameEncoder: createWavefrontFrameEncoder({ getConfig: { maxDepth: depth }, getBindGroups: ["ping", "pong"],
      pipelines: { generatePrimaryRays: "DENSE-FORBIDDEN", intersectActiveQueue: "intersect", resolveSurfaceRecords: "shade", compactAndSwapQueues: "swap" },
      counterBuffer: "counters", activeDispatchBuffer: "continuation-dispatch" }),
  };
  const request = { tile: { x: 31, y: 17, width: 65, height: 3 }, frameOffset: 512, tileOffset: 256,
    parallelism: createGpuParallelismCounters() };
  return { calls, groups, encoder, options, request, snapshots: () => snapshots };
}

test("prepared coordinator defaults off and does not inspect resources", () => {
  assert.equal(createAdaptivePreparedSampleEncoder(), null);
  assert.equal(createAdaptivePreparedSampleEncoder(new Proxy({}, { get: (_target, key) => {
    if (key === "enabled") return false;
    throw new Error("disabled resource inspected");
  } })), null);
});

for (const depth of [1, 4, 8, 32]) test(`prepared coordinator orders bootstrap/camera/shared bounces at depth ${depth}`, () => {
  const f = fixture(depth), coordinator = createAdaptivePreparedSampleEncoder(f.options);
  coordinator.encode(f.encoder, f.request);
  assert.equal(f.snapshots(), 1);
  assert.deepEqual(f.calls[0], ["clear", "counters", 0, 128]);
  assert.deepEqual(f.calls.filter(([kind]) => kind === "pipeline").map(([, name]) => name),
    ["validate", "initialize", "camera", ...Array.from({ length: depth }, () => ["intersect", "shade", "swap"]).flat()]);
  assert.deepEqual(f.calls.filter(([kind]) => kind === "group").slice(0, 6), [
    ["group", 0, "bootstrap-frame", [512]], ["group", 1, "bootstrap-list", [256]],
    ["group", 0, "bootstrap-frame", [512]], ["group", 1, "bootstrap-list", [256]],
    ["group", 0, "camera-frame", [512]], ["group", 1, "camera-list", [256]],
  ]);
  assert.deepEqual(f.calls.find(([kind]) => kind === "indirect"), ["indirect", "primary-dispatch", 0]);
  assert.equal(f.request.parallelism.directDispatches, 2 + depth);
  assert.equal(f.request.parallelism.indirectDispatches, 1 + 2 * depth);
  assert.equal(f.request.parallelism.directShaderInvocations, 512 + depth);
  assert.equal(f.request.parallelism.estimatedIndirectShaderInvocationsUpperBound, 256 * (1 + 2 * depth));
});

test("prepared coordinator refreshes bindings and rejects host errors before commands", () => {
  const f = fixture(), coordinator = createAdaptivePreparedSampleEncoder(f.options);
  f.groups.cameraFrame = "replacement-camera";
  coordinator.encode(f.encoder, { ...f.request, parallelism: undefined });
  assert.ok(f.calls.some((entry) => entry[0] === "group" && entry[2] === "replacement-camera"));
  const before = f.calls.length;
  for (const tile of [{ width: 0 }, { x: -1 }, { y: NaN }, { width: 16385 }, { height: 0.5 }]) {
    assert.throws(() => coordinator.encode(f.encoder, { ...f.request, tile: { ...f.request.tile, ...tile } }), RangeError);
  }
  for (const key of ["frameOffset", "tileOffset"]) for (const value of [-1, 1, 1.5, NaN, 0x100000000]) {
    assert.throws(() => coordinator.encode(f.encoder, { ...f.request, [key]: value }), RangeError);
  }
  assert.equal(f.calls.length, before);
  assert.equal(f.snapshots(), 1);
  f.groups.cameraWorklist = null;
  assert.throws(() => coordinator.encode(f.encoder, f.request), /binding/iu);
  assert.equal(f.calls.length, before);
});

test("prepared coordinator propagates stage failures without subsequent stages or submission", () => {
  const f = fixture();
  const failure = new Error("device encoder failed");
  const coordinator = createAdaptivePreparedSampleEncoder(f.options);
  assert.throws(() => coordinator.encode({ clearBuffer() { throw failure; } }, f.request), (error) => error === failure);
  assert.equal(f.calls.length, 0);
  f.encoder.copyBufferToBuffer = () => { throw failure; };
  assert.throws(() => coordinator.encode(f.encoder, f.request), (error) => error === failure);
  assert.deepEqual(f.calls.filter(([kind]) => kind === "pipeline").map(([, value]) => value), ["validate", "initialize", "camera"]);
});
