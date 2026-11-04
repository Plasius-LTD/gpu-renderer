import test from 'node:test';
import assert from 'node:assert/strict';
import {createRefinementQueue} from '../src/wavefront-refinement-queue.js';
import {withPersistentRadiance} from '../src/wavefront-refinement-shader.js';
import {SHARED_ADAPTIVE_WGSL} from '../src/wavefront-adaptive-shared-shader.js';
import {planAdaptiveResources} from '../src/wavefront-adaptive-metadata.js';
import {packRefinementConfig,createRefinementPipelines,REFINEMENT_WGSL} from '../src/wavefront-refinement-gpu.js';
import {reflectGpuInterface} from '@plasius/gpu-shader/node';

const plan=(phase,maximumSamplesPerPixel=8)=>({phase,maximumSamplesPerPixel,sequencePeriodSamplesPerPixel:8,tiers:[1,2,4,maximumSamplesPerPixel].filter(n=>n<=maximumSamplesPerPixel),canRun:true});
test('disabled refinement creates no queue, reads no dimensions and preserves shader bytes',()=>{
 assert.equal(createRefinementQueue({enabled:false,get width(){throw Error('off');}}),null);
 assert.equal(withPersistentRadiance(SHARED_ADAPTIVE_WGSL,false),SHARED_ADAPTIVE_WGSL);
});
test('complete 1-SPP coverage precedes optional work, including partial tiles',()=>{
 const q=createRefinementQueue({enabled:true,width:129,height:129,maximumSamplesPerPixel:8});
 q.update(plan('focus'),[.5,.5]);
 const tiles=[];
 for(let i=0;i<4;i++){
  const ticket=q.next();assert.equal(ticket.range.firstSample,0);assert.equal(ticket.range.sampleLimit,1);
  assert.equal(q.snapshot().previewComplete,false);assert.throws(()=>q.next(),/outstanding/);
  tiles.push(ticket.tile);q.complete(ticket);
 }
 assert.equal(tiles.reduce((s,t)=>s+t.width*t.height,0),129*129);
 assert.equal(q.snapshot().previewComplete,true);
 assert.equal(q.next().range.firstSample,1);
});
test('stationary catch-up retains focus samples and non-power-of-two endpoints',()=>{
 const q=createRefinementQueue({enabled:true,width:256,height:128,maximumSamplesPerPixel:8});
 q.update(plan('focus',7),[.75,.5]);
 const issued=[];let ticket;
 while((ticket=q.next())){issued.push(ticket);q.complete(ticket);}
 assert.ok(issued.some(t=>t.range.sampleLimit===7));
 assert.equal(issued[0].tile.x,128,'focus tile first, even during coverage');
 q.update(plan('stationary'),[.25,.5]);
 const ranges=[];
 while((ticket=q.next())){ranges.push(ticket.range);q.complete(ticket);}
 assert.ok(ranges.some(t=>t.firstSample===7&&t.sampleLimit===8));
 assert.equal(q.snapshot().finished,true);
 assert.equal(q.snapshot().previewComplete,true);
});
test('epochs reject stale completions, failed work cannot publish and focus changes retain coverage',()=>{
 const q=createRefinementQueue({enabled:true,width:1,height:1,maximumSamplesPerPixel:8});
 q.update(plan('coverage'));const first=q.next();q.complete(first);
 q.update(plan('focus'),[0,0]);assert.equal(q.snapshot().previewComplete,true);
 const pending=q.next();q.reset('camera-change');assert.throws(()=>q.complete(pending),/stale/i);
 assert.equal(q.snapshot().previewComplete,false);assert.equal(q.snapshot().resetReason,'camera-change');
 const retry=q.next();q.fail(retry,'device-loss');assert.throws(()=>q.next(),/failed/);
 q.reset('recreated');assert.equal(q.next().range.firstSample,0);
});
test('invalid plans and coordinates fail before issuing GPU work',()=>{
 for(const o of [{width:0,height:1},{width:1,height:1,maximumSamplesPerPixel:257},{width:65536,height:65536}])assert.throws(()=>createRefinementQueue({enabled:true,maximumSamplesPerPixel:8,...o}),RangeError);
 const q=createRefinementQueue({enabled:true,width:1,height:1,maximumSamplesPerPixel:8});
 assert.throws(()=>q.update(plan('bad')),RangeError);
 assert.throws(()=>q.update(plan('focus'),[NaN,0]),RangeError);
 q.update({...plan('focus'),canRun:false});assert.equal(q.next(),null);
 q.update(plan('focus'));const ticket=q.next();assert.throws(()=>q.complete({...ticket}),/ticket/);
});
test('completion marks the frontier immediately without an empty follow-up GPU batch',()=>{
 const q=createRefinementQueue({enabled:true,width:1,height:1,maximumSamplesPerPixel:8});
 q.update(plan('coverage',1));q.complete(q.next());assert.equal(q.snapshot().finished,true);
 q.update(plan('stationary'));
 for(const end of [2,4,8]){const t=q.next();assert.equal(t.range.sampleLimit,end);q.complete(t);}
 assert.equal(q.snapshot().finished,true);assert.equal(q.next(),null);
});
test('progressive history admission accounts full-screen FP32 sums and keeps old allocation default',()=>{
 const ordinary=planAdaptiveResources({enabled:true,width:3840,height:2160,countResolve:true});
 assert.equal(ordinary.bytes.radianceSums,16384*16);
 const options={enabled:true,width:3840,height:2160,countResolve:true,persistentRadiance:true};
 assert.equal(planAdaptiveResources(options).reason,'adaptive-allocation-cap');
 const progressive=planAdaptiveResources({...options,maximumAllocationBytes:192*1024**2});
 assert.equal(progressive.enabled,true);assert.equal(progressive.bytes.radianceSums,3840*2160*16);
 assert.equal(progressive.bytes.pixelState,3840*2160*4);assert.ok(progressive.bytes.total<192*1024**2);
 assert.throws(()=>planAdaptiveResources({...options,countResolve:false}),/countResolve/);
 assert.throws(()=>planAdaptiveResources({...options,persistentRadiance:1}),TypeError);
});
test('persistent specialization retains transport and count ownership but uses global sums and actual counts',()=>{
 const source=withPersistentRadiance(SHARED_ADAPTIVE_WGSL,true);
 assert.ok(source.includes('prior = sums[pixel].xyz'));
 assert.ok(source.includes('sums[pixel] = vec4<f32>(next, 0.0)'));
 assert.ok(source.includes('sums[pixel].xyz / f32(completed)'));
 assert.ok(source.includes('completed >= phase.sampleLimit'));
 assert.ok(source.includes('resolve_complete_path_tree(root, pixel, ordinal)'));
 assert.throws(()=>withPersistentRadiance('unknown source',true),/specialization/);
});
test('GPU target uniforms are bounded immutable policy snapshots, pipelines are lazy and propagate compiler errors',async()=>{
 const focus={enabled:true,focusPointUv:[.5,.25],innerRadius:.1,outerRadius:.8,edgeImportance:0};
 const input={width:129,height:128,maximumSamplesPerPixel:8,tiers:[1,2,4,8],focus,focusImportanceActive:true,reset:true,epoch:3};
 const packed=packRefinementConfig(input),u=new Uint32Array(packed),f=new Float32Array(packed);
 assert.equal(packed.byteLength,112);assert.deepEqual([...u.slice(0,4)],[129,128,8,1]);
 assert.deepEqual([...f.slice(4,6)],[.5,.25]);assert.deepEqual([...u.slice(12,16)],[1,4,3,0]);
 for(const patch of [{width:0},{height:0},{maximumSamplesPerPixel:257},{tiers:[1,4,2,8]},{tiers:[1]},{focus:{...focus,outerRadius:.1}},{epoch:-1},{reset:1}])assert.throws(()=>packRefinementConfig({...input,...patch}),RangeError);
 const forbidden=new Proxy({}, {get(){throw Error('disabled access');}});
 assert.equal(await createRefinementPipelines(forbidden,null),null);
 let assembled;
 const device={createShaderModule(d){assembled=d.code;return{getCompilationInfo:async()=>({messages:[]})};},createBindGroupLayout:d=>d,createPipelineLayout:d=>d,createComputePipelineAsync:async d=>d};
 const p=await createRefinementPipelines(device,{COMPUTE:4},{enabled:true});
 assert.equal(assembled,REFINEMENT_WGSL);assert.equal(p.targets.compute.entryPoint,'refinement_targets');
 assert.ok(p.layout.entries.find(e=>e.binding===6).buffer.hasDynamicOffset);
 await assert.rejects(createRefinementPipelines({...device,createComputePipelineAsync(){throw Error('pipeline');}},{COMPUTE:4},{enabled:true}),/pipeline/);
});
test('assembled refinement WGSL reflects the executed uniform ABI',async()=>{
 const used={refinement_targets:[0,1,4],refinement_gather:[1,2,3,4,6],refinement_fold_failure:[4,5]};
 const entries=[0,1,2,3,4,5,6].map(binding=>({group:0,binding,visibility:['compute'],resource:{kind:'buffer',addressSpace:[0,6].includes(binding)?'uniform':'storage',access:[0,2,5,6].includes(binding)?'read':'read_write',recordName:binding===0?'RefinementConfig':binding===6?'RefinementTile':null,minimumBindingSize:binding===0?112:binding===6?32:[2,3].includes(binding)?16:4}}));
 const m=await reflectGpuInterface({interfaceId:'plasius.renderer.refinement',interfaceVersion:'1.0.0',modules:[{moduleId:'refinement',source:REFINEMENT_WGSL}],pipelines:Object.entries(used).map(([entryPoint,bindings])=>({kind:'compute',pipelineId:entryPoint,layout:{bindGroups:[{group:0,entries:entries.filter(e=>bindings.includes(e.binding))}]},compute:{moduleId:'refinement',entryPoint,constants:{}}})),modelFacingRecordNames:['RefinementConfig','RefinementTile'],modelFacingBindings:[],semantics:[]});
 assert.equal(m.records.find(r=>r.name==='RefinementConfig').byteSize,112);
 assert.equal(m.records.find(r=>r.name==='RefinementTile').byteSize,32);
});
