import test from "node:test";
import assert from "node:assert/strict";
import { createSharedSampleRanges, packSharedPhase, createSharedAdaptivePipelines, encodeSharedPhase, encodeSharedSample } from "../src/wavefront-adaptive-shared.js";
import { SHARED_ADAPTIVE_WGSL } from "../src/wavefront-adaptive-shared-shader.js";
import { WAVEFRONT_MAKE_CAMERA_RAY_WGSL } from "../src/wavefront-camera-shared-shader.js";
import { PATH_TREE_WGSL } from "../src/wavefront-path-tree-shader.js";
import { createWavefrontFrameEncoder } from "../src/wavefront-frame-encoder.js";
import { createGpuParallelismCounters } from "../src/wavefront-frame-runtime.js";
import { reflectSharedAdaptiveInterface } from "../scripts/adaptive-shared-interface.js";

test("final shared module reflects every executed stage and preserves canonical records",async()=>{
  const manifest=await reflectSharedAdaptiveInterface();
  for(const [name,size] of [["SharedPhase",32],["SharedControl",16],["SharedDispatch",12],["FrameConfig",320],["RayRecord",96],["PathNode",64],["Counters",112]])assert.equal(manifest.records.find(r=>r.name===name).byteSize,size);
  assert.equal(manifest.entryPoints.length,7);
});

test("shared ranges preserve every absolute pixel sample without summing tier rounds", () => {
  const ranges = createSharedSampleRanges([32, 2, 8, 8]);
  assert.deepEqual(ranges, [{firstSample:0,sampleLimit:2},{firstSample:2,sampleLimit:8},{firstSample:8,sampleLimit:32}]);
  const seen = new Set(); let rounds = 0;
  for (const range of ranges) for (let n=range.firstSample;n<range.sampleLimit;n++,rounds++) {
    for (const [pixel,budget] of [2,8,32].entries()) if (budget>=range.sampleLimit) {
      const key=`${pixel}:${n}`; assert.ok(!seen.has(key)); seen.add(key);
    }
  }
  assert.equal(rounds,32); assert.equal(seen.size,42);
  for(const tiers of [[],[0],[257],[1.5],[NaN]]) assert.throws(()=>createSharedSampleRanges(tiers),RangeError);
});

const phase={width:128,height:128,tileX:0,tileY:0,tileWidth:128,tileHeight:128,firstSample:2,sampleLimit:8};
test("shared phase has a separate compact immutable ABI and validates host bounds",()=>{
  assert.deepEqual([...new Uint32Array(packSharedPhase(phase))],[128,128,0,0,128,128,2,8]);
  for(const patch of [{firstSample:8},{firstSample:-1},{sampleLimit:257},{tileWidth:129},{width:0},{tileHeight:0},{tileX:1}])assert.throws(()=>packSharedPhase({...phase,...patch}),RangeError);
});

test("shared pipelines reuse canonical camera and path reduction, default off and propagate errors",async()=>{
  assert.ok(SHARED_ADAPTIVE_WGSL.includes(WAVEFRONT_MAKE_CAMERA_RAY_WGSL));
  assert.ok(SHARED_ADAPTIVE_WGSL.includes(PATH_TREE_WGSL));
  const forbidden=new Proxy({}, {get(){throw Error("disabled access");}});
  assert.equal(await createSharedAdaptivePipelines(forbidden,null),null);
  const device={createShaderModule:()=>({getCompilationInfo:async()=>({messages:[]})}),createBindGroupLayout:d=>d,createPipelineLayout:d=>d,createComputePipelineAsync:async d=>d};
  const p=await createSharedAdaptivePipelines(device,{COMPUTE:4},{enabled:true});
  assert.equal(p.prepare.compute.entryPoint,"prepare_shared_sample");
  assert.equal(p.commit.compute.entryPoint,"commit_shared_sample");
  assert.equal(p.layout.entries.filter(e=>e.buffer.hasDynamicOffset).length,2);
  await assert.rejects(createSharedAdaptivePipelines({...device,createComputePipelineAsync(){throw Error("pipeline");}},{COMPUTE:4},{enabled:true}),/pipeline/);
  await assert.rejects(createSharedAdaptivePipelines({...device,createShaderModule:()=>({getCompilationInfo:async()=>({messages:[{type:"error",message:"shader"}]})})},{COMPUTE:4},{enabled:true}),/shader/);
});

test("shared scheduling uses compacted preparation/commit around unchanged bounces",()=>{
  const calls=[];const encoder={clearBuffer:(...a)=>calls.push(["clear",...a]),copyBufferToBuffer:()=>{},beginComputePass:()=>({setPipeline:p=>calls.push(["pipeline",p]),setBindGroup:(...a)=>calls.push(["group",...a]),dispatchWorkgroups:n=>calls.push(["direct",n]),dispatchWorkgroupsIndirect:(...a)=>calls.push(["indirect",...a]),end(){}})};
  const p={initialize:"init",compact:"compact",finalize:"finalize",validate:"validate",prepare:"prepare",commit:"commit"};
  const frameEncoder=createWavefrontFrameEncoder({getConfig:{maxDepth:4},getBindGroups:[{},{}],pipelines:{intersectActiveQueue:"intersect",resolveSurfaceRecords:"shade",compactAndSwapQueues:"swap"},counterBuffer:{},activeDispatchBuffer:{}});
  const options={pipelines:p,bindGroup:"bindings",frameOffset:512,phaseOffset:256,tile:{x:0,y:0,width:128,height:128},dispatchBuffer:"dispatch",counterBuffer:"counters",frameEncoder,parallelism:createGpuParallelismCounters()};
  encodeSharedPhase(encoder,options);encodeSharedSample(encoder,options);
  assert.deepEqual(calls.filter(c=>c[0]==="pipeline").map(c=>c[1]),["init","compact","finalize","validate","prepare",...Array.from({length:4},()=>["intersect","shade","swap"]).flat(),"commit"]);
  assert.equal(calls.filter(c=>c[0]==="indirect"&&c[1]==="dispatch").length,3);
  const before=calls.length;
  for(const patch of [{frameOffset:1},{phaseOffset:-1},{tile:{x:0,y:0,width:0,height:1}},{tile:{x:0,y:0,width:16385,height:1}}])assert.throws(()=>encodeSharedSample(encoder,{...options,...patch}),RangeError);
  assert.equal(calls.length,before);
  assert.throws(()=>encodeSharedSample({...encoder,clearBuffer(){throw Error("encoder");}},options),/encoder/);
});
