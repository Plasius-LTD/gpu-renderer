import test from "node:test";
import assert from "node:assert/strict";
import { summarizeCpuValues, summarizeCpuLane } from "./fixtures/cpu-profile-summary.js";

test("CPU summary retains paired signed overhead, tails, and missing GPU evidence", () => {
  assert.deepEqual(summarizeCpuValues([4,1,3,2]), { count:4, mean:2.5, median:2.5, p95:4, min:1, max:4 });
  assert.equal(summarizeCpuValues([1,2,8]).median,2);
  assert.throws(()=>summarizeCpuValues([]), /invalid/);
  assert.throws(()=>summarizeCpuValues([NaN]), /invalid/);
  const profile = { stages:{commandEncoding:{elapsedMs:2,exclusiveMs:1}}, commands:{computePasses:2}, knownTemporaryBuffers:{count:1,bytes:8} };
  const rows = [{round:0,profileEnabled:false,linearOutputJobMs:10,gpuMs:8},{round:0,profileEnabled:true,linearOutputJobMs:9,gpuMs:8,cpuProfile:profile}];
  assert.equal(summarizeCpuLane(rows).job.meanPairedDeltaMs,-1);
  assert.equal(summarizeCpuLane(rows).gpu.meanPairedDeltaMs,0);
  assert.equal(summarizeCpuLane(rows).stages.commandEncoding.exclusiveMs.median,1);
  assert.throws(()=>summarizeCpuLane(rows.slice(1)), /Unpaired/);
  assert.throws(()=>summarizeCpuLane([...rows,...rows]), /Unpaired/);
  assert.equal(summarizeCpuLane(rows.map(row=>({...row,gpuMs:null}))).gpu,null);
});
