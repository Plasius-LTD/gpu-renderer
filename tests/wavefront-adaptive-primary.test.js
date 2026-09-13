import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createGpuRecordCodec } from "@plasius/gpu-shader";
import { packAdaptivePixelState, planAdaptiveResources, createAdaptiveResourceOwner } from "../src/wavefront-adaptive-metadata.js";
import { packAdaptivePrimaryConfig, compactAdaptivePrimaryReference, createAdaptivePrimaryPipelines, encodeAdaptivePrimaryWorklist } from "../src/wavefront-adaptive-primary.js";
import { reflectAdaptivePrimaryInterface, generateAdaptivePrimaryConstants } from "../scripts/adaptive-primary-interface.js";

const tile = { width: 8, height: 8, tileX: 2, tileY: 3, tileWidth: 3, tileHeight: 2, tier: 32 };
const pixels = () => new Uint32Array(64).fill(packAdaptivePixelState({ requested: 32 }));

test("worklist configuration uses the final reflected ABI and generated constants", async () => {
  const manifest = await reflectAdaptivePrimaryInterface();
  const config = manifest.records.find(({ name }) => name === "AdaptivePrimaryConfig");
  assert.equal(config.byteSize, 32);
  assert.equal(manifest.records.find(({ name }) => name === "AdaptivePrimaryControl").byteSize, 16);
  assert.deepEqual(packAdaptivePrimaryConfig(tile), createGpuRecordCodec(config, manifest.records).encode({
    canvasWidth: 8, canvasHeight: 8, tileX: 2, tileY: 3, tileWidth: 3, tileHeight: 2, tier: 32, reserved: 0,
  }));
  assert.equal(await readFile(new URL("../src/wavefront-adaptive-primary-constants.js", import.meta.url), "utf8"), await generateAdaptivePrimaryConstants());
});
test("compaction preserves tile-local and full-screen ownership across mixed tiers", () => {
  const words = pixels(); words[27] = packAdaptivePixelState({ requested: 4, completed: 4 }); words[34] = packAdaptivePixelState({ requested: 8 });
  const result = compactAdaptivePrimaryReference(words, tile, 64);
  assert.equal(result.failed, false); assert.equal(result.count, 4);
  assert.deepEqual(result.localPixelIds, [0, 2, 4, 5]);
  assert.deepEqual(result.sourcePixelIds, [26, 28, 35, 36]);
  assert.deepEqual(result.dispatch, [1, 1, 1]);
  assert.deepEqual(compactAdaptivePrimaryReference(words, { ...tile, tier: 128 }, 64).dispatch, [0, 1, 1]);
});
test("full tiles and every legal tier produce a complete bounded worklist", () => {
  for (const tier of [1, 2, 4, 8, 16, 32, 64, 128, 256]) {
    const config = { width: 128, height: 128, tileX: 0, tileY: 0, tileWidth: 128, tileHeight: 128, tier };
    const words = new Uint32Array(16384).fill(packAdaptivePixelState({ requested: tier }));
    const result = compactAdaptivePrimaryReference(words, config, 16384);
    assert.equal(result.count, 16384); assert.equal(new Set(result.localPixelIds).size, 16384);
    assert.deepEqual(result.dispatch, [256, 1, 1]);
  }
});
test("malformed counts, failed pixels, reused selected tiers and overflow veto all dispatch", () => {
  for (const word of [0, 511, 32 | (33 << 9), (32 | 0x80000000) >>> 0, packAdaptivePixelState({ requested: 32, completed: 1 })]) {
    const words = pixels(); words[26] = word;
    const result = compactAdaptivePrimaryReference(words, tile, 64);
    assert.equal(result.failed, true); assert.equal(result.count, 0); assert.deepEqual(result.dispatch, [0, 1, 1]);
  }
  assert.equal(compactAdaptivePrimaryReference(pixels(), tile, 2).failed, true);
});
test("primary config rejects bad domains and impossible capacities", () => {
  for (const change of [{ width: 0 }, { width: 65536, height: 65536 }, { tileX: -1 }, { tileX: 8 }, { tileY: 8 }, { tileWidth: 0 }, { tileHeight: 0 }, { tier: 0 }, { tier: 257 }, { tier: 1.5 }, { width: 512, height: 512, tileWidth: 256, tileHeight: 256 }]) {
    assert.throws(() => packAdaptivePrimaryConfig({ ...tile, ...change }));
  }
  assert.throws(() => compactAdaptivePrimaryReference(new Uint32Array(2), tile, 64));
  assert.throws(() => compactAdaptivePrimaryReference(pixels(), tile, 0));
});
test("disabled primary pipelines do not touch the GPU; enabled uses three explicit stages", async () => {
  assert.equal(await createAdaptivePrimaryPipelines(new Proxy({}, { get() { throw new Error("unused"); } }), null), null);
  const entries = [];
  const device = {
    createShaderModule: () => ({ getCompilationInfo: async () => ({ messages: [] }) }),
    createBindGroupLayout: (descriptor) => { entries.push(descriptor.entries); return descriptor; },
    createPipelineLayout: (descriptor) => descriptor,
    createComputePipelineAsync: async (descriptor) => { entries.push(descriptor.compute.entryPoint); return descriptor; },
  };
  const pipelines = await createAdaptivePrimaryPipelines(device, { COMPUTE: 4 }, { enabled: true });
  assert.deepEqual(entries.slice(1), ["initialize_primary_worklist", "compact_primary_tier", "finalize_primary_dispatch"]);
  assert.equal(entries[0][4].buffer.hasDynamicOffset, true);
  const calls = [];
  const encoder = { beginComputePass: () => ({ setPipeline: (value) => calls.push(value.compute.entryPoint), setBindGroup: (...args) => calls.push(args), dispatchWorkgroups: (count) => calls.push(count), end() {} }) };
  const encodedTile = { ...tile, width: 65, tileX: 0, tileWidth: 65, tileHeight: 1 };
  encodeAdaptivePrimaryWorklist(encoder, pipelines, "group", 256, encodedTile);
  assert.deepEqual(calls.filter((value) => typeof value === "number"), [2, 2, 1]);
  assert.deepEqual(calls.filter(Array.isArray), [[0, "group", [256]], [0, "group", [256]], [0, "group", [256]]]);
  assert.throws(() => encodeAdaptivePrimaryWorklist(encoder, pipelines, "group", 1, encodedTile));
  assert.throws(() => encodeAdaptivePrimaryWorklist(encoder, pipelines, "group", 0, { ...encodedTile, tileWidth: 0 }));
  await assert.rejects(createAdaptivePrimaryPipelines({ ...device, createShaderModule: () => ({ getCompilationInfo: async () => ({ messages: [{ type: "error", message: "invalid" }] }) }) }, { COMPUTE: 4 }, { enabled: true }), /invalid/);
  for (const failingStage of entries.slice(1)) {
    await assert.rejects(createAdaptivePrimaryPipelines({ ...device, createComputePipelineAsync: async (descriptor) => {
      if (descriptor.compute.entryPoint === failingStage) throw new Error("pipeline rejected");
      return descriptor;
    } }, { COMPUTE: 4 }, { enabled: true }), /pipeline rejected/);
  }
});

test("primary-only resource allocation validates uniforms and cleans up admitted bytes", async () => {
  const allocations = [];
  const limits = { maxBufferSize: 268435456, maxStorageBufferBindingSize: 134217728,
    minUniformBufferOffsetAlignment: 256, maxUniformBufferBindingSize: 65536 };
  const usage = { STORAGE: 128, COPY_DST: 8, INDIRECT: 256, UNIFORM: 64 };
  const device = { limits, pushErrorScope() {}, async popErrorScope() { return null; },
    createBuffer: (descriptor) => { const buffer = { ...descriptor, destroyed: false, destroy() { this.destroyed = true; } }; allocations.push(buffer); return buffer; } };
  const options = { enabled: true, width: 8, height: 8, primaryWorklist: true };
  const owner = createAdaptiveResourceOwner(device, usage, options);
  assert.equal(allocations.length, 0);
  const result = await owner.acquire();
  assert.equal(result.status, "ready"); assert.equal(result.buffers.primaryConfig.usage, usage.UNIFORM | usage.COPY_DST);
  assert.equal(result.buffers.primaryControl.size, 16);
  assert.equal(result.allocatedBytes, owner.snapshot().plan.bytes.total);
  owner.destroy(); assert.equal(owner.snapshot().allocatedBytes, 0); assert.ok(allocations.every(({ destroyed }) => destroyed));
  assert.equal(planAdaptiveResources(options, { ...limits, maxUniformBufferBindingSize: 16 }).reason, "adaptive-device-uniform-limits");
  assert.equal(planAdaptiveResources(options, { ...limits, minUniformBufferOffsetAlignment: 512 }).reason, "adaptive-device-uniform-limits");
  assert.equal((await createAdaptiveResourceOwner(device, { ...usage, UNIFORM: undefined }, options).acquire()).status, "disabled");
  assert.throws(() => planAdaptiveResources({ ...options, primaryWorklist: "yes" }));
});
test("primary controls and immutable slots are admitted under the existing allocation cap", () => {
  const base = planAdaptiveResources({ enabled: true, width: 3840, height: 2160 });
  const enabled = planAdaptiveResources({ enabled: true, width: 3840, height: 2160, primaryWorklist: true, primaryConfigSlots: 9 });
  assert.equal(enabled.bytes.primaryControl, 16); assert.equal(enabled.bytes.primaryConfig, 9 * 256);
  assert.equal(enabled.bytes.total - base.bytes.total, 16 + 9 * 256);
  assert.equal(planAdaptiveResources({ enabled: true, width: 3840, height: 2160, primaryWorklist: true, maximumAllocationBytes: enabled.bytes.total - 1, primaryConfigSlots: 9 }).reason, "adaptive-allocation-cap");
  assert.throws(() => planAdaptiveResources({ enabled: true, width: 8, height: 8, primaryWorklist: true, primaryConfigSlots: 0 }));
});
