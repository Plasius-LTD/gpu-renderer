import { WAVEFRONT_SAMPLE_SEQUENCE_WGSL,WAVEFRONT_STABLE_SAMPLE_ROUTING_WGSL } from "/src/wavefront-sampling-dimensions.js";
import { progressiveSampleWords } from "/src/wavefront-progressive-sampling.js";
// Physical integer parity probe; never used as rendering performance evidence.
export async function probeProgressiveSampling(){
  const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw new Error("No physical WebGPU adapter");
  const device=await adapter.requestDevice(),buffers=[],count=4096,size=count*16;
  try{
    device.pushErrorScope("validation");
    const module=device.createShaderModule({code:`
      struct ProbeConfig {transportExperimentFlags:u32,}
      var<private> config:ProbeConfig;
      ${WAVEFRONT_STABLE_SAMPLE_ROUTING_WGSL}
      ${WAVEFRONT_SAMPLE_SEQUENCE_WGSL}
      @group(0) @binding(0) var<storage,read_write> output:array<vec4<u32>>;
      @compute @workgroup_size(64) fn probe(@builtin(global_invocation_id) id:vec3<u32>){
        let i=id.x;if(i>=4096u){return;}
        output[i]=vec4<u32>(progressive_sample_words(i/32u,i%32u,i%4u,7u,22u,false),progressive_sample_words(i/32u,i%32u,i%4u,7u,22u,true));
      }`});
    const info=await module.getCompilationInfo(),errors=info.messages.filter(m=>m.type==="error");
    if(errors.length)throw new Error(errors.map(m=>m.message).join("; "));
    const pipeline=await device.createComputePipelineAsync({layout:"auto",compute:{module,entryPoint:"probe"}});
    const output=device.createBuffer({size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
    const readback=device.createBuffer({size,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});buffers.push(output,readback);
    const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:output}}]});
    const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(count/64);pass.end();encoder.copyBufferToBuffer(output,0,readback,0,size);device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const words=new Uint32Array(readback.getMappedRange());
    for(let i=0;i<count;i++){
      const args=[Math.floor(i/32),i%32,i%4,7,22];
      const expected=[...progressiveSampleWords(...args,"owen-sobol"),...progressiveSampleWords(...args,"independent-random")];
      if(expected.some((word,j)=>word!==words[i*4+j]))throw new Error(`CPU/GPU sample mismatch at ${i}: CPU ${expected}, GPU ${Array.from(words.subarray(i*4,i*4+4))}`);
    }
    readback.unmap();const error=await device.popErrorScope();if(error)throw new Error(error.message);
    return {status:"passed",pairsPerSampler:count,comparedWords:count*4,adapter:adapter.info,validationErrors:0};
  }finally{for(const b of buffers)b.destroy();device.destroy();}
}
