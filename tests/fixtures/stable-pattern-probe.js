import { stablePatternWords, stablePatternWgsl } from "/src/wavefront-stable-pattern.js";
import { listWavefrontSampleDimensions, WAVEFRONT_SAMPLE_SEQUENCE_WGSL } from "/src/wavefront-sampling-dimensions.js";

// Physical probe includes source used by assembled shaders, high ordinals,
// high-bit spatial keys, camera words, 1D selectors and exact f32 conversion.
export async function probeStablePattern() {
  const adapter=await navigator.gpu.requestAdapter();
  if(!adapter || adapter.info.isFallbackAdapter)throw new Error("Physical adapter required");
  const device=await adapter.requestDevice(),buffers=[];
  const bounded=async p=>{let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error("Stable pattern GPU probe timeout")),30000);})]);}finally{clearTimeout(timer);}};
  try{
    device.pushErrorScope("validation");
    const dimensions=listWavefrontSampleDimensions().map(d=>d.dimension),ordinals=[0,1,2,7,31,255,65537,0xffffffff],count=dimensions.length*8*ordinals.length;
    const helpers=WAVEFRONT_SAMPLE_SEQUENCE_WGSL.slice(0,WAVEFRONT_SAMPLE_SEQUENCE_WGSL.indexOf("fn random01"));
    for(const cameraOnly of [false,true]){
      const module=device.createShaderModule({code:helpers+stablePatternWgsl(cameraOnly)+`
const dimensions=array<u32,${dimensions.length}>(${dimensions.map(d=>d+"u").join(",")});
const ordinals=array<u32,8>(${ordinals.map(d=>d+"u").join(",")});
@group(0) @binding(0) var<storage,read_write> result:array<vec4<u32>>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x;if(i>=${count}u){return;}
 let pixel=i*747796405u;let ordinal=ordinals[i%8u];let bounce=(i/8u)%8u;let dimension=dimensions[i/64u];
 let a=sample_dimension_1d(pixel,ordinal,bounce,7u,dimension);
 let b=sample_dimension_2d(pixel,ordinal,bounce,43u,dimension,1u);
 result[i]=vec4<u32>(stable_pattern_words(pixel,ordinal,bounce,dimension),bitcast<u32>(a),bitcast<u32>(b.y));
}`});
      const info=await bounded(module.getCompilationInfo());if(info.messages.some(m=>m.type==="error"))throw new Error(JSON.stringify(info.messages));
      const pipeline=await bounded(device.createComputePipelineAsync({layout:"auto",compute:{module,entryPoint:"main"}}));
      const size=count*16,output=device.createBuffer({size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}),readback=device.createBuffer({size,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});buffers.push(output,readback);
      const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:output}}]});
      const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(count/64));pass.end();encoder.copyBufferToBuffer(output,0,readback,0,size);device.queue.submit([encoder.finish()]);
      await bounded(readback.mapAsync(GPUMapMode.READ));const actual=new Uint32Array(readback.getMappedRange());
      for(let i=0;i<count;i++){
        const words=stablePatternWords(Math.imul(i,747796405)>>>0,ordinals[i%8],Math.floor(i/8)%8,dimensions[Math.floor(i/64)],cameraOnly);
        const expected=[...words,...new Uint32Array(Float32Array.from(words,w=>(w>>>8)/2**24).buffer)];
        if(expected.some((v,j)=>v!==actual[i*4+j]))throw new Error(`Stable CPU/GPU mismatch at ${i} cameraOnly=${cameraOnly}`);
      }readback.unmap();
    }
    const error=await bounded(device.popErrorScope());if(error)throw new Error(error.message);
    return {status:"passed",comparedWords:count*8,events:dimensions.length,bounces:8,ordinals,modes:2};
  }finally{for(const buffer of buffers)buffer.destroy();device.destroy();}
}
