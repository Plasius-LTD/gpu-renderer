import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { createAdaptiveBootstrapPipelines, encodeAdaptiveBootstrap } from "../src/wavefront-adaptive-bootstrap.js";
import { ADAPTIVE_BOOTSTRAP_WGSL } from "../src/wavefront-adaptive-bootstrap-shader.js";
import * as shared from "../src/wavefront-primary-shared-shader.js";
import { WAVEFRONT_COMPUTE_WGSL } from "../src/wavefront-shaders.js";
import { reflectAdaptiveBootstrapInterface } from "../scripts/adaptive-bootstrap-interface.js";
import { COUNTER_BUFFER_BYTES } from "../src/wavefront-core.js";

test("bootstrap reuses canonical declarations and clearing without changing the fixed shader", () => {
  for (const fragment of Object.values(shared)) {
    assert.ok(WAVEFRONT_COMPUTE_WGSL.includes(fragment));
    assert.ok(ADAPTIVE_BOOTSTRAP_WGSL.includes(fragment));
  }
  assert.equal(createHash("sha256").update(WAVEFRONT_COMPUTE_WGSL).digest("hex"),
    "c0a78da83cb60ed59a1bc56ead48d7e258c01ce402836d464c5b713b24c38fcb"); // PR 214 corrected fixed baseline.
  assert.match(ADAPTIVE_BOOTSTRAP_WGSL, /pathNodes\[localPixelId\] = PathNode\(\)/u);
  assert.doesNotMatch(ADAPTIVE_BOOTSTRAP_WGSL, /pathVertices|clear_deferred_path/u);
  assert.doesNotMatch(ADAPTIVE_BOOTSTRAP_WGSL, /fn make_ray\(|bsdf|textureSample/u);
});

test("the executed final bootstrap module reflects the existing buffer ABI", async () => {
  const manifest = await reflectAdaptiveBootstrapInterface();
  const record = (name) => manifest.records.find((item) => item.name === name);
  assert.equal(record("Counters").byteSize, 112);
  assert.equal(record("TerminationMetrics").byteSize, 80);
  assert.equal(record("FrameConfig").byteSize, 320);
  assert.equal(record("RayRecord").byteSize, 96);
  assert.equal(record("PathNode").byteSize, 64);
  assert.equal(record("AdaptiveBootstrapControl").byteSize, 16);
  assert.equal(record("AdaptiveBootstrapTile").byteSize, 32);
  assert.deepEqual(record("AdaptiveBootstrapControl").members.map(({ name, offset }) => [name, offset]),
    [["count", 0], ["failure", 4], ["reserved0", 8], ["reserved1", 12]]);
  assert.deepEqual(manifest.entryPoints.map((entry) => entry.name), ["validate_compacted_sample", "initialize_compacted_sample"]);
});

test("bootstrap pipelines are lazy, explicit and propagate shader/pipeline failures", async () => {
  assert.equal(await createAdaptiveBootstrapPipelines(new Proxy({}, { get() { throw new Error("disabled"); } }), null), null);
  const layouts = [];
  const device = {
    createShaderModule: () => ({ getCompilationInfo: async () => ({ messages: [] }) }),
    createBindGroupLayout: (layout) => { layouts.push(layout); return layout; },
    createPipelineLayout: (layout) => layout,
    createComputePipelineAsync: async (descriptor) => descriptor,
  };
  const result = await createAdaptiveBootstrapPipelines(device, { COMPUTE: 4 }, { enabled: true });
  assert.deepEqual(layouts[0].entries.map(({ binding }) => binding), [0, 3, 5, 6, 22]);
  assert.equal(layouts[0].entries[2].buffer.hasDynamicOffset, true);
  assert.equal(layouts[0].entries[3].buffer.minBindingSize, COUNTER_BUFFER_BYTES);
  assert.deepEqual(layouts[1].entries.map(({ binding }) => binding), [0, 1, 2]);
  assert.equal(layouts[1].entries[1].buffer.type, "storage");
  assert.equal(layouts[1].entries[2].buffer.hasDynamicOffset, true);
  assert.equal(result.validate.compute.entryPoint, "validate_compacted_sample");
  assert.equal(result.initialize.compute.entryPoint, "initialize_compacted_sample");
  await assert.rejects(createAdaptiveBootstrapPipelines({ ...device,
    createShaderModule: () => ({ getCompilationInfo: async () => ({ messages: [{ type: "error", message: "bad bootstrap" }] }) }),
  }, { COMPUTE: 4 }, { enabled: true }), /bad bootstrap/u);
  await assert.rejects(createAdaptiveBootstrapPipelines({ ...device,
    createComputePipelineAsync: async () => { throw new Error("rejected bootstrap"); },
  }, { COMPUTE: 4 }, { enabled: true }), /rejected bootstrap/u);
});

test("bootstrap clears counters before separate validation/initialization passes with immutable offsets", () => {
  const calls = [];
  const encoder = {
    clearBuffer: (...args) => calls.push(["clear", ...args]),
    beginComputePass: () => { calls.push(["begin"]); return {
      setPipeline: (pipeline) => calls.push(["pipeline", pipeline]),
      setBindGroup: (...args) => calls.push(["group", ...args]),
      dispatchWorkgroups: (...args) => calls.push(["dispatch", ...args]),
      end: () => calls.push(["end"]),
    }; },
  };
  encodeAdaptiveBootstrap(encoder, { validate: "validate", initialize: "initialize" }, "frame", "worklist", "counters", 512, 256, 195);
  assert.deepEqual(calls, [["clear", "counters", 0, COUNTER_BUFFER_BYTES],
    ...["validate", "initialize"].flatMap((pipeline) => [["begin"], ["pipeline", pipeline],
      ["group", 0, "frame", [512]], ["group", 1, "worklist", [256]], ["dispatch", 4], ["end"]])]);
  for (const offset of [-1, 1, 1.5, NaN, 0x100000000]) {
    const before = calls.length;
    assert.throws(() => encodeAdaptiveBootstrap(encoder, {}, null, null, null, offset, 0, 1));
    assert.throws(() => encodeAdaptiveBootstrap(encoder, {}, null, null, null, 0, offset, 1));
    assert.equal(calls.length, before);
  }
  for (const count of [0, -1, 16385, 1.5, NaN]) {
    const before = calls.length;
    assert.throws(() => encodeAdaptiveBootstrap(encoder, {}, null, null, null, 0, 0, count));
    assert.equal(calls.length, before);
  }
});
