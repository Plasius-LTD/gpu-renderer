import {createGuidedSpatialDenoiser} from '/src/wavefront-guided-denoise.js';
import {assertShaderModuleCompiles} from '/src/wavefront-runtime-support.js';

// Read only for retained evidence, never part of timed denoising. Chunk-sized
// staging avoids a second full-screen readback allocation at 4K.
export async function createTextureReader({device,makeBuffer,read,wait,width,height}) {
 const result=makeBuffer(16384*16,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),settings=makeBuffer(16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);
 const module=device.createShaderModule({code:`
 struct Settings {width:u32,height:u32,start:u32,count:u32};
 @group(0) @binding(0) var source:texture_2d<f32>;
 @group(0) @binding(1) var<storage,read_write> output:array<vec4<f32>>;
 @group(0) @binding(2) var<uniform> settings:Settings;
 @compute @workgroup_size(64) fn read_texture(@builtin(global_invocation_id) id:vec3<u32>){
 if(id.x>=settings.count){return;}let index=settings.start+id.x;
 output[id.x]=textureLoad(source,vec2<i32>(i32(index%settings.width),i32(index/settings.width)),0);}`});
 await wait(assertShaderModuleCompiles(module,'guided-readback'));
 const pipeline=await wait(device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'read_texture'}}));
 return async view=>{
  const image=new Float32Array(width*height*4),group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:view},{binding:1,resource:{buffer:result}},{binding:2,resource:{buffer:settings}}]});
  for(let start=0;start<width*height;start+=16384){
   const count=Math.min(16384,width*height-start);device.queue.writeBuffer(settings,0,new Uint32Array([width,height,start,count]));
   const e=device.createCommandEncoder(),p=e.beginComputePass();p.setPipeline(pipeline);p.setBindGroup(0,group);p.dispatchWorkgroups(Math.ceil(count/64));p.end();device.queue.submit([e.finish()]);
   image.set(new Float32Array(await read(result,count*16)),start*4);
  }
  return image;
 };
}

export async function createGuidedRoomPostprocess(c) {
 const {device,native,b,frame,counters,queue,descriptors,frameEncoder,makeBuffer,read,wait,active}=c;
 const trace=descriptors.get('plasius.wavefront.bind.activeNext').entries;
 const views=descriptors.get('plasius.wavefront.bind.denoise.radianceToScratch').entries;
 const rawView=views.find(e=>e.binding===14).resource;
 const denoiser=await createGuidedSpatialDenoiser(device,{texture:GPUTextureUsage,buffer:GPUBufferUsage,shader:GPUShaderStage},{
  'renderer.denoise.guidedSpatial.enabled':true,width:native.width,height:native.height,
  inputView:rawView,scratchView:views.find(e=>e.binding===15).resource,outputView:trace.find(e=>e.binding===7).resource,
  pixelState:b.pixelState,frameBuffer:frame,hitBuffer:trace.find(e=>e.binding===2).resource.buffer,rayBuffer:queue,counterBuffer:counters});
 let query,queryResolve,queryReadback;
 try{
  if(device.features.has('timestamp-query')){
   query=device.createQuerySet({type:'timestamp',count:2});
   queryResolve=makeBuffer(16,GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC);
   queryReadback=makeBuffer(16,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);
  }
  const readTexture=await createTextureReader({device,makeBuffer,read,wait,width:native.width,height:native.height});
  return {denoiser,rawView,readTexture,memory:{...denoiser.memory,diagnosticStagingBytes:16384*16+16+(query?32:0),diagnosticStagingIncludedInFixtureTotal:true},
   async apply(filtered){
    active();const start=performance.now(),e=device.createCommandEncoder();
    denoiser.encode(e,{filtered,...(query?{timestampWrites:{querySet:query,beginningOfPassWriteIndex:0,endOfPassWriteIndex:1}}:{})});
    frameEncoder.encodePresent(e);
    if(query){e.resolveQuerySet(query,0,2,queryResolve,0);e.copyBufferToBuffer(queryResolve,0,queryReadback,0,16);}
    device.queue.submit([e.finish()]);await wait(device.queue.onSubmittedWorkDone());
    const jobMs=performance.now()-start;let gpuMs=null;
    if(query){await wait(queryReadback.mapAsync(GPUMapMode.READ));const values=new BigUint64Array(queryReadback.getMappedRange());gpuMs=Number(values[1]-values[0])/1e6;queryReadback.unmap();}
    const error=await wait(device.popErrorScope());device.pushErrorScope('validation');if(error)throw new Error(error.message);
    return {filtered,jobMs,gpuMs,gpuScope:'filter-and-tone-map-excludes-presentation-and-guide-capture',jobScope:'encoding-submission-GPU-completion-includes-presentation-excludes-readback'};
   },destroy(){query?.destroy();denoiser.destroy();}};
 }catch(error){query?.destroy();denoiser.destroy();throw error;}
}
