import {createGuidedSpatialDenoiser} from '/src/wavefront-guided-denoise.js';
import {createTextureReader} from './native-guided-postprocess.js';
import {createGuidedDenoiseProbe,evaluateGuidedDenoiseProbe} from '/lighting/demo/eames-environments/guided-denoise-probe.js';
import {assertShaderModuleCompiles} from '/src/wavefront-runtime-support.js';

export async function runGuidedDenoiseProbe(signal) {
 const adapter=await navigator.gpu.requestAdapter();if(adapter?.info.isFallbackAdapter!==false)throw new Error('Physical GPU required for guided probe');
 const device=await adapter.requestDevice(),owned=[],probe=createGuidedDenoiseProbe();let denoiser;
 const wait=async promise=>{let timer;try{const r=await Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Guided probe timed out')),30000))]);if(signal.aborted)throw Error('Guided probe cancelled');return r;}finally{clearTimeout(timer);}};
 const makeBuffer=(size,usage)=>{const b=device.createBuffer({size,usage});owned.push(b);return b;};
 const texture=format=>{const t=device.createTexture({size:[128,128],format,usage:GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.TEXTURE_BINDING});owned.push(t);return t;};
 const read=async(b,size)=>{const staging=makeBuffer(size,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);const e=device.createCommandEncoder();e.copyBufferToBuffer(b,0,staging,0,size);device.queue.submit([e.finish()]);await wait(staging.mapAsync(GPUMapMode.READ));const data=staging.getMappedRange().slice(0);staging.unmap();return data;};
 try{
  device.pushErrorScope('validation');
  const raw=texture('rgba16float'),scratch=texture('rgba16float'),display=texture('rgba8unorm');
  const words=makeBuffer(probe.words.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);device.queue.writeBuffer(words,0,probe.words);
  denoiser=await wait(createGuidedSpatialDenoiser(device,{texture:GPUTextureUsage,buffer:GPUBufferUsage,shader:GPUShaderStage},{
   'renderer.denoise.guidedSpatial.enabled':true,width:128,height:128,inputView:raw.createView(),scratchView:scratch.createView(),outputView:display.createView(),pixelState:words,
   frameBuffer:makeBuffer(320,GPUBufferUsage.UNIFORM),rayBuffer:makeBuffer(96,GPUBufferUsage.STORAGE),hitBuffer:makeBuffer(240,GPUBufferUsage.STORAGE),counterBuffer:makeBuffer(128,GPUBufferUsage.STORAGE)}));
  const data=new Float32Array(probe.raw.length*3);data.set(probe.raw);data.set(probe.normalDepth,probe.raw.length);data.set(probe.albedo,probe.raw.length*2);
  const source=makeBuffer(data.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);device.queue.writeBuffer(source,0,data);
  const module=device.createShaderModule({code:`
   @group(0) @binding(0) var<storage,read> data:array<vec4<f32>>;
   @group(0) @binding(1) var raw:texture_storage_2d<rgba16float,write>;
   @group(0) @binding(2) var normals:texture_storage_2d<rgba16float,write>;
   @group(0) @binding(3) var albedo:texture_storage_2d<rgba8unorm,write>;
   @compute @workgroup_size(64) fn initialize(@builtin(global_invocation_id) id:vec3<u32>){if(id.x>=16384u){return;}
   let p=vec2<i32>(i32(id.x%128u),i32(id.x/128u));textureStore(raw,p,data[id.x]);textureStore(normals,p,data[16384u+id.x]);textureStore(albedo,p,data[32768u+id.x]);}`});
  await wait(assertShaderModuleCompiles(module,'guided-probe-init'));
  const pipeline=await wait(device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'initialize'}}));
  const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:source}},{binding:1,resource:raw.createView()},{binding:2,resource:denoiser.normalTexture.createView()},{binding:3,resource:denoiser.albedoTexture.createView()}]});
  const e=device.createCommandEncoder(),p=e.beginComputePass();p.setPipeline(pipeline);p.setBindGroup(0,group);p.dispatchWorkgroups(256);p.end();denoiser.encode(e);device.queue.submit([e.finish()]);await wait(device.queue.onSubmittedWorkDone());
  const readTexture=await createTextureReader({device,makeBuffer,read,wait,width:128,height:128});
  const output=await readTexture(denoiser.filteredView);const error=await wait(device.popErrorScope());if(error)throw Error(error.message);
  return {...evaluateGuidedDenoiseProbe(probe,output),adapter:{vendor:adapter.info.vendor,architecture:adapter.info.architecture}};
 }finally{denoiser?.destroy();owned.forEach(r=>r.destroy());device.destroy();}
}
