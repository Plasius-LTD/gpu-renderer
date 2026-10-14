import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createGpuRecordCodec } from "@plasius/gpu-shader";
import { packAdaptivePixelState, unpackAdaptivePixelState, planAdaptiveResources } from "../src/wavefront-adaptive-metadata.js";
import { WAVEFRONT_COMPUTE_WGSL } from "../src/wavefront-shaders.js";
import {
  reduceAdaptiveSampleBranches, commitAdaptiveSampleReference, resolveAdaptiveRadianceReference,
  packAdaptiveResolveConfig, packAdaptiveCameraSamples, createAdaptiveResolvePipelines,
} from "../src/wavefront-adaptive-resolve.js";
import { reflectAdaptiveResolveInterface, generateAdaptiveResolveConstants } from "../scripts/adaptive-resolve-interface.js";

const tile = { width: 8, height: 8, tileX: 2, tileY: 3, tileWidth: 2, tileHeight: 2, sampleOrdinal: 0, frameValid: true };
const sample = (sourcePixelId, sampleOrdinal, radiance = [2, 4, 8]) => ({ sourcePixelId, sampleOrdinal, radiance, status: 1 });
const state = (requested = 32, completed = 0, flags = 0, sum = [0, 0, 0]) => ({ word: packAdaptivePixelState({ requested, completed, flags }), sum });

test("unequal completed counts preserve the unweighted linear HDR mean up to 256 SPP", () => {
  for (const budget of [1, 2, 4, 32, 128, 256]) {
    let current = state(budget);
    for (let ordinal = 0; ordinal < budget; ordinal += 1) {
      current = commitAdaptiveSampleReference(current, sample(26, ordinal, [1024, 0.5, 131072]), { ...tile, sampleOrdinal: ordinal }, 0);
    }
    assert.equal(unpackAdaptivePixelState(current.word).completed, budget);
    assert.deepEqual(current.sum, [1024 * budget, 0.5 * budget, 131072 * budget]);
    assert.deepEqual(resolveAdaptiveRadianceReference(current), [1024, 0.5, 131072, 1]);
  }
  let current = state(4);
  for (let ordinal = 0; ordinal < 2; ordinal += 1) current = commitAdaptiveSampleReference(current, sample(26, ordinal, [ordinal * 2 + 2, 8, 16]), { ...tile, sampleOrdinal: ordinal }, 0);
  assert.deepEqual(resolveAdaptiveRadianceReference(current), [3, 8, 16, 1]);
});

test("the branch oracle combines siblings without treating them as additional camera samples", () => {
  const branches = [
    { ...sample(26, 0, [2, 4, 8]), branchId: 9 },
    { ...sample(26, 0, [3, 6, 12]), branchId: 2 },
  ];
  const reduced = reduceAdaptiveSampleBranches({ sourcePixelId: 26, sampleOrdinal: 0, expectedBranches: 2, branches });
  assert.deepEqual(reduced, sample(26, 0, [5, 10, 20]));
  const committed = commitAdaptiveSampleReference(state(32), reduced, tile, 0);
  assert.equal(unpackAdaptivePixelState(committed.word).completed, 1);
  assert.deepEqual(resolveAdaptiveRadianceReference(committed), [5, 10, 20, 1]);
  for (const invalid of [branches.slice(0, 1), [...branches, branches[0]], [branches[0], branches[0]], [branches[0], { ...branches[1], status: 0 }], [branches[0], { ...branches[1], sourcePixelId: 27 }]]) {
    assert.notEqual(reduceAdaptiveSampleBranches({ sourcePixelId: 26, sampleOrdinal: 0, expectedBranches: 2, branches: invalid }).status, 1);
  }
});

test("eligible partial, mismatched, duplicate, skipped, failed and corrupt samples never advance counts", () => {
  const cases = [
    [state(), { ...sample(26, 0), status: 0 }, tile],
    [state(), { ...sample(26, 0), status: 2 }, tile],
    [state(), sample(27, 0), tile],
    [state(), sample(26, 1), tile],
    [state(32, 1, 0, [2, 4, 8]), sample(26, 0), tile],
    [state(), sample(26, 2), { ...tile, sampleOrdinal: 2 }],
    [state(), sample(26, 0), { ...tile, frameValid: false }],
    [{ word: 511, sum: [1, 1, 1] }, sample(26, 0), tile],
    [state(0), sample(26, 0), tile],
  ];
  for (const [before, cameraSample, config] of cases) {
    const result = commitAdaptiveSampleReference(before, cameraSample, config, 0);
    assert.equal((result.word >>> 9) & 511, (before.word >>> 9) & 511);
    assert.deepEqual(result.sum, before.sum);
    assert.deepEqual(resolveAdaptiveRadianceReference(result), [0, 0, 0, 0]);
    assert.equal(result.word >>> 31, 1);
  }
});

test("non-finite, negative and overflowing float32 radiance is rejected without HDR clamping", () => {
  for (const radiance of [[NaN, 1, 1], [Infinity, 1, 1], [-1, 1, 1], [Number.MAX_VALUE, 1, 1]]) {
    const result = commitAdaptiveSampleReference(state(), sample(26, 0, radiance), tile, 0);
    assert.equal((result.word >>> 9) & 511, 0);
    assert.deepEqual(resolveAdaptiveRadianceReference(result), [0, 0, 0, 0]);
  }
  const result = commitAdaptiveSampleReference(state(32, 1, 0, [3e38, 0, 0]), sample(26, 1, [3e38, 0, 0]), { ...tile, sampleOrdinal: 1 }, 0);
  assert.equal((result.word >>> 9) & 511, 1);
  assert.deepEqual(resolveAdaptiveRadianceReference(result), [0, 0, 0, 0]);
  assert.deepEqual(resolveAdaptiveRadianceReference(state(32, 1, 0, [NaN, 1, 1])), [0, 0, 0, 0]);
});

test("tile reuse resets the first sum, inactive budgets remain untouched and flags survive", () => {
  const before = state(2, 0, 123, [9e20, 9e20, 9e20]);
  const first = commitAdaptiveSampleReference(before, sample(35, 0), tile, 3);
  assert.deepEqual(first.sum, [2, 4, 8]);
  assert.equal(unpackAdaptivePixelState(first.word).flags, 123);
  const inactive = state(2, 2, 123, [4, 8, 16]);
  assert.deepEqual(commitAdaptiveSampleReference(inactive, null, { ...tile, sampleOrdinal: 2 }, 0), inactive);
  assert.deepEqual(resolveAdaptiveRadianceReference(state()), [0, 0, 0, 0]);
  assert.throws(() => commitAdaptiveSampleReference(state(), sample(0, 0), tile, 4));
});

test("configuration and sample packers match the final reflected codecs", async () => {
  const manifest = await reflectAdaptiveResolveInterface();
  const record = manifest.records.find(({ name }) => name === "AdaptiveResolveConfig");
  const camera = manifest.records.find(({ name }) => name === "AdaptiveCameraSample");
  assert.equal(record.byteSize, 32);
  assert.equal(camera.byteSize, 32);
  assert.deepEqual(packAdaptiveResolveConfig(tile), createGpuRecordCodec(record, manifest.records).encode({
    canvasWidth: 8, canvasHeight: 8, tileX: 2, tileY: 3, tileWidth: 2, tileHeight: 2, sampleOrdinal: 0, frameValid: 1,
  }));
  const sampleBytes = createGpuRecordCodec(camera, manifest.records).encode({ radiance: [2, 4, 8], sourcePixelId: 26, sampleOrdinal: 0, status: 1, reserved0: 0, reserved1: 0 });
  assert.deepEqual(packAdaptiveCameraSamples([sample(26, 0)]), sampleBytes);
  assert.equal(await readFile(new URL("../src/wavefront-adaptive-resolve-constants.js", import.meta.url), "utf8"), await generateAdaptiveResolveConstants());
});

test("configuration packing rejects invalid canvas, tile, ordinal and success evidence", () => {
  for (const overrides of [
    { width: 0 }, { width: "8" }, { width: 65536, height: 65536 }, { tileX: -1 },
    { tileX: 8 }, { tileY: 8 }, { tileWidth: 0 }, { tileHeight: 9 }, { sampleOrdinal: 256 },
    { frameValid: "true" }, { frameValid: undefined }, { tileWidth: 256, tileHeight: 256, width: 512, height: 512 },
  ]) assert.throws(() => packAdaptiveResolveConfig({ ...tile, ...overrides }));
  assert.throws(() => packAdaptiveCameraSamples([]));
  assert.throws(() => packAdaptiveCameraSamples([sample(-1, 0)]));
  assert.throws(() => packAdaptiveCameraSamples([sample(0, 0, [NaN, 0, 0])]));
});

test("count-resolve scratch and immutable config slots are included in allocation admission", () => {
  const plan = planAdaptiveResources({ enabled: true, width: 3840, height: 2160, countResolve: true, resolveConfigSlots: 128 });
  assert.equal(plan.bytes.cameraSamples, 524288);
  assert.equal(plan.bytes.radianceSums, 262144);
  assert.equal(plan.bytes.resolvedRadiance, 262144);
  assert.equal(plan.bytes.resolveConfig, 32768);
  assert.equal(plan.bytes.total, 33243148 + 1048576 + 32768);
  assert.equal(planAdaptiveResources({ enabled: true, width: 3840, height: 2160, countResolve: true, resolveConfigSlots: 600000 }).reason, "adaptive-allocation-cap");
  assert.throws(() => planAdaptiveResources({ enabled: true, width: 8, height: 8, countResolve: true, resolveConfigSlots: 0 }));
});

test("disabled pipelines perform no GPU access; enabled pipelines use explicit layouts", async () => {
  assert.equal(await createAdaptiveResolvePipelines(null, null, { enabled: false }), null);
  const calls = [];
  const device = {
    createShaderModule(descriptor) { calls.push(descriptor); return { getCompilationInfo: async () => ({ messages: [] }) }; },
    createBindGroupLayout(descriptor) { calls.push(descriptor); return descriptor; },
    createPipelineLayout(descriptor) { return descriptor; },
    async createComputePipelineAsync(descriptor) { calls.push(descriptor); return descriptor; },
  };
  const resources = await createAdaptiveResolvePipelines(device, { COMPUTE: 4 }, { enabled: true });
  assert.equal(resources.commit.compute.entryPoint, "commit_adaptive_sample");
  assert.equal(resources.resolve.compute.entryPoint, "resolve_adaptive_radiance");
  const config = resources.layout.entries.find(({ binding }) => binding === 4);
  assert.equal(config.buffer.hasDynamicOffset, true);
  assert.equal(config.buffer.minBindingSize, 32);
  const manifest = await reflectAdaptiveResolveInterface();
  assert.deepEqual(resources.layout.entries, manifest.bindings.map(({ binding, resource }) => ({
    binding, visibility: 4,
    buffer: {
      type: resource.addressSpace === "uniform" ? "uniform" : resource.access === "read" ? "read-only-storage" : "storage",
      ...(resource.addressSpace === "uniform" ? { hasDynamicOffset: true } : {}),
      minBindingSize: resource.minimumBindingSize,
    },
  })));
});

test("pipeline compilation failures propagate without returning partial pipelines", async () => {
  for (const failure of ["shader", "commit", "resolve"]) {
    const calls = [];
    const device = {
      createShaderModule: () => ({ getCompilationInfo: async () => ({ messages: failure === "shader" ? [{ type: "error", message: "invalid fixture" }] : [] }) }),
      createBindGroupLayout: (descriptor) => descriptor,
      createPipelineLayout: (descriptor) => descriptor,
      async createComputePipelineAsync(descriptor) {
        calls.push(descriptor.compute.entryPoint);
        if (descriptor.label.endsWith(failure)) throw new Error("Pipeline rejected");
        return descriptor;
      },
    };
    await assert.rejects(createAdaptiveResolvePipelines(device, { COMPUTE: 4 }, { enabled: true }));
    assert.equal(calls.length, failure === "shader" ? 0 : failure === "commit" ? 1 : 2);
  }
});

test("the fixed assembled transport remains byte-identical", () => {
  assert.equal(createHash("sha256").update(WAVEFRONT_COMPUTE_WGSL).digest("hex"), "6314e7ac17898b87cd8fc0b9bce46743237b8c5f8099ca31b8040c49726564d0");
});
