import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createPrunedContinuationShader, createPrunedContinuationPipelines } from "../src/wavefront-pruned-continuations.js";
import { WAVEFRONT_COMPUTE_WGSL } from "../src/wavefront-shaders.js";
import { WAVEFRONT_INTERSECTION_BODY_WGSL, WAVEFRONT_SURFACE_BODY_WGSL } from "../src/wavefront-shader-kernels.js";
import { analyzeWgslSource, reflectGpuInterface } from "@plasius/gpu-shader/node";
import { createWavefrontFrameEncoder } from "../src/wavefront-frame-encoder.js";
import { createGpuParallelismCounters } from "../src/wavefront-frame-runtime.js";

test("fixed shader bytes and transport bodies stay canonical; pruning flags are independent",()=>{
  assert.equal(createHash("sha256").update(WAVEFRONT_COMPUTE_WGSL).digest("hex"),"c0a78da83cb60ed59a1bc56ead48d7e258c01ce402836d464c5b713b24c38fcb");
  assert.equal(createPrunedContinuationShader(),WAVEFRONT_COMPUTE_WGSL);
  const fused=createPrunedContinuationShader({fusedHits:true});
  assert.ok(fused.includes(WAVEFRONT_SURFACE_BODY_WGSL));
  assert.ok(fused.includes(WAVEFRONT_INTERSECTION_BODY_WGSL.replace("hits[index] = make_miss(ray);\n    return;","return make_miss(ray);").replace("hits[index] = HitRecord(","return HitRecord(")));
  const entry=fused.slice(fused.indexOf("fn intersectAndResolveActiveQueue"));
  assert.equal((entry.match(/activeQueue\[index\]/g)||[]).length,1);
  assert.ok(!entry.includes("hits["));
  assert.ok(fused.includes("return max(1u, (rayCount + 63u) / 64u);"));
  for(const fusedHits of [false,true]){const pruned=createPrunedContinuationShader({fusedHits,zeroEmptyDispatch:true});assert.ok(pruned.includes("return (rayCount + 63u) / 64u;"));assert.ok(!pruned.includes("return max(1u, (rayCount + 63u) / 64u);"));}
});

test("final fused module reflects canonical records and excludes hit scratch from executed entry",async()=>{
  const source=createPrunedContinuationShader({fusedHits:true,zeroEmptyDispatch:true});
  const analyzed=analyzeWgslSource(source,"pruned");
  const used=[0,1,4,5,6,8,9,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44];
  const bindings=analyzed.bindings.filter(b=>used.includes(b.binding)).map(b=>({...b,visibility:["compute"]}));
  const manifest=await reflectGpuInterface({interfaceId:"plasius.renderer.pruned-continuations",interfaceVersion:"1.0.0",modules:[{moduleId:"pruned",source}],
    pipelines:[{kind:"compute",pipelineId:"fused",layout:{bindGroups:[{group:0,entries:bindings}]},compute:{moduleId:"pruned",entryPoint:"intersectAndResolveActiveQueue",constants:{}}}],
    modelFacingRecordNames:["RayRecord","HitRecord","PathNode"],modelFacingBindings:[],semantics:[]});
  for(const [name,size] of [["RayRecord",96],["HitRecord",240],["PathNode",64]])assert.equal(manifest.records.find(r=>r.name===name).byteSize,size);
  assert.ok(!manifest.bindings.some(b=>b.binding===2));
});

test("pipeline variants default off, reuse trace layout, and propagate validation errors",async()=>{
  const forbidden=new Proxy({}, {get(){throw Error("disabled touch");}});
  assert.equal(await createPrunedContinuationPipelines(forbidden,null),null);
  const created=[];const device={createShaderModule:d=>({...d,getCompilationInfo:async()=>({messages:[]})}),createComputePipelineAsync:async d=>{created.push(d);return d;}};
  const layout={};const fused=await createPrunedContinuationPipelines(device,layout,{fusedHits:true});
  assert.equal(fused.traceAndResolve.compute.entryPoint,"intersectAndResolveActiveQueue");assert.equal(fused.traceAndResolve.layout,layout);assert.equal(fused.compactAndSwapQueues,undefined);
  const zero=await createPrunedContinuationPipelines(device,layout,{zeroEmptyDispatch:true});assert.equal(zero.traceAndResolve,undefined);assert.equal(zero.compactAndSwapQueues.compute.entryPoint,"compactAndSwapQueues");
  const both=await createPrunedContinuationPipelines(device,layout,{fusedHits:true,zeroEmptyDispatch:true});assert.ok(both.traceAndResolve&&both.compactAndSwapQueues);assert.equal(created.length,4);
  await assert.rejects(createPrunedContinuationPipelines({...device,createComputePipelineAsync(){throw Error("pipeline");}},layout,{fusedHits:true}),/pipeline/);
  await assert.rejects(createPrunedContinuationPipelines({...device,createShaderModule:()=>({getCompilationInfo:async()=>({messages:[{type:"error",message:"WGSL"}]})})},layout,{zeroEmptyDispatch:true}),/WGSL/);
});

for(const depth of [1,4,8])test(`prepared-only variant dispatches preserve queue parity at depth ${depth}`,()=>{
  const calls=[];const encoder={copyBufferToBuffer(){},beginComputePass:()=>({setPipeline:p=>calls.push(p),setBindGroup:(_i,g)=>calls.push(g),dispatchWorkgroups(){},dispatchWorkgroupsIndirect(){},end(){}})};
  let variant={traceAndResolve:"fused",compactAndSwapQueues:"zero-swap"};
  const frame=createWavefrontFrameEncoder({getConfig:{maxDepth:depth},getBindGroups:["ping","pong"],pipelines:{generatePrimaryRays:"primary",intersectActiveQueue:"intersect",resolveSurfaceRecords:"shade",compactAndSwapQueues:"swap"},counterBuffer:{},activeDispatchBuffer:{},getPreparedContinuationPipelines:()=>variant});
  const counters=createGpuParallelismCounters();frame.encodePreparedTileSample(encoder,{width:128,height:128},0,counters);
  assert.deepEqual(calls,Array.from({length:depth},(_,i)=>[i%2?"pong":"ping","fused","zero-swap"]).flat());assert.equal(counters.indirectDispatches,depth);
  calls.length=0;frame.encodeTileSample(encoder,{width:128,height:128},0,createGpuParallelismCounters());assert.ok(!calls.includes("fused"));assert.ok(!calls.includes("zero-swap"));
  calls.length=0;variant={compactAndSwapQueues:"zero-swap"};frame.encodePreparedTileSample(encoder,{width:128,height:128},0,createGpuParallelismCounters());assert.equal(calls.filter(v=>v==="intersect").length,depth);
});
