import {WAVEFRONT_COMPUTE_WGSL} from '../../src/wavefront-shaders.js';
import {createBrdfLutResource} from '../../src/wavefront-gpu-resources.js';
import {assertShaderModuleCompiles} from '../../src/wavefront-runtime-support.js';
import {createWavefrontPathTracingComputeConfig} from '../../src/wavefront-config.js';
import {createConfigPayload} from '../../src/wavefront-packers.js';

export const COLOUR_PROBE_CASES=Object.freeze([[0,0,0],[.001,.01,.03],[.883,.035,0],[1,1,1]]);
export const COLOUR_PROBE_TOLERANCE=2e-6;
export function authoredColourProbeFrame(sheen,ambient){
 return createConfigPayload(createWavefrontPathTracingComputeConfig({width:1,height:1,ambientColor:[...ambient,1],
  featureFlags:{'renderer.materials.sheen.enabled':sheen}}),{x:0,y:0,width:1,height:1},0);
}
export function authoredColourProbeShader(){return WAVEFRONT_COMPUTE_WGSL+`
 @compute @workgroup_size(1) fn authored_colour_probe(@builtin(global_invocation_id) id:vec3<u32>){
  let colours=array<vec3<f32>,${COLOUR_PROBE_CASES.length}>(${COLOUR_PROBE_CASES.map(c=>`vec3<f32>(${c.join(',')})`).join(',')});
  let kind=id.x%3u;var hit=HitRecord();hit.color=vec4<f32>(colours[id.x/3u],1);
  hit.shadingNormal=vec4<f32>(0,1,0,0);hit.geometricNormal=hit.shadingNormal;
  hit.material=vec4<f32>(0.8,select(0.0,1.0,kind==2u),1,1.5);
  hit.materialExtension.y=select(0.0,1.0,kind!=0u);hit.occlusion=1.0;
  hit.specularColor=vec4<f32>(1,1,1,0.8);
  if(sheen_enabled()){hit.materialResponse=vec4<f32>(1,0.329,0.1,0);}
  let v=vec3<f32>(0,1,0);
  accumulation[id.x]=vec4<f32>(evaluate_surface_bsdf(hit,v,v),evaluate_surface_bsdf_pdf(hit,v,v));
 }`;}

export async function runAuthoredColourProbe(device,wait){
 const owned=[],count=COLOUR_PROBE_CASES.length*3,size=count*16;
 const buffer=(size,usage)=>{const b=device.createBuffer({size,usage});owned.push(b);return b;};
 try{
  device.pushErrorScope('validation');
  const config=buffer(authoredColourProbeFrame(false,[0,0,0]).byteLength,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),output=buffer(size,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),staging=buffer(size,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);
  const lut=createBrdfLutResource(device,{texture:GPUTextureUsage},128,true);owned.push(lut.texture);
  const module=device.createShaderModule({code:authoredColourProbeShader()});await wait(assertShaderModuleCompiles(module,'authored-colour'));
  const pipeline=await wait(device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'authored_colour_probe'}}));
  const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:3,resource:{buffer:output}},{binding:5,resource:{buffer:config}},{binding:29,resource:lut.view},{binding:30,resource:lut.sampler}]});
  let maxAnalyticError=0,maxAmbientDifference=0;const runs=[];
  for(const sheen of [false,true]){
   let baseline;
   for(const ambient of [[0,0,0],[1,.5,.2]]){
    device.queue.writeBuffer(config,0,authoredColourProbeFrame(sheen,ambient));
    const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(count);pass.end();
    encoder.copyBufferToBuffer(output,0,staging,0,size);device.queue.submit([encoder.finish()]);await wait(staging.mapAsync(GPUMapMode.READ));
    const values=new Float32Array(staging.getMappedRange().slice(0));staging.unmap();
    if(!values.every(v=>Number.isFinite(v)&&v>=0)||values.some((v,i)=>i%4===3&&v<=0))throw Error('Invalid authored-colour GPU response');
    for(let i=0;i<count;i++)for(let channel=0;channel<3;channel++){
     const color=COLOUR_PROBE_CASES[Math.floor(i/3)][channel],kind=i%3;
     const expected=kind===0?color/Math.PI:kind===1?color*.96/Math.PI+.04/(4*Math.PI*.8**4):color/(4*Math.PI*.8**4);
     if(!sheen)maxAnalyticError=Math.max(maxAnalyticError,Math.abs(values[i*4+channel]-expected));
    }
    if(baseline)values.forEach((v,i)=>{maxAmbientDifference=Math.max(maxAmbientDifference,Math.abs(v-baseline[i]));});else baseline=values;
    runs.push({sheen,ambient,values:Array.from(values)});
   }
  }
  const error=await wait(device.popErrorScope());if(error||maxAnalyticError>COLOUR_PROBE_TOLERANCE||maxAmbientDifference>COLOUR_PROBE_TOLERANCE)throw Error('Authored-colour probe failed: '+JSON.stringify({maxAnalyticError,maxAmbientDifference,error:error?.message}));
  return {passed:true,cases:count,runs,maxAnalyticError,maxAmbientDifference,tolerance:COLOUR_PROBE_TOLERANCE,scope:'closed-form-material-correctness-not-performance'};
 }finally{owned.forEach(r=>r.destroy());}
}
