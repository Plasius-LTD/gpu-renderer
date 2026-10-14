import { CONFIG_BUFFER_BYTES } from './wavefront-core.js';
import { createBuffer } from './wavefront-gpu-resources.js';
import { assertShaderModuleCompiles, createComputePipeline } from './wavefront-runtime-support.js';
import { WAVEFRONT_COMPUTE_WGSL } from './wavefront-shaders.js';
import { PROGRESSIVE_WGSL } from './wavefront-progressive-shader.js';

// Accumulate linear, unfiltered radiance. Presentation never feeds back into history.
export async function createWavefrontProgressiveResources({device, constants, config,
  configBuffer, radianceTexture, radianceView, outputView}) {
  if (!config.progressive) return null;
  const layout = device.createBindGroupLayout({entries:[
    {binding:5,visibility:constants.shader.COMPUTE,buffer:{type:'uniform',hasDynamicOffset:true,minBindingSize:CONFIG_BUFFER_BYTES}},
    {binding:14,visibility:constants.shader.COMPUTE,texture:{sampleType:'float'}},
    {binding:15,visibility:constants.shader.COMPUTE,storageTexture:{access:'write-only',format:'rgba16float'}},
    {binding:18,visibility:constants.shader.COMPUTE,storageTexture:{access:'write-only',format:'rgba8unorm'}},
    {binding:45,visibility:constants.shader.COMPUTE,buffer:{type:'storage'}},
    {binding:46,visibility:constants.shader.COMPUTE,buffer:{type:'uniform'}},
  ]});
  const shader=device.createShaderModule({label:'plasius.wavefront.progressiveShader',code:WAVEFRONT_COMPUTE_WGSL+PROGRESSIVE_WGSL});
  await assertShaderModuleCompiles(shader,'plasius.wavefront.progressiveShader');
  const pipeline=await createComputePipeline(device,shader,device.createPipelineLayout({bindGroupLayouts:[layout]}),
    'accumulateProgressiveRadiance','plasius.wavefront.progressive');
  const history=createBuffer(device,constants.buffer.STORAGE,config.width*config.height*16,'plasius.wavefront.progressiveHistory');
  const counts=createBuffer(device,constants.buffer.UNIFORM|constants.buffer.COPY_DST,16,'plasius.wavefront.progressiveCounts');
  const texture=device.createTexture({label:'plasius.wavefront.progressiveRadiance',size:{width:config.width,height:config.height},
    format:'rgba16float',usage:constants.texture.STORAGE_BINDING|constants.texture.COPY_SRC});
  const bindGroup=device.createBindGroup({layout,entries:[
    {binding:5,resource:{buffer:configBuffer,size:CONFIG_BUFFER_BYTES}},
    {binding:14,resource:radianceView},{binding:15,resource:texture.createView()},
    {binding:18,resource:outputView},{binding:45,resource:{buffer:history}},{binding:46,resource:{buffer:counts}},
  ]});
  let samples=0;
  return Object.freeze({
    get samples(){return samples;},
    reset(){samples=0;},
    encode(encoder,offset,batchSamples){
      device.queue.writeBuffer(counts,0,new Uint32Array([samples,batchSamples,0,0]));
      const pass=encoder.beginComputePass({label:'plasius.wavefront.progressivePass'});
      pass.setPipeline(pipeline);pass.setBindGroup(0,bindGroup,[offset]);
      pass.dispatchWorkgroups(Math.ceil(config.width/8),Math.ceil(config.height/8));pass.end();
      encoder.copyTextureToTexture({texture},{texture:radianceTexture},{width:config.width,height:config.height,depthOrArrayLayers:1});
      samples+=batchSamples;
    },
    destroy(){history.destroy();counts.destroy();texture.destroy();},
  });
}
