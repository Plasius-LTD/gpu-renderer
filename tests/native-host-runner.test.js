import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createWavefrontPathTracingComputeConfig} from '../src/wavefront-config.js';
import {createAdaptiveTilePlan} from '../src/wavefront-adaptive-tile-plan.js';
import {resolveTransportExperiments} from '../src/wavefront-core.js';
import {createGpuParallelismCounters} from '../src/wavefront-frame-runtime.js';
import {createWavefrontCpuProfile} from '../src/wavefront-cpu-profile.js';
import {packSharedPhase,encodeSharedPhase,encodeSharedSample} from '../src/wavefront-adaptive-shared.js';
import {pathQueueCapacity} from '../src/wavefront-optical-interface-budget.js';
import {nativeSampleChunks,nativePhaseRanges} from './fixtures/native-sample-chunks.js';
import {nativeHostOptions,createNativeBudgetState,packNativeConfigBatch} from './fixtures/native-host-packing.js';
import {validateOpticalSelections} from './fixtures/optical-selection.js';

// Actual coordinator with command/upload adapters. This is not GPU execution,
// image qualification or a native-resolution performance result.
async function exercise(options,mode){
 const commands=[],uploads=[],file=new URL('./fixtures/native-adaptive-runner.js',import.meta.url);
 const source=fs.readFileSync(file,'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'');
 const config=createWavefrontPathTracingComputeConfig({width:128,height:128,tileSize:128,samplesPerPixel:2,maxDepth:2,deferredPathResolve:true});
 const buffer=name=>({name,size:65536}),pass=()=>Object.fromEntries(['setPipeline','setBindGroup','dispatchWorkgroups','dispatchWorkgroupsIndirect','end'].map(key=>[key,(...args)=>commands.push([key,...args])]));
 const device={createBindGroup:d=>d.layout,queue:{onSubmittedWorkDone:async()=>{},submit:()=>commands.push(['submit']),writeBuffer:(target,offset,data)=>{
  uploads.push({target:target.name,offset,bytes:Buffer.from(data instanceof ArrayBuffer?data.slice(0):data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength))});
 }},popErrorScope:async()=>null,pushErrorScope:()=>{},createCommandEncoder:()=>({beginComputePass:d=>{commands.push(['begin',d]);return pass();},clearBuffer:(b,...args)=>commands.push(['clear',b.name,...args]),finish:()=>{commands.push(['finish']);return {};}})};
 const c={native:{width:128,height:128,canvas:{width:128,height:128},budgets:new Uint8Array(128*128).fill(1),hostOptimizations:options},device,renderer:{config},sampler:'legacy',
  b:Object.fromEntries(['resolvedRadiance','pixelState','primaryConfig','primaryControl','dispatch'].map(k=>[k,buffer(k)])),frame:buffer('frame'),counters:buffer('counters'),accumulation:buffer('accumulation'),
  frameEncoder:{encodePreparedTileSample:(_e,_t,offset)=>commands.push(['prepared',offset]),encodeTileSample:(_e,_t,offset)=>commands.push(['fixed',offset]),encodeTileOutput:(_e,_t,offset)=>commands.push(['output',offset]),encodePresent:()=>commands.push(['present'])},
  shared:Object.fromEntries(['initialize','compact','finalize','validate','prepare','commit','resolve'].map(k=>[k,k])),sharedGroup:'shared',sharedPhaseGroup:'phase',telemetry:{opticalSegmentsAvailable:false},timestampPairs:[],
  makeBuffer:size=>({name:'gather',size}),group:layout=>layout,descriptors:new Map([['plasius.wavefront.bind.activeNext',{entries:[{binding:16,resource:'outputTexture'},{binding:7,resource:'linearTexture'}]}]]),
  wait:async p=>p,active:()=>{},destroy:()=>commands.push(['destroy']),errors:[],owner:{snapshot:()=>({allocatedBytes:0})},setMode:()=>{},setConfig:()=>{},adapter:{isFallbackAdapter:false},memory:{fixtureStagingBytes:0}};
 const context=vm.createContext({createAdaptiveTilePlan,createAdaptiveTileOutputPipelines:async()=>({outputLayout:'output',gatherLayout:'gather',output:'publish'}),resolveTransportExperiments,createGpuParallelismCounters,
  createWavefrontCpuProfile,packSharedPhase,encodeSharedPhase,encodeSharedSample,pathQueueCapacity,nativeSampleChunks,nativePhaseRanges,nativeHostOptions,createNativeBudgetState,packNativeConfigBatch,validateOpticalSelections,
  MAX_OPTICAL_TRACE_INTERFACES:4096,GPUShaderStage:{COMPUTE:4},GPUBufferUsage:{STORAGE:128},performance,document:{visibilityState:'visible'},Float32Array,Uint32Array,Uint8Array});
 new vm.Script(source,{filename:file.pathname}).runInContext(context);
 const runner=await context.createNativeAdaptiveRunner(c),frame=await runner.run(mode);runner.destroy();return {commands,uploads,frame,memory:runner.memory};
}
test('actual native coordinator preserves ordered commands and upload bytes in all modes',async()=>{
 for(const mode of ['fixed','uniform','radial']){
  const baseline=await exercise({},mode),optimized=await exercise({templateConfigPacking:true,lazyUniformBudget:true},mode);
  assert.equal(JSON.stringify(optimized.commands),JSON.stringify(baseline.commands));assert.deepEqual(optimized.uploads,baseline.uploads);
  assert.equal(optimized.frame.validationErrors,0);assert.equal(optimized.frame.mode,mode);
  assert.equal(baseline.memory.cachedBudgetHostBytes-optimized.memory.cachedBudgetHostBytes,mode==='uniform'?0:128*128*4);
 }
});
