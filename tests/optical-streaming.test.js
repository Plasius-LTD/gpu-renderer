import test from 'node:test';
import assert from 'node:assert/strict';
import {createWavefrontPathTracingComputeConfig as make} from '../src/wavefront-config.js';
import {createConfigPayload} from '../src/wavefront-packers.js';
import {createWavefrontFrameEncoder} from '../src/wavefront-frame-encoder.js';
import {createGpuParallelismCounters} from '../src/wavefront-frame-runtime.js';
import {WAVEFRONT_SURFACE_BODY_WGSL} from '../src/wavefront-shader-kernels.js';
import {WAVEFRONT_COMPUTE_WGSL} from '../src/wavefront-shaders.js';
import {OpticalWgslExec as Exec,OpticalWgslParser as Parser} from './fixtures/optical-wgsl-executor.js';
const enabled={'renderer.transport.opticalInterfaceBudget.enabled':true,'renderer.transport.boundedDielectricBranching.enabled':true,'renderer.transport.nestedMediaRefraction.enabled':true};
const options={width:128,height:128,tileSize:128,maxDepth:20,strictPhysicalLowSppLighting:true,...enabled};
test('streamed optical work keeps ordinary-sized node storage and frame ABI while admitting bounded physical metadata',()=>{
 const off=make({...options,'renderer.transport.opticalInterfaceBudget.enabled':false}),on=make(options);
 assert.equal(on.opticalInterfaceBudget.storageMode,'streamed-linear-chain');assert.equal(on.opticalInterfaceBudget.additionalPathBytes,0);
 assert.equal(on.memory.pathVertexBytes,off.memory.pathVertexBytes);assert.equal(on.maximumPathEvents,84);
 const high=make({...options,opticalInterfaceBudget:{maximumInterfaces:2048}});assert.equal(high.maximumPathEvents,2068);assert.equal(high.memory.pathVertexBytes,on.memory.pathVertexBytes);
 assert.throws(()=>make({...options,opticalInterfaceBudget:{maximumInterfaces:2049}}),/limits/);
 const view=new DataView(createConfigPayload(on,{x:0,y:0,width:128,height:128},7,{opticalTelemetry:true}));
 assert.equal(view.getUint32(28,true),20);assert.equal(view.getFloat32(92,true),1);assert.equal(view.getFloat32(108,true),64);assert.equal(view.getFloat32(124,true),20);assert.equal(view.byteLength,320);
});
test('only ordinary queue iterations are host-dispatched; smooth optical work is resolved selectively on GPU',()=>{
 const config=make(options),records=[];const pass={setPipeline(){},setBindGroup(){},dispatchWorkgroups(){},dispatchWorkgroupsIndirect(){},end(){}};
 const encoder={beginComputePass:()=>pass,copyBufferToBuffer(){}};
 const frame=createWavefrontFrameEncoder({getConfig:config,getBindGroups:[{},{}],pipelines:{},counterBuffer:{},activeDispatchBuffer:{},getFrameTelemetry:()=>({recordActiveRayCount:(_e,_b,i)=>records.push(i)})});
 frame.encodePreparedTileSample(encoder,{width:128,height:128},0,createGpuParallelismCounters());
 assert.deepEqual(records,Array.from({length:20},(_,i)=>i));assert.match(WAVEFRONT_SURFACE_BODY_WGSL,/resolve_optical_chain/);
});

test('logical node ownership is independent of physical optical ordinal and resolves a camera sample once',()=>{
 const code=WAVEFRONT_COMPUTE_WGSL.replace('@group(0) @binding(5) var<uniform> config: FrameConfig;','var<private> config: FrameConfig;')+`
 @compute @workgroup_size(1)fn logical_test(){
 config.transportExperimentFlags=180224u;config.tilePixelCount=4u;config.maxDepth=20u;
 var input=RayRecord();input.bounce=100u;input.rayId=1u;input.parentRayId=PATH_NONE;input.sourcePixelId=7u;input.sampleId=3u;
 let root=begin_path_node(input,2u);record_path_direct(root,vec3<f32>(.1));link_path_child(root,0u,false);
 var child=input;child.bounce=101u;child.flags=1u<<24u;child.parentRayId=root.parentRayId;
 let leaf=begin_path_node(child,0u);record_path_terminal(leaf,vec3<f32>(.65),2u);
 accumulation[0]=resolve_complete_path_tree(1u,7u,3u);accumulation[1]=vec4<f32>(f32(root.parentRayId),f32(leaf.parentRayId),f32(pathNodes[1].depth),f32(pathNodes[4].depth));
 }`;
 const output=new Float32Array(8),nodes=new Uint32Array(20*4*16);
 new Exec(new Parser().parse(code)).dispatchWorkgroups('logical_test',1,{0:{3:output,22:nodes}});
 assert.deepEqual([...output],[.75,.75,.75,1,1,4,0,1]);
});
