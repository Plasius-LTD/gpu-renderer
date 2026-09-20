import { SHARED_ADAPTIVE_WGSL } from "./wavefront-adaptive-shared-shader.js";
import { assertShaderModuleCompiles, createComputePipeline } from "./wavefront-runtime-support.js";
import { CONFIG_BUFFER_BYTES, COUNTER_BUFFER_BYTES, RAY_RECORD_BYTES, PATH_VERTEX_RECORD_BYTES } from "./wavefront-core.js";
import { recordDirectDispatch, recordIndirectDispatch, createGpuParallelismCounters } from "./wavefront-frame-runtime.js";

export function createSharedSampleRanges(tiers) {
  if (!Array.isArray(tiers) || !tiers.length || tiers.some(n=>!Number.isSafeInteger(n)||n<1||n>256)) throw new RangeError("Invalid shared sample tiers.");
  let firstSample=0;
  return [...new Set(tiers)].sort((a,b)=>a-b).map(sampleLimit=>{const phase=Object.freeze({firstSample,sampleLimit});firstSample=sampleLimit;return phase;});
}

export function packSharedPhase(phase) {
  const fields=[phase.width,phase.height,phase.tileX,phase.tileY,phase.tileWidth,phase.tileHeight,phase.firstSample,phase.sampleLimit];
  if(fields.some(n=>!Number.isSafeInteger(n)||n<0||n>0xffffffff) || !phase.width || !phase.height || phase.width*phase.height>0xffffffff
    || !phase.tileWidth || !phase.tileHeight || phase.tileWidth*phase.tileHeight>16384 || phase.tileX+phase.tileWidth>phase.width || phase.tileY+phase.tileHeight>phase.height
    || phase.firstSample>=phase.sampleLimit || phase.sampleLimit>256)throw new RangeError("Invalid shared phase.");
  const bytes=new ArrayBuffer(32),view=new DataView(bytes);
  fields.forEach((value,index)=>view.setUint32(index*4,value,true));return bytes;
}

export const SHARED_ADAPTIVE_BINDING_SIZES = Object.freeze([CONFIG_BUFFER_BYTES,32,4,4,16,12,RAY_RECORD_BYTES,PATH_VERTEX_RECORD_BYTES,COUNTER_BUFFER_BYTES,16,16]);
export const SHARED_ADAPTIVE_ENTRIES = Object.freeze({initialize:"initialize_shared_phase",compact:"compact_shared_phase",finalize:"finalize_shared_phase",validate:"validate_shared_phase",prepare:"prepare_shared_sample",commit:"commit_shared_sample",resolve:"resolve_shared_frame"});

export async function createSharedAdaptivePipelines(device, shaderStage, {enabled=false}={}) {
  if(!enabled)return null;
  const module=device.createShaderModule({label:"adaptive-shared-rounds",code:SHARED_ADAPTIVE_WGSL});
  await assertShaderModuleCompiles(module,"adaptive-shared-rounds");
  const entries=SHARED_ADAPTIVE_BINDING_SIZES.map((minBindingSize,binding)=>({binding,visibility:shaderStage.COMPUTE,
    buffer:{type:binding<2?"uniform":"storage",minBindingSize,...(binding<2?{hasDynamicOffset:true}:{})}}));
  const phaseLayout=device.createBindGroupLayout({label:"adaptive-shared-worklist",entries});
  // An indirect argument buffer must not also be bound writable in that pass.
  const layout=device.createBindGroupLayout({label:"adaptive-shared-execution",entries:entries.filter(e=>e.binding!==5)});
  const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[layout]}),phasePipelineLayout=device.createPipelineLayout({bindGroupLayouts:[phaseLayout]}),result={layout,phaseLayout};
  for(const [key,entry] of Object.entries(SHARED_ADAPTIVE_ENTRIES))result[key]=await createComputePipeline(device,module,["initialize","compact","finalize"].includes(key)?phasePipelineLayout:pipelineLayout,entry,`adaptive-shared-${key}`);
  return Object.freeze(result);
}

function validateRequest({tile,frameOffset,phaseOffset}) {
  if(!tile || [tile.x,tile.y,tile.width,tile.height].some(n=>!Number.isSafeInteger(n)||n<0||n>0xffffffff)
    || !tile.width || !tile.height || tile.width*tile.height>16384 || tile.x+tile.width>0xffffffff || tile.y+tile.height>0xffffffff)throw new RangeError("Invalid shared tile.");
  for(const offset of [frameOffset,phaseOffset])if(!Number.isSafeInteger(offset)||offset<0||offset>0xffffffff||offset%256)throw new RangeError("Invalid immutable shared offset.");
}
function pass(encoder,options,key,indirect,groups) {
  const p=encoder.beginComputePass({label:`adaptive-shared-${key}`});p.setPipeline(options.pipelines[key]);p.setBindGroup(0,["initialize","compact","finalize"].includes(key)?options.phaseBindGroup:options.bindGroup,[options.frameOffset,options.phaseOffset]);
  if(indirect){p.dispatchWorkgroupsIndirect(options.dispatchBuffer,0);recordIndirectDispatch(options.parallelism,groups,64);}
  else {p.dispatchWorkgroups(groups);recordDirectDispatch(options.parallelism,[groups],key==="finalize"?1:64);}
  p.end();
}
export function encodeSharedPhase(encoder,request) {
  validateRequest(request);const options={...request,parallelism:request.parallelism??createGpuParallelismCounters()},groups=Math.ceil(request.tile.width*request.tile.height/64);
  pass(encoder,options,"initialize",false,groups);pass(encoder,options,"compact",false,groups);pass(encoder,options,"finalize",false,1);pass(encoder,options,"validate",true,groups);
}
export function encodeSharedSample(encoder,request) {
  validateRequest(request);const options={...request,parallelism:request.parallelism??createGpuParallelismCounters()},groups=Math.ceil(request.tile.width*request.tile.height/64);
  encoder.clearBuffer(options.counterBuffer,0,COUNTER_BUFFER_BYTES);
  pass(encoder,options,"prepare",true,groups);
  options.frameEncoder.encodePreparedTileSample(encoder,options.tile,options.frameOffset,options.parallelism);
  pass(encoder,options,"commit",true,groups);
}
