import { createWavefrontPathTracingComputeRenderer, type WavefrontMeshInstanceInput, type WavefrontGpuAllocationSnapshot } from '../src/index.js';
const instance: WavefrontMeshInstanceInput = {id:1,meshId:1,transform:new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])};
async function consumer(canvas:HTMLCanvasElement) {
  const renderer=await createWavefrontPathTracingComputeRenderer({canvas,memoryBudgetBytes:512*1024*1024,
    meshes:[{id:1,positions:[-1,0,0,1,0,0,0,1,0],indices:[0,1,2]}],instances:[instance]});
  const snapshot:WavefrontGpuAllocationSnapshot=renderer.getSnapshot().allocations;
  const count:number=renderer.getSnapshot().instanceCount;
  renderer.destroy();return {snapshot,count};
}
void consumer;
