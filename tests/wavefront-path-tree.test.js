import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { reducePathTreeReference } from "../src/wavefront-path-tree-reference.js";
import { PATH_VERTEX_RECORD_BYTES } from "../src/wavefront-core.js";
import { WAVEFRONT_COMPUTE_WGSL } from "../src/wavefront-shaders.js";
import { reflectPathTreeInterface } from "../scripts/path-tree-interface.js";
import { readWavefrontTerminationMetrics } from "../src/wavefront-readbacks.js";
import { createWavefrontTransportGuardrailSummary } from "../src/wavefront-frame-runtime.js";
import { dispatchWavefrontFrame, dispatchWavefrontFrameAwaitingGpu } from "../src/wavefront-frame-dispatcher.js";

const NONE = 0xffffffff;
const node = (changes = {}) => ({ direct: [0, 0, 0], terminal: [0, 0, 0], flags: 1,
  parent: NONE, firstChild: NONE, secondChild: NONE, terminalKind: 2,
  rootId: 0, sourcePixelId: 10, sampleId: 7, depth: 0, ...changes });
const tree = () => [
  node({ direct: [1, 0, 0], terminalKind: 0, firstChild: 2, secondChild: 1 }),
  node({ parent: 0, depth: 1, terminal: [6, 7, 8] }),
  node({ parent: 0, depth: 1, direct: [0, 2, 0], terminal: [3, 4, 5] }),
];

test("the final assembled transport reflects the 64-byte path-node ABI", async () => {
  const manifest = await reflectPathTreeInterface();
  const record = manifest.records.find(({ name }) => name === "PathNode");
  assert.equal(record.byteSize, PATH_VERTEX_RECORD_BYTES);
  assert.deepEqual(record.members.map(({ offset }) => offset),
    [0, 12, 16, 28, 32, 36, 40, 44, 48, 52, 56, 60]);
});

test("complete sibling trees reduce once, independent of temporary slot order", () => {
  assert.deepEqual(reducePathTreeReference(tree(), 0, { sourcePixelId: 10, sampleId: 7, maxDepth: 8 }), { radiance: [10, 13, 13], complete: true, terminalPaths: 2 });
  const nested = tree();
  nested[2] = node({ parent: 0, depth: 1, direct: [0, 2, 0], terminalKind: 0, firstChild: 3 });
  nested.push(node({ parent: 2, depth: 2, terminal: [3, 4, 5] }));
  assert.deepEqual(reducePathTreeReference(nested, 0, { sourcePixelId: 10, sampleId: 7, maxDepth: 8 }), { radiance: [10, 13, 13], complete: true, terminalPaths: 2 });
  assert.deepEqual(reducePathTreeReference([node()], 0, { sourcePixelId: 10, sampleId: 7, maxDepth: 1 }), { radiance: [0, 0, 0], complete: true, terminalPaths: 1 });
});

test("missing branches, overflow and invalid lineage never become a successful darker sample", () => {
  for (const changes of [
    { flags: 3 }, { sourcePixelId: 11 }, { sampleId: 8 }, { parent: 1 }, { depth: 3 },
    { terminal: [NaN, 0, 0] }, { terminal: [-1, 0, 0] }, { terminal: [Infinity, 0, 0] },
    { terminalKind: 0 }, { firstChild: 0 },
  ]) {
    const input = tree(); input[1] = { ...input[1], ...changes };
    assert.equal(reducePathTreeReference(input, 0, { sourcePixelId: 10, sampleId: 7, maxDepth: 8 }).complete, false);
  }
  for (const changes of [{ secondChild: 2 }, { firstChild: 900 }, { parent: 2 }, { flags: 0 }]) {
    const input = tree(); input[0] = { ...input[0], ...changes };
    assert.equal(reducePathTreeReference(input, 0, { sourcePixelId: 10, sampleId: 7, maxDepth: 8 }).complete, false);
  }
  assert.equal(reducePathTreeReference(tree(), 0, { sourcePixelId: 10, sampleId: 7, maxDepth: 1 }).complete, false);
});

test("the renderer uses depth/slot-owned nodes instead of sibling writes to pixel accumulation", async () => {
  assert.equal(PATH_VERTEX_RECORD_BYTES, 64);
  assert.match(WAVEFRONT_COMPUTE_WGSL, /struct PathNode/);
  assert.match(WAVEFRONT_COMPUTE_WGSL, /fn resolve_complete_path_tree/);
  const kernel = await readFile(new URL("../src/wavefront-shader-kernels.js", import.meta.url), "utf8");
  const resolve = kernel.slice(kernel.indexOf("fn resolveSurfaceRecords"), kernel.indexOf("fn compactAndSwapQueues"));
  assert.doesNotMatch(resolve, /accumulation\[ray\.rayId\]\s*=/);
  assert.match(resolve, /begin_path_node\(activeQueue\[index\], index\)/);
});

test("both dispatch styles reduce each complete camera sample before reusing node storage", () => {
  for (const deferredPathResolve of [false, true]) {
    for (const awaiting of [false, true]) {
      const events = [];
      const config = { maxDepth: 2, samplesPerPixel: 3, deferredPathResolve,
        maxFramePassesPerSubmission: 16, denoise: false };
      const device = { createCommandEncoder: () => ({ finish: () => ({}) }), queue: { submit() {} } };
      const frameEncoder = {
        encodeTileSample: (_encoder, _tile, offset) => events.push(["sample", offset]),
        encodeTileOutput: (_encoder, _tile, offset) => events.push(["resolve", offset]),
        encodePresent() {},
      };
      const input = { config, device, frameEncoder, tiles: [{ x: 0, y: 0, width: 4, height: 1 }], frameIndex: 1 };
      if (awaiting) dispatchWavefrontFrameAwaitingGpu({ ...input, writeFrameConfigSlot: (slot) => slot });
      else dispatchWavefrontFrame({ ...input, createFrameConfigWriter: () => (_tile, options) => options.sampleIndex });
      assert.deepEqual(events, [["sample", 0], ["resolve", 0], ["sample", 1], ["resolve", 1], ["sample", 2], ["resolve", 2]]);
    }
  }
});

test("missing integrity readback is unknown; a sticky failure rejects the frame", async () => {
  const unknown = await readWavefrontTerminationMetrics({ constants: {} });
  assert.equal(unknown.pathCompletionValid, null);
  for (const word of [0, 1]) {
    const data = new Uint32Array(32); data[26] = word;
    let destroyed = false;
    const device = {
      createBuffer: () => ({ async mapAsync() {}, getMappedRange: () => data.buffer,
        unmap() {}, destroy: () => { destroyed = true; } }),
      createCommandEncoder: () => ({ copyBufferToBuffer() {}, finish: () => ({}) }),
      queue: { submit() {} },
    };
    const result = await readWavefrontTerminationMetrics({ device, constants: { map: { READ: 1 }, buffer: { COPY_DST: 1, MAP_READ: 2 } },
      counterBuffer: {}, waitForSubmittedGpuWork: async () => {} });
    assert.equal(result.pathCompletionValid, word === 0);
    assert.equal(destroyed, true);
    const guardrail = createWavefrontTransportGuardrailSummary(result).checks.find(({ id }) => id === "path-completion");
    assert.equal(guardrail.status, word === 0 ? "pass" : "fail");
  }
});

test("dielectric siblings share refraction convention and roulette compensation; metals never split", () => {
  assert.match(WAVEFRONT_COMPUTE_WGSL, /sanitize_linear_radiance\(rawTerminal\) \* sample_weight\(\)/);
  assert.match(WAVEFRONT_COMPUTE_WGSL, /let etaRatio = dielectric_eta\(hit\);/);
  assert.match(WAVEFRONT_COMPUTE_WGSL, /refract_direction\(ray.direction.xyz, surface_shading_normal\(hit\),\s+dielectric_eta\(hit\)\)/);
  assert.match(WAVEFRONT_COMPUTE_WGSL, /if \(totalInternalReflection\) \{\s+continuationThroughput = segmentTransmittance;/);
  assert.match(WAVEFRONT_COMPUTE_WGSL, /secondaryThroughput = secondaryThroughput \/ survivalProbability;/);
  assert.match(WAVEFRONT_COMPUTE_WGSL, /if \(splitDielectric\) \{\s+let secondaryIndex/);
});

test("completion integrity readback failures release staging and cannot manufacture a pass", async () => {
  for (const stage of ["wait", "map"]) {
    let destroyed = false;
    const device = {
      createBuffer: () => ({ async mapAsync() { throw new Error("map failed"); },
        unmap() {}, destroy: () => { destroyed = true; } }),
      createCommandEncoder: () => ({ copyBufferToBuffer() {}, finish: () => ({}) }),
      queue: { submit() {} },
    };
    await assert.rejects(readWavefrontTerminationMetrics({ device,
      constants: { map: { READ: 1 }, buffer: { COPY_DST: 1, MAP_READ: 2 } }, counterBuffer: {},
      waitForSubmittedGpuWork: async () => { if (stage === "wait") throw new Error("wait failed"); },
    }), new RegExp(stage + " failed"));
    assert.equal(destroyed, true);
  }
});
