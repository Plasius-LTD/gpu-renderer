import assert from "node:assert/strict";
import test from "node:test";
import { createWavefrontFrameEncoder } from "../src/wavefront-frame-encoder.js";
import { createGpuParallelismCounters } from "../src/wavefront-frame-runtime.js";
import { COUNTER_DISPATCH_ARGS_OFFSET, INDIRECT_DISPATCH_ARGS_BYTES } from "../src/wavefront-core.js";

function fixture(depth, telemetryEnabled) {
  const calls = [];
  const config = { maxDepth: depth, denoise: false };
  const groups = ["ping", "pong"];
  const telemetry = {
    decorateFirstPass: (descriptor) => { calls.push(["first", descriptor.label]); return descriptor; },
    recordActiveRayCount: (_encoder, buffer, bounce) => calls.push(["active-count", buffer, bounce]),
  };
  const encoder = {
    beginComputePass: ({ label }) => {
      calls.push(["begin", label]);
      return {
        setBindGroup: (...args) => calls.push(["group", ...args]),
        setPipeline: (pipeline) => calls.push(["pipeline", pipeline]),
        dispatchWorkgroups: (...args) => calls.push(["direct", ...args]),
        dispatchWorkgroupsIndirect: (...args) => calls.push(["indirect", ...args]),
        end: () => calls.push(["end"]),
      };
    },
    copyBufferToBuffer: (...args) => calls.push(["copy", ...args]),
  };
  const frame = createWavefrontFrameEncoder({
    getConfig: () => config, getBindGroups: () => groups,
    pipelines: { generatePrimaryRays: "primary", intersectActiveQueue: "intersect",
      resolveSurfaceRecords: "shade", compactAndSwapQueues: "swap" },
    counterBuffer: "counters", activeDispatchBuffer: "dispatch",
    getFrameTelemetry: () => telemetryEnabled ? telemetry : null,
  });
  return { calls, config, groups, frame, encoder, parallelism: createGpuParallelismCounters() };
}

function continuationTrace(depth, offset, telemetry) {
  const calls = [];
  for (let bounce = 0; bounce < depth; bounce += 1) {
    if (telemetry) calls.push(["active-count", "counters", bounce]);
    calls.push(["copy", "counters", COUNTER_DISPATCH_ARGS_OFFSET, "dispatch", 0, INDIRECT_DISPATCH_ARGS_BYTES],
      ["begin", `plasius.wavefront.bounce.${bounce}`],
      ["group", 0, bounce % 2 ? "pong" : "ping", [offset]],
      ["pipeline", "intersect"], ["indirect", "dispatch", 0],
      ["pipeline", "shade"], ["indirect", "dispatch", 0],
      ["pipeline", "swap"], ["direct", 1], ["end"]);
  }
  return calls;
}

for (const depth of [1, 4, 8]) for (const telemetry of [false, true]) {
  test(`fixed and prepared-primary command suffixes agree: depth ${depth}, telemetry ${telemetry}`, () => {
    const tile = { x: 13, y: 7, width: 17, height: 5 };
    const offset = 512;
    const dense = fixture(depth, telemetry);
    dense.frame.encodeTileSample(dense.encoder, tile, offset, dense.parallelism);
    const prefix = telemetry ? [["first", "plasius.wavefront.generatePrimaryRaysPass"]] : [];
    prefix.push(["begin", "plasius.wavefront.generatePrimaryRaysPass"], ["group", 0, "ping", [offset]],
      ["pipeline", "primary"], ["direct", 2], ["end"]);
    assert.deepEqual(dense.calls, [...prefix, ...continuationTrace(depth, offset, telemetry)]);
    const prepared = fixture(depth, telemetry);
    prepared.frame.encodePreparedTileSample(prepared.encoder, tile, offset, prepared.parallelism);
    assert.deepEqual(prepared.calls, continuationTrace(depth, offset, telemetry));
    assert.equal(prepared.parallelism.directDispatches, depth);
    assert.equal(prepared.parallelism.directWorkgroups, depth);
    assert.equal(prepared.parallelism.directShaderInvocations, depth);
    assert.equal(prepared.parallelism.indirectDispatches, depth * 2);
    assert.equal(prepared.parallelism.estimatedIndirectWorkgroupsUpperBound, depth * 4);
    assert.equal(dense.parallelism.directDispatches, depth + 1);
    assert.equal(dense.parallelism.directShaderInvocations, depth + 128);
    assert.equal(dense.parallelism.indirectDispatches, prepared.parallelism.indirectDispatches);
    assert.equal(dense.parallelism.estimatedIndirectWorkgroupsUpperBound, prepared.parallelism.estimatedIndirectWorkgroupsUpperBound);
  });
}

test("prepared transport refreshes frame bindings and propagates encoder failures", () => {
  const f = fixture(1, false);
  f.config.maxDepth = 4;
  f.groups[0] = "replacement-ping";
  f.frame.encodePreparedTileSample(f.encoder, { width: 1, height: 1 }, 768, f.parallelism);
  assert.equal(f.parallelism.indirectDispatches, 8);
  assert.deepEqual(f.calls.find(([kind]) => kind === "group"), ["group", 0, "replacement-ping", [768]]);
  const error = new Error("counter copy failed");
  assert.throws(() => f.frame.encodePreparedTileSample({ copyBufferToBuffer() { throw error; } },
    { width: 1, height: 1 }, 768, f.parallelism), (actual) => actual === error);
});
