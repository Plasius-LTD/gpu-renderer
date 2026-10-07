import {createWavefrontPathTracingComputeShaderSource} from '../../src/wavefront-shaders.js';
import {createConfigPayload} from '../../src/wavefront-packers.js';
import {assertShaderModuleCompiles} from '../../src/wavefront-runtime-support.js';

// Failure-only geometric replay. No image is accepted from these diagnostics;
// roulette, lighting and energy are not reproduced or qualified here.
export function opticalReplayShader({root,sampler,splitting}) {
 if(!Number.isInteger(root)||root<0||root>=16384)throw Error('Invalid replay root');
 const split=splitting.enabled;
 return createWavefrontPathTracingComputeShaderSource({progressiveSampling:sampler,roughBounceSplitting:splitting})+`
 @compute @workgroup_size(1) fn replay_optics(@builtin(global_invocation_id) id:vec3<u32>){
  var ray=make_ray(${root}u);var key=0u;var splitLevel=0u;
  for(var step=0u;step<64u;step++){
   accumulation[1536u+id.x]=vec4<f32>(f32(step+1u),0,0,0);
   ${split?'rough_branch_key=key;':''}
   let hit=trace_material_hit(ray);let o=(id.x*64u+step)*6u;
   accumulation[o]=vec4<f32>(f32(hit.hitType),f32(ray.bounce),f32(hit.primitiveId),f32(hit.frontFace));
   accumulation[o+1u]=vec4<f32>(ray.origin.xyz,hit.distance);
   accumulation[o+2u]=vec4<f32>(ray.direction.xyz,f32(medium_stack_current_id(ray)));
   accumulation[o+3u]=vec4<f32>(vec3<f32>(ray.mediumStack.xyz),f32(hit.mediumRefId));
   accumulation[o+4u]=vec4<f32>(hit.position.xyz,f32(medium_transition_failure(ray,hit)));
   accumulation[o+5u]=vec4<f32>(hit.geometricNormal.xyz,-1.0);
   if(hit.hitType==2u||ray.bounce>=config.maxDepth){return;}
   if(recoverable_optical_entry(ray,hit)){
    ray.origin=vec4<f32>(optical_offset(hit.position.xyz,hit.geometricNormal.xyz,ray.direction.xyz),1);continue;
   }
   if(medium_transition_invalid(ray,hit)){return;}
   if(dielectric_event(hit)&&medium_valid(hit.mediumRefId)&&medium_stack_current_id(ray)==transmitted_medium_ref_id(ray,hit)){
    let depth=transitioned_medium_stack_depth(ray,hit);let medium=transmitted_medium_ref_id(ray,hit);
    ray.mediumStack=transitioned_medium_stack(ray,hit);ray.mediumStackDepth=depth;ray.mediumRefId=medium;
    ray.origin=vec4<f32>(optical_offset(hit.position.xyz,hit.geometricNormal.xyz,ray.direction.xyz),1);continue;
   }
   ${split?'if(rough_split_eligible(ray,hit)){key=key*2u+1u+((id.x>>splitLevel)&1u);splitLevel++;rough_branch_key=key;}':''}
   let scatter=scatter_direction(ray,hit);
   accumulation[o+5u].w=f32(scatter.lobeKind);
   if(scatter.lobeKind==SCATTER_LOBE_DELTA_TRANSMISSION){
    let depth=transitioned_medium_stack_depth(ray,hit);let medium=transmitted_medium_ref_id(ray,hit);
    ray.mediumStack=transitioned_medium_stack(ray,hit);ray.mediumStackDepth=depth;ray.mediumRefId=medium;
   }
   ray.origin=vec4<f32>(offset_origin(hit.position.xyz,hit.geometricNormal.xyz,hit.shadingNormal.xyz,scatter.direction.xyz),1);
   ray.direction=scatter.direction;ray.flags=scatter.flags|(key<<8u);ray.bounce++;
  }
 }`;
}
export async function replayOpticalFailure({device,config,tile,seed,sampler,failure,frame,layout,entries,read,wait}){
 const root=(Math.floor(failure.pixel/config.width)-tile.y)*tile.width+failure.pixel%config.width-tile.x;
 const module=device.createShaderModule({code:opticalReplayShader({root,sampler,splitting:config.roughBounceSplitting})});
 await wait(assertShaderModuleCompiles(module,'failure-only-optical-replay'));
 const pipeline=await wait(device.createComputePipelineAsync({layout,compute:{module,entryPoint:'replay_optics'}}));
 const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries});
 device.queue.writeBuffer(frame,0,createConfigPayload(config,tile,seed,{sampleIndex:failure.sample,sampleWeight:1}));
 const e=device.createCommandEncoder(),p=e.beginComputePass();p.setPipeline(pipeline);p.setBindGroup(0,group,[0]);p.dispatchWorkgroups(4);p.end();device.queue.submit([e.finish()]);
 const data=new Float32Array(await read(entries.find(x=>x.binding===3).resource.buffer,(4*64*6+4)*16));
 return {scope:'geometry-and-sampling-only; no roulette, radiance or performance claim',pixel:failure.pixel,sample:failure.sample,
  branches:Array.from({length:4},(_,branch)=>Array.from({length:Math.min(64,data[6144+branch*4])},(_,step)=>Array.from(data.slice((branch*64+step)*24,(branch*64+step+1)*24))))};
}
