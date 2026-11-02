import {WAVEFRONT_COMPUTE_WGSL} from '../../src/wavefront-shaders.js';
import {createWavefrontPathTracingComputeConfig} from '../../src/wavefront-config.js';
import {createConfigPayload} from '../../src/wavefront-packers.js';
import {createMediumTextureResource} from '../../src/wavefront-gpu-resources.js';
import {assertShaderModuleCompiles} from '../../src/wavefront-runtime-support.js';
import {functionSource} from './rough-dielectric-numerical-harness.js';

// Analytic quadrature, never a scene/performance benchmark or sampling default.
export const BSDF_PROPOSAL_PROBE=Object.freeze({samples:512,meanTolerance:0.0001,nullTolerance:0.002});
export const BSDF_PROPOSAL_CASES=Object.freeze([
 {name:'ordinary-ggx',normal:[0,0,1]},
 {name:'coated-ggx',normal:[0,0,1],coat:true},
 {name:'rotated-ggx',normal:[.6,0,.8]},
 {name:'rotated-coated-ggx',normal:[.6,0,.8],coat:true},
 {name:'diffuse',normal:[0,0,1],diffuse:true},
 {name:'emissive-metadata',normal:[0,0,1],emissive:2},
 {name:'portal-metadata',normal:[0,0,1],portals:1},
]);
function body(name,code){const original=functionSource(name);return original.slice(0,original.indexOf('{')+1)+code+'}';}
export function bsdfProposalProbeShader(){
 // Replace quadrature inputs and scene target lookups only. Both production
 // scatter_direction and evaluate_surface_bsdf_pdf are completely unchanged.
 return WAVEFRONT_COMPUTE_WGSL
  .replace(functionSource('sample_dimension_1d'),body('sample_dimension_1d','return select(0.5,0.0,dimension==SAMPLE_DIM_GUIDED_LIGHT_SELECTOR);'))
  .replace(functionSource('sample_dimension_2d'),body('sample_dimension_2d',`let y=(f32(sampleId)+0.5)/${BSDF_PROPOSAL_PROBE.samples}.0;return vec2<f32>(0.5,select(y,fract(2.0*y),dimension==SAMPLE_DIM_FALLBACK_HEMISPHERE));`))
  .replace(functionSource('sample_emissive_triangle_direction'),body('sample_emissive_triangle_direction','return fallback;'))
  .replace(functionSource('sample_environment_portal_direction'),body('sample_environment_portal_direction','return fallback;'))+`
 fn proposal_probe(sampleOrdinal:u32,diffuse:bool){
  if(sampleOrdinal>=${BSDF_PROPOSAL_PROBE.samples}u){return;}
  let n=config.environmentHorizonColor.xyz;var ray=RayRecord();ray.direction=vec4<f32>(-n,0);ray.sampleId=sampleOrdinal;
  var hit=HitRecord();hit.shadingNormal=vec4<f32>(n,0);hit.geometricNormal=hit.shadingNormal;
  hit.color=vec4<f32>(1);hit.material=vec4<f32>(1,select(1.0,0.0,diffuse),1,1.5);hit.specularColor=vec4<f32>(1);
  hit.materialExtension=vec4<f32>(1,select(1.0,0.0,diffuse),0,0);
  hit.materialResponse.w=select(0.0,1.0,transport_experiment_enabled(8192u));
  let scatter=scatter_direction(ray,hit);
  accumulation[sampleOrdinal]=vec4<f32>(scatter.pdf,dot(n,scatter.direction.xyz),f32(scatter.flags),f32(scatter.lobeKind));
 }
 @compute @workgroup_size(64) fn ggx_proposal_probe(@builtin(global_invocation_id) id:vec3<u32>){proposal_probe(id.x,false);}
 @compute @workgroup_size(64) fn diffuse_proposal_probe(@builtin(global_invocation_id) id:vec3<u32>){proposal_probe(id.x,true);}
 `;
}
export function bsdfProposalConfig(c){
 const base=createWavefrontPathTracingComputeConfig({width:1,height:1,samplesPerPixel:32,
  'renderer.materials.layeredClearcoat.enabled':c.coat===true,environmentLighting:{horizonColor:[...c.normal,1]}});
 return createConfigPayload({...base,emissiveTriangleCount:c.emissive??0,environmentPortalCount:c.portals??0,environmentPortalMode:c.portals?1:0},{x:0,y:0,width:1,height:1},0);
}
export function summarizeBsdfProposal(values,c){
 const {samples,meanTolerance,nullTolerance}=BSDF_PROPOSAL_PROBE;
 if(values.length!==samples*4||!values.every(Number.isFinite))throw Error('Missing/nonfinite BSDF proposal evidence');
 let nulls=0,mean=0;
 for(let i=0;i<samples;i++){
  const [pdf,cosine,flags]=values.subarray(i*4,i*4+3);
  if(flags!==0||pdf<0)throw Error('Unexpected guided/invalid BSDF proposal');
  if(pdf===0){nulls++;continue;}
  if(cosine<=0||cosine>1.00001)throw Error('Invalid accepted BSDF hemisphere');
  // Independent unit-Lambertian integrand, not the production material BRDF.
  mean+=cosine/(Math.PI*pdf*samples);
 }
 const expectedNullFraction=c.diffuse?0:.5,nullFraction=nulls/samples;
 if(Math.abs(mean-1)>meanTolerance||Math.abs(nullFraction-expectedNullFraction)>nullTolerance)throw Error('BSDF proposal density mismatch '+JSON.stringify({name:c.name,mean,nullFraction,expectedNullFraction}));
 return {name:c.name,mean,expectedMean:1,nullFraction,expectedNullFraction,passed:true};
}
export async function runBsdfProposalProbe(device,wait){
 const owned=[],{samples}=BSDF_PROPOSAL_PROBE;
 const buffer=(size,usage)=>{const b=device.createBuffer({size,usage});owned.push(b);return b;};
 try{
  device.pushErrorScope('validation');
  const frame=buffer(320,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),output=buffer(samples*16,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),staging=buffer(samples*16,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);
  const medium=createMediumTextureResource(device,{texture:GPUTextureUsage},[{id:0,ior:1,priority:0}],true);owned.push(medium.texture);
  const module=device.createShaderModule({code:bsdfProposalProbeShader()});await wait(assertShaderModuleCompiles(module,'bsdf-proposal-density'));
  const pipelines={};
  for(const kind of ['ggx','diffuse']){const pipeline=await wait(device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:kind+'_proposal_probe'}}));pipelines[kind]={pipeline,group:device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:3,resource:{buffer:output}},{binding:5,resource:{buffer:frame}},{binding:32,resource:medium.view}]})};}
  const cases=[];
  for(const c of BSDF_PROPOSAL_CASES){
   device.queue.writeBuffer(frame,0,bsdfProposalConfig(c));const {pipeline,group}=pipelines[c.diffuse?'diffuse':'ggx'],e=device.createCommandEncoder(),p=e.beginComputePass();
   p.setPipeline(pipeline);p.setBindGroup(0,group);p.dispatchWorkgroups(samples/64);p.end();e.copyBufferToBuffer(output,0,staging,0,samples*16);device.queue.submit([e.finish()]);
   await wait(staging.mapAsync(GPUMapMode.READ));const values=new Float32Array(staging.getMappedRange().slice(0));staging.unmap();cases.push(summarizeBsdfProposal(values,c));
  }
  const error=await wait(device.popErrorScope());if(error)throw Error(error.message);
  return {passed:true,cases,settings:BSDF_PROPOSAL_PROBE,scope:'production BSDF sampler/PDF analytic quadrature; not full-scene convergence or performance'};
 }finally{owned.forEach(r=>r.destroy());}
}
