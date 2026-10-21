import {WAVEFRONT_COMPUTE_WGSL} from '../../src/wavefront-shaders.js';
import {createWavefrontGpuMaterialSource,createWavefrontMeshAcceleration} from '../../src/wavefront-mesh-sources.js';
import {packWavefrontTriangles,createConfigPayload} from '../../src/wavefront-packers.js';
import {createMaterialTextureResource} from '../../src/wavefront-texture-transforms.js';
import {createBrdfLutResource} from '../../src/wavefront-gpu-resources.js';
import {createWavefrontPathTracingComputeConfig} from '../../src/wavefront-config.js';
import {validateWavefrontBsdfSample} from '../../src/wavefront-reference.js';
import {CORE_UV_TEXTURES,EXTENSION_UV_TEXTURES} from '../../src/wavefront-uvs.js';
import {assertShaderModuleCompiles} from '../../src/wavefront-runtime-support.js';

export const CLEARCOAT_TOLERANCE=Object.freeze({absolute:2e-5,relative:.002});
const unit=v=>{const d=Math.hypot(...v);return v.map(n=>n/d);};
export function clearcoatProbeMeshes(){
 const tex=(data,extra={})=>({width:1,height:1,data:Uint8Array.from(data),...extra});
 const cases=[null,{}, {scale:0}, {texCoord:1,scale:.5}, {transform:{rotation:Math.PI/2}}, {transform:{scale:[-2,3]}}];
 return cases.map(normal=>({positions:[0,0,0,1,0,0,0,1,0],normals:[0,0,1,0,0,1,0,0,1],indices:[0,1,2],
  uvs:[0,0,1,0,0,1],uvs1:[0,0,0,1,1,0],color:[.6,.2,.05,1],roughness:.5,metallic:0,
  clearcoat:.75,clearcoatRoughness:.5,
  normalTexture:tex([204,128,230,255]),clearcoatTexture:tex([204,51,102,255]),
  clearcoatRoughnessTexture:tex([51,102,204,255]),clearcoatNormalTexture:normal?tex([255,128,255,255],normal):null}));
}
export function clearcoatExpectedNormals(){return [[0,0,1],unit([1,1/255,1]),[0,0,1],unit([.5/255,.5,1]),unit([1/255,-1,1]),unit([-1,1/255,1])];}
export function clearcoatProbeShader(){return WAVEFRONT_COMPUTE_WGSL+`
 @compute @workgroup_size(1) fn clearcoat_probe(@builtin(global_invocation_id) id:vec3<u32>){
  let t=triangles[id.x];let base=t.triangleId*5u;
  let m=sample_surface_material(t,vec2<f32>(0.3,0.2),vec3<f32>(0.5,0.3,0.2),vec3<f32>(0,0,1),vec3<f32>(0,0,1));
  accumulation[base]=vec4<f32>(m.clearcoatNormal,m.materialResponse.w);
  accumulation[base+1u]=vec4<f32>(m.shadingNormal,m.materialExtension.x);
  var h=HitRecord();h.color=vec4<f32>(0.6,0.2,0.05,1);h.material=vec4<f32>(0.5,0,1,1.5);
  h.geometricNormal=vec4<f32>(0,0,1,0);h.shadingNormal=h.geometricNormal;h.occlusion=1.0;
  h.materialResponse.w=m.materialResponse.w;h.materialExtension=vec4<f32>(m.materialExtension.x,1,0,0);h.specularColor=vec4<f32>(1);
  h.clearcoatNormalXY=m.clearcoatNormal.xy;h.clearcoatNormalZ=m.clearcoatNormal.z;
  let v=vec3<f32>(0,0,1);accumulation[base+2u]=vec4<f32>(evaluate_surface_bsdf(h,v,v),evaluate_surface_bsdf_pdf(h,v,v));
  accumulation[base+3u]=vec4<f32>(coating_fresnel(h.materialResponse.w,surface_clearcoat_normal(h),v));
  h.materialResponse.w=0.0;accumulation[base+4u]=vec4<f32>(evaluate_surface_bsdf(h,v,v),evaluate_surface_bsdf_pdf(h,v,v));
 }`;}

export async function runClearcoatProbe(device,wait){
 const owned=[],meshes=clearcoatProbeMeshes(),count=meshes.length,size=count*5*16;
 const buffer=(data,usage)=>{const b=device.createBuffer({size:typeof data==='number'?data:data.byteLength,usage:usage|GPUBufferUsage.COPY_DST});owned.push(b);if(typeof data!=='number')device.queue.writeBuffer(b,0,data);return b;};
 const texture=a=>{const t=device.createTexture({size:[a.width,a.height],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});owned.push(t);device.queue.writeTexture({texture:t},a.data,{bytesPerRow:a.width*4},[a.width,a.height]);return t.createView();};
 try{
  device.pushErrorScope('validation');
  const material=createWavefrontGpuMaterialSource(meshes),triangles=createWavefrontMeshAcceleration(meshes,material).triangles;
  const metadata=createMaterialTextureResource(device,{texture:GPUTextureUsage},material.textureMetadata),lut=createBrdfLutResource(device,{texture:GPUTextureUsage},128,true);owned.push(metadata.texture,lut.texture);
  const frame=enabled=>createConfigPayload(createWavefrontPathTracingComputeConfig({width:1,height:1,'renderer.materials.layeredClearcoat.enabled':enabled}),{x:0,y:0,width:1,height:1},0);
  const config=buffer(frame(true),GPUBufferUsage.UNIFORM),output=buffer(size,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),staging=buffer(size,GPUBufferUsage.MAP_READ);
  const module=device.createShaderModule({code:clearcoatProbeShader()});await wait(assertShaderModuleCompiles(module,'clearcoat-probe'));
  const pipeline=await wait(device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'clearcoat_probe'}}));
  const names=[...CORE_UV_TEXTURES,...EXTENSION_UV_TEXTURES],bindings=[23,24,25,26,27,...Array.from({length:12},(_,i)=>33+i)];
  const entries=names.map((name,i)=>({binding:bindings[i],resource:texture(i<5?material[name+'Atlas']:material.extensionAtlases[name])}));
  entries.push({binding:3,resource:{buffer:output}},{binding:5,resource:{buffer:config}},{binding:8,resource:{buffer:buffer(packWavefrontTriangles(triangles).buffer,GPUBufferUsage.STORAGE)}},
   {binding:28,resource:device.createSampler({minFilter:'nearest',magFilter:'nearest'})},{binding:29,resource:lut.view},{binding:30,resource:lut.sampler},{binding:45,resource:metadata.view});
  const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries}),runs=[];let maximumScaledError=0;
  const near=(actual,expected)=>{const error=Math.abs(actual-expected)/(CLEARCOAT_TOLERANCE.absolute+CLEARCOAT_TOLERANCE.relative*Math.abs(expected));maximumScaledError=Math.max(maximumScaledError,error);};
  for(const enabled of [false,true,false]){
   device.queue.writeBuffer(config,0,frame(enabled));const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(count);pass.end();
   encoder.copyBufferToBuffer(output,0,staging,0,size);device.queue.submit([encoder.finish()]);await wait(staging.mapAsync(GPUMapMode.READ));const values=new Float32Array(staging.getMappedRange().slice(0));staging.unmap();
   if(!values.every(Number.isFinite))throw Error('Non-finite clearcoat GPU response');
   for(let i=0;i<count;i++){
    const o=i*20,normal=clearcoatExpectedNormals()[i];
    if(enabled){normal.forEach((v,j)=>near(values[o+j],v));near(values[o+3],.6);near(values[o+7],.2);near(values[o+12],.6*(.04+.96*(1-normal[2])**5));}
    const reference=validateWavefrontBsdfSample({viewDirection:[0,0,1],lightDirection:[0,0,1],hit:{color:[.6,.2,.05],roughness:.5,clearcoat:values[o+3],clearcoatRoughness:values[o+7],shadingNormal:[0,0,1],clearcoatNormal:normal,layeredClearcoat:enabled}});
    [...reference.bsdf,reference.expectedPdf].forEach((v,j)=>near(values[o+8+j],v));
    if(runs.length)for(let j=16;j<20;j++)near(values[o+j],runs[0].values[o+j]);
   }
   if(runs.length===2)values.forEach((v,i)=>near(v,runs[0].values[i]));
   runs.push({enabled,values:Array.from(values)});
  }
  const error=await wait(device.popErrorScope());if(error||maximumScaledError>1)throw Error('Clearcoat probe failed: '+JSON.stringify({error:error?.message,maximumScaledError,runs}));
  return {passed:true,cases:count,runs,maximumScaledError,tolerance:CLEARCOAT_TOLERANCE,zeroCoatAndFlagOffPreserved:true,scope:'assembled-material-correctness-not-performance'};
 }finally{owned.forEach(r=>r.destroy());}
}
