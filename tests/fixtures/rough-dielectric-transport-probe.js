import {WAVEFRONT_COMPUTE_WGSL} from '../../src/wavefront-shaders.js';
import {createMediumTextureResource} from '../../src/wavefront-gpu-resources.js';
import {createConfigPayload} from '../../src/wavefront-packers.js';
import {createWavefrontPathTracingComputeConfig} from '../../src/wavefront-config.js';
import {assertShaderModuleCompiles} from '../../src/wavefront-runtime-support.js';
import {integrateOpticalEnergy} from './rough-dielectric-reference.js';

export const ROUGH_OPTICAL_PROBE=Object.freeze({samples:4096,roughness:[0,.35,.8],transmission:[0,.25,.5,1],absoluteMeanTolerance:.03,pdfRelativeTolerance:.001});
export function roughDielectricProbeShader(){return WAVEFRONT_COMPUTE_WGSL+`
fn probe_inverse(index:u32,base:u32)->f32{
 var n=index;var scale=1.0;var value=0.0;
 for(var k=0u;k<24u && n>0u;k++){scale/=f32(base);value+=f32(n%base)*scale;n/=base;}
 return value;
}
@compute @workgroup_size(64) fn rough_optical_probe(@builtin(global_invocation_id) id:vec3<u32>){
 let samples=${ROUGH_OPTICAL_PROBE.samples}u;
 let c=id.x/samples;let ordinal=id.x%samples+1u;if(c>=${ROUGH_OPTICAL_PROBE.roughness.length*ROUGH_OPTICAL_PROBE.transmission.length}u){return;}
 let roughness=array<f32,${ROUGH_OPTICAL_PROBE.roughness.length}>(${ROUGH_OPTICAL_PROBE.roughness.map(x=>x.toFixed(8)).join(',')})[c/${ROUGH_OPTICAL_PROBE.transmission.length}u];
 let t=array<f32,${ROUGH_OPTICAL_PROBE.transmission.length}>(${ROUGH_OPTICAL_PROBE.transmission.map(x=>x.toFixed(8)).join(',')})[c%${ROUGH_OPTICAL_PROBE.transmission.length}u];
 var ray=RayRecord();ray.direction=vec4<f32>(0,0,-1,0);ray.sourcePixelId=id.x;ray.sampleId=ordinal;
 var hit=HitRecord();hit.hitType=0u;hit.frontFace=1u;hit.materialKind=2u;hit.mediumRefId=1u;
 hit.material=vec4<f32>(roughness,0,1,1.5);hit.materialExtension=vec4<f32>(0,1,t,0);hit.color=vec4<f32>(1);
 hit.geometricNormal=vec4<f32>(0,0,1,0);hit.shadingNormal=hit.geometricNormal;
 let s=scatter_rough_dielectric_samples(ray,hit,probe_inverse(ordinal,2u),probe_inverse(ordinal,3u),vec2<f32>(probe_inverse(ordinal,5u),probe_inverse(ordinal,7u)));
 let weight=rough_dielectric_throughput(ray,hit,s);let transmission=scatter_is_transmission(s);
 var errors=0u;
 if(s.pdf>0.0){
  if(select(1.0,-1.0,transmission)*s.direction.z<=0.0){errors|=1u;}
  if(s.mediumRefId!=select(0u,1u,transmission)){errors|=2u;}
  if((s.flags & RAY_FLAG_DELTA_SAMPLE)==0u && abs(s.pdf-rough_dielectric_pdf(ray,hit,s.direction.xyz))>max(1e-6,s.pdf*${ROUGH_OPTICAL_PROBE.pdfRelativeTolerance})){errors|=4u;}
  if(transmission && (s.flags & RAY_FLAG_NO_COMPETING_NEE)==0u){errors|=8u;}
 }
 // Entry, occupied exit, and unoccupied opaque backface: opacity does not erase geometry.
 var triangle=TriangleRecord();triangle.v0=vec4<f32>(-1,-1,0,1);triangle.v1=vec4<f32>(1,-1,0,1);triangle.v2=vec4<f32>(0,1,0,1);
 triangle.materialKind=2u;triangle.materialExtension.z=t;triangle.material.z=0.0;triangle.mediumRefId=1u;
 var collisionRay=ray;collisionRay.origin=vec4<f32>(0,0,1,1);
 if(intersect_triangle(collisionRay,triangle,0u).hit!=1u){errors|=16u;}
 collisionRay.origin.z=-1.0;collisionRay.direction.z=1.0;collisionRay.mediumRefId=1u;collisionRay.mediumStack=vec4<u32>(1,0,0,0);collisionRay.mediumStackDepth=1u;
 collisionRay=transport_visibility_ray(collisionRay,collisionRay.origin.xyz,collisionRay.direction.xyz);
 if(intersect_triangle(collisionRay,triangle,0u).hit!=1u){errors|=32u;}
 collisionRay.mediumRefId=0u;collisionRay.mediumStack=vec4<u32>(0);collisionRay.mediumStackDepth=0u;
 triangle.mediumRefId=0u;triangle.materialKind=0u;triangle.materialExtension.z=0.0;triangle.material.z=1.0;
 if(intersect_triangle(collisionRay,triangle,0u).hit!=0u){errors|=64u;}
 accumulation[id.x]=vec4<f32>(select(weight.x,0.0,transmission),select(0.0,weight.x,transmission),s.pdf,f32(errors));
}`;}

export function validateRoughOpticalProbe(values){
 const {samples,roughness,transmission,absoluteMeanTolerance}=ROUGH_OPTICAL_PROBE;
 if(values.length!==samples*roughness.length*transmission.length*4||!values.every(Number.isFinite))throw Error('Invalid rough optical probe output');
 const cases=[];
 for(const [r,rough] of roughness.entries())for(const [t,factor] of transmission.entries()){
  let reflected=0,transmitted=0;
  for(let n=0;n<samples;n++){
   const o=((r*transmission.length+t)*samples+n)*4;
   if(values[o]<0||values[o+1]<0||values[o+2]<0||values[o+3]!==0)throw Error('Rough optical collision/PDF/medium failure at '+o+': '+values.slice(o,o+4));
   reflected+=values[o]/samples;transmitted+=values[o+1]/samples;
  }
  const reference=integrateOpticalEnergy(rough,factor);
  if(Math.abs(reflected-reference.reflected)>absoluteMeanTolerance||Math.abs(transmitted-reference.transmitted)>absoluteMeanTolerance)throw Error('Rough optical energy mismatch '+JSON.stringify({rough,factor,reflected,transmitted,reference}));
  cases.push({roughness:rough,transmission:factor,reflected,transmitted,reference});
 }
 return {passed:true,cases,scope:'surface BSDF/PDF/entry-exit probe; not room images, caustics or performance',tolerances:ROUGH_OPTICAL_PROBE};
}

export async function runRoughDielectricTransportProbe(signal){
 const adapter=await navigator.gpu.requestAdapter();if(adapter?.info.isFallbackAdapter!==false)throw Error('Physical rough optical probe requires GPU');
 const device=await adapter.requestDevice(),owned=[];
 const wait=async promise=>{let timer;try{const result=await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Rough optical probe timeout')),30000);})]);if(signal.aborted)throw Error('Cancelled');return result;}finally{clearTimeout(timer);}};
 const buffer=(size,usage)=>{const b=device.createBuffer({size,usage});owned.push(b);return b;};
 try{
  device.pushErrorScope('validation');
  const medium=createMediumTextureResource(device,{texture:GPUTextureUsage},[{id:0,ior:1},{id:1,ior:1.5,priority:1}],true);owned.push(medium.texture);
  const size=ROUGH_OPTICAL_PROBE.samples*ROUGH_OPTICAL_PROBE.roughness.length*ROUGH_OPTICAL_PROBE.transmission.length*16;
  const frame=buffer(320,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),output=buffer(size,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),staging=buffer(size,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);
  const config=createWavefrontPathTracingComputeConfig({width:1,height:1,sceneObjects:[],'renderer.transport.nestedMediaRefraction.enabled':true,'renderer.transport.roughDielectricTransport.enabled':true});
  device.queue.writeBuffer(frame,0,createConfigPayload(config,{x:0,y:0,width:1,height:1},0));
  const module=device.createShaderModule({code:roughDielectricProbeShader()});await wait(assertShaderModuleCompiles(module,'rough-optical-probe'));
  const pipeline=await wait(device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'rough_optical_probe'}}));
  const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:3,resource:{buffer:output}},{binding:5,resource:{buffer:frame}},{binding:32,resource:medium.view}]});
  const e=device.createCommandEncoder(),p=e.beginComputePass();p.setPipeline(pipeline);p.setBindGroup(0,group);p.dispatchWorkgroups(size/16/64);p.end();e.copyBufferToBuffer(output,0,staging,0,size);device.queue.submit([e.finish()]);
  await wait(staging.mapAsync(GPUMapMode.READ));const values=Array.from(new Float32Array(staging.getMappedRange().slice(0)));staging.unmap();
  const error=await wait(device.popErrorScope());if(error)throw Error(error.message);
  return {...validateRoughOpticalProbe(values),diagnosticAllocatedBytes:size*2+320+medium.allocatedBytes};
 }finally{owned.forEach(r=>r.destroy());device.destroy();}
}
