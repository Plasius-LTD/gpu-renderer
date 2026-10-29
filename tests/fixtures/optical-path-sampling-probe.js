import {createWavefrontPathTracingComputeShaderSource} from '../../src/wavefront-shaders.js';
import {createMediumTextureResource} from '../../src/wavefront-gpu-resources.js';
import {createConfigPayload} from '../../src/wavefront-packers.js';
import {createWavefrontPathTracingComputeConfig} from '../../src/wavefront-config.js';
import {assertShaderModuleCompiles} from '../../src/wavefront-runtime-support.js';
import {OPTICAL_TAIL_PROBE,OPTICAL_TAIL_PROBE_WGSL,summarizeOpticalTail} from './optical-tail-budget-probe.js';

// Frozen analytic qualification inputs, not scene or runtime sampling policy.
export const OPTICAL_PATH_PROBE=Object.freeze({samples:256,pixels:256,maxInteractions:19,
 cosines:Object.freeze([1,.5,.1]),ior:1.5,meanTolerance:.015});
export function opticalSlabReference(cosine,ior=OPTICAL_PATH_PROBE.ior,interactions=OPTICAL_PATH_PROBE.maxInteractions){
 const eta=1/ior,ct=Math.sqrt(1-eta*eta*(1-cosine*cosine));
 const fresnel=.5*(((eta*cosine-ct)/(eta*cosine+ct))**2+((cosine-eta*ct)/(cosine+eta*ct))**2);
 // Front reflection plus all slab exits through the finite event horizon.
 return 1-(1-fresnel)*fresnel**(interactions-1);
}

export const OPTICAL_PATH_PROBE_WGSL=`
@compute @workgroup_size(64) fn optical_path_probe(@builtin(global_invocation_id) id:vec3<u32>){
 const paths:u32=${OPTICAL_PATH_PROBE.samples*OPTICAL_PATH_PROBE.pixels}u;
 if(id.x>=paths*${OPTICAL_PATH_PROBE.cosines.length}u){return;}
 let lane=id.x/paths;
 let cosines=array<f32,${OPTICAL_PATH_PROBE.cosines.length}>(${OPTICAL_PATH_PROBE.cosines.join(',')});
 let ci=cosines[lane];
 var ray=RayRecord();ray.sampleId=id.x%${OPTICAL_PATH_PROBE.samples}u;
 ray.sourcePixelId=(id.x%paths)/${OPTICAL_PATH_PROBE.samples}u;
 var hit=HitRecord();hit.materialKind=2u;hit.material=vec4<f32>(0,0,1,${OPTICAL_PATH_PROBE.ior});
 hit.materialExtension=vec4<f32>(0,1,1,0);hit.color=vec4<f32>(1);hit.specularColor=vec4<f32>(1);
 hit.mediumRefId=1u;hit.geometricNormal=vec4<f32>(0,0,1,0);hit.shadingNormal=hit.geometricNormal;
 var weight=1.0;var result=0.0;var escaped=0u;var terminated=0u;
 // Parallel slab in a unit-radiance environment. Local oriented coordinates at
 // each interface preserve incidence angle; this isolates the canonical optical
 // estimator, not BVH/cylinder geometry or room shading.
 for(var bounce=0u;bounce<${OPTICAL_PATH_PROBE.maxInteractions}u;bounce++){
  ray.bounce=bounce;let inside=bounce>0u;
  ray.mediumStack=vec4<u32>(select(0u,1u,inside),0,0,0);ray.mediumStackDepth=select(0u,1u,inside);
  ray.mediumRefId=select(0u,1u,inside);hit.frontFace=select(1u,0u,inside);
  let cosine=select(ci,sqrt(1.0-(1.0-ci*ci)/(${OPTICAL_PATH_PROBE.ior}*${OPTICAL_PATH_PROBE.ior})),inside);
  ray.direction=vec4<f32>(sqrt(max(0.0,1.0-cosine*cosine)),0,-cosine,0);
  let scatter=scatter_dielectric(ray,hit);
  let reflection=scatter.lobeKind==SCATTER_LOBE_DELTA_REFLECTION;
  var eventWeight=select(dielectric_transmission_weight(ray,hit).x,dielectric_reflection_weight(ray,hit).x,reflection)/scatter.pdf;
  if(bounce>=2u){
   ray.throughput=vec4<f32>(vec3<f32>(weight),1);
   let survival=continuation_survival_probability(ray,hit,vec3<f32>(eventWeight),vec3<f32>(0),!reflection);
   if(sample_dimension_1d(ray.sourcePixelId,ray.sampleId,bounce,config.frameIndex,SAMPLE_DIM_RUSSIAN_ROULETTE)>survival){terminated=1u;break;}
   eventWeight/=survival;
  }
  weight*=eventWeight;
  if((!inside&&reflection)||(inside&&!reflection)){result=weight;escaped=1u;break;}
 }
 accumulation[id.x]=vec4<f32>(result,f32(escaped),f32(terminated),f32(1u-escaped-terminated));
}`;

export function opticalPathProbeShader(sampler){
 if(!['fixed-pattern','stable-pattern','stable-camera-random'].includes(sampler))throw Error('Unknown optical path sampler');
 return createWavefrontPathTracingComputeShaderSource({progressiveSampling:sampler})+OPTICAL_PATH_PROBE_WGSL+OPTICAL_TAIL_PROBE_WGSL;
}

export function summarizeOpticalPaths(values){
 const count=OPTICAL_PATH_PROBE.samples*OPTICAL_PATH_PROBE.pixels;
 if(values.length!==count*OPTICAL_PATH_PROBE.cosines.length*4)throw Error('Optical path probe length mismatch');
 return OPTICAL_PATH_PROBE.cosines.map((cosine,lane)=>{
  let sum=0,escaped=0,roulette=0,depth=0,escapedWeightError=0;
  for(let i=0;i<count;i++){
   const o=(lane*count+i)*4,r=values[o],e=values[o+1],q=values[o+2],d=values[o+3];
   if(!Number.isFinite(r)||r<0||![e,q,d].every(x=>x===0||x===1)||e+q+d!==1)throw Error('Invalid optical path sample');
   sum+=r;escaped+=e;roulette+=q;depth+=d;
   if(e)escapedWeightError=Math.max(escapedWeightError,Math.abs(r-1));
  }
  const expected=opticalSlabReference(cosine),mean=sum/count,error=Math.abs(mean-expected);
  return {cosine,mean,expected,error,escapedWeightError,passed:error<=OPTICAL_PATH_PROBE.meanTolerance&&escapedWeightError<=.0001,escaped,roulette,depth};
 });
}

export async function runOpticalPathSamplingProbe(signal,sampler,{opticalInterfaceBudget=false}={}){
 const source=opticalPathProbeShader(sampler);
 if(signal.aborted)throw Error('Cancelled');
 const adapter=await navigator.gpu.requestAdapter();if(adapter?.info.isFallbackAdapter!==false)throw Error('Physical optical path probe requires GPU');
 const device=await adapter.requestDevice(),owned=[];
 const wait=async promise=>{let timer;try{const value=await Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Optical path probe timeout')),30000))]);if(signal.aborted)throw Error('Cancelled');return value;}finally{clearTimeout(timer);}};
 const buffer=(size,usage)=>{const b=device.createBuffer({size,usage});owned.push(b);return b;};
 try{
  device.pushErrorScope('validation');
  const medium=createMediumTextureResource(device,{texture:GPUTextureUsage},[{id:0,ior:1,priority:0},{id:1,ior:OPTICAL_PATH_PROBE.ior,priority:2}],true);owned.push(medium.texture);
  const count=OPTICAL_PATH_PROBE.samples*OPTICAL_PATH_PROBE.pixels*OPTICAL_PATH_PROBE.cosines.length;
  const frame=buffer(320,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),output=buffer(count*16,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),staging=buffer(count*16,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);
  const config=createWavefrontPathTracingComputeConfig({width:1,height:1,
   ...(opticalInterfaceBudget?{maxDepth:20,strictPhysicalLowSppLighting:true,'renderer.transport.opticalInterfaceBudget.enabled':true}:{}),
   'renderer.transport.boundedDielectricBranching.enabled':true,'renderer.transport.nestedMediaRefraction.enabled':true});
  device.queue.writeBuffer(frame,0,createConfigPayload(config,{x:0,y:0,width:1,height:1},7));
  const module=device.createShaderModule({code:source});await wait(assertShaderModuleCompiles(module,'optical-path-sampling-'+sampler));
  const pipeline=await wait(device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'optical_path_probe'}}));
  const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:3,resource:{buffer:output}},{binding:5,resource:{buffer:frame}},{binding:32,resource:medium.view}]});
  const e=device.createCommandEncoder(),p=e.beginComputePass();p.setPipeline(pipeline);p.setBindGroup(0,group);p.dispatchWorkgroups(Math.ceil(count/64));p.end();
  e.copyBufferToBuffer(output,0,staging,0,output.size);device.queue.submit([e.finish()]);await wait(staging.mapAsync(GPUMapMode.READ));
  const cases=summarizeOpticalPaths(new Float32Array(staging.getMappedRange().slice(0)));staging.unmap();
  let opticalInterfaceBudgetProbe;
  if(opticalInterfaceBudget){
   const tail=await wait(device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'optical_tail_budget_probe'}}));
   const g=device.createBindGroup({layout:tail.getBindGroupLayout(0),entries:[{binding:3,resource:{buffer:output}},{binding:5,resource:{buffer:frame}},{binding:32,resource:medium.view}]});
   const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(tail);pass.setBindGroup(0,g);pass.dispatchWorkgroups(Math.ceil(OPTICAL_TAIL_PROBE.samples/64));pass.end();
   encoder.copyBufferToBuffer(output,0,staging,0,OPTICAL_TAIL_PROBE.samples*16);device.queue.submit([encoder.finish()]);await wait(staging.mapAsync(GPUMapMode.READ));
   opticalInterfaceBudgetProbe=summarizeOpticalTail(new Float32Array(staging.getMappedRange().slice(0,OPTICAL_TAIL_PROBE.samples*16)));staging.unmap();
  }
  const error=await wait(device.popErrorScope());if(error)throw Error(error.message);
  const passed=cases.every(c=>c.passed);
  // Known-bad controls are retained, explicitly labeled, not promoted to passes.
  if((sampler==='stable-camera-random'||sampler==='fixed-pattern')&&!passed)throw Error('Independent optical path mean mismatch '+JSON.stringify(cases));
  return {passed,sampler,cases,settings:OPTICAL_PATH_PROBE,...(opticalInterfaceBudgetProbe?{opticalInterfaceBudgetProbe}:{}),scope:'conditional optical estimator only; not room geometry, image or performance qualification'};
 }finally{owned.forEach(r=>r.destroy());device.destroy();}
}
