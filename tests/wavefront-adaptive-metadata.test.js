import assert from "node:assert/strict";
import test from "node:test";
import { createGpuRecordCodec } from "@plasius/gpu-shader";
import {
  packAdaptivePixelState,
  unpackAdaptivePixelState,
  planAdaptiveResources,
  createAdaptiveResourceOwner,
} from "../src/wavefront-adaptive-metadata.js";
import { reflectAdaptiveInterface, generateAdaptiveByteConstants } from "../scripts/adaptive-interface.js";
import { readFile } from "node:fs/promises";

const options = { enabled: true, width: 3840, height: 2160 };
const usage = { STORAGE: 128, COPY_DST: 8, INDIRECT: 256 };
function fakeDevice({ failAt = -1, scopeError = null, scopeWait } = {}) {
  const buffers = [];
  const scopes = [];
  let pops = 0;
  return {
    buffers, scopes,
    limits: { maxBufferSize: 256 * 1024 ** 2, maxStorageBufferBindingSize: 128 * 1024 ** 2 },
    createBuffer(descriptor) {
      if (buffers.length === failAt) throw new Error("private provider error");
      const buffer = { ...descriptor, destroyed: 0, destroy() { this.destroyed += 1; } };
      buffers.push(buffer);
      return buffer;
    },
    pushErrorScope(filter) { scopes.push(filter); },
    async popErrorScope() {
      pops += 1;
      if (scopeWait) await scopeWait;
      return pops === 1 ? scopeError : null;
    },
  };
}

test("adaptive count ABI exhaustively round trips legal counts, including 256", () => {
  for (let requested = 0; requested <= 256; requested += 1) {
    for (let completed = 0; completed <= requested; completed += 1) {
      for (const flags of [0, 1, 8192, 16383]) {
        const word = packAdaptivePixelState({ requested, completed, flags });
        assert.ok(word >= 0 && word <= 0xffffffff);
        assert.deepEqual(unpackAdaptivePixelState(word), { requested, completed, flags });
      }
    }
  }
  assert.equal(packAdaptivePixelState({ requested: 256, completed: 256, flags: 16383 }), 0xfffe0100);
});

test("adaptive packing rejects malformed counts, flags, words and impossible completion", () => {
  for (const invalid of [-1, 257, NaN, Infinity, 1.5, "2", null]) {
    assert.throws(() => packAdaptivePixelState({ requested: invalid, completed: 0, flags: 0 }));
    assert.throws(() => packAdaptivePixelState({ requested: 256, completed: invalid, flags: 0 }));
  }
  for (const invalid of [-1, 16384, NaN, 0.5, "0", null]) {
    assert.throws(() => packAdaptivePixelState({ requested: 1, completed: 0, flags: invalid }));
  }
  for (const invalid of [-1, 0x100000000, NaN, 1.5, "0", null, 511, 511 << 9, 2 << 9 | 1]) {
    assert.throws(() => unpackAdaptivePixelState(invalid));
  }
  assert.throws(() => packAdaptivePixelState({ requested: 1, completed: 2, flags: 0 }));
});

test("final adaptive WGSL controls checked byte constants and CPU codec offsets", async () => {
  const manifest = await reflectAdaptiveInterface();
  const record = manifest.records.find(({ name }) => name === "AdaptivePixelState");
  assert.equal(record.byteSize, 4);
  assert.equal(record.alignment, 4);
  assert.equal(record.members[0].offset, 0);
  const pixels = manifest.records.find(({ name }) => name === "AdaptivePixelStates");
  assert.equal(pixels.members[0].type.stride, 4);
  const codec = createGpuRecordCodec(record, manifest.records);
  const word = packAdaptivePixelState({ requested: 256, completed: 128, flags: 16383 });
  assert.equal(new DataView(codec.encode({ word })).getUint32(0, true), word);
  assert.ok(manifest.entryPoints.some(({ name }) => name === "reset_adaptive_counts"));
  assert.equal(await readFile(new URL("../src/wavefront-adaptive-byte-constants.js", import.meta.url), "utf8"),
    await generateAdaptiveByteConstants());
});

test("4K admission accounts for bounded worklists, optional classifiers and two packed masks", () => {
  const base = planAdaptiveResources(options);
  assert.equal(base.enabled, true);
  assert.deepEqual(base.bytes, {
    pixelState: 33177600, firstHitDistance: 0, normalMaterialRisk: 0,
    worklist: 65536, dispatch: 12, history: 0, total: 33243148,
  });
  const full = planAdaptiveResources({ ...options, firstHitDistance: true, normalMaterialRisk: true, history: true });
  assert.equal(full.bytes.total, 101671948);
  assert.equal(full.bytes.history, 2073600);
  assert.equal(full.buffers.length, 7);
  const partial = planAdaptiveResources({ ...options, width: 33, height: 1, history: true, tilePixelCapacity: 16 });
  assert.equal(partial.bytes.history, 16);
  assert.equal(partial.bytes.worklist, 64);
  assert.equal(planAdaptiveResources({ ...options, normalMaterialRisk: true }).bytes.firstHitDistance, 0);
});

test("cap and device limits reject before allocation and report planned, not allocated, bytes", () => {
  const admitted = planAdaptiveResources(options);
  assert.equal(planAdaptiveResources({ ...options, maximumAllocationBytes: admitted.bytes.total }).enabled, true);
  const rejected = planAdaptiveResources({ ...options, maximumAllocationBytes: admitted.bytes.total - 1 });
  assert.equal(rejected.enabled, false);
  assert.equal(rejected.reason, "adaptive-allocation-cap");
  assert.equal(rejected.bytes.total, admitted.bytes.total);
  assert.equal(planAdaptiveResources({ ...options, width: 7680, height: 4320, firstHitDistance: true }).reason, "adaptive-allocation-cap");
  assert.equal(planAdaptiveResources(options, { maxBufferSize: 1024, maxStorageBufferBindingSize: 1024 }).reason, "adaptive-device-buffer-limit");
  assert.equal(planAdaptiveResources(options, {}).reason, "adaptive-device-limits-unavailable");
  assert.equal(planAdaptiveResources(options, { maxBufferSize: Infinity, maxStorageBufferBindingSize: NaN }).enabled, false);
});

test("invalid dimensions and allocation options fail closed; disabled state ignores unused configuration", () => {
  for (const field of ["width", "height", "tilePixelCapacity", "maximumAllocationBytes"]) {
    for (const value of [0, -1, 1.5, NaN, Infinity, "32", null]) {
      assert.throws(() => planAdaptiveResources({ ...options, [field]: value }), field);
    }
  }
  assert.throws(() => planAdaptiveResources({ ...options, width: 65536, height: 65536 }));
  assert.throws(() => planAdaptiveResources({ ...options, tilePixelCapacity: 16385 }));
  for (const key of ["firstHitDistance", "normalMaterialRisk", "history"]) {
    for (const value of [null, "true", 1]) assert.throws(() => planAdaptiveResources({ ...options, [key]: value }));
  }
  const disabled = planAdaptiveResources({ enabled: false, width: NaN });
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.reason, "adaptive-disabled");
  assert.equal(disabled.bytes.total, 0);
  assert.deepEqual(disabled.buffers, []);
});

test("resource owner is lazy, reuses allocations, and destroys idempotently", async () => {
  const device = fakeDevice();
  const owner = createAdaptiveResourceOwner(device, usage, options);
  assert.equal(device.buffers.length, 0);
  assert.equal(owner.snapshot().allocatedBytes, 0);
  const first = await owner.acquire();
  assert.equal(first.status, "ready");
  assert.equal(device.buffers.length, 3);
  assert.deepEqual(device.scopes, ["out-of-memory", "validation"]);
  assert.equal(await owner.acquire(), first);
  assert.equal(owner.snapshot().allocatedBytes, 33243148);
  assert.ok(device.buffers.every(({ usage: value }) => (value & 1) === 0));
  assert.equal(first.buffers.dispatch.usage, usage.STORAGE | usage.COPY_DST | usage.INDIRECT);
  owner.destroy();
  owner.destroy();
  assert.ok(device.buffers.every(({ destroyed }) => destroyed === 1));
  assert.equal(owner.snapshot().allocatedBytes, 0);
  assert.equal((await owner.acquire()).reason, "adaptive-disposed");
});

test("disabled, refused, or missing-device-evidence owners allocate no buffers or scopes", async () => {
  for (const settings of [{ enabled: false }, { ...options, maximumAllocationBytes: 1 }]) {
    const device = fakeDevice();
    const owner = createAdaptiveResourceOwner(device, usage, settings);
    assert.equal((await owner.acquire()).status, "disabled");
    assert.equal(device.buffers.length, 0);
    assert.equal(device.scopes.length, 0);
    owner.destroy();
  }
  const device = fakeDevice();
  device.popErrorScope = undefined;
  const result = await createAdaptiveResourceOwner(device, usage, options).acquire();
  assert.equal(result.reason, "adaptive-error-scopes-unavailable");
  assert.equal(device.buffers.length, 0);
});

test("partial synchronous, GPU validation and OOM failures destroy all created buffers", async () => {
  for (const settings of [{ failAt: 0 }, { failAt: 1 }, { failAt: 2 }, { scopeError: { message: "private validation detail" } }]) {
    const device = fakeDevice(settings);
    const owner = createAdaptiveResourceOwner(device, usage, options);
    const result = await owner.acquire();
    assert.equal(result.status, "disabled");
    assert.equal(result.reason, "adaptive-allocation-failed");
    assert.equal(owner.snapshot().allocatedBytes, 0);
    assert.ok(device.buffers.every(({ destroyed }) => destroyed === 1));
    assert.doesNotMatch(JSON.stringify(result), /private/);
    assert.equal(await owner.acquire(), result);
    owner.destroy();
    assert.ok(device.buffers.every(({ destroyed }) => destroyed === 1));
  }
});

test("concurrent acquisition shares work and disposal during error-scope completion does not leak", async () => {
  let release;
  const scopeWait = new Promise((resolve) => { release = resolve; });
  const device = fakeDevice({ scopeWait });
  const owner = createAdaptiveResourceOwner(device, usage, options);
  const first = owner.acquire();
  const second = owner.acquire();
  owner.destroy();
  release();
  const results = await Promise.all([first, second]);
  assert.equal(results[0], results[1]);
  assert.equal(results[0].reason, "adaptive-disposed");
  assert.equal(owner.snapshot().allocatedBytes, 0);
  assert.ok(device.buffers.every(({ destroyed }) => destroyed === 1));
});

test("disabled admission never touches device getters and construction snapshots configuration", async () => {
  const device = { get limits() { throw new Error("disabled path touched GPU"); } };
  assert.equal((await createAdaptiveResourceOwner(device, usage).acquire()).reason, "adaptive-disabled");
  const mutable = { ...options };
  const owner = createAdaptiveResourceOwner(fakeDevice(), usage, mutable);
  mutable.width = 7680;
  assert.equal((await owner.acquire()).allocatedBytes, 33243148);
  owner.destroy();
});

test("both scopes are popped before awaiting, and OOM, rejected scopes and invalid usage fail closed", async () => {
  for (const failure of ["oom", "reject", "throw", "usage", "push"]) {
    const device = fakeDevice();
    let pops = 0;
    device.popErrorScope = () => {
      pops += 1;
      if (failure === "throw") throw new Error("private provider message");
      if (failure === "reject") return Promise.reject(new Error("private rejection"));
      return Promise.resolve(pops === 2 ? { message: "OOM" } : null);
    };
    if (failure === "push") {
      device.pushErrorScope = () => {
        device.scopes.push("scope");
        if (device.scopes.length === 2) throw new Error("scope unavailable");
      };
    }
    const owner = createAdaptiveResourceOwner(device, failure === "usage" ? {} : usage, options);
    const acquisition = owner.acquire();
    assert.equal(pops, failure === "usage" ? 0 : failure === "push" ? 1 : 2);
    assert.equal((await acquisition).status, "disabled");
    assert.equal(owner.snapshot().allocatedBytes, 0);
    assert.ok(device.buffers.every(({ destroyed }) => destroyed === 1));
  }
});
