import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeWgslSource} from '@plasius/gpu-shader/node';
import {resolveGuidedDenoise,createGuidedSpatialDenoiser} from '../src/wavefront-guided-denoise.js';
import {GUIDED_CAPTURE_WGSL,GUIDED_FILTER_WGSL} from '../src/wavefront-guided-denoise-shader.js';
import {createWavefrontFrameEncoder} from '../src/wavefront-frame-encoder.js';
import {createGpuParallelismCounters} from '../src/wavefront-frame-runtime.js';

const flag='renderer.denoise.guidedSpatial.enabled';
const constants={texture:{STORAGE_BINDING:1,TEXTURE_BINDING:2,COPY_SRC:4,COPY_DST:8},buffer:{UNIFORM:1,COPY_DST:2},shader:{COMPUTE:4}};
function mock(fail=false){
 const allocations=[],commands=[];
 const device={limits:{maxTextureDimension2D:8192},queue:{writeBuffer(){}},
 createTexture:d=>{const r={descriptor:d,destroyed:0,createView:()=>({label:d.label}),destroy(){this.destroyed++;}};allocations.push(r);return r;},
 createBuffer:d=>{const r={descriptor:d,destroyed:0,destroy(){this.destroyed++;}};allocations.push(r);return r;},
 createShaderModule:d=>({getCompilationInfo:async()=>({messages:fail?[{type:'error',message:'bad shader'}]:[]}),...d}),
 createBindGroupLayout:d=>d,createPipelineLayout:d=>d,createComputePipelineAsync:async d=>d,createBindGroup:d=>d};
 const encoder={beginComputePass:d=>{commands.push(d);return {setPipeline(){},setBindGroup(){},dispatchWorkgroups(){},end(){}};}};
 return {device,allocations,commands,encoder};
}
const args={width:1920,height:1080,[flag]:true,inputView:{},outputView:{},scratchView:{},pixelState:{},frameBuffer:{},hitBuffer:{},rayBuffer:{},counterBuffer:{}};
test('guided denoise is default off, validates native allocation before work, and has bounded memory',async()=>{
 assert.equal(resolveGuidedDenoise({}).enabled,false);
 assert.equal(await createGuidedSpatialDenoiser(null,null,{}),null);
 for(const v of [{[flag]:true},{featureFlags:{[flag]:true}},{featureFlags:{enabled:{[flag]:true}}},{featureFlags:{flags:{[flag]:true}}},{featureFlags:{renderer:{denoise:{guidedSpatial:{enabled:true}}}}}])assert.equal(resolveGuidedDenoise({...args,...v}).enabled,true);
 assert.equal(resolveGuidedDenoise({...args,[flag]:false,featureFlags:{[flag]:true}}).enabled,false);
 assert.equal(resolveGuidedDenoise(args).additionalBytes,1920*1080*20+1024);
 assert.equal(resolveGuidedDenoise({...args,width:3840,height:2160}).additionalBytes,3840*2160*20+1024);
 for(const v of [{width:0},{height:NaN},{width:1.5},{guidedSpatialDenoise:{maximumAdditionalBytes:1}},{guidedSpatialDenoise:{maximumAdditionalBytes:NaN}},{width:3840,height:2160,scratchView:null}])assert.throws(()=>resolveGuidedDenoise({...args,...v}));
 const m=mock();await assert.rejects(()=>createGuidedSpatialDenoiser(m.device,constants,{...args,width:9000}));assert.equal(m.allocations.length,0);
});
test('resources are reused across filters, raw resolve skips filtering, cleanup owns no borrowed resources',async()=>{
 const m=mock(),d=await createGuidedSpatialDenoiser(m.device,constants,args);
 assert.equal(m.allocations.length,4); // two guides, one extra ping-pong, uniforms
 assert.equal(d.memory.additionalBytes,1920*1080*20+1024);
 d.encode(m.encoder);assert.equal(m.commands.length,4);
 d.encode(m.encoder,{filtered:false});assert.equal(m.commands.length,5);
 assert.equal(m.allocations.length,4);
 assert.ok(d.capture(0));assert.equal(d.capture(512),null);
 d.destroy();d.destroy();assert.ok(m.allocations.every(a=>a.destroyed===1));
 assert.throws(()=>d.encode(m.encoder),/destroyed/);
 const failed=mock(true);await assert.rejects(()=>createGuidedSpatialDenoiser(failed.device,constants,args),/bad shader/);
 assert.ok(failed.allocations.every(a=>a.destroyed===1));
 const owned=mock(),standalone=await createGuidedSpatialDenoiser(owned.device,constants,{...args,scratchView:null});
 assert.equal(owned.allocations.length,5);standalone.destroy();assert.ok(owned.allocations.every(a=>a.destroyed===1));
});
test('assembled guide ABI reuses canonical hits and captures by source pixel; filter preserves invalid and protected input',()=>{
 for(const source of [GUIDED_CAPTURE_WGSL,GUIDED_FILTER_WGSL])assert.ok(analyzeWgslSource(source,'guided').bindings.length>0);
 assert.match(GUIDED_CAPTURE_WGSL,/hit\.sourcePixelId % config\.canvasWidth/);
 assert.match(GUIDED_CAPTURE_WGSL,/ray\.sampleId != 0u \|\| ray\.bounce != 0u/);
 assert.match(GUIDED_CAPTURE_WGSL,/hit\.material\.x >= 0\.5/);
 assert.match(GUIDED_FILTER_WGSL,/>> 9u\) & 511u/);
 assert.match(GUIDED_FILTER_WGSL,/center\.w == 0\.0 \|\| albedo\.w == 0\.0/);
 assert.doesNotMatch(GUIDED_FILTER_WGSL,/vec3<f32>\(16\.0\)/);
});
test('primary guide capture runs between intersection and surface, once at sample zero only; off order unchanged',()=>{
 const run=enabled=>{const order=[],parallelism=createGpuParallelismCounters();
  const encoder={copyBufferToBuffer(){},beginComputePass(){return {setPipeline:p=>order.push(p),setBindGroup(){},dispatchWorkgroups(){},dispatchWorkgroupsIndirect(){},end(){}};}};
  const frame=createWavefrontFrameEncoder({getConfig:{maxDepth:2},getBindGroups:['a','b'],pipelines:{intersectActiveQueue:'hit',resolveSurfaceRecords:'shade',compactAndSwapQueues:'swap'},counterBuffer:{},activeDispatchBuffer:{},getPrimaryGuideCapture:offset=>enabled&&offset===0?{pipeline:'guide',bindGroup:{}}:null});
  for(const offset of [0,512])frame.encodePreparedTileSample(encoder,{width:8,height:8},offset,parallelism);
  return order;};
 const on=run(true),off=run(false);assert.deepEqual(on.slice(0,4),['hit','guide','shade','swap']);
 assert.equal(on.filter(x=>x==='guide').length,1);assert.deepEqual(on.filter(x=>x!=='guide'),off);
});
