import test from 'node:test';
import assert from 'node:assert/strict';
import {createWavefrontPathTracingComputeConfig as config,estimateWavefrontPathTracingMemory as memory} from '../src/wavefront-config.js';
import {resolveTransportExperiments} from '../src/wavefront-core.js';
import {createConfigPayload} from '../src/wavefront-packers.js';
import {createWavefrontFrameEncoder} from '../src/wavefront-frame-encoder.js';
import {createGpuParallelismCounters} from '../src/wavefront-frame-runtime.js';
import {OPTICAL_EVENT_CONFIG_WGSL} from '../src/wavefront-optical-interface-budget.js';
import {WAVEFRONT_COMPUTE_WGSL} from '../src/wavefront-shaders.js';
import {createHash} from 'node:crypto';
import {withoutOpticalBudget} from './fixtures/optical-budget-baseline.js';
import {clampTileSizeForDevice} from '../src/wavefront-gpu-resources.js';
import {estimateSubmittedGpuWorkTiming} from '../src/wavefront-runtime-support.js';
import {functionSource} from './fixtures/rough-dielectric-numerical-harness.js';
import {OpticalWgslExec as Exec,OpticalWgslParser as Parser} from './fixtures/optical-wgsl-executor.js';

const flag='renderer.transport.opticalInterfaceBudget.enabled';
const options={width:128,height:128,tileSize:128,maxDepth:20,strictPhysicalLowSppLighting:true,
 [flag]:true,'renderer.transport.boundedDielectricBranching.enabled':true,'renderer.transport.nestedMediaRefraction.enabled':true};
test('separate optical allowance is default off and cannot silently enable its prerequisites',()=>{
 assert.equal(resolveTransportExperiments().effective.opticalInterfaceBudget,false);
 assert.throws(()=>config({[flag]:true}),/requires/);
 for(const [key,value] of [['strictPhysicalLowSppLighting',false],['deferredPathResolve',false],['renderer.transport.nestedMediaRefraction.enabled',false],['renderer.transport.boundedDielectricBranching.enabled',false]])assert.throws(()=>config({...options,[key]:value}),/requires/);
 const nested=config({...options,[flag]:undefined,featureFlags:{renderer:{transport:{opticalInterfaceBudget:{enabled:true}}}}});
 assert.equal(nested.opticalInterfaceBudget.enabled,true);
});
test('ordinary20 remains ordinary20; streamed optical64 needs no additional path nodes',()=>{
 const off=config({...options,[flag]:false}),on=config(options);
 assert.equal(off.maximumPathEvents,20);assert.equal(on.maxDepth,20);assert.equal(on.maximumPathEvents,84);
 assert.equal(on.memory.pathVertexBytes-off.memory.pathVertexBytes,0);
 assert.equal(on.opticalInterfaceBudget.maximumInterfaces,64);
 assert.equal(on.opticalInterfaceBudget.additionalPathBytes,0);
 assert.equal(memory(options).pathVertexBytes,on.memory.pathVertexBytes);
 const tile={x:0,y:0,width:128,height:128};
 const a=new DataView(createConfigPayload(off,tile,7)),b=new DataView(createConfigPayload(on,tile,7));
 assert.equal(a.getUint32(28,true),20);assert.equal(b.getUint32(28,true),20);
 assert.equal(a.getFloat32(108,true),0);assert.equal(a.getFloat32(124,true),0);
 assert.equal(b.getFloat32(108,true),64);assert.equal(b.getFloat32(124,true),20);
 for(const offset of [64,68,72,80,84,88,96,100,104,112,116,120,128,132,136,140])assert.equal(a.getFloat32(offset,true),b.getFloat32(offset,true));
 assert.equal(a.byteLength,320);assert.equal(b.byteLength,320);
});
test('optical admission rejects invalid limits, additional bytes and overlapping split lineage before allocation',()=>{
 for(const maximumInterfaces of [0,2049,NaN,Infinity,-1,1.5,'64',true])assert.throws(()=>config({...options,opticalInterfaceBudget:{maximumInterfaces}}),/opticalInterfaceBudget/);
 assert.equal(config({...options,opticalInterfaceBudget:{maximumAdditionalBytes:1}}).opticalInterfaceBudget.additionalPathBytes,0);
 for(const maximumAdditionalBytes of [0,-1,NaN,Infinity,1.5])assert.throws(()=>config({...options,opticalInterfaceBudget:{maximumAdditionalBytes}}),/opticalInterfaceBudget/);
 assert.throws(()=>config({...options,'renderer.sampling.stablePattern.enabled':true,'renderer.sampling.roughBounceSplitting.enabled':true,roughBounceSplitting:{splitDepth:1}}),/opticalInterfaceBudget/);
 assert.equal(config({...options,opticalInterfaceBudget:{maximumInterfaces:1}}).maximumPathEvents,21);
 for(const opticalInterfaceBudget of [[],null,3,{unknown:1}]){
  if(opticalInterfaceBudget===null)continue; // nullish options retain the public default.
  assert.throws(()=>config({...options,opticalInterfaceBudget}),/opticalInterfaceBudget/);
 }
});
test('device tile fitting uses ordinary node capacity independently of the optical cap',()=>{
 const limit=32*1024**2,device={limits:{maxStorageBufferBindingSize:limit}};
 assert.equal(clampTileSizeForDevice(config({...options,[flag]:false}),device),128);
 const on=config(options),size=clampTileSizeForDevice(on,device);
 assert.equal(size,128);assert(size*size*(on.maxDepth+1)*64<=limit);
});
test('submitted-work deadline estimation includes additional physical passes',()=>{
 const off=config({...options,[flag]:false}),on=config(options);
 assert(estimateSubmittedGpuWorkTiming(on,1).timeoutMs>estimateSubmittedGpuWorkTiming(off,1).timeoutMs);
});

function budget({bounce=0,ordinary=0,ordinaryLimit=20,opticalLimit=64,enabled=true,material=2,transmission=1,rough=false,validMedium=true}={}){
 const functions=['optical_interface_budget_enabled','optical_interface_eligible','ordinary_path_events','configured_path_events','path_budget_state_valid','path_budget_exhausted','continuation_budget_flags'].map(functionSource).join('\n');
 const code=`struct RayRecord{bounce:u32,flags:u32,}struct HitRecord{materialKind:u32,mediumRefId:u32,materialExtension:vec4<f32>,}
 struct FrameConfig{maxDepth:u32,cameraUp:vec4<f32>,cameraRight:vec4<f32>,transportExperimentFlags:u32,cameraForward:vec4<f32>,pathResolveSettings:vec4<f32>,}
 var<private>config:FrameConfig;
 fn transport_experiment_enabled(bit:u32)->bool{return (config.transportExperimentFlags&bit)!=0u;}
 fn path_event_config_valid()->bool{return true;}
 fn dielectric_event(h:HitRecord)->bool{return h.materialKind==2u||h.materialKind==3u;}
 fn rough_dielectric_active(h:HitRecord)->bool{return ${rough};}
 fn medium_valid(id:u32)->bool{return ${validMedium};}
 ${functions}
 @group(0) @binding(0)var<storage,read_write>o:array<u32>;
 @compute @workgroup_size(1)fn probe(){config.maxDepth=${ordinaryLimit}u;
 config.cameraUp.w=${ordinaryLimit};config.cameraRight.w=${opticalLimit};config.transportExperimentFlags=${enabled?131072:0}u;
 let ray=RayRecord(${bounce}u,${(ordinary*16777216+5)>>>0}u);
 let hit=HitRecord(${material}u,1u,vec4<f32>(0,0,${transmission},0));
 o[0]=select(0u,1u,path_budget_state_valid(ray));o[1]=select(0u,1u,path_budget_exhausted(ray,hit));
 o[2]=continuation_budget_flags(ray,hit,2u);o[3]=select(0u,1u,optical_interface_eligible(hit));}`;
 const out=new Uint32Array(4);new Exec(new Parser().parse(code)).dispatchWorkgroups('probe',1,{0:{0:out}});return [...out];
}
test('every optical event retains physical ordinal but does not spend ordinary scattering allowance',()=>{
 assert.deepEqual(budget({bounce:31,ordinary:0}),[1,0,2,1]);
 assert.deepEqual(budget({bounce:64,ordinary:0}),[1,1,2,1]);
 assert.deepEqual(budget({bounce:64,ordinary:0,material:0}),[1,0,16777218,0]);
 assert.deepEqual(budget({bounce:25,ordinary:19,material:0}),[1,1,335544322,0]);
 assert.deepEqual(budget({bounce:25,ordinary:19}),[1,0,318767106,1]);
 assert.equal(budget({bounce:83,ordinary:19})[1],1);
});
test('partial, rough and unsupported optical surfaces retain ordinary limits; malformed counters fail closed',()=>{
 for(const extra of [{transmission:.5},{rough:true},{validMedium:false},{material:1}])assert.equal(budget({bounce:25,ordinary:19,...extra})[1],1);
 assert.equal(budget({bounce:2,ordinary:3})[0],0);
 assert.equal(budget({bounce:65,ordinary:0})[0],0);
 assert.equal(budget({bounce:19,ordinary:0,enabled:false})[1],1);
 assert.equal(budget({bounce:0,ordinary:0,enabled:false})[2],2);
});
test('assembled off shader reconstructs exact pre-budget transport and payload',()=>{
 assert.equal(createHash('sha256').update(withoutOpticalBudget(WAVEFRONT_COMPUTE_WGSL)).digest('hex'),'c276c550b87b16f800f6e4953446b7d1ccc57db95f2281ba5bcd8e88f01844a2');
 const a=config({...options,[flag]:false}),b=config({...options,[flag]:undefined});
 assert.deepEqual(createConfigPayload(a,{x:0,y:0,width:128,height:128},7),createConfigPayload(b,{x:0,y:0,width:128,height:128},7));
 assert.equal(a.memory.pathVertexBytes,b.memory.pathVertexBytes);
});
test('GPU frame admission never accepts a raised physical cap without matching optical policy',()=>{
 const code=`struct FrameConfig{maxDepth:u32,cameraUp:vec4<f32>,cameraRight:vec4<f32>,transportExperimentFlags:u32,cameraForward:vec4<f32>,pathResolveSettings:vec4<f32>,}
 @group(0)@binding(0)var<storage,read>config:FrameConfig;
 @group(0)@binding(1)var<storage,read_write>o:array<u32>;
 ${OPTICAL_EVENT_CONFIG_WGSL}
 @compute @workgroup_size(1)fn probe(){o[0]=select(0u,1u,path_event_config_valid());}`;
 for(const [depth,ordinary,optical,flags,expected] of [[20,0,0,0,1],[20,20,64,180224,1],[32,32,2048,180224,1],[84,20,64,0,0],[84,20,64,131072,0],[84,20,63,180224,0],[84,20.5,63.5,180224,0],[84,20,65,180224,0],[20,0,20,180224,0],[97,33,64,180224,0],[0,0,0,0,0],[33,0,0,0,0]]){
  const bytes=new ArrayBuffer(96),v=new DataView(bytes);v.setFloat32(80,1,true);v.setFloat32(88,1,true);v.setUint32(0,depth,true);v.setFloat32(28,ordinary,true);v.setFloat32(44,optical,true);v.setUint32(48,flags,true);
  const out=new Uint32Array(1);new Exec(new Parser().parse(code)).dispatchWorkgroups('probe',1,{0:{0:new Uint8Array(bytes),1:out}});
  assert.equal(out[0],expected,JSON.stringify([depth,ordinary,optical,flags]));
 }
});
test('fixed and prepared encoders dispatch ordinary queues only; optical events are streamed',()=>{
 for(const enabled of [false,true])for(const prepared of [false,true]){
  const c=config({...options,[flag]:enabled}),records=[],labels=[],groups=[];
  const encoder={copyBufferToBuffer(){},beginComputePass:({label})=>{labels.push(label);return {setPipeline(){},setBindGroup:(_i,g)=>groups.push(g),dispatchWorkgroups(){},dispatchWorkgroupsIndirect(){},end(){}};}};
  const frame=createWavefrontFrameEncoder({getConfig:c,getBindGroups:['ping','pong'],pipelines:{},counterBuffer:{},activeDispatchBuffer:{},getFrameTelemetry:()=>({recordActiveRayCount:(_e,_b,i)=>records.push(i),decorateFirstPass:x=>x})});
  frame[prepared?'encodePreparedTileSample':'encodeTileSample'](encoder,{width:128,height:128},0,createGpuParallelismCounters());
  assert.equal(c.maxDepth,20);assert.deepEqual(records,Array.from({length:20},(_,i)=>i));
  assert.equal(labels.filter(l=>l.startsWith('plasius.wavefront.bounce.')).length,c.maxDepth);
  assert.equal(groups.at(-1),'pong');
 }
});
