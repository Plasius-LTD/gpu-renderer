import {WAVEFRONT_COMPUTE_WGSL} from '../../src/wavefront-shaders.js';
import {createWavefrontPathTracingComputeConfig} from '../../src/wavefront-config.js';
import {createConfigPayload} from '../../src/wavefront-packers.js';
import {createMediumTextureResource} from '../../src/wavefront-gpu-resources.js';
import {assertShaderModuleCompiles} from '../../src/wavefront-runtime-support.js';

// Frozen analytic controls, not renderer configuration defaults or image truth.
export const ENVIRONMENT_MIS_PROBE=Object.freeze({samples:4096,pdfTolerance:1e-6,meanTolerance:2e-5});
export const ENVIRONMENT_MIS_CASES=Object.freeze([
 {name:'uniform-sky',flags:0,selection:1}, {name:'cosine-sky',flags:16,selection:1},
 {name:'mixed-uniform',flags:0,lights:2,selection:.5}, {name:'mixed-cosine',flags:16,lights:2,selection:.5},
 {name:'source-stable-emissive-only',flags:64,lights:2,selection:0},
 {name:'deterministic-two-estimators',flags:8,lights:2,selection:1},
 {name:'combined-stable-deterministic',flags:72,lights:2,selection:1},
 {name:'non-strict-sphere',flags:0,strict:false,selection:1},
 {name:'texture-without-importance',flags:0,map:true,selection:1},
 {name:'texture-importance-mixture',flags:0,map:true,importance:true,lights:2,selection:.5},
 {name:'rough-partial-optical',flags:65536|32768,selection:1},
 {name:'smooth-partial-optical',flags:32768,selection:1},
 {name:'blocked-portal-fallback',flags:0,portal:true,selection:1},
]);

export function environmentMisProbeConfig(c){
 const base=createWavefrontPathTracingComputeConfig({width:1,height:1,samplesPerPixel:32,
  strictPhysicalLowSppLighting:c.strict!==false,
  environmentLighting:{horizonColor:[1,1,1,1],zenithColor:[1,1,1,1],sunColor:[3,3,3,1],sunDirection:[0,0,1],intensity:1}});
 return createConfigPayload({...base,transportExperimentFlags:c.flags,emissiveTriangleCount:c.lights??0,
  environmentPortalCount:c.portal?1:0,environmentPortalMode:c.portal?2:0,
  environmentMap:{...base.environmentMap,enabled:!!c.map,width:1,height:1,hasImportanceData:!!c.importance}},
 {x:0,y:0,width:1,height:1},0);
}

export const ENVIRONMENT_MIS_PROBE_WGSL=`
@compute @workgroup_size(64) fn environment_mis_probe(@builtin(global_invocation_id) id:vec3<u32>){
 if(id.x>=${ENVIRONMENT_MIS_PROBE.samples}u){return;}
 let c=(f32(id.x)+0.5)/${ENVIRONMENT_MIS_PROBE.samples}.0;
 let n=vec3<f32>(0,0,1);let d=vec3<f32>(sqrt(1.0-c*c),0,c);let p=c/3.14159265359;
 var ray=RayRecord();ray.bounce=1u;ray.direction=vec4<f32>(d,environment_nee_direction_pdf(n,d));ray.throughput.w=p;
 let terminal=terminal_environment_source(ray,vec3<f32>(4));
 var sampled=select(4.0,1.0,environment_nee_samples_sky_only());
 if(config.environmentPortalMode==2u){sampled=0.0;}
 var hit=HitRecord();hit.shadingNormal=vec4<f32>(n,0);hit.geometricNormal=hit.shadingNormal;
 let light=sample_environment_direct_light(hit,ray,n,0.5*max(environment_nee_selection_probability(),0.000001),environment_nee_selection_probability());
 accumulation[id.x]=vec4<f32>(2.0*c*(sampled*power_heuristic(ray.direction.w,p)+terminal.x),
  light.pdf-environment_nee_direction_pdf(n,light.direction.xyz),
  environment_nee_direction_pdf(n,-d),environment_nee_selection_probability());
}
@compute @workgroup_size(1) fn environment_mis_contract(@builtin(global_invocation_id) id:vec3<u32>){
 var ray=RayRecord();ray.bounce=1u;ray.direction=vec4<f32>(0,0,-1,0);ray.throughput.w=0.3;
 var hit=HitRecord();hit.material=vec4<f32>(0.8,0,1,1.5);hit.materialExtension.z=0.0;
 hit.shadingNormal=vec4<f32>(0,0,1,0);hit.geometricNormal=hit.shadingNormal;hit.frontFace=1u;hit.mediumRefId=1u;
 if(id.x>=4u){hit.materialKind=2u;hit.materialExtension.z=0.5;}
 var scatter=ScatterResult();scatter.direction=vec4<f32>(0,0,1,0);scatter.pdf=0.3;
 if(id.x==1u||id.x==5u){scatter.flags=RAY_FLAG_DELTA_SAMPLE;}
 if(id.x==2u||id.x==6u){scatter.flags=RAY_FLAG_NO_COMPETING_NEE;scatter.direction.z=-1.0;}
 if(id.x==3u||id.x==7u){hit.shadingNormal=vec4<f32>(1,0,0,0);hit.geometricNormal=hit.shadingNormal;scatter.direction=vec4<f32>(1,0,0,0);ray.direction=vec4<f32>(-1,0,0,0);}
 let packed=continuation_environment_direction(ray,hit,scatter);
 ray.direction=packed;ray.flags=scatter.flags;
 let terminal=terminal_environment_source(ray,vec3<f32>(4));
 accumulation[id.x]=vec4<f32>(packed.w,terminal.x,packed.x,packed.z);
 if(id.x==0u){ray.bounce=0u;accumulation[8u]=vec4<f32>(terminal_environment_source(ray,vec3<f32>(4)),0);}
}`;

export function summarizeEnvironmentMis(values,contracts,c){
 const {samples,pdfTolerance,meanTolerance}=ENVIRONMENT_MIS_PROBE;
 if(values.length!==samples*4||contracts.length!==36||![...values,...contracts].every(Number.isFinite))throw Error('Invalid environment MIS evidence');
 let mean=0,maxPdfError=0;
 const skyOnly=c.strict!==false&&!c.map&&!c.importance;
 for(let i=0;i<samples;i++){
  const o=i*4;mean+=values[o]/samples;maxPdfError=Math.max(maxPdfError,Math.abs(values[o+1]));
  if(Math.abs(values[o+3]-c.selection)>pdfTolerance||(skyOnly&&values[o+2]!==0))throw Error('Environment MIS support/class mismatch');
 }
 for(let i=0;i<8;i++){
  const o=i*4,noncompeting=i%4===1||i%4===2;
  const partial=i>=4,continuousOptical=!!(c.flags&(65536|32768));
  const expectedPdf=noncompeting||(partial&&!continuousOptical)?0:
   c.selection*(skyOnly?((c.flags&16)?1/Math.PI:1/(2*Math.PI)):c.importance?1/(2*Math.PI*Math.PI):1/(4*Math.PI));
  maxPdfError=Math.max(maxPdfError,Math.abs(contracts[o]-expectedPdf));
  if((noncompeting||c.portal)&&contracts[o+1]!==4)throw Error('Environment MIS attenuated noncompeting source');
  const rotated=i%4===3;
  if(contracts[o+2]!==Number(rotated)||contracts[o+3]!==((i%4===2)?-1:Number(!rotated)))throw Error('Environment MIS changed ray direction');
 }
 if(contracts[32]!==4||maxPdfError>pdfTolerance||Math.abs(mean-4)>meanTolerance)throw Error('Environment MIS mismatch '+JSON.stringify({c,mean,maxPdfError,contracts:Array.from(contracts)}));
 return {name:c.name,mean,expected:4,error:Math.abs(mean-4),maxPdfError,selection:c.selection,contractValues:Array.from(contracts),passed:true};
}

export async function runEnvironmentMisProbe(device,wait){
 const owned=[],{samples}=ENVIRONMENT_MIS_PROBE;
 const buffer=(size,usage)=>{const b=device.createBuffer({size,usage});owned.push(b);return b;};
 const tex=(data,sampled=false)=>{const t=device.createTexture({size:[1,1],format:sampled?'rgba8unorm':'rgba32float',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});owned.push(t);device.queue.writeTexture({texture:t},sampled?new Uint8Array(data.map(v=>v*255)):new Float32Array(data),{bytesPerRow:sampled?4:16},[1,1]);return t.createView();};
 try{
  device.pushErrorScope('validation');
  const frame=buffer(320,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),output=buffer(samples*16,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),staging=buffer(samples*16,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);
  const portal=buffer(128,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);
  const medium=createMediumTextureResource(device,{texture:GPUTextureUsage},[{id:0,ior:1,priority:0},{id:1,ior:1.5,priority:2}],true);owned.push(medium.texture);
  const module=device.createShaderModule({code:WAVEFRONT_COMPUTE_WGSL+ENVIRONMENT_MIS_PROBE_WGSL});await wait(assertShaderModuleCompiles(module,'environment-mis'));
  const entries=[{binding:3,resource:{buffer:output}},{binding:5,resource:{buffer:frame}},{binding:19,resource:{buffer:portal}},
   {binding:20,resource:tex([1,1,1,1],true)},{binding:21,resource:device.createSampler()},
   {binding:31,resource:tex([1,1,1,1])},{binding:32,resource:medium.view}];
  const pipelines=[];
  for(const [entryPoint,bindings] of [['environment_mis_probe',[3,5,19,20,21,31]],['environment_mis_contract',[3,5,19,31,32]]]){
   const pipeline=await wait(device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint}}));
   pipelines.push({pipeline,group:device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:entries.filter(e=>bindings.includes(e.binding))})});
  }
  const run=async(index,count,size)=>{const {pipeline,group}=pipelines[index],e=device.createCommandEncoder(),p=e.beginComputePass();p.setPipeline(pipeline);p.setBindGroup(0,group);p.dispatchWorkgroups(count);p.end();e.copyBufferToBuffer(output,0,staging,0,size);device.queue.submit([e.finish()]);await wait(staging.mapAsync(GPUMapMode.READ));const values=new Float32Array(staging.getMappedRange(0,size).slice(0));staging.unmap();return values;};
  const cases=[];
  for(const c of ENVIRONMENT_MIS_CASES){
   device.queue.writeBuffer(frame,0,environmentMisProbeConfig(c));
   const values=await run(0,samples/64,samples*16),contracts=await run(1,8,36*4);
   cases.push(summarizeEnvironmentMis(values,contracts,c));
  }
  const error=await wait(device.popErrorScope());if(error)throw Error(error.message);
  return {passed:true,cases,settings:ENVIRONMENT_MIS_PROBE,scope:'assembled estimator PDF/component/analytic furnace, not full-scene convergence or performance'};
 }finally{owned.forEach(r=>r.destroy());}
}
