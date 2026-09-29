import { FIXED_PATTERN_WGSL, fixedPatternWords } from "/src/wavefront-fixed-pattern.js";
import { listWavefrontSampleDimensions } from "/src/wavefront-sampling-dimensions.js";

export async function probeFixedPattern() {
  const adapter=await navigator.gpu.requestAdapter();
  if(!adapter || adapter.info.isFallbackAdapter)throw new Error("Physical adapter required");
  const device=await adapter.requestDevice(),buffers=[];
  let timer;
  const bounded=p=>Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error("Fixed pattern GPU probe timeout")),30000);})]).finally(()=>clearTimeout(timer));
  try {
    device.pushErrorScope("validation");
    const dimensions=listWavefrontSampleDimensions().map(d=>d.dimension),count=dimensions.length*8*32;
    const module=device.createShaderModule({code:FIXED_PATTERN_WGSL+`
      const dimensions=array<u32,${dimensions.length}>(${dimensions.map(d=>d+"u").join(",")});
      @group(0) @binding(0) var<storage,read_write> result:array<vec4<u32>>;
      @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3<u32>){
        let i=id.x;if(i>=${count}u){return;}
        let ordinal=i%32u;let bounce=(i/32u)%8u;let dimension=dimensions[i/256u];
        let a=sample_dimension_1d(i,ordinal,bounce,7u,dimension);
        let b=sample_dimension_2d(i+1u,ordinal,bounce,43u,dimension,1u);
        result[i]=vec4<u32>(fixed_pattern_words(ordinal,bounce,dimension),bitcast<u32>(a),bitcast<u32>(b.y));
      }`});
    const info=await bounded(module.getCompilationInfo());if(info.messages.some(m=>m.type==="error"))throw new Error(JSON.stringify(info.messages));
    const pipeline=await bounded(device.createComputePipelineAsync({layout:"auto",compute:{module,entryPoint:"main"}}));
    const size=count*16,output=device.createBuffer({size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}),readback=device.createBuffer({size,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});buffers.push(output,readback);
    const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:output}}]});
    const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(count/64));pass.end();encoder.copyBufferToBuffer(output,0,readback,0,size);device.queue.submit([encoder.finish()]);
    await bounded(readback.mapAsync(GPUMapMode.READ));const actual=new Uint32Array(readback.getMappedRange());
    for(let i=0;i<count;i++){
      const words=fixedPatternWords(i%32,Math.floor(i/32)%8,dimensions[Math.floor(i/256)]);
      const floats=new Uint32Array(Float32Array.from(words,w=>(w>>>8)/2**24).buffer);
      const expected=[...words,...floats];
      if(expected.some((v,j)=>v!==actual[i*4+j]))throw new Error(`Fixed CPU/GPU mismatch at ${i}`);
    }
    readback.unmap();const error=await bounded(device.popErrorScope());if(error)throw new Error(error.message);
    return {status:"passed",comparedWords:count*4,events:dimensions.length,bounces:8,ordinals:32};
  } finally {for(const buffer of buffers)buffer.destroy();device.destroy();}
}
