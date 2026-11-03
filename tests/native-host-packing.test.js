import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createConfigPayload,createConfigPayloadBatch,FRAME_CONFIG_SAMPLE_INDEX_OFFSET} from '../src/wavefront-packers.js';
import {createWavefrontPathTracingComputeConfig} from '../src/wavefront-config.js';
import {CONFIG_BUFFER_BYTES} from '../src/wavefront-core.js';
import {reflectAdaptiveCameraInterface} from '../scripts/adaptive-camera-interface.js';
import {WAVEFRONT_COMPUTE_WGSL} from '../src/wavefront-shaders.js';
import {nativeHostOptions,createNativeBudgetState,packNativeConfigBatch} from './fixtures/native-host-packing.js';
import {compareHostDiagnosticFrames} from './fixtures/native-host-measurements.js';

test('batched frame slots exactly preserve canonical bytes, padding, absolute ordinals and all metadata',async()=>{
 const reflected=(await reflectAdaptiveCameraInterface()).records.find(r=>r.name==='FrameConfig');
 assert.equal(FRAME_CONFIG_SAMPLE_INDEX_OFFSET,reflected.members.find(m=>m.name==='projectionAndSampling').offset+3*4);
 for(const optical of [false,true])for(const sampleCount of [1,2,7,32,128,256])for(const weight of [1,1/sampleCount]){
  const config=createWavefrontPathTracingComputeConfig({width:1920,height:1080,samplesPerPixel:256,maxDepth:20,strictPhysicalLowSppLighting:true,deferredPathResolve:true,
   'renderer.transport.boundedDielectricBranching.enabled':optical,'renderer.transport.nestedMediaRefraction.enabled':optical,
   'renderer.transport.opticalInterfaceBudget.enabled':optical,opticalInterfaceBudget:{maximumInterfaces:2048}});
  const tile={x:1792,y:1024,width:128,height:56},firstSample=256-sampleCount,buildRange={sampleWeight:weight,opticalTelemetry:optical,start:17,count:9,sortItemCount:16};
  const batch=createConfigPayloadBatch(config,tile,0xffffffff,{sampleCount,firstSample,...buildRange}),stride=config.memory.configBufferStride;
  assert.equal(batch.byteLength,sampleCount*stride);
  for(let i=0;i<sampleCount;i++){
   assert.deepEqual(batch.subarray(i*stride,i*stride+CONFIG_BUFFER_BYTES),new Uint8Array(createConfigPayload(config,tile,0xffffffff,{...buildRange,sampleIndex:firstSample+i})));
   assert(batch.subarray(i*stride+CONFIG_BUFFER_BYTES,(i+1)*stride).every(v=>v===0));
  }
 }
 assert.equal(createHash('sha256').update(WAVEFRONT_COMPUTE_WGSL).digest('hex'),'b50d988d92d0af5867fc3355cadad89ad8b1affe9c88bf051298df2c8acaf7b4');
});
test('invalid batch sizes/ranges/strides and experiment flags fail before packing or budget allocation',()=>{
 const c=createWavefrontPathTracingComputeConfig({samplesPerPixel:32}),tile={x:0,y:0,width:128,height:128};
 for(const settings of [{sampleCount:0},{sampleCount:257},{sampleCount:1.5},{sampleCount:2,firstSample:31},{sampleCount:1,firstSample:-1},{sampleIndex:1}])assert.throws(()=>createConfigPayloadBatch(c,tile,0,settings));
 for(const stride of [0,319,322,Infinity])assert.throws(()=>createConfigPayloadBatch({...c,memory:{...c.memory,configBufferStride:stride}},tile,0,{sampleCount:1}));
 for(const options of [null,[],true,{templateConfigPacking:1},{lazyUniformBudget:'true'},{unknown:true}])assert.throws(()=>nativeHostOptions(options));
 assert.deepEqual(nativeHostOptions(),{templateConfigPacking:false,lazyUniformBudget:false});
});
test('independent host selectors preserve upload bytes and accurately count known backing allocations',()=>{
 const c=createWavefrontPathTracingComputeConfig({samplesPerPixel:32}),tile={x:0,y:0,width:128,height:128},records=[];
 for(const templateConfigPacking of [false,true]){
  const allocations=[],bytes=packNativeConfigBatch(c,tile,7,32,{templateConfigPacking}, {sampleWeight:1,opticalTelemetry:false},n=>allocations.push(n));
  records.push(bytes);assert.equal(allocations.reduce((a,b)=>a+b,0),bytes.byteLength+(templateConfigPacking?1:32)*CONFIG_BUFFER_BYTES);
  assert.equal(allocations.length,templateConfigPacking?2:33);
 }
 assert.deepEqual(records[0],records[1]);
 const settings={templateConfigPacking:true,lazyUniformBudget:true},frozen=nativeHostOptions(settings);settings.templateConfigPacking=false;assert.equal(frozen.templateConfigPacking,true);assert(Object.isFrozen(frozen));
});
test('lazy uniform storage avoids exactly four host bytes per pixel until first uniform use and is reused',()=>{
 for(const lazyUniformBudget of [false,true]){
  const budgets=new Uint8Array(1920*1080).fill(1),state=createNativeBudgetState(budgets,32,{lazyUniformBudget}),initial=budgets.byteLength+budgets.length*4,alloc=[];
  assert.equal(state.memoryBytes(),initial+(lazyUniformBudget?0:budgets.length*4));
  assert.equal(state.get('fixed'),null);const radial=state.get('radial');assert.equal(radial[0],1);
  budgets[0]=2;assert.equal(state.get('radial')[0],1);
  const uniform=state.get('uniform',n=>alloc.push(n));assert(uniform.every(n=>n===32));assert.equal(uniform,state.get('uniform'));
  assert.deepEqual(alloc,lazyUniformBudget?[budgets.length*4]:[]);assert.equal(state.memoryBytes(),initial+budgets.length*4);
  assert.throws(()=>state.get('unknown'));
 }
 for(const budgets of [[1,2],new Uint8Array([0]),new Uint16Array([257])])assert.throws(()=>createNativeBudgetState(budgets,256));
 assert.equal(createNativeBudgetState(new Uint16Array([256]),256,{lazyUniformBudget:true}).get('radial')[0],256);
});
test('paired host diagnostics demand exact HDR/count/ray identity and reject hidden or incomplete work',()=>{
 const frame={width:2,height:1,maximumSpp:2,sampler:'fixed-pattern',seed:7,mode:'radial',maximumPathEvents:2068,actualSamples:3,validationErrors:0,
  diagnostics:true,fused:false,visibilityBefore:'visible',visibilityAfter:'visible',actualHistogram:{1:1,2:1},opticalInterfaceBudget:{enabled:true,maximumInterfaces:2048},image:new Float32Array([.25,.5,.75,1,.75,.5,.25,1]),
  tiles:[{tileIndex:0,tile:{x:0,y:0,width:2,height:1},expectedPrimaryRays:3,telemetry:{rayCounts:{status:'available',observedPrimaryRays:3,secondaryRays:4,totalPathSegments:7,bounceHistogram:[3,4]}}}]};
 assert.deepEqual(compareHostDiagnosticFrames(frame,structuredClone(frame)),{exactHdr:true,exactCompletedSamples:true,exactRays:true,primaryRays:3,secondaryRays:4,totalPathSegments:7});
 for(const change of [f=>f.image[0]+=.01,f=>f.image[3]=0,f=>f.actualSamples--,f=>f.actualHistogram[1]++,f=>f.visibilityBefore='hidden',f=>f.validationErrors++,f=>f.fused=true,
  f=>f.tiles[0].telemetry.rayCounts.secondaryRays++,f=>f.tiles=[],f=>f.tiles[0].tile.x++,f=>f.maximumSpp++,f=>f.opticalInterfaceBudget.enabled=false]){
  const changed=structuredClone(frame);change(changed);assert.throws(()=>compareHostDiagnosticFrames(frame,changed));
 }
});
