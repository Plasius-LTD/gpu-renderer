import {WAVEFRONT_COMPUTE_WGSL} from '/src/wavefront-shaders.js';
import {createWavefrontGpuMaterialSource,createWavefrontMeshAcceleration} from '/src/wavefront-mesh-sources.js';
import {packWavefrontTriangles} from '/src/wavefront-packers.js';
import {createMaterialTextureResource} from '/src/wavefront-texture-transforms.js';
import {createBrdfLutResource} from '/src/wavefront-gpu-resources.js';
import {charlieSheenBrdf} from '/src/wavefront-sheen.js';
import {CORE_UV_TEXTURES,EXTENSION_UV_TEXTURES} from '/src/wavefront-uvs.js';
import {assertShaderModuleCompiles} from '/src/wavefront-runtime-support.js';
import {runAuthoredColourProbe} from './authored-colour-probe.js';

// Execute real atlas lookup and the assembled sheen BSDF, not a mock renderer.
export async function runMaterialFidelityProbe(signal){
 const adapter=await navigator.gpu.requestAdapter();
 if(adapter?.info.isFallbackAdapter!==false)throw Error('Physical GPU required');
 const device=await adapter.requestDevice({requiredLimits:{maxSampledTexturesPerShaderStage:19}}),owned=[];
 const check=(v,m)=>{if(!v)throw Error('Material fidelity: '+m);};
 const wait=async promise=>{let timer;try{const v=await Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Material probe timeout')),30000))]);check(!signal.aborted,'cancelled');return v;}finally{clearTimeout(timer);}};
 const buffer=(data,usage)=>{const b=device.createBuffer({size:typeof data==='number'?data:data.byteLength,usage:usage|GPUBufferUsage.COPY_DST});owned.push(b);if(typeof data!=='number')device.queue.writeBuffer(b,0,data);return b;};
 const texture=a=>{const t=device.createTexture({size:[a.width,a.height],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});owned.push(t);device.queue.writeTexture({texture:t},a.data,{bytesPerRow:a.width*4},[a.width,a.height]);return t.createView();};
 try{
  device.pushErrorScope('validation');
  const names=[...CORE_UV_TEXTURES,...EXTENSION_UV_TEXTURES];
  const cases=[{}, {transform:{offset:[-3,3],scale:[7,7]}},
   {transform:{rotation:Math.PI/2,offset:[.7,.1]}},
   {transform:{scale:[-2,3],offset:[.1,-.3]}},
   {transform:{scale:[4,4]},wrapS:33071,wrapT:33071},
   {transform:{scale:[4,4]},wrapS:33648,wrapT:33648}];
  const pixels=Uint8Array.from({length:64},(_,i)=>i%4===3?51*(1+Math.floor(i/4)%4):16+Math.floor(i/4)*12);
  const meshes=cases.map(options=>({positions:[0,0,0,1,0,0,0,1,0],indices:[0,1,2],uvs:[.37,.26,.37,.26,.37,.26],
   color:[1,1,1,1],sheenColor:[1,1,1],sheenRoughness:.8,
   ...Object.fromEntries(names.map(name=>[name+'Texture',{width:4,height:4,data:pixels,...options}]))}));
  const material=createWavefrontGpuMaterialSource(meshes),triangles=createWavefrontMeshAcceleration(meshes,material).triangles;
  const metadata=createMaterialTextureResource(device,{texture:GPUTextureUsage},material.textureMetadata);
  const lut=createBrdfLutResource(device,{texture:GPUTextureUsage},128,true);owned.push(metadata.texture,lut.texture);
  const bindings=[23,24,25,26,27,...Array.from({length:12},(_,i)=>33+i)];
  const frame=new Uint32Array(80);frame[67]=4096;
  const frameBuffer=buffer(frame,GPUBufferUsage.UNIFORM),output=buffer(cases.length*20*16,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC);
  const samples=names.map((name,slot)=>`accumulation[base+${slot}u]=sample_material_atlas(${name}AtlasTexture,textureLoad(materialTextureMetadata,vec2<i32>(${3+slot*3},i32(t.materialSlot)),0),uv,t.materialSlot,${slot}u,mask);`).join('\n');
  const module=device.createShaderModule({code:WAVEFRONT_COMPUTE_WGSL+`
   @compute @workgroup_size(1) fn materialProbe(@builtin(global_invocation_id) id:vec3<u32>){
    let t=triangles[id.x];let base=t.triangleId*20u;let uv=vec2<f32>(0.37,0.26);
    let mask=u32(textureLoad(materialTextureMetadata,vec2<i32>(0,i32(t.materialSlot)),0).x);
    ${samples}
    let material=sample_surface_material(t,uv,vec3<f32>(1,0,0),vec3<f32>(0,0,1),vec3<f32>(0,0,1));
    accumulation[base+17u]=vec4<f32>(material.materialResponse.xyz,material.specularColor.w);
    let nv=0.15+f32(t.triangleId)*0.15;let nl=0.6;
    let v=vec3<f32>(sqrt(1.0-nv*nv),0,nv);let l=vec3<f32>(sqrt(1.0-nl*nl)*cos(0.7),sqrt(1.0-nl*nl)*sin(0.7),nl);
    let nh=normalize(v+l).z;
    accumulation[base+18u]=vec4<f32>(charlie_sheen(nv,nl,nh,0.8),nv,nl,nh);
    var hit=HitRecord();hit.color=vec4<f32>(0.5);hit.material=vec4<f32>(0.8,0,1,1.5);
    hit.materialResponse=vec4<f32>(1,0.329,0.1,0);hit.materialExtension.y=1.0;
    hit.specularColor=vec4<f32>(1,1,1,0.8);hit.occlusion=1.0;hit.shadingNormal=vec4<f32>(0,0,1,0);
    accumulation[base+19u]=vec4<f32>(evaluate_surface_bsdf(hit,v,l),evaluate_surface_bsdf_pdf(hit,v,l));
   }`});
  await wait(assertShaderModuleCompiles(module,'material-fidelity'));
  const pipeline=await wait(device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'materialProbe'}}));
  const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[
   {binding:3,resource:{buffer:output}},{binding:5,resource:{buffer:frameBuffer}},
   {binding:8,resource:{buffer:buffer(packWavefrontTriangles(triangles).buffer,GPUBufferUsage.STORAGE)}},
   {binding:28,resource:device.createSampler({minFilter:'nearest',magFilter:'nearest'})},
   {binding:29,resource:lut.view},{binding:30,resource:lut.sampler},{binding:45,resource:metadata.view},
   ...names.map((name,i)=>({binding:bindings[i],resource:texture(i<5?material[name+'Atlas']:material.extensionAtlases[name])}))]});
  const staging=buffer(output.size,GPUBufferUsage.MAP_READ);
  const run=async()=>{const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();
   pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(cases.length);pass.end();
   encoder.copyBufferToBuffer(output,0,staging,0,output.size);device.queue.submit([encoder.finish()]);
   await wait(staging.mapAsync(GPUMapMode.READ));const values=new Float32Array(staging.getMappedRange().slice(0));staging.unmap();return values;};
  const values=await run();let maxTextureError=0,maxSheenRelativeError=0;
  const wrap=(v,mode)=>mode===33071?Math.max(0,Math.min(1,v)):mode===33648?1-Math.abs((((v/2)%1+1)%1)*2-1):((v%1)+1)%1;
  for(const [i,c] of cases.entries()){
   const t=c.transform??{},s=t.scale??[1,1],o=t.offset??[0,0],r=t.rotation??0;
   const u=wrap(.37*s[0]*Math.cos(r)-.26*s[1]*Math.sin(r)+o[0],c.wrapS);
   const v=wrap(.37*s[0]*Math.sin(r)+.26*s[1]*Math.cos(r)+o[1],c.wrapT);
   const p=(Math.min(3,Math.floor(v*4))*4+Math.min(3,Math.floor(u*4)))*4,base=i*80;
   for(let slot=0;slot<17;slot++)for(let channel=0;channel<4;channel++)maxTextureError=Math.max(maxTextureError,Math.abs(values[base+slot*4+channel]-pixels[p+channel]/255));
   const color=pixels[p]/255,linear=((color+.055)/1.055)**2.4;
   check(Math.abs(values[base+68]-linear)<1e-5,'sheen colour must be linear');
   check(Math.abs(values[base+71]-.8*pixels[p+3]/255)<1e-5,'sheen roughness must use alpha');
   const f=values.slice(base+72,base+76),expected=charlieSheenBrdf(f[1],f[2],f[3],.8);
   maxSheenRelativeError=Math.max(maxSheenRelativeError,Math.abs(f[0]-expected)/Math.max(1e-8,expected));
   check(values[base+79]>0&&values.slice(base+76,base+80).every(Number.isFinite),'BSDF or full-support PDF invalid');
  }
  check(maxTextureError<1e-5,'transformed texture mismatch '+maxTextureError);
  check(maxSheenRelativeError<.01,'sheen GPU/CPU mismatch '+maxSheenRelativeError);
  frame[67]=0;device.queue.writeBuffer(frameBuffer,0,frame);const off=await run();
  check(off.some((v,i)=>i%80>=76&&Math.abs(v-values[i])>1e-5),'sheen flag had no effect');
  const error=await wait(device.popErrorScope());check(!error,error?.message);
  const authoredColour=await runAuthoredColourProbe(device,wait);
  return {passed:true,cases:cases.length,slots:17,maxTextureError,maxSheenRelativeError,sheenFlagIndependent:true,authoredColour,scope:'assembled-material-correctness-not-performance'};
 }finally{owned.forEach(r=>r.destroy());device.destroy();}
}
