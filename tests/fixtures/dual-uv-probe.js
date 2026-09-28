import {WAVEFRONT_COMPUTE_WGSL} from '/src/wavefront-shaders.js';
import {createWavefrontGpuMeshSource,createWavefrontGpuMaterialSource,createWavefrontMeshAcceleration} from '/src/wavefront-mesh-sources.js';
import {packWavefrontTriangles} from '/src/wavefront-packers.js';
import {CORE_UV_TEXTURES,EXTENSION_UV_TEXTURES} from '/src/wavefront-uvs.js';
import {assertShaderModuleCompiles} from '/src/wavefront-runtime-support.js';

// Small analytic probe only, never performance evidence. Execute canonical material
// functions and GPU triangle preparation from the complete assembled renderer WGSL.
export async function runDualUvProbe(signal){
 const adapter=await navigator.gpu.requestAdapter();if(adapter?.info.isFallbackAdapter!==false)throw Error('Physical GPU required for UV probe');
 const device=await adapter.requestDevice({requiredLimits:{maxSampledTexturesPerShaderStage:17}}),owned=[];
 const check=(v,m)=>{if(!v)throw Error('UV probe: '+m);};
 const wait=async promise=>{let timer;try{const value=await Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('UV probe timeout')),30000))]);check(!signal.aborted,'cancelled');return value;}finally{clearTimeout(timer);}};
 const buffer=(data,usage)=>{const b=device.createBuffer({size:typeof data==='number'?data:data.byteLength,usage:usage|GPUBufferUsage.COPY_DST});owned.push(b);if(typeof data!=='number')device.queue.writeBuffer(b,0,data);return b;};
 const texture=a=>{const t=device.createTexture({size:[a.width,a.height],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});owned.push(t);device.queue.writeTexture({texture:t},a.data,{bytesPerRow:a.width*4},[a.width,a.height]);return t.createView();};
 try{
  device.pushErrorScope('validation');
  const slots=[...CORE_UV_TEXTURES,...EXTENSION_UV_TEXTURES],masks=[0,131071,...slots.map((_,i)=>1<<i)];
  const pixels=new Uint8Array([64,64,64,255,192,192,192,255]);
  const meshes=masks.map(mask=>({positions:[0,0,0,1,0,0,0,1,0],indices:[0,1,2],normals:[0,0,1,0,0,1,0,0,1],
   uvs:[0.25,0.25,0.75,0.25,0.25,0.75],uvs1:[0.75,0.25,0.75,0.75,0.25,0.25],color:[1,1,1,1],emission:[1,1,1,1],
   ...Object.fromEntries(slots.map((name,i)=>[name+'Texture',{texCoord:(mask>>i)&1,width:2,height:1,data:pixels}]))}));
  const materials=createWavefrontGpuMaterialSource(meshes),source=createWavefrontGpuMeshSource(meshes,materials),triangles=packWavefrontTriangles(createWavefrontMeshAcceleration(meshes,materials).triangles);
  // Original triangle IDs survive CPU BVH ordering; the probe writes in that order.
  const stride=20,output=buffer(masks.length*stride*16,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),triangleBuffer=buffer(triangles.buffer,GPUBufferUsage.STORAGE);
  const code=WAVEFRONT_COMPUTE_WGSL+`
   @compute @workgroup_size(1) fn probeUv(@builtin(global_invocation_id) id:vec3<u32>){
    let t=triangles[id.x];let bary=vec3<f32>(0.5,0.25,0.25);
    let uv=t.uv0uv1.xy*bary.x+t.uv0uv1.zw*bary.y+t.uv2Pad.xy*bary.z;
    let second=vec2<f32>(t.v0.w,t.n0.w)*bary.x+vec2<f32>(t.v1.w,t.n1.w)*bary.y+vec2<f32>(t.v2.w,t.n2.w)*bary.z;
    let m=sample_surface_material(t,uv,bary,vec3<f32>(0,0,1),vec3<f32>(0,0,1));let base=t.triangleId*20u;
    accumulation[base]=vec4<f32>(m.color.rgb,m.occlusion);
    let basis=build_triangle_tangent_basis(t,vec3<f32>(0,0,1));
    accumulation[base+1u]=vec4<f32>(basis.tangent,0);accumulation[base+2u]=vec4<f32>(basis.bitangent,0);
    for(var slot=0u;slot<17u;slot++){accumulation[base+3u+slot]=vec4<f32>(material_uv(uv,second,u32(t.textureSettings.w),slot),0,0);}
   }`;
  const module=device.createShaderModule({code});await wait(assertShaderModuleCompiles(module,'dual-uv-canonical'));
  const pipeline=await wait(device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'probeUv'}}));
  const bindings=[23,24,25,26,27,...Array.from({length:12},(_,i)=>33+i)];
  const atlas=slots.map((name,i)=>i<5?materials[name+'Atlas']:materials.extensionAtlases[name]);
  const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[
   {binding:3,resource:{buffer:output}},{binding:8,resource:{buffer:triangleBuffer}},
   ...atlas.map((a,i)=>({binding:bindings[i],resource:texture(a)})),
   {binding:28,resource:device.createSampler({minFilter:'nearest',magFilter:'nearest'})}]});
  const read=async()=>{const staging=buffer(output.size,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST),e=device.createCommandEncoder();e.copyBufferToBuffer(output,0,staging,0,output.size);device.queue.submit([e.finish()]);await wait(staging.mapAsync(GPUMapMode.READ));const f=new Float32Array(staging.getMappedRange().slice(0));staging.unmap();return f;};
  const run=async()=>{const e=device.createCommandEncoder(),p=e.beginComputePass();p.setPipeline(pipeline);p.setBindGroup(0,group);p.dispatchWorkgroups(masks.length);p.end();device.queue.submit([e.finish()]);return read();};
  const cpu=await run();
  const frame=new Uint32Array(80);frame[11]=masks.length;frame[14]=masks.length;
  const prepare=await wait(device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'prepareMeshTrianglesAndLeaves'}}));
  const preparation=device.createBindGroup({layout:prepare.getBindGroupLayout(0),entries:[
   {binding:5,resource:{buffer:buffer(frame,GPUBufferUsage.UNIFORM)}},{binding:8,resource:{buffer:triangleBuffer}},
   {binding:9,resource:{buffer:buffer(masks.length*2*48,GPUBufferUsage.STORAGE)}},
   {binding:10,resource:{buffer:buffer(source.vertices.buffer,GPUBufferUsage.STORAGE)}},
   {binding:11,resource:{buffer:buffer(source.indices.buffer,GPUBufferUsage.STORAGE)}},
   {binding:12,resource:{buffer:buffer(source.meshes.buffer,GPUBufferUsage.STORAGE)}},
   {binding:13,resource:{buffer:buffer(masks.length*16,GPUBufferUsage.STORAGE)}}]});
  const e=device.createCommandEncoder(),p=e.beginComputePass();p.setPipeline(prepare);p.setBindGroup(0,preparation);p.dispatchWorkgroups(1);p.end();device.queue.submit([e.finish()]);
  const gpu=await run(),error=await wait(device.popErrorScope());check(!error,error?.message);check(cpu.every((v,i)=>v===gpu[i]),'CPU/GPU triangle preparation mismatch');
  const near=(a,b)=>Math.abs(a-b)<0.00001;
  masks.forEach((mask,i)=>{
   const base=i*stride*4,value=(mask&1?192:64)/255,srgb=value<=0.04045?value/12.92:Math.pow((value+0.055)/1.055,2.4);
   check(near(cpu[base],srgb)&&near(cpu[base+3],(mask&8?192:64)/255),'texture sampled wrong UV set');
   check(near(cpu[base+4],mask&4?0:1)&&near(cpu[base+5],mask&4?-1:0),'normal tangent uses wrong UV set');
   for(let slot=0;slot<17;slot++)check(near(cpu[base+(3+slot)*4],mask&(1<<slot)?0.625:0.375)&&near(cpu[base+(3+slot)*4+1],0.375),'slot selection mismatch');
  });
  return {passed:true,cases:masks.length,slots:17,cpuGpuPreparationEqual:true,triangleRecordBytes:triangles.buffer.byteLength/masks.length,vertexRecordBytes:source.vertices.recordBytes,adapter:{vendor:adapter.info.vendor,architecture:adapter.info.architecture},scope:'analytic-material-UV-test-not-performance'};
 }finally{owned.forEach(r=>r.destroy());device.destroy();}
}
