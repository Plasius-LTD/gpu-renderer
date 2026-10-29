import {createWavefrontPathTracingComputeShaderSource} from '../../src/wavefront-shaders.js';
import {assertShaderModuleCompiles} from '../../src/wavefront-runtime-support.js';
export const MAX_OPTICAL_TRACE_INTERFACES=4096;
const VECTORS=13,WORDS=VECTORS*4,RECORD_BYTES=WORDS*4;
export function assertCanonicalOpticalPrefix(original,result){
 const fields=['stage','rayId','pixel','sample','bounce','medium','flags','mediumDepth','origin','direction','throughput','mediumStack','hit'];
 const prefix=original.records.filter(r=>r.stage==='after-intersection');
 for(const [i,record] of prefix.entries())if((record.flags>>>24)!==0||fields.some(k=>JSON.stringify(record[k])!==JSON.stringify(result.records[record.bounce]?.[k]))){
  result.canonicalPrefixExactlyEqual=false;result.prefixMismatchIndex=i;result.originalPrefix=prefix;
  const error=Error('Optical tail canonical prefix mismatch '+i);error.opticalTailTrace=result;throw error;
 }
 if(!prefix.length)throw Error('Missing canonical optical prefix');
 result.canonicalPrefixRecords=prefix.length;result.canonicalPrefixExactlyEqual=true;
 result.canonicalPrefixScope=original.recordScope??'per-physical-event';
}
export function packOpticalTracePrimary(record,selection){
 if(record?.stage!=='before-intersection'||record.bounce!==0||record.medium!==0||record.mediumDepth!==0||record.flags!==0||record.parentRayId!==0xffffffff||record.pixel!==selection.pixel||record.sample!==selection.sample||
  ![record.rayId,record.parentRayId,record.pixel,record.sample,record.bounce,record.medium,record.flags,record.mediumDepth,...(record.mediumStack??[])].every(v=>Number.isInteger(v)&&v>=0&&v<=0xffffffff)||
  record.origin?.length!==3||record.direction?.length!==3||record.throughput?.length!==4||record.mediumStack?.length!==4||record.mediumStack.some(v=>v!==0)||
  ![...record.origin,record.originW,...record.direction,record.directionW,...record.throughput].every(v=>Number.isFinite(Math.fround(v))))throw Error('Missing exact original primary ray');
 const bytes=new ArrayBuffer(96),u=new Uint32Array(bytes),f=new Float32Array(bytes);
 u.set([record.rayId,record.parentRayId,record.pixel,record.sample,record.bounce,record.medium,record.flags,record.mediumDepth]);
 f.set([...record.origin,record.originW],8);f.set([...record.direction,record.directionW],12);f.set(record.throughput,16);u.set(record.mediumStack,20);
 return bytes;
}
export function opticalTraceEventsFromSearch(search){
 const values=new URLSearchParams(search).getAll('opticalTraceEvents');
 if(!values.length)return 0;
 if(values.length!==1||!(/^[1-9][0-9]*$/).test(values[0])||Number(values[0])>MAX_OPTICAL_TRACE_INTERFACES)throw Error('Invalid optical tail trace bound');
 return Number(values[0]);
}
export function opticalChainTraceShader({pixel,maximumInterfaces,sampler}){
 if(!Number.isInteger(pixel)||pixel<0||pixel>0xffffff||!Number.isInteger(maximumInterfaces)||maximumInterfaces<1||maximumInterfaces>MAX_OPTICAL_TRACE_INTERFACES||!['fixed-pattern','stable-camera-random','stable-pattern'].includes(sampler))throw Error('Invalid optical tail trace settings');
 const recorder=`fn record_optical_chain_step(ray:RayRecord,hit:HitRecord){
  if(ray.bounce>${maximumInterfaces}u){return;}let o=ray.bounce*${VECTORS}u;
  accumulation[o]=vec4<f32>(ray.origin.xyz,f32(ray.bounce));
  accumulation[o+1u]=vec4<f32>(ray.direction.xyz,f32(ray.mediumRefId));accumulation[o+2u]=ray.throughput;
  accumulation[o+3u]=vec4<f32>(hit.position.xyz,f32(hit.hitType));accumulation[o+4u]=vec4<f32>(hit.geometricNormal.xyz,f32(hit.frontFace));
  accumulation[o+5u]=vec4<f32>(hit.shadingNormal.xyz,f32(hit.mediumRefId));accumulation[o+6u]=vec4<f32>(ray.mediumStack);
  accumulation[o+7u]=vec4<f32>(f32(hit.primitiveId),f32(ray.mediumStackDepth),f32(hit.materialKind),f32(ray.flags&0x00ffffffu));
  accumulation[o+8u]=hit.material;accumulation[o+9u]=hit.materialExtension;
  accumulation[o+10u]=vec4<f32>(hit.distance,hit.pad2,hit.occlusion,f32(hit.objectId));accumulation[o+11u]=hit.barycentric;
  accumulation[o+12u]=vec4<f32>(f32(ray.sourcePixelId),f32(ray.sampleId),f32(ray.rayId),f32(ordinary_path_events(ray)));
 }`;
 return createWavefrontPathTracingComputeShaderSource({progressiveSampling:sampler}).replace('fn record_optical_chain_step(ray: RayRecord, hit: HitRecord) {}',recorder)+`
 @compute @workgroup_size(1)fn trace_optical_chain(){
  let x=${pixel}u%config.canvasWidth;let y=${pixel}u/config.canvasWidth;
  let root=(y-config.tileY)*config.tileWidth+x-config.tileX;
  let ray=activeQueue[0];let first=intersect_nested_ray(ray);
  let result=resolve_optical_chain(first.ray,first.hit,${maximumInterfaces}u);
  var radiance=vec3<f32>(0);let h=result.hit;let r=result.ray;
  if(result.termination==0u){
   if(h.hitType==2u){radiance=r.throughput.xyz*medium_transmittance(medium_stack_current_id(r),h.distance)*terminal_environment_source(r,h.color.xyz);}
   if(h.hitType==1u){radiance=r.throughput.xyz*medium_transmittance(medium_stack_current_id(r),h.distance)*max(h.emission.xyz,h.color.xyz);}
  }
  accumulation[${(maximumInterfaces+1)*VECTORS}u]=vec4<f32>(f32(r.bounce),f32(result.termination),f32(result.additionalSegments),f32(h.hitType));
  accumulation[${(maximumInterfaces+1)*VECTORS+1}u]=vec4<f32>(radiance,0);
 }`;
}
export function decodeOpticalChainTrace(bytes,maximumInterfaces){
 if(!Number.isInteger(maximumInterfaces)||maximumInterfaces<1||maximumInterfaces>MAX_OPTICAL_TRACE_INTERFACES||bytes.byteLength!==(maximumInterfaces+1)*RECORD_BYTES+32)throw Error('Optical tail trace extent');
 const a=new Float32Array(bytes),end=(maximumInterfaces+1)*WORDS,[ordinal,termination,additionalSegments,hitType]=a.slice(end,end+4);
 if(![ordinal,termination,additionalSegments,hitType].every(Number.isInteger)||ordinal<0||ordinal>maximumInterfaces||additionalSegments!==ordinal||![0,5,6,7,9].includes(termination))throw Error('Optical tail trace summary');
 const records=[];
 for(let b=0;b<=ordinal;b++){const o=b*WORDS,v=(n,length=3)=>Array.from(a.slice(o+n,o+n+length));
  if(a[o+3]!==b)throw Error('Missing optical tail ordinal');
  records.push({stage:'after-intersection',bounce:b,origin:v(0),direction:v(4),medium:a[o+7],throughput:v(8,4),mediumStack:v(24,4),
   mediumDepth:a[o+29],flags:a[o+31],pixel:a[o+48],sample:a[o+49],rayId:a[o+50],ordinaryEvents:a[o+51],
   hit:{type:a[o+15],primitive:a[o+28],frontFace:a[o+19],medium:a[o+23],materialKind:a[o+30],object:a[o+43],distance:a[o+40],failure:a[o+15]===5?a[o+41]:0,positionError:a[o+15]===5?null:a[o+41],position:v(12),geometricNormal:v(16),shadingNormal:v(20),material:v(32,4),extension:v(36,4),barycentric:v(44)}});
 }
 const radiance=Array.from(a.slice(end+4,end+7));
 if(records.at(-1).hit.type!==hitType||termination===7&&ordinal!==maximumInterfaces||!radiance.every(v=>Number.isFinite(v)&&v>=0)||records.some(r=>r.ordinaryEvents!==0||
  r.pixel!==records[0].pixel||r.sample!==records[0].sample||r.rayId!==records[0].rayId||
  ![...r.origin,...r.direction,...r.throughput,...r.mediumStack,...r.hit.position,...r.hit.geometricNormal,...r.hit.shadingNormal,...r.hit.material,...r.hit.extension,...r.hit.barycentric,r.hit.distance].every(Number.isFinite)))throw Error('Invalid optical tail record');
 return {scope:'bounded diagnostic-only canonical optical chain, not production admission or accepted image samples',maximumInterfaces,ordinal,termination,additionalSegments,hitType,radiance,records};
}
export async function captureOpticalChainTrace(c,{config,tile,selection,sampler,maximumInterfaces,original}){
 if(!maximumInterfaces)return null; // No device access or allocation when off.
 const code=opticalChainTraceShader({...selection,sampler,maximumInterfaces});
 if((config.transportExperimentFlags&49152)!==49152||(config.transportExperimentFlags&65536)||config.roughBounceSplitting?.enabled)throw Error('Optical tail trace requires smooth bounded nested transport');
 const {device,pipelines,descriptors,wait}=c,size=(maximumInterfaces+1)*RECORD_BYTES+32;
 const primary=packOpticalTracePrimary(original.records.find(r=>r.stage==='before-intersection'&&r.bounce===0),selection);
 const owned=[],allocate=descriptor=>{const b=device.createBuffer(descriptor);owned.push(b);return b;};
 try{
  const input=allocate({label:'optical-tail-original-primary',size:96,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  const buffer=allocate({label:'optical-tail-private-scratch',size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});
  const staging=allocate({label:'optical-tail-private-readback',size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  const module=device.createShaderModule({label:'optical-tail-diagnostic',code});await wait(assertShaderModuleCompiles(module,'optical-tail-diagnostic'));
  const layout=pipelines.intersectActiveQueue.getBindGroupLayout(0),pipeline=await wait(device.createComputePipelineAsync({layout:device.createPipelineLayout({bindGroupLayouts:[layout]}),compute:{module,entryPoint:'trace_optical_chain'}}));
  device.queue.writeBuffer(input,0,primary);
  const entries=descriptors.get('plasius.wavefront.bind.activeNext').entries.map(e=>e.binding===3?{binding:3,resource:{buffer}}:e.binding===0?{binding:0,resource:{buffer:input}}:e);
  const group=device.createBindGroup({layout,entries}),encoder=device.createCommandEncoder();encoder.clearBuffer(buffer);
  const pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group,[selection.sample*config.memory.configBufferStride]);pass.dispatchWorkgroups(1);pass.end();
  encoder.copyBufferToBuffer(buffer,0,staging,0,size);device.queue.submit([encoder.finish()]);await wait(staging.mapAsync(GPUMapMode.READ));
  const result=decodeOpticalChainTrace(staging.getMappedRange().slice(0),maximumInterfaces);staging.unmap();
  assertCanonicalOpticalPrefix(original,result);
  result.allocatedDiagnosticBytes=size*2+96;result.tile=tile;
  result.inputRaySha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',primary)),v=>v.toString(16).padStart(2,'0')).join('');
  result.shaderSha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code))),v=>v.toString(16).padStart(2,'0')).join('');
  return result;
 }finally{owned.forEach(buffer=>buffer.destroy());}
}
