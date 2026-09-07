import assert from "node:assert/strict";
import test from "node:test";
import { resolveWavefrontRenderedSamplesPerPixel } from "../src/wavefront-frame-stats.js";

const config = { samplesPerPixel: 32 };

test("omitted and non-positive frame budgets retain the fixed sample target", () => {
  for (const frameTimeBudgetMs of [undefined, 0, -1, NaN, Infinity]) {
    for (const lastCompletedFrameTimeMs of [null, 1000]) {
      const result = resolveWavefrontRenderedSamplesPerPixel({
        config,
        renderOptions: { frameTimeBudgetMs, minimumSamplesPerPixel: 1 },
        lastCompletedFrameTimeMs,
        lastCompletedSamplesPerPixel: 32,
      });
      assert.equal(result.renderedSamplesPerPixel, 32, `budget ${frameTimeBudgetMs}`);
      assert.equal(result.targetSamplesPerPixel, 32);
      assert.equal(result.frameTimeBudgetMs, null);
      assert.equal(result.budgetConstrained, false);
    }
  }
});

test("zero budget preserves explicit per-frame sample targets and the default floor", () => {
  const result = resolveWavefrontRenderedSamplesPerPixel({
    config,
    renderOptions: { frameTimeBudgetMs: 0, samplesPerPixel: 16 },
  });
  assert.equal(result.renderedSamplesPerPixel, 16);
  assert.equal(result.targetSamplesPerPixel, 16);
  assert.equal(result.minimumSamplesPerPixel, 16);
  assert.equal(result.budgetConstrained, false);
});

test("positive budgets still start at the floor and use completed timing evidence", () => {
  const options = { config, renderOptions: { frameTimeBudgetMs: 16 } };
  assert.equal(resolveWavefrontRenderedSamplesPerPixel(options).renderedSamplesPerPixel, 1);
  const measured = resolveWavefrontRenderedSamplesPerPixel({
    ...options,
    lastCompletedFrameTimeMs: 64,
    lastCompletedSamplesPerPixel: 32,
  });
  assert.equal(measured.renderedSamplesPerPixel, 8);
  assert.equal(measured.frameTimeBudgetMs, 16);
  assert.equal(measured.budgetConstrained, true);
  assert.equal(resolveWavefrontRenderedSamplesPerPixel({
    ...options, awaitGPUCompletion: false,
  }).renderedSamplesPerPixel, 32);
});
