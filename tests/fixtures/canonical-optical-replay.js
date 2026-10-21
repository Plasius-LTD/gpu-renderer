import {WAVEFRONT_CAMERA_RAY_RECORD_WGSL} from '../../src/wavefront-camera-shared-shader.js';
import {WAVEFRONT_SHADER_LAYOUT_WGSL} from '../../src/wavefront-shader-layout.js';
import {assertShaderModuleCompiles} from '../../src/wavefront-runtime-support.js';
import {createGpuParallelismCounters} from '../../src/wavefront-frame-runtime.js';

const RECORD_WORDS=64;
const hitRecord=WAVEFRONT_SHADER_LAYOUT_WGSL.match(/struct HitRecord \{[\s\S]+?\n\};/)[0];
export function canonicalJournalShader({pixel,sample,maxDepth}) {
 if(!Number.isSafeInteger(pixel)||pixel<0||pixel>0xffffffff||!Number.isInteger(sample)||sample<0||sample>255||!Number.isInteger(maxDepth)||maxDepth<1||maxDepth>32)throw Error('Invalid canonical journal selection');
 // Writable binding types match the canonical pass usage scope; these kernels
 // only read transport resources. The sole destination is the private journal.
 return `${WAVEFRONT_CAMERA_RAY_RECORD_WGSL}\n${hitRecord}
 @group(0) @binding(0) var<storage, read_write> rays:array<RayRecord>;
 @group(0) @binding(1) var<storage, read_write> hits:array<HitRecord>;
 @group(0) @binding(2) var<storage, read_write> counters:array<u32>;
 @group(0) @binding(3) var<storage, read_write> journal:array<vec4<u32>>;
 fn capture(slot:u32,stage:u32){
  if(slot>=counters[0]||slot>=arrayLength(&rays)){return;}
  let ray=rays[slot];let bounce=ray.bounce;
  if(ray.sourcePixelId!=${pixel}u||ray.sampleId!=${sample}u||bounce >= ${maxDepth}u){return;}
  let o=(bounce*2u+stage)*16u;
  if(o+15u>=arrayLength(&journal)){return;}
  journal[o]=vec4<u32>(1u,slot,stage,0u);
  journal[o+1u]=vec4<u32>(ray.rayId,ray.parentRayId,ray.sourcePixelId,ray.sampleId);
  journal[o+2u]=vec4<u32>(ray.bounce,ray.mediumRefId,ray.flags,ray.mediumStackDepth);
  journal[o+3u]=bitcast<vec4<u32>>(ray.origin);
  journal[o+4u]=bitcast<vec4<u32>>(ray.direction);
  journal[o+5u]=bitcast<vec4<u32>>(ray.throughput);
  journal[o+6u]=ray.mediumStack;
  if(stage==0u){return;}
  let hit=hits[slot];
  journal[o+7u]=vec4<u32>(hit.hitType,hit.primitiveId,hit.frontFace,hit.mediumRefId);
  journal[o+8u]=vec4<u32>(hit.materialKind,hit.objectId,hit.materialRefId,hit.materialSlot);
  journal[o+9u]=bitcast<vec4<u32>>(vec4<f32>(hit.distance,hit.occlusion,hit.pad2,0.0));
  journal[o+10u]=bitcast<vec4<u32>>(hit.position);
  journal[o+11u]=bitcast<vec4<u32>>(hit.geometricNormal);
  journal[o+12u]=bitcast<vec4<u32>>(hit.shadingNormal);
  journal[o+13u]=bitcast<vec4<u32>>(hit.material);
  journal[o+14u]=bitcast<vec4<u32>>(hit.materialExtension);
  journal[o+15u]=bitcast<vec4<u32>>(hit.barycentric);
 }
 @compute @workgroup_size(64) fn before(@builtin(global_invocation_id) id:vec3<u32>){capture(id.x,0u);}
 @compute @workgroup_size(64) fn after(@builtin(global_invocation_id) id:vec3<u32>){capture(id.x,1u);}`;
}

export function decodeCanonicalJournal(bytes){
 if(bytes.byteLength%(RECORD_WORDS*4)||bytes.byteLength>32*2*RECORD_WORDS*4)throw Error('Invalid canonical journal length');
 const u=new Uint32Array(bytes),f=new Float32Array(bytes),records=[];
 for(let o=0;o<u.length;o+=RECORD_WORDS){
  if(!u[o])continue;
  const vector=(n,count=3)=>Array.from(f.slice(o+n,o+n+count));
  records.push({stage:u[o+2]?'after-intersection':'before-intersection',queueSlot:u[o+1],
   rayId:u[o+4],parentRayId:u[o+5],pixel:u[o+6],sample:u[o+7],bounce:u[o+8],medium:u[o+9],flags:u[o+10],mediumDepth:u[o+11],
   origin:vector(12),direction:vector(16),throughput:vector(20,4),mediumStack:Array.from(u.slice(o+24,o+28)),
   hit:u[o+2]?{type:u[o+28],primitive:u[o+29],frontFace:u[o+30],medium:u[o+31],materialKind:u[o+32],object:u[o+33],
    distance:f[o+36],failure:u[o+28]===5?f[o+38]:0,positionError:u[o+28]===5?null:f[o+38],position:vector(40),geometricNormal:vector(44),shadingNormal:vector(48),material:vector(52,4),extension:vector(56,4),barycentric:vector(60)}:null});
 }
 return records;
}

export function encodeCanonicalReplay(encoder,{frameEncoder,tile,frameOffset,phaseOffset,counters,shared,sharedGroup,dispatch,pipelines,journal,label='failure-only'}){
 encoder.clearBuffer(counters);
 const prepare=encoder.beginComputePass({label:label+'-canonical-prepare'});
 prepare.setPipeline(shared.prepare);prepare.setBindGroup(0,sharedGroup,[frameOffset,phaseOffset]);prepare.dispatchWorkgroupsIndirect(dispatch,0);prepare.end();
 const observed=new Proxy(encoder,{get(target,key){
  if(key!=='beginComputePass'){const value=target[key];return typeof value==='function'?value.bind(target):value;}
  return descriptor=>{
   const pass=target.beginComputePass(descriptor),match=/^plasius\.wavefront\.bounce\.(\d+)$/.exec(descriptor.label);
   if(!match)return pass;
   let binding;
   return new Proxy(pass,{get(p,k){
    if(k==='setBindGroup')return (...args)=>{binding=args;p.setBindGroup(...args);};
    if(k==='setPipeline')return pipeline=>{
     const capture=pipeline===pipelines.intersectActiveQueue?journal.before:pipeline===pipelines.resolveSurfaceRecords?journal.after:null;
     if(capture){p.setPipeline(capture);p.setBindGroup(0,journal.groups[Number(match[1])%2]);p.dispatchWorkgroups(Math.ceil(tile.width*tile.height/64));p.setBindGroup(...binding);}
     p.setPipeline(pipeline);
    };
    const value=p[k];return typeof value==='function'?value.bind(p):value;
   }});
  };
 }});
 frameEncoder.encodePreparedTileSample(observed,tile,frameOffset,createGpuParallelismCounters());
}

// Only after a rejected tile. Never resolve radiance or commit sample counts.
// Preserve the original compiled pipelines, worklist, dynamic config and phase.
export async function replayCanonicalFailure(c,{config,tile,ranges,failure}){
 return captureCanonicalJournal(c,{config,tile,ranges,selection:failure,failureOnly:true});
}
// An explicitly selected successful sample is not represented as a failure.
// Its original worklist/config are still required; no image/count commits occur.
export async function captureCanonicalSelection(c,{config,tile,ranges,selection}){
 return captureCanonicalJournal(c,{config,tile,ranges,selection,failureOnly:false});
}
async function captureCanonicalJournal(c,{config,tile,ranges,selection,failureOnly}){
 if(config.roughBounceSplitting?.enabled||!(config.transportExperimentFlags&16384))return {status:'unsupported',reason:'canonical-journal-requires-bounded-single-continuation'};
 const {device,frameEncoder,counters,shared,sharedGroup,b,pipelines,descriptors,wait,read}=c;
 const phase=ranges.findIndex(r=>selection.sample>=r.firstSample&&selection.sample<r.sampleLimit);
 if(phase<0)throw Error('Failed ordinal is outside retained tile phases');
 if(phase!==ranges.length-1)return {status:'unsupported',reason:'original-phase-worklist-no-longer-retained'};
 const code=canonicalJournalShader({pixel:selection.pixel,sample:selection.sample,maxDepth:config.maxDepth});
 const label=failureOnly?'failure-only':'selected-sample';
 const size=config.maxDepth*2*RECORD_WORDS*4;
 const buffer=device.createBuffer({label:label+'-canonical-journal',size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
 try{
  const module=device.createShaderModule({label:label+'-canonical-journal',code});
  await wait(assertShaderModuleCompiles(module,label+'-canonical-journal'));
  const layout=device.createBindGroupLayout({entries:[0,1,2,3].map(binding=>({binding,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}}))});
  const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[layout]});
  const journal={groups:['activeNext','nextActive'].map(name=>{
   const entries=descriptors.get(`plasius.wavefront.bind.${name}`).entries;
   return device.createBindGroup({layout,entries:[0,2,6].map((source,binding)=>({binding,resource:entries.find(e=>e.binding===source).resource})).concat({binding:3,resource:{buffer}})});
  })};
  for(const entryPoint of ['before','after'])journal[entryPoint]=await wait(device.createComputePipelineAsync({layout:pipelineLayout,compute:{module,entryPoint}}));
  c.setMode(false,false);
  // Restore only the sticky control failure; the entire original worklist and
  // dispatch count remain intact. This is not a retry of an accepted render.
  if(failureOnly)device.queue.writeBuffer(b.primaryControl,4,new Uint32Array([0]));
  const encoder=device.createCommandEncoder();
  encodeCanonicalReplay(encoder,{frameEncoder,tile,frameOffset:selection.sample*config.memory.configBufferStride,phaseOffset:phase*256,counters,shared,sharedGroup,dispatch:b.dispatch,pipelines,journal,label});
  device.queue.submit([encoder.finish()]);await wait(device.queue.onSubmittedWorkDone());
  return {status:'captured',scope:label+'-canonical-tile-sample; no accepted image or performance claim',allocatedBytes:size,
   pixel:selection.pixel,sample:selection.sample,records:decodeCanonicalJournal(await read(buffer,size))};
 }finally{buffer.destroy();}
}
