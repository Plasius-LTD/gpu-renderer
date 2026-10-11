import {WAVEFRONT_COMPUTE_WGSL} from '../../src/wavefront-shaders.js';
import {createMediumTextureResource} from '../../src/wavefront-gpu-resources.js';
import {createConfigPayload} from '../../src/wavefront-packers.js';
import {createWavefrontPathTracingComputeConfig} from '../../src/wavefront-config.js';
import {assertShaderModuleCompiles} from '../../src/wavefront-runtime-support.js';

export const DIELECTRIC_PROBE_TOLERANCES=Object.freeze({optics:0.0001,mean:0.025,samples:16384});
export function dielectricProbeShader(){return WAVEFRONT_COMPUTE_WGSL+`
@compute @workgroup_size(1) fn dielectric_probe(@builtin(global_invocation_id) id:vec3<u32>){
 if(id.x==16u){
  var triangle=TriangleRecord();triangle.v0=vec4<f32>(-1,-1,0,1);
  triangle.v1=vec4<f32>(1,-1,0,1);triangle.v2=vec4<f32>(0,1,0,1);
  var r=RayRecord();r.origin=vec4<f32>(0,0,0.5,1);r.direction=vec4<f32>(0,0,-1,0);
  let first=intersect_triangle(r,triangle,0u);
  optical_query_minimum=next_optical_distance(first.distance);
  let repeated=intersect_triangle(r,triangle,0u);
  triangle.v0.z=-0.000001;triangle.v1.z=-0.000001;triangle.v2.z=-0.000001;
  let adjacent=intersect_triangle(r,triangle,1u);
  optical_query_minimum=0.0;
  let reset=transport_ray_minimum();
  accumulation[64]=vec4<f32>(f32(first.hit),f32(repeated.hit),f32(adjacent.hit),reset);
  accumulation[65]=vec4<f32>(adjacent.distance-first.distance,0,0,0);
  accumulation[66]=vec4<f32>(0);accumulation[67]=vec4<f32>(0);return;
 }
 if(id.x==10u || id.x==14u){
  // A valid adjacent rim exit can be closer than the old 0.1 micrometre cutoff.
  var triangle=TriangleRecord();triangle.v0=vec4<f32>(-0.01,-0.01,0,1);
  triangle.v1=vec4<f32>(0.01,-0.01,0,1);triangle.v2=vec4<f32>(0,0.01,0,1);
  var closeRay=RayRecord();closeRay.origin=vec4<f32>(0,0,0.00000006,1);closeRay.direction=vec4<f32>(0,0,-1,0);
  if(id.x==14u){
   triangle.materialKind=2u;triangle.material.z=1.0;triangle.mediumRefId=1u;
   closeRay.origin.z=-0.005;closeRay.direction.z=1.0;closeRay.mediumStack=vec4<u32>(1,0,0,0);closeRay.mediumStackDepth=1u;
  }
  let candidate=intersect_triangle(closeRay,triangle,0u);
  let p=optical_triangle_position(triangle,vec3<f32>(0.25,0.25,0.5));
  let o=id.x*4u;accumulation[o]=vec4<f32>(f32(candidate.hit),candidate.distance,p.x,p.y);
  accumulation[o+1u]=vec4<f32>(p.z,0,0,0);accumulation[o+2u]=vec4<f32>(0);accumulation[o+3u]=vec4<f32>(0);return;
 }
 var ray=RayRecord();ray.direction=vec4<f32>(0.6,0,-0.8,0);ray.sourcePixelId=id.x+19u;
 var hit=HitRecord();hit.materialKind=2u;hit.material=vec4<f32>(0,0,1,1.5);hit.materialExtension=vec4<f32>(0,1,1,0);
 hit.color=vec4<f32>(1);hit.specularColor=vec4<f32>(1);hit.geometricNormal=vec4<f32>(0,0,1,0);hit.shadingNormal=hit.geometricNormal;
 hit.mediumRefId=1u;hit.frontFace=1u;
 if(id.x==15u){
  ray.mediumStack=vec4<u32>(1,0,0,0);ray.mediumStackDepth=1u;ray.mediumRefId=1u;hit.frontFace=0u;
  ray.direction=vec4<f32>(normalize(vec3<f32>(-1,0,-0.1)),0);hit.shadingNormal=vec4<f32>(0.8,0,0.6,0);
  var wrongSide=0u;
  for(var j=0u;j<1024u;j++){ray.sampleId=j;let s=scatter_dielectric(ray,hit);
   let height=dot(s.direction.xyz,hit.geometricNormal.xyz);
   if((s.lobeKind==SCATTER_LOBE_DELTA_REFLECTION && height<=0.0) || (s.lobeKind==SCATTER_LOBE_DELTA_TRANSMISSION && height>=0.0)){wrongSide++;}
  }
  accumulation[60]=vec4<f32>(f32(wrongSide),select(0.0,1.0,dielectric_cannot_refract(ray,hit)),0,0);
  accumulation[61]=vec4<f32>(0);accumulation[62]=vec4<f32>(0);accumulation[63]=vec4<f32>(0);return;
 }
 if(id.x>=11u){
  ray.bounce=1u;ray.mediumStack=vec4<u32>(1,0,0,0);ray.mediumStackDepth=1u;
  hit.distance=select(0.00000005,0.01,id.x==12u);
  if(id.x==13u){ray.mediumStack=vec4<u32>(0);ray.mediumStackDepth=0u;hit.frontFace=0u;}
  let o=id.x*4u;accumulation[o]=vec4<f32>(select(0.0,1.0,recoverable_optical_entry(ray,hit)),f32(medium_transition_failure(ray,hit)),0,0);
  accumulation[o+1u]=vec4<f32>(0);accumulation[o+2u]=vec4<f32>(0);accumulation[o+3u]=vec4<f32>(0);return;
 }
 switch(id.x){
  case 1u:{ray.mediumStack=vec4<u32>(1,2,0,0);ray.mediumStackDepth=2u;hit.frontFace=0u;}
  case 2u:{ray.mediumStack=vec4<u32>(2,0,0,0);ray.mediumStackDepth=1u;hit.mediumRefId=2u;hit.material.w=1.333;hit.frontFace=0u;}
  case 3u:{ray.mediumStack=vec4<u32>(1,0,0,0);ray.mediumStackDepth=1u;hit.frontFace=0u;ray.direction=vec4<f32>(0.8,0,-0.6,0);}
  case 4u:{ray.mediumStack=vec4<u32>(1,0,0,0);ray.mediumStackDepth=1u;hit.mediumRefId=2u;hit.material.w=1.333;}
  case 5u:{ray.mediumStack=vec4<u32>(2,0,0,0);ray.mediumStackDepth=1u;}
  case 6u:{ray.mediumStack=vec4<u32>(2,1,0,0);ray.mediumStackDepth=2u;hit.mediumRefId=2u;hit.frontFace=0u;}
  case 7u:{ray.mediumStack=vec4<u32>(1,2,3,4);ray.mediumStackDepth=4u;hit.mediumRefId=5u;}
  case 8u:{hit.frontFace=0u;}
  case 9u:{ray.mediumStack=vec4<u32>(1,0,0,0);ray.mediumStackDepth=1u;}
  default:{}
 }
 ray.mediumRefId=medium_stack_current_id(ray);
 let ratio=dielectric_ratio(ray,hit);let tir=dielectric_cannot_refract(ray,hit);
 let fresnel=interface_fresnel(-ray.direction.z,ratio);
 let transmitted=transmitted_medium_ref_id(ray,hit);
 let invalid=medium_transition_invalid(ray,hit);
 let base=id.x*4u;
 accumulation[base]=vec4<f32>(ratio,fresnel,f32(ray.mediumRefId),f32(transmitted));
 accumulation[base+1u]=vec4<f32>(f32(transitioned_medium_stack_depth(ray,hit)),select(0.0,1.0,tir),select(0.0,1.0,invalid),
   refract_direction(ray.direction.xyz,surface_shading_normal(hit),ratio).x);
 var total=vec3<f32>(0);var reflectionCount=0u;var wrongMedium=0u;
 for(var ordinal=0u;ordinal<${DIELECTRIC_PROBE_TOLERANCES.samples}u;ordinal++){
  ray.sampleId=ordinal;let scatter=scatter_dielectric(ray,hit);
  let reflection=scatter.lobeKind==SCATTER_LOBE_DELTA_REFLECTION;
  var weight=select(dielectric_transmission_weight(ray,hit),dielectric_reflection_weight(ray,hit),reflection);
  if(tir){weight=vec3<f32>(1);}
  if(bounded_dielectric_enabled()){weight/=scatter.pdf;}
  total+=weight;reflectionCount+=select(0u,1u,reflection);
  wrongMedium+=select(0u,1u,scatter.mediumRefId!=select(transmitted,ray.mediumRefId,reflection));
 }
 accumulation[base+2u]=vec4<f32>(total/f32(${DIELECTRIC_PROBE_TOLERANCES.samples}u),f32(wrongMedium));
 accumulation[base+3u]=vec4<f32>(dielectric_reflection_probability(ray,hit),f32(reflectionCount)/f32(${DIELECTRIC_PROBE_TOLERANCES.samples}u),
  dielectric_reflection_weight(ray,hit).x,dielectric_transmission_weight(ray,hit).x);
}`;}

export async function runDielectricTransportProbe(signal){
 const adapter=await navigator.gpu.requestAdapter();if(adapter?.info.isFallbackAdapter!==false)throw Error('Physical dielectric probe requires GPU');
 const device=await adapter.requestDevice(),owned=[];
 const wait=async p=>{let timer;try{const v=await Promise.race([p,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Dielectric probe timeout')),30000))]);if(signal.aborted)throw Error('Cancelled');return v;}finally{clearTimeout(timer);}};
 const buffer=(size,usage)=>{const b=device.createBuffer({size,usage});owned.push(b);return b;};
 try{
  device.pushErrorScope('validation');
  const mediums=Array.from({length:6},(_,id)=>({id,ior:id===0?1:id===2?1.333:1.5,priority:id===1?2:1}));
  const medium=createMediumTextureResource(device,{texture:GPUTextureUsage},mediums,true);owned.push(medium.texture);
  const frame=buffer(320,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),output=buffer(17*64,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),staging=buffer(17*64,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);
  const module=device.createShaderModule({code:dielectricProbeShader()});await wait(assertShaderModuleCompiles(module,'dielectric-transport-probe'));
  const pipeline=await wait(device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'dielectric_probe'}}));
  const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:3,resource:{buffer:output}},{binding:5,resource:{buffer:frame}},{binding:32,resource:medium.view}]}),runs=[];
  for(const [bounded,nested] of [[false,false],[true,false],[false,true],[true,true],[false,false]]){
   const config=createWavefrontPathTracingComputeConfig({width:1,height:1,'renderer.sampling.independentRandom.enabled':true,
    'renderer.transport.boundedDielectricBranching.enabled':bounded,'renderer.transport.nestedMediaRefraction.enabled':nested});
   device.queue.writeBuffer(frame,0,createConfigPayload(config,{x:0,y:0,width:1,height:1},7));
   const e=device.createCommandEncoder(),p=e.beginComputePass();p.setPipeline(pipeline);p.setBindGroup(0,group);p.dispatchWorkgroups(17);p.end();
   e.copyBufferToBuffer(output,0,staging,0,output.size);device.queue.submit([e.finish()]);await wait(staging.mapAsync(GPUMapMode.READ));
   const values=Array.from(new Float32Array(staging.getMappedRange().slice(0)));staging.unmap();
   if(!values.every(Number.isFinite))throw Error('Non-finite dielectric probe');
   const near=(a,b,t=DIELECTRIC_PROBE_TOLERANCES.optics)=>{if(Math.abs(a-b)>t)throw Error('Dielectric mismatch '+JSON.stringify({bounded,nested,a,b,t}));};
   const water=1.3330078125; // Exact rgba16float upload representation of authored 1.333.
   near(values[160],nested?1:0,0);if(nested)near(values[161],.00000006,.000000001);
   for(const index of [162,163,164])near(values[index],0,0);
   near(values[176],nested?1:0,0);near(values[192],0,0);near(values[208],0,0);
   near(values[177],nested?2:0,0);near(values[193],nested?2:0,0);near(values[209],nested?4:0,0);
   near(values[224],nested?1:0,0);
   if(nested){near(values[240],0,0);near(values[241],1,0);}
   near(values[256],1,0);near(values[257],nested?0:1,0);near(values[258],1,0);
   near(values[259],nested?0:0.001,0.000000001);near(values[260],0.000001,0.0000001);
   if(nested){
    for(const [i,eta,before,after,invalid] of [[0,1/1.5,0,1,0],[1,1.5/water,1,2,0],[2,water,2,0,0],[3,1.5,1,0,0],[4,1,1,1,0],[5,water/1.5,2,1,0],[6,1,1,1,0],[7,1,1,1,1],[8,1,0,0,1],[9,1,1,1,1]]){
     const o=i*16;near(values[o],eta);near(values[o+2],before);near(values[o+3],after);near(values[o+6],invalid);
     if(i<7){const sin=i===3?.8:.6,ci=Math.sqrt(1-sin*sin),st=eta*sin;
      const ct=Math.sqrt(Math.max(0,1-st*st)),f=eta===1?0:st>=1?1:(((eta*ci-ct)/(eta*ci+ct))**2+((ci-eta*ct)/(ci+eta*ct))**2)/2;
      near(values[o+1],f);near(values[o+5],st>=1?1:0);if(st<1)near(values[o+7],st);
     }
    }
   }
   for(let i=0;i<7;i++){
    const o=i*16;near(values[o+11],0);
    if(bounded){near(values[o+13],values[o+12],.015);near(values[o+8],values[o+5]===1?1:values[o+14]+values[o+15],DIELECTRIC_PROBE_TOLERANCES.mean);}
   }
   if(runs.length===4)values.forEach((v,i)=>near(v,runs[0].values[i],0));
   runs.push({bounded,nested,values});
  }
  const error=await wait(device.popErrorScope());if(error)throw Error(error.message);
  return {passed:true,runs,tolerances:DIELECTRIC_PROBE_TOLERANCES,scope:'assembled analytic optics and estimator; not room quality or performance'};
 }finally{owned.forEach(r=>r.destroy());device.destroy();}
}
