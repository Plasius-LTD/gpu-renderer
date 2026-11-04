import test from "node:test";
import assert from "node:assert/strict";
import { createWavefrontCpuProfile } from "../src/wavefront-cpu-profile.js";

test("CPU profiling defaults off without accessing clocks or devices", () => {
  assert.equal(createWavefrontCpuProfile(), null);
  assert.equal(createWavefrontCpuProfile({ enabled: false, now() { throw Error("clock"); } }), null);
});

test("nested host spans have exclusive accounting; waits and failures stay separate", async () => {
  let time = 0;
  const p = createWavefrontCpuProfile({ enabled: true, now: () => time });
  assert.equal(p.measure("commandEncoding", () => {
    time += 2;
    p.measure("configPacking", () => { time += 3; });
    time += 4;
    return 42;
  }), 42);
  await p.measureAsync("gpuWait", async () => { time += 20; });
  const error = Error("original");
  assert.throws(() => p.measure("configPacking", () => { time++; throw error; }), e => e === error);
  await assert.rejects(p.measureAsync("outputReadback", async () => { time += 2; throw error; }), e => e === error);
  const s = p.snapshot();
  assert.deepEqual(s.stages.commandEncoding, { calls: 1, failures: 0, elapsedMs: 9, exclusiveMs: 6, kind: "synchronous-host" });
  assert.equal(s.stages.configPacking.elapsedMs, 4);
  assert.equal(s.stages.configPacking.failures, 1);
  assert.equal(s.stages.gpuWait.kind, "asynchronous-wait");
  assert.equal(s.stages.gpuWait.elapsedMs, 20);
  assert.equal(s.stages.outputReadback.failures, 1);
  assert.ok(Object.isFrozen(s.stages.configPacking));
  assert.throws(() => p.measure("unbounded-label", () => {}), /stage/);
  assert.throws(() => p.measure("gpuWait", () => {}), /stage/);
  await assert.rejects(p.measureAsync("submit", async () => {}), /stage/);
});

test("local GPU facades preserve receivers, arguments, results and command order", () => {
  let time = 0;
  const p = createWavefrontCpuProfile({ enabled: true, now: () => time++ });
  const calls = [], result = {};
  const pass = { setPipeline(...args) { assert.equal(this, pass); calls.push(["pipeline", ...args]); }, dispatchWorkgroups(...args) { calls.push(["dispatch", ...args]); }, dispatchWorkgroupsIndirect() {}, setBindGroup() {}, end() {} };
  const encoder = { beginComputePass(d) { assert.equal(this, encoder); calls.push(["pass", d]); return pass; }, beginRenderPass() { return pass; }, copyBufferToBuffer() {}, clearBuffer() {}, finish() { assert.equal(this, encoder); return result; } };
  const queue = { writeBuffer(...args) { assert.equal(this, queue); calls.push(["write", ...args]); }, submit(args) { assert.equal(this, queue); assert.equal(args[0], result); }, onSubmittedWorkDone() { assert.equal(this, queue); return result; } };
  const device = { queue, createCommandEncoder() { assert.equal(this, device); return encoder; }, label: "original" };
  const d = p.wrapDevice(device);
  assert.notEqual(d, device); assert.equal(d.label, "original"); assert.equal(device.queue, queue);
  const words = new Uint32Array(10), bytes = new DataView(new ArrayBuffer(20));
  d.queue.writeBuffer({}, 0, words, 2, 3);
  d.queue.writeBuffer({}, 0, bytes, 2, 3);
  d.queue.writeBuffer({}, 0, words.subarray(2));
  d.queue.writeBuffer({}, 0, bytes.buffer, 3);
  const e = d.createCommandEncoder(); const desc = {};
  const cp = e.beginComputePass(desc); cp.setPipeline("p"); cp.setBindGroup(0, {}, [256]); cp.dispatchWorkgroups(2, 1, 1); cp.dispatchWorkgroupsIndirect({}, 0); cp.end();
  e.beginRenderPass({}).end(); e.copyBufferToBuffer({}, 0, {}, 0, 12); e.clearBuffer({ size: 16 }, 4); d.queue.submit([e.finish()]);
  assert.equal(d.queue.onSubmittedWorkDone(), result);
  assert.deepEqual(calls.slice(-3), [["pass", desc], ["pipeline", "p"], ["dispatch", 2, 1, 1]]);
  p.recordAllocation(128); p.recordAllocation(32);
  const s = p.snapshot();
  assert.equal(s.commands.uploadBytes, 12 + 3 + 32 + 17);
  assert.equal(s.commands.uploadCalls, 4);
  assert.equal(s.commands.computePasses, 1); assert.equal(s.commands.renderPasses, 1);
  assert.equal(s.commands.directDispatches, 1); assert.equal(s.commands.indirectDispatches, 1);
  assert.equal(s.commands.bufferCopyBytes, 12); assert.equal(s.commands.clearBytes, 12);
  assert.equal(s.commands.submissions, 1);
  assert.deepEqual(s.knownTemporaryBuffers, { count: 2, bytes: 160 });
  assert.throws(() => p.recordAllocation(-1), /allocation/);
  assert.throws(() => p.recordAllocation(NaN), /allocation/);
  queue.submit = () => { throw Error("submit error"); };
  assert.throws(() => d.queue.submit([]), /submit error/);
  assert.equal(p.snapshot().stages.submit.failures, 1);
});

test("timing entries are opt-in, bounded, cleaned, and cannot fail rendering", () => {
  let time = 0;
  const events = [];
  const timing = { measure(name, options) { events.push([name, options]); }, clearMeasures(name) { events.push(name); } };
  const p = createWavefrontCpuProfile({ enabled: true, userTiming: true, now: () => time++, timing });
  for (let i = 0; i < 150; i++) p.measure("configPacking", () => {});
  assert.equal(events.length, 256);
  assert.equal(p.snapshot().timeline.dropped, 22);
  assert.equal(events[0][0], events[1]);
  const broken = createWavefrontCpuProfile({ enabled: true, userTiming: true, now: () => time++, timing: { measure() { throw Error("unsupported"); } } });
  assert.equal(broken.measure("configPacking", () => 1), 1);
  assert.equal(broken.snapshot().timeline.errors, 1);
  const bad = createWavefrontCpuProfile({ enabled: true, now: () => NaN });
  assert.throws(() => bad.measure("configPacking", () => {}), /clock/);
  p.measure("commandEncoding", () => assert.throws(() => p.snapshot(), /active/));
});
