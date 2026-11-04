import assert from "node:assert/strict";
import test from "node:test";
import { createWavefrontFrameLoop } from "../src/wavefront-frame-loop.js";

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return {promise, resolve, reject}; };
const turn = () => new Promise(resolve => setTimeout(resolve, 0));

test("disabled loop is inert; options are validated", async () => {
  let calls = 0;
  const loop = createWavefrontFrameLoop({renderFrame: () => { calls++; }});
  assert.equal((await loop.start()).status, "disabled");
  assert.equal((await loop.stop()).status, "disabled");
  assert.equal(calls, 0);
  for (const options of [{}, {renderFrame: 1}, {renderFrame() {}, enabled: "yes"},
    {renderFrame() {}, targetFrameTimeMs: -1}, {renderFrame() {}, targetFrameTimeMs: NaN},
    {renderFrame() {}, getRenderOptions: 1}, {renderFrame() {}, onFrameComplete: 1}]) {
    assert.throws(() => createWavefrontFrameLoop(options));
  }
});

test("single-flight promise yields other work, reports confirmed progress and drains on stop", async () => {
  const gate = deferred(); let calls = 0, options;
  const loop = createWavefrontFrameLoop({enabled:true, targetFrameTimeMs: 1,
    renderFrame: input => { calls++; options = input; return gate.promise; }});
  const run = loop.start(); assert.equal(loop.start(), run);
  await turn(); assert.equal(calls, 1); assert.equal(options.awaitGPUCompletion, true);
  assert.equal(options.readStats, false); assert.equal(options.readOutputProbe, false);
  options.onProgress({stage:"waiting-gpu", completedTiles:1, totalTiles:2});
  await turn();
  const progress = loop.getProgress();
  assert.ok(Object.isFrozen(progress)); assert.equal(progress.completedTileFraction, .5);
  assert.equal(progress.gpuCompletionFraction, null); assert.ok(progress.budgetRatio > 1);
  assert.ok(progress.overBudgetMs > 0); assert.equal(progress.completedFrames, 0);
  assert.equal(loop.stop(), run); assert.equal(loop.start(), run);
  assert.equal(loop.getProgress().status, "stopping");
  gate.resolve({samples:32}); const final = await run;
  assert.equal(final.status, "stopped"); assert.equal(final.completedFrames, 1);
  assert.equal(calls, 1); assert.equal(loop.getProgress().elapsedMs, final.elapsedMs);
  options.onProgress({stage:"waiting-gpu",completedTiles:0,totalTiles:2});
  assert.equal(loop.getProgress().stage, "complete"); // late callback ignored
});

test("completion schedules next frame with updated boundary options, and waits for observers", async () => {
  const gate = deferred(); let frame = 0, spp = 32, input, previous;
  const loop = createWavefrontFrameLoop({enabled:true, targetFrameTimeMs:0,
    getRenderOptions: context => { previous=context.previousResult; return {samplesPerPixel:spp, awaitGPUCompletion:false, readStats:true}; },
    renderFrame: async options => { input=options; frame++; return {frame}; },
    onFrameComplete: async (result, progress) => {
      assert.equal(progress.stage, "complete"); assert.equal(progress.budgetRatio, null);
      if (result.frame===1) { spp=8; await gate.promise; } else { loop.stop(); }
    }});
  const run=loop.start(); await turn(); assert.equal(frame,1);
  gate.resolve(); const final=await run;
  assert.equal(frame,2); assert.deepEqual(previous,{frame:1}); assert.equal(input.samplesPerPixel,8);
  assert.equal(input.awaitGPUCompletion,true); assert.equal(input.readStats,true);
  assert.equal(final.completedFrames,2);
  const restarted=loop.start(); assert.notEqual(restarted,run); await restarted;
  assert.equal(frame,3);
});

test("stop before start or while boundary preparation/observer is pending never submits another frame", async () => {
  for (const where of ["before", "options", "observer"]) {
    const gate=deferred(); let calls=0;
    const loop=createWavefrontFrameLoop({enabled:true,
      getRenderOptions: where==="options" ? () => gate.promise : undefined,
      renderFrame: async () => {calls++;},
      onFrameComplete: where==="observer" ? () => gate.promise : undefined});
    assert.equal((await loop.stop()).status,"idle");
    const run=loop.start(); if(where!=="before") await turn();
    loop.stop(); gate.resolve({}); await run;
    assert.equal(calls,where==="observer"?1:0);
  }
});

test("failure rejects run and stop and cannot automatically retry", async () => {
  for (const where of ["options", "render", "observer"]) {
    const error=new Error("device lost / timeout / callback failure"); let calls=0;
    const loop=createWavefrontFrameLoop({enabled:true,
      getRenderOptions: () => {if(where==="options")throw error; return {};},
      renderFrame: async () => {calls++;if(where==="render")throw error;},
      onFrameComplete: () => {if(where==="observer")throw error;}});
    const run=loop.start(); await assert.rejects(run, e=>e===error);
    assert.equal(loop.getProgress().status,"failed");
    assert.equal(loop.getProgress().completedFrames,where==="observer"?1:0);
    assert.equal(loop.start(),run); assert.equal(loop.stop(),run); assert.ok(calls<=1);
  }
});

test("fast promises yield browser tasks rather than an unbounded microtask chain", {timeout:1000}, async () => {
  let frames=0, otherTaskRan=false;
  const loop=createWavefrontFrameLoop({enabled:true,renderFrame:async()=>{frames++;}});
  const run=loop.start();
  setTimeout(()=>{otherTaskRan=true;loop.stop();},0);
  await run;
  assert.ok(otherTaskRan); assert.ok(frames>=1);
});

test("timer fallback yields and releases resources; invalid boundary options reject", async () => {
  const original=globalThis.MessageChannel;
  try {
    globalThis.MessageChannel=undefined;
    let frames=0;const loop=createWavefrontFrameLoop({enabled:true,renderFrame:async()=>{frames++;if(frames===2)loop.stop();}});
    assert.equal((await loop.start()).completedFrames,2);
  } finally { globalThis.MessageChannel=original; }
  for (const value of [1,[]]) {
    const loop=createWavefrontFrameLoop({enabled:true,renderFrame:async()=>{},getRenderOptions:()=>value});
    await assert.rejects(loop.start(),/render options/);
  }
});

test("forwards progress observers and preserves non-Error failures", async () => {
  const events=[];
  const loop=createWavefrontFrameLoop({enabled:true,
    getRenderOptions:()=>({onProgress:event=>events.push(event)}),
    renderFrame:async options=>{options.onProgress({stage:"waiting-gpu",completedTiles:0,totalTiles:1});throw "failed adapter";}});
  await assert.rejects(loop.start(),error=>error==="failed adapter");
  assert.equal(events.length,1);assert.equal(loop.getProgress().lastError,"failed adapter");
});
