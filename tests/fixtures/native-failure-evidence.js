// Failure-only readback: preserve the original rejection, even if the GPU is lost.
export async function readFailedPathNodes(device, source, wait) {
 const limit=32, size=4+limit*7*4;
 const output=device.createBuffer({size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
 const staging=device.createBuffer({size,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
 try {
  const module=device.createShaderModule({code:`
   struct Failures { count: atomic<u32>, records: array<u32> }
   @group(0) @binding(0) var<storage,read> nodes: array<u32>;
   @group(0) @binding(1) var<storage,read_write> failures: Failures;
   @compute @workgroup_size(64) fn gather(@builtin(global_invocation_id) id:vec3<u32>) {
    let o=id.x*16u;
    if(o+15u>=arrayLength(&nodes) || (nodes[o+3u]&2u)==0u){return;}
    let slot=atomicAdd(&failures.count,1u); if(slot>=32u){return;}
    let d=slot*7u; failures.records[d]=id.x;
    failures.records[d+1u]=nodes[o+12u]; failures.records[d+2u]=nodes[o+13u];
    failures.records[d+3u]=nodes[o+14u]; failures.records[d+4u]=nodes[o+15u]&15u;
    failures.records[d+5u]=nodes[o+15u]>>4u; failures.records[d+6u]=nodes[o+3u];
   }`});
  const pipeline=device.createComputePipeline({layout:'auto',compute:{module,entryPoint:'gather'}});
  const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:source}},{binding:1,resource:{buffer:output}}]});
  const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();
  pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(source.size/64/64));pass.end();
  encoder.copyBufferToBuffer(output,0,staging,0,size);device.queue.submit([encoder.finish()]);
  await wait(staging.mapAsync(GPUMapMode.READ));
  const words=new Uint32Array(staging.getMappedRange().slice(0));staging.unmap();
  return Array.from({length:Math.min(limit,words[0])},(_,i)=>{
   const o=1+i*7;return {node:words[o],pixel:words[o+1],sample:words[o+2],bounce:words[o+3],reason:words[o+4],primitive:words[o+5],flags:words[o+6]};
  });
 } finally {output.destroy();staging.destroy();}
}
export function failedPathNodes(bytes){
 const words=new Uint32Array(bytes),failures=[];
 for(let i=0;i<words.length;i+=16)if((words[i+3]&2)!==0){
  failures.push({node:i/16,pixel:words[i+12],sample:words[i+13],bounce:words[i+14],reason:words[i+15]&15,primitive:words[i+15]>>>4});
  if(failures.length===32)break;
 }
 return failures;
}
export async function retainNativeFailure(error,trace,readDetails){
 const evidence={...trace,counterScope:'last-encoded-camera-sample-only'};
 try{evidence.finalSample=await readDetails();}
 catch(readbackError){evidence.readbackError=readbackError.message;}
 error.captureFailure=evidence;
 return error;
}
