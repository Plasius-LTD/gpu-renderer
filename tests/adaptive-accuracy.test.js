import assert from "node:assert/strict";
import test from "node:test";
import { divisionErrorUlps, WGSL_F32_DIVISION_MAX_ULPS } from "./fixtures/adaptive-accuracy.js";

test("physical arithmetic oracle uses the specified division accuracy, not an image tolerance", () => {
  assert.equal(WGSL_F32_DIVISION_MAX_ULPS, 2.5);
  assert.equal(divisionErrorUlps(37.000003814697266, 37), 1);
  const ulp = 2 ** -18;
  assert.equal(divisionErrorUlps(37 + 2 * ulp, 37), 2);
  assert.ok(divisionErrorUlps(37 + 3 * ulp, 37) > WGSL_F32_DIVISION_MAX_ULPS);
  assert.equal(divisionErrorUlps(0.5 + 2 ** -24, 0.5), 2);
  assert.equal(divisionErrorUlps(131072, 131072), 0);
  for (const [actual, expected] of [[NaN, 1], [Infinity, 1], [1, NaN], [1, Infinity], [1, 0], [1, -1], [1, 1 / 3], [1, 2 ** -149]]) {
    assert.equal(divisionErrorUlps(actual, expected), Infinity);
  }
});
