// Never reuse a consumed GPUAdapter when the next resolution creates a device.
export async function forEachNativeFrameTarget(gpu, targets, run, stopped=()=>false) {
  for(const [name,target] of Object.entries(targets)){
    if(stopped())throw new Error("Stopped by user");
    const adapter=await gpu?.requestAdapter({powerPreference:"high-performance"});
    if(adapter?.info.isFallbackAdapter!==false)throw new Error("Physical WebGPU unavailable");
    await run(name,target,adapter);
  }
}
