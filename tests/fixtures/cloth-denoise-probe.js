// Analytic correctness only: production guide capture + production filtering.
// Kept separate from native-resolution scene/performance evidence.
export function createClothProbe() {
 const width=128,height=128,count=width*height;
 const raw=new Float32Array(count*4),truth=new Float32Array(count*4),hits=new Float32Array(count*60),hitWords=new Uint32Array(hits.buffer),rays=new Uint32Array(count*24),words=new Uint32Array(count);
 for(let pixel=0;pixel<count;pixel++){
  const x=pixel%width,y=Math.floor(pixel/width),slot=count-pixel-1,h=slot*60,o=pixel*4;
  const color=y>=64&&y<96?[.3,.3,.3]:[(x%2?76:90)/255,(x%2?28:36)/255,0];
  const light=x<64?2:4,noise=y>=32&&y<64?(((Math.imul(pixel+1,1664525)+1013904223)>>>8)%101/100-.5):0;
  const value=y>=64&&y<96?[32,24,18]:color.map((v,c)=>c===2?0.02:Math.max(v,.1)*light);
  truth.set([...value,1],o);raw.set([...value.map(v=>v*(1+noise)),1],o);words[pixel]=1|(1<<9);
  hitWords[h+1]=pixel;hits[h+12]=x<64?1:4;
  hits.set(x<64?[0,0,1,0]:[1,0,0,0],h+20);
  hits.set([x%2?.8:-.8,0,.6,0],h+24); // deliberately discontinuous fibre normal
  hits.set([...color,1],h+40);hits.set([.8,0,1,1.5],h+48);hits.set([1,.329,.1,0],h+52);
  if(y>=96){
   // Protected sheen combinations: low roughness, metal, transparency,
   // transmission, coat, emissive material, miss, later camera sample.
   const kind=Math.floor(x/16);
   if(kind===0)hits[h+48]=.6;
   if(kind===1)hits[h+49]=1;
   if(kind===2)hits[h+50]=.5;
   if(kind===3)hits[h+58]=1;
   if(kind===4)hits[h+55]=1;
   if(kind===5)hitWords[h+4]=1;
   if(kind===6)hitWords[h+2]=1;
   if(kind===7)rays[slot*24+3]=1;
   if(x===0)words[pixel]=1; // incomplete
   if(x===1)words[pixel]=0x80000000;
  }
 }
 return {width,height,raw,truth,hits,rays,words};
}

export function evaluateClothProbe(probe,output,guides,normals) {
 let inputError=0,outputError=0,textureRelativeError=0,constantError=0,protectedError=0,guideFailures=0,invalid=0;
 for(let p=0;p<probe.width*probe.height;p++){
  const y=Math.floor(p/probe.width),x=p%probe.width,o=p*4;
  const eligible=y<96;
  if(Math.abs(guides[o+3]-(eligible?128/255:0))>0.001)guideFailures++;
  if(eligible&&(Math.abs(normals[o+(x<64?2:0)]-1)>0.001))guideFailures++;
  if(y>=96&&x<2){if(output[o+3]!==0)invalid++;continue;}
  for(let c=0;c<3;c++){
   const error=Math.abs(output[o+c]-probe.truth[o+c]);
   if(!Number.isFinite(error))throw Error('Nonfinite cloth result');
   // Exclude cross-band borders; include x=63/64 geometric boundary.
   if(y>=10&&y<22)textureRelativeError=Math.max(textureRelativeError,error/Math.max(probe.truth[o+c],.01));
   if(y>=42&&y<54){inputError+=(probe.raw[o+c]-probe.truth[o+c])**2;outputError+=error**2;}
   if(y>=74&&y<86)constantError=Math.max(constantError,error);
   if(y>=96)protectedError=Math.max(protectedError,Math.abs(output[o+c]-probe.raw[o+c]));
  }
 }
 const rmseRatio=Math.sqrt(outputError/inputError);
 const result={textureRelativeError,constantError,protectedError,guideFailures,invalid,rmseRatio};
 if(textureRelativeError>.005||constantError>.001||protectedError>.002||guideFailures||invalid||!(rmseRatio<.65))throw Error('Cloth probe failed: '+JSON.stringify(result));
 return {passed:true,...result,scope:'synthetic-cloth-correctness-not-native-performance-or-convergence'};
}

export async function runClothDenoiseProbe(signal) {
 const {createGuidedSpatialDenoiser}=await import('/src/wavefront-guided-denoise.js');
 const {createTextureReader}=await import('./native-guided-postprocess.js');
 const {assertShaderModuleCompiles}=await import('/src/wavefront-runtime-support.js');
 const adapter=await navigator.gpu.requestAdapter();if(adapter?.info.isFallbackAdapter!==false)throw Error('Physical GPU required');
 const device=await adapter.requestDevice(),owned=[],probe=createClothProbe();let denoiser;
 const wait=async promise=>{let timer;try{const v=await Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Cloth probe timeout')),30000))]);if(signal.aborted)throw Error('Cloth probe cancelled');return v;}finally{clearTimeout(timer);}};
 const buffer=(data,usage)=>{const b=device.createBuffer({size:typeof data==='number'?data:data.byteLength,usage:usage|GPUBufferUsage.COPY_DST});owned.push(b);if(typeof data!=='number')device.queue.writeBuffer(b,0,data);return b;};
 const texture=format=>{const t=device.createTexture({size:[128,128],format,usage:GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.TEXTURE_BINDING});owned.push(t);return t;};
 const read=async(b,size)=>{const staging=buffer(size,GPUBufferUsage.MAP_READ);const e=device.createCommandEncoder();e.copyBufferToBuffer(b,0,staging,0,size);device.queue.submit([e.finish()]);await wait(staging.mapAsync(GPUMapMode.READ));const data=staging.getMappedRange().slice(0);staging.unmap();return data;};
 try{
  device.pushErrorScope('validation');
  const raw=texture('rgba16float'),scratch=texture('rgba16float'),display=texture('rgba8unorm');
  const frame=new Uint32Array(80);frame.set([128,128]);const counters=new Uint32Array(32);counters[0]=16384;
  denoiser=await wait(createGuidedSpatialDenoiser(device,{texture:GPUTextureUsage,buffer:GPUBufferUsage,shader:GPUShaderStage},{
   'renderer.denoise.guidedSpatial.enabled':true,width:128,height:128,inputView:raw.createView(),scratchView:scratch.createView(),outputView:display.createView(),pixelState:buffer(probe.words,GPUBufferUsage.STORAGE),
   frameBuffer:buffer(frame,GPUBufferUsage.UNIFORM),rayBuffer:buffer(probe.rays,GPUBufferUsage.STORAGE),hitBuffer:buffer(probe.hits,GPUBufferUsage.STORAGE),counterBuffer:buffer(counters,GPUBufferUsage.STORAGE)}));
  const source=buffer(probe.raw,GPUBufferUsage.STORAGE),module=device.createShaderModule({code:`
   @group(0) @binding(0) var<storage,read> source:array<vec4<f32>>;
   @group(0) @binding(1) var raw:texture_storage_2d<rgba16float,write>;
   @compute @workgroup_size(64) fn initialize(@builtin(global_invocation_id) id:vec3<u32>){if(id.x>=16384u){return;}
   textureStore(raw,vec2<i32>(i32(id.x%128u),i32(id.x/128u)),source[id.x]);}`});
  await wait(assertShaderModuleCompiles(module,'cloth-input'));
  const pipeline=await wait(device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'initialize'}}));
  const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:source}},{binding:1,resource:raw.createView()}]});
  const e=device.createCommandEncoder();let p=e.beginComputePass();p.setPipeline(pipeline);p.setBindGroup(0,group);p.dispatchWorkgroups(256);p.end();
  const capture=denoiser.capture(0);p=e.beginComputePass();p.setPipeline(capture.pipeline);p.setBindGroup(0,capture.bindGroup,[0]);p.dispatchWorkgroups(256);p.end();
  denoiser.encode(e);device.queue.submit([e.finish()]);await wait(device.queue.onSubmittedWorkDone());
  const reader=await createTextureReader({device,makeBuffer:buffer,read,wait,width:128,height:128});
  const output=await reader(denoiser.filteredView),guides=await reader(denoiser.albedoTexture.createView()),normals=await reader(denoiser.normalTexture.createView());
  const error=await wait(device.popErrorScope());if(error)throw Error(error.message);
  return evaluateClothProbe(probe,output,guides,normals);
 }finally{denoiser?.destroy();owned.forEach(r=>r.destroy());device.destroy();}
}
