import {CLOTH_INSPECTION_WGSL} from './cloth-inspection-shader.js';
import {inspectionDisplayColor} from './cloth-inspection-settings.js';
import {assertShaderModuleCompiles} from '/src/wavefront-runtime-support.js';

export async function runClothInspectionProbe(signal){
 let device;const owned=[];
 const wait=async promise=>{let timer;try{const v=await Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Cloth inspection probe timeout')),30000))]);if(signal.aborted)throw Error('Cloth inspection cancelled');return v;}finally{clearTimeout(timer);}};
 try{
  const adapter=await wait(navigator.gpu.requestAdapter());if(adapter?.info.isFallbackAdapter!==false)throw Error('Physical GPU required');
  // Assign before cancellation check so a device created during cancellation is destroyed.
  await wait(adapter.requestDevice().then(value=>{device=value;}));device.pushErrorScope('validation');
  const buffer=(size,usage)=>{const b=device.createBuffer({size,usage});owned.push(b);return b;};
  const texture=(format,usage)=>{const t=device.createTexture({size:[4,1],format,usage});owned.push(t);return t;};
  const normals=texture('rgba32float',GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST);
  const albedo=texture('rgba8unorm',GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST);
  const output=texture('rgba8unorm',GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.COPY_SRC);
  const ns=new Float32Array([0,0,1,0,1,0,0,0,0,0,0,0,0,-1,0,0]);
  const colors=new Uint8Array([128,0,255,128,32,64,96,255,255,255,255,0,1,2,3,128]);
  device.queue.writeTexture({texture:normals},ns,{bytesPerRow:64},[4,1]);device.queue.writeTexture({texture:albedo},colors,{bytesPerRow:16},[4,1]);
  const settings=buffer(16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),staging=buffer(256,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);
  const module=device.createShaderModule({code:CLOTH_INSPECTION_WGSL});await wait(assertShaderModuleCompiles(module,'cloth-inspection-probe'));
  const layout=device.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform'}},
   ...[1,2].map(binding=>({binding,visibility:GPUShaderStage.COMPUTE,texture:{sampleType:'unfilterable-float'}})),
   {binding:3,visibility:GPUShaderStage.COMPUTE,storageTexture:{format:'rgba8unorm',access:'write-only'}}]});
  const pipeline=await wait(device.createComputePipelineAsync({layout:device.createPipelineLayout({bindGroupLayouts:[layout]}),compute:{module,entryPoint:'display_material_guides'}}));
  const group=device.createBindGroup({layout,entries:[{binding:0,resource:{buffer:settings}},{binding:1,resource:normals.createView()},{binding:2,resource:albedo.createView()},{binding:3,resource:output.createView()}]});
  let maxByteError=0;
  for(const [mode,name] of ['albedo','normal'].entries()){
   device.queue.writeBuffer(settings,0,new Uint32Array([4,1,mode,0]));const e=device.createCommandEncoder(),p=e.beginComputePass();
   p.setPipeline(pipeline);p.setBindGroup(0,group);p.dispatchWorkgroups(1);p.end();e.copyTextureToBuffer({texture:output},{buffer:staging,bytesPerRow:256},[4,1]);device.queue.submit([e.finish()]);
   await wait(staging.mapAsync(GPUMapMode.READ));const bytes=new Uint8Array(staging.getMappedRange().slice(0,16));staging.unmap();
   for(let i=0;i<4;i++){const expected=inspectionDisplayColor(name,Array.from(ns.slice(i*4,i*4+4)),Array.from(colors.slice(i*4,i*4+4),v=>v/255));
    for(let ch=0;ch<4;ch++)maxByteError=Math.max(maxByteError,Math.abs(bytes[i*4+ch]-Math.round(expected[ch]*255)));}
  }
  const error=await wait(device.popErrorScope());if(error||maxByteError>1)throw Error(error?.message??'Cloth inspection display mismatch');
  return {passed:true,pixels:4,modes:2,maxByteError,scope:'diagnostic-display-only'};
 }finally{owned.forEach(r=>r.destroy());device?.destroy();}
}
