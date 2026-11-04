import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRefinementQueue} from '../src/wavefront-refinement-queue.js';
import {packRefinementConfig} from '../src/wavefront-refinement-gpu.js';
import {packSharedPhase,encodeSharedPhase,encodeSharedSample} from '../src/wavefront-adaptive-shared.js';
import {createTiles,createConfigPayloadBatch} from '../src/wavefront-packers.js';
import {createWavefrontPathTracingComputeConfig} from '../src/wavefront-config.js';
import {createGpuParallelismCounters} from '../src/wavefront-frame-runtime.js';
import {nativeSampleChunks} from './fixtures/native-sample-chunks.js';
import {pathQueueCapacity} from '../src/wavefront-optical-interface-budget.js';

// Execute the real coordinator with submission/queue adapters. Pixel arithmetic
// is qualified on physical GPU; these tests cover promise ownership and failures.
async function setup(){
 const commands=[],file=new URL('./fixtures/native-refinement-runner.js',import.meta.url),source=fs.readFileSync(file,'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'');
 const config=createWavefrontPathTracingComputeConfig({width:1,height:1,samplesPerPixel:2,maxDepth:2,deferredPathResolve:true});
 const buffer=name=>({name,size:65536});let block=null,error=null;
 const device={createBindGroup:d=>d.layout,queue:{writeBuffer:(b)=>commands.push(['write',b.name]),submit:()=>commands.push(['submit']),onSubmittedWorkDone:async()=>{if(block)await block;}},popErrorScope:async()=>error,pushErrorScope(){},createCommandEncoder:()=>({clearBuffer(){},finish:()=>({}),beginComputePass:()=>({setPipeline:p=>commands.push(['pipeline',p]),setBindGroup(){},dispatchWorkgroups(){},dispatchWorkgroupsIndirect(){},end(){}})})};
 const policy={enabled:true,sequencePeriodSamplesPerPixel:2,foveation:{enabled:true,focusPointUv:[.5,.5],innerRadius:.15,outerRadius:.75,edgeImportance:0}};
 const c={device,native:{width:1,height:1,canvas:{},refinement:{policy}},renderer:{config,updateCamera:()=>config},frame:buffer('frame'),b:Object.fromEntries(['refinementConfig','refinementStatus','pixelState','radianceSums','resolvedRadiance','primaryControl','primaryConfig','dispatch'].map(k=>[k,buffer(k)])),counters:buffer('counters'),frameEncoder:{encodePreparedTileSample(){},encodePresent:()=>commands.push(['present'])},shared:Object.fromEntries(['initialize','compact','finalize','validate','prepare','commit'].map(k=>[k,k])),sharedGroup:'shared',sharedPhaseGroup:'phase',group:layout=>layout,wait:async p=>p,read:async()=>new Uint32Array(4).buffer,active(){},makeBuffer:size=>({size}),descriptors:new Map([['plasius.wavefront.bind.activeNext',{entries:[{binding:16,resource:'linear'},{binding:7,resource:'display'}]}]]),errors:[],setMode(){},setConfig(){},destroy:()=>commands.push(['destroy']),owner:{snapshot:()=>({allocatedBytes:0})},memory:{fixtureStagingBytes:0}};
 const context=vm.createContext({createRefinementQueue,packRefinementConfig,packSharedPhase,encodeSharedPhase,encodeSharedSample,createTiles,createConfigPayloadBatch,createGpuParallelismCounters,nativeSampleChunks,pathQueueCapacity,
  createRefinementPipelines:async()=>({layout:'refinement',targets:'targets',fold:'fold',gather:'gather'}),createAdaptiveTileOutputPipelines:async()=>({outputLayout:'output',gatherLayout:'gather',output:'publish'}),GPUShaderStage:{COMPUTE:4},GPUBufferUsage:{STORAGE:128},performance,Uint32Array,Uint16Array,Float32Array});
 new vm.Script(source,{filename:file.pathname}).runInContext(context);
 const runner=await context.createNativeRefinementRunner(c);
 return {runner,commands,block(p){block=p;},error(v){error=v;}};
}
const coverage={phase:'coverage',maximumSamplesPerPixel:1,sequencePeriodSamplesPerPixel:2,tiers:[1],canRun:true,maximumWorkUnits:1,focusImportanceActive:false,budgetReason:'budget-disabled'};
test('zero optional budget emits no GPU work and one active promise owns shared scratch',async()=>{
 const c=await setup(),before=c.commands.length;
 await c.runner.runBatch({...coverage,canRun:false,maximumWorkUnits:0});assert.equal(c.commands.length,before);
 let release;c.block(new Promise(resolve=>{release=resolve;}));
 const pending=c.runner.runBatch(coverage);assert.equal(c.runner.snapshot().pending,true);
 await assert.rejects(c.runner.runBatch(coverage),/already pending/);assert.throws(()=>c.runner.reset(),/Drain/);assert.throws(()=>c.runner.destroy(),/Drain/);
 release();await pending;assert.equal(c.runner.snapshot().previewComplete,true);assert.equal(c.runner.snapshot().pending,false);
 c.runner.reset({reason:'camera',camera:{}});assert.equal(c.runner.snapshot().previewComplete,false);c.runner.destroy();
});
test('GPU and observer errors are preserved, never publishing an invalid generation',async()=>{
 const c=await setup();c.error({message:'gpu failure'});
 await assert.rejects(c.runner.runBatch(coverage),/gpu failure/);assert.ok(!c.commands.some(c=>c[0]==='present'));assert.equal(c.runner.snapshot().previewComplete,false);c.runner.destroy();
 const d=await setup();await assert.rejects(d.runner.runBatch(coverage,{onProgress(){throw Error('observer');}}),/observer/);
 assert.equal(d.runner.snapshot().previewComplete,false);assert.equal(d.runner.snapshot().resetReason,'progress-observer-failure');
 await d.runner.runBatch(coverage);assert.equal(d.runner.snapshot().previewComplete,true);d.runner.destroy();
});
