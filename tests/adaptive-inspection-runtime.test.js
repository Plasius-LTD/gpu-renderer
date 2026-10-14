import test from "node:test";
import assert from "node:assert/strict";
import { createWavefrontPathTracingComputeConfig } from "../src/wavefront-config.js";
import { createAdaptiveInspectionRuntime } from "../src/wavefront-adaptive-inspection.js";
function fixture({
  bad = false,
  controlFailure = false,
  allocationFailure = false,
} = {}) {
  const buffers = [],
    passes = [],
    calls = [],
    words = new Uint32Array([
      1 | (1 << 9),
      2 | (2 << 9),
      1 | (1 << 9),
      2 | (2 << 9),
      0,
      controlFailure ? 1 : 0,
      0,
      0,
    ]);
  if (bad) words[0] = 1;
  const pass = (label) => ({
    setPipeline() {},
    setBindGroup() {},
    dispatchWorkgroups() {},
    dispatchWorkgroupsIndirect() {},
    end() {
      passes.push(label);
    },
  });
  const device = {
    limits: {
      maxBufferSize: 268435456,
      maxStorageBufferBindingSize: 134217728,
      minUniformBufferOffsetAlignment: 256,
      maxUniformBufferBindingSize: 65536,
    },
    pushErrorScope() {},
    async popErrorScope() {
      return allocationFailure ? { message: "allocation failed" } : null;
    },
    createBuffer(d) {
      const b = {
        size: d.size,
        descriptor: d,
        destroy() {
          b.destroyed = true;
        },
        async mapAsync() {},
        getMappedRange() {
          return words.buffer;
        },
        unmap() {
          calls.push("unmap");
        },
      };
      buffers.push(b);
      return b;
    },
    createShaderModule() {
      return {
        async getCompilationInfo() {
          return { messages: [] };
        },
      };
    },
    createBindGroupLayout: (x) => x,
    createPipelineLayout: (x) => x,
    createComputePipeline: (x) => x,
    createBindGroup: (x) => x,
    createCommandEncoder() {
      return {
        beginComputePass: (x) => pass(x.label),
        clearBuffer() {},
        copyBufferToBuffer() {},
        finish() {
          return {};
        },
      };
    },
    queue: {
      writeBuffer() {},
      submit() {
        calls.push("submit");
      },
    },
  };
  const constants = {
    buffer: {
      STORAGE: 1,
      COPY_DST: 2,
      COPY_SRC: 4,
      INDIRECT: 8,
      UNIFORM: 16,
      MAP_READ: 32,
    },
    shader: { COMPUTE: 1 },
    map: { READ: 1 },
  };
  const config = {
    ...createWavefrontPathTracingComputeConfig({
      width: 2,
      height: 2,
      samplesPerPixel: 2,
      tileSize: 128,
      deferredPathResolve: true,
      denoise: true,
    }),
  };
  const ctx = {
    device,
    constants,
    getConfig: () => config,
    configBuffer: {},
    activeQueue: {},
    counterBuffer: {},
    pathVertexBuffer: {},
    radianceView: {},
    outputView: {},
    frameEncoder: {
      encodePreparedTileSample() {
        calls.push("transport");
      },
      encodePresent() {
        calls.push("present");
      },
      encodeDenoise() {
        calls.push("denoise");
      },
    },
    buildAcceleration() {
      calls.push("build");
    },
    waitForGpu: async () => {},
  };
  return {
    ctx,
    buffers,
    passes,
    calls,
    config,
    budgets: new Uint8Array([1, 2, 1, 2]),
  };
}
test("adaptive runtime validates counts before display, denoises last and frees allocations once", async () => {
  const f = fixture(),
    progress = [],
    runtime = createAdaptiveInspectionRuntime(f.ctx);
  const result = await runtime.render({
    budgets: f.budgets,
    onProgress: (p) => progress.push(p),
  });
  assert.equal(result.completedSamples, 6);
  assert.equal(result.meanSpp, 1.5);
  assert.equal(progress.at(-1).completedTiles, 1);
  assert.equal(f.calls.filter((x) => x === "transport").length, 2);
  assert.ok(f.calls.indexOf("unmap") < f.calls.indexOf("present"));
  assert.ok(f.calls.indexOf("denoise") > f.calls.indexOf("present"));
  assert.ok(result.adaptiveBufferBytes < 128 * 1024 ** 2);
  runtime.destroy();
  runtime.destroy();
  assert.ok(f.buffers.every((b) => b.destroyed));
  await assert.rejects(runtime.render({ budgets: f.budgets }), /disposed/);
});
test("incomplete pixels, failed control and allocation errors reject without presentation", async () => {
  for (const flags of [
    { bad: true },
    { controlFailure: true },
    { allocationFailure: true },
  ]) {
    const f = fixture(flags),
      r = createAdaptiveInspectionRuntime(f.ctx);
    await assert.rejects(
      r.render({ budgets: f.budgets }),
      /Incomplete|rejected|allocation/,
    );
    assert.ok(!f.calls.includes("present"));
    r.destroy();
    assert.ok(f.buffers.every((b) => b.destroyed));
  }
});
test("single-flight rejects overlap, cancellation drains then releases the render lock", async () => {
  const f = fixture(),
    r = createAdaptiveInspectionRuntime(f.ctx),
    abort = new AbortController();
  let finish;
  f.ctx.waitForGpu = async () => {};
  const p = r.render({
    budgets: f.budgets,
    signal: abort.signal,
    onProgress: () => abort.abort(),
  });
  await assert.rejects(r.render({ budgets: f.budgets }), /progress/);
  await assert.rejects(p, /abort/i);
  assert.equal(r.busy, false);
  r.destroy();
  const g = fixture();
  g.ctx.waitForGpu = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const s = createAdaptiveInspectionRuntime(g.ctx),
    stop = new AbortController();
  const running = s.render({ budgets: g.budgets, signal: stop.signal });
  for (let i = 0; i < 100 && !finish; i++) await Promise.resolve();
  stop.abort();
  finish();
  await assert.rejects(running, /abort/i);
  s.destroy();
});

test("stalled initialization times out, releases resources and cannot start another frame", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  f.ctx.device.popErrorScope = () => new Promise(() => {});
  const r = createAdaptiveInspectionRuntime(f.ctx),
    p = r.render({ budgets: f.budgets });
  const rejected = assert.rejects(p, /timed out/);
  t.mock.timers.tick(60000);
  await rejected;
  assert.ok(f.buffers.every((b) => b.destroyed));
  assert.equal(r.busy, false);
  await assert.rejects(r.render({ budgets: f.budgets }), /disposed/);
});
test("aborting a mapped readback unmaps it and a new job can run", async () => {
  const f = fixture(),
    abort = new AbortController(),
    create = f.ctx.device.createBuffer;
  f.ctx.device.createBuffer = (d) => {
    const b = create(d);
    if (d.label === "adaptive-inspection-readback")
      b.mapAsync = async () => abort.abort();
    return b;
  };
  const r = createAdaptiveInspectionRuntime(f.ctx);
  await assert.rejects(
    r.render({ budgets: f.budgets, signal: abort.signal }),
    /abort/i,
  );
  assert.ok(f.calls.includes("unmap"));
  assert.ok(!f.calls.includes("present"));
  f.buffers.find(
    (b) => b.descriptor.label === "adaptive-inspection-readback",
  ).mapAsync = async () => {};
  f.config.denoise = false;
  const result = await r.render({ budgets: f.budgets });
  assert.equal(result.meanSpp, 1.5);
  r.destroy();
});
