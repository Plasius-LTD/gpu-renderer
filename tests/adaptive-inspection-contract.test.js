import test from "node:test";
import assert from "node:assert/strict";
import {
  prepareAdaptiveFrame,
  inspectAdaptiveTileCounts,
} from "../src/wavefront-adaptive-inspection-contract.js";

test("admission copies budgets, preserves unequal tiers and bounds native UHD", () => {
  const budgets = new Uint16Array([1, 2, 4, 8]);
  const p = prepareAdaptiveFrame(
    {
      width: 2,
      height: 2,
      samplesPerPixel: 8,
      tileSize: 128,
      deferredPathResolve: true,
    },
    { budgets },
  );
  budgets.fill(8);
  assert.deepEqual([...p.budgets], [1, 2, 4, 8]);
  assert.equal(p.totalSamples, 15);
  assert.equal(p.meanSpp, 3.75);
  for (const patch of [
    { width: 3841, height: 2160 },
    { samplesPerPixel: 0 },
    { tileSize: 64 },
    { deferredPathResolve: false },
  ])
    assert.throws(() =>
      prepareAdaptiveFrame(
        {
          width: 2,
          height: 2,
          samplesPerPixel: 8,
          tileSize: 128,
          deferredPathResolve: true,
          ...patch,
        },
        { budgets },
      ),
    );
  assert.throws(() =>
    prepareAdaptiveFrame(
      {
        width: 2,
        height: 2,
        samplesPerPixel: 8,
        tileSize: 128,
        deferredPathResolve: true,
      },
      { budgets: new Uint16Array([0, 1, 1, 1]) },
    ),
  );
});
test("completed samples are validated against each requested pixel including partial tiles", () => {
  const budgets = new Uint16Array([1, 2, 4, 8, 16, 32]),
    tile = { x: 1, y: 1, width: 2, height: 1 };
  const words = new Uint32Array([16 | (16 << 9), 32 | (32 << 9)]);
  assert.deepEqual(inspectAdaptiveTileCounts(words, tile, 3, budgets), {
    samples: 48,
    minimum: 16,
    maximum: 32,
  });
  for (const bad of [
    new Uint32Array([16 | (15 << 9), 32 | (32 << 9)]),
    new Uint32Array([0x80002010, 32 | (32 << 9)]),
    new Uint32Array(1),
  ])
    assert.throws(
      () => inspectAdaptiveTileCounts(bad, tile, 3, budgets),
      /Incomplete|count/,
    );
});

test("adaptive factory rejects disabled and incompatible options before accessing WebGPU", async () => {
  const { createAdaptiveWavefrontRenderer } =
    await import("../src/adaptive.js");
  await assert.rejects(createAdaptiveWavefrontRenderer(), /enabled/);
  for (const patch of [
    { width: 5000 },
    { height: 3000, width: 3000 },
    { samplesPerPixel: 257 },
    { maxDepth: 21 },
  ])
    await assert.rejects(
      createAdaptiveWavefrontRenderer({
        "renderer.sampling.adaptivePerPixel.enabled": true,
        width: 128,
        height: 128,
        ...patch,
      }),
      /Adaptive/,
    );
});
