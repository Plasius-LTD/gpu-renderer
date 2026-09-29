import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveRoughBounceSplitting,roughSplitAdditionalBytes,withRoughBounceSplitting,roughBranchPixel} from '../src/wavefront-rough-bounce-splitting.js';
import {createWavefrontPathTracingComputeConfig,estimateWavefrontPathTracingMemoryForConfig} from '../src/wavefront-config.js';
import {createWavefrontPathTracingComputeShaderSource,WAVEFRONT_COMPUTE_WGSL} from '../src/wavefront-shaders.js';
import {stablePatternWords} from '../src/wavefront-stable-pattern.js';
import {createSharedAdaptivePipelines} from '../src/wavefront-adaptive-shared.js';
import {createAdaptiveCompletionPipeline} from '../src/wavefront-adaptive-completion.js';
import {createWavefrontPipelineResources} from '../src/wavefront-pipelines.js';
import {analyzeWgslSource,reflectGpuInterface} from '@plasius/gpu-shader/node';
import {createWavefrontFrameEncoder} from '../src/wavefront-frame-encoder.js';
import {createGpuParallelismCounters} from '../src/wavefront-frame-runtime.js';
const flag='renderer.sampling.roughBounceSplitting.enabled';
const on={'renderer.sampling.stablePattern.enabled':true,[flag]:true,strictPhysicalLowSppLighting:true};
test('expanded queue telemetry changes only the indirect upper bound, not GPU commands',()=>{
 const capture=enabled=>{
  const calls=[],parallelism=createGpuParallelismCounters();
  const encoder={copyBufferToBuffer:(...a)=>calls.push(['copy',...a]),beginComputePass:d=>{
   calls.push(['begin',d]);return {setPipeline:p=>calls.push(['pipeline',p]),setBindGroup:(...a)=>calls.push(['group',...a]),dispatchWorkgroupsIndirect:(...a)=>calls.push(['indirect',...a]),dispatchWorkgroups:(...a)=>calls.push(['direct',...a]),end:()=>calls.push(['end'])};
  }};
  const frame=createWavefrontFrameEncoder({getConfig:{maxDepth:6,roughBounceSplitting:{enabled,queueFactor:4}},getBindGroups:['ping','pong'],pipelines:{intersectActiveQueue:'intersect',resolveSurfaceRecords:'shade',compactAndSwapQueues:'swap'},counterBuffer:'counter',activeDispatchBuffer:'dispatch'});
  frame.encodePreparedTileSample(encoder,{width:8,height:8},0,parallelism);return {calls,parallelism};
 };
 const off=capture(false),split=capture(true);
 assert.deepEqual(split.calls,off.calls);
 assert.equal(off.parallelism.estimatedIndirectWorkgroupsUpperBound,12);
 assert.equal(split.parallelism.estimatedIndirectWorkgroupsUpperBound,42);
 assert.equal(split.parallelism.indirectDispatches,off.parallelism.indirectDispatches);
});
test('rough splitting is explicitly flagged, bounded and admitted before allocating',()=>{
 assert.equal(resolveRoughBounceSplitting().queueFactor,1);
 for(const options of [{[flag]:true},{featureFlags:{[flag]:true}},{featureFlags:{enabled:{[flag]:true}}},{featureFlags:{flags:{[flag]:true}}},{featureFlags:{renderer:{sampling:{roughBounceSplitting:{enabled:true}}}}}])assert.equal(resolveRoughBounceSplitting(options).queueFactor,2);
 assert.equal(resolveRoughBounceSplitting({[flag]:false,featureFlags:{[flag]:true}}).enabled,false);
 for(const splitDepth of [0,3,1.5,NaN])assert.throws(()=>resolveRoughBounceSplitting({...on,roughBounceSplitting:{splitDepth}}));
 for(const maximumAdditionalBytes of [0,-1,NaN])assert.throws(()=>resolveRoughBounceSplitting({...on,roughBounceSplitting:{maximumAdditionalBytes}}));
 assert.throws(()=>createWavefrontPathTracingComputeConfig({[flag]:true}),/stable/);
 assert.throws(()=>createWavefrontPathTracingComputeConfig({...on,maxDepth:9}),/depth/);
 assert.throws(()=>createWavefrontPathTracingComputeConfig({...on,deferredPathResolve:false}),/deferred/);
 assert.throws(()=>createWavefrontPathTracingComputeConfig({...on,roughBounceSplitting:{maximumAdditionalBytes:1}}),/allocation/);
 for(const splitDepth of [1,2]){
  const c=createWavefrontPathTracingComputeConfig({...on,roughBounceSplitting:{splitDepth}}),off=createWavefrontPathTracingComputeConfig();
  const factor=2**splitDepth;
  assert.equal(c.memory.queueBytes,off.memory.queueBytes*factor);
  assert.equal(c.memory.hitBytes,off.memory.hitBytes*factor);
  assert.equal(c.memory.pathVertexBytes,off.memory.pathVertexBytes*factor);
  assert.equal(c.memory.accumulationBytes,off.memory.accumulationBytes);
  assert.deepEqual(estimateWavefrontPathTracingMemoryForConfig(c),c.memory);
  assert.equal(roughSplitAdditionalBytes(c.tilePixelCapacity,c.maxDepth,c.roughBounceSplitting),(factor-1)*c.tilePixelCapacity*(96*2+256+(c.maxDepth+1)*64));
 }
});
test('branch lighting keys separate siblings without changing camera identity or zero-key control',()=>{
 assert.equal(roughBranchPixel(17,0),17);
 const keys=new Set(Array.from({length:511},(_,i)=>roughBranchPixel(17,i)));assert.equal(keys.size,511);
 for(let s=0;s<32;s++){
  assert.deepEqual(stablePatternWords(roughBranchPixel(17,1),s,0,1),stablePatternWords(17,s,0,1));
  assert.notDeepEqual(stablePatternWords(roughBranchPixel(17,1),s,0,22),stablePatternWords(roughBranchPixel(17,2),s,0,22));
 }
 // Partition energy at each binary split; descendants remain one camera sample.
 for(const depth of [1,2])assert.equal(Array(2**depth).fill(1/2**depth).reduce((a,b)=>a+b),1);
});
test('specialized assembled shaders preserve off bytes, binary ABI, identity, weights and capacity',async()=>{
 assert.equal(createWavefrontPathTracingComputeShaderSource(),WAVEFRONT_COMPUTE_WGSL);
 assert.equal(withRoughBounceSplitting('unchanged'), 'unchanged');
 assert.throws(()=>withRoughBounceSplitting('missing markers',{enabled:true,splitDepth:1,queueFactor:2},true),/source/);
 for(const splitDepth of [1,2]){
  const splitting=resolveRoughBounceSplitting({...on,roughBounceSplitting:{splitDepth}});
  assert.throws(()=>createWavefrontPathTracingComputeShaderSource({roughBounceSplitting:splitting}),/stable/);
  const source=createWavefrontPathTracingComputeShaderSource({progressiveSampling:'stable-pattern',roughBounceSplitting:splitting});
  const analyzed=analyzeWgslSource(source,'split');
  const used=[0,1,2,4,5,6,8,9,19,20,21,22,29,30,31,32];
  const manifest=await reflectGpuInterface({interfaceId:'plasius.renderer.rough-split',interfaceVersion:'1.0.0',modules:[{moduleId:'split',source}],
   pipelines:[{kind:'compute',pipelineId:'shade',layout:{bindGroups:[{group:0,entries:analyzed.bindings.filter(b=>used.includes(b.binding)).map(b=>({...b,visibility:['compute']}))}]},compute:{moduleId:'split',entryPoint:'resolveSurfaceRecords',constants:{}}}],
   modelFacingRecordNames:['RayRecord','HitRecord','PathNode'],modelFacingBindings:[],semantics:[]});
  for(const [name,size] of [['RayRecord',96],['HitRecord',240],['PathNode',64]])assert.equal(manifest.records.find(r=>r.name===name).byteSize,size);
  assert.match(source,/throughput\.xyz \* weight \* 0\.5/);
  assert.match(source,/ray\.sourcePixelId, ray\.sampleId/);
  assert.match(source,/rough_split_eligible/);assert.match(source,/split_pixel_id\(pixelId\)/);
  assert.match(source,/hit\.materialKind == 0u\s*&& hit\.material\.x >= 0\.5/);
  assert.match(source,/hit\.materialExtension\.z <= 0\.001 && max_component\(hit\.materialResponse\.xyz\) == 0\.0/);
  assert.match(source.slice(source.indexOf('fn spawn_rough_children')),/fail_path_node\(ray\);\s*record_termination_metrics[^;]+;\s*atomicAdd\(&counters\.terminatedCount, 1u\)/);
  assert.match(source,/min\(nextCount, rough_queue_capacity\(\)\)/);
  const modules=[],device={createBindGroupLayout:x=>x,createPipelineLayout:x=>x,createShaderModule:x=>{modules.push(x);return {getCompilationInfo:async()=>({messages:[]})};},createComputePipelineAsync:async x=>x,createRenderPipelineAsync:async x=>x};
  await createWavefrontPipelineResources({device,constants:{shader:{COMPUTE:4,FRAGMENT:2,VERTEX:1}},format:'bgra8unorm',config:{transportExperimentFlags:2048,roughBounceSplitting:splitting}});
  assert.equal(modules[0].code,source);
  await createSharedAdaptivePipelines(device,{}, {enabled:true,roughBounceSplitting:splitting});
  await createAdaptiveCompletionPipeline(device,{}, {enabled:true,roughBounceSplitting:splitting});
  for(const m of modules.filter(m=>/adaptive-shared|adaptive-complete/.test(m.label)))assert.match(m.code,new RegExp(`config.tilePixelCount \\* ${2**splitDepth}u`));
 }
});
