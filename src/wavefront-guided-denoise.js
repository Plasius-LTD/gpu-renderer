import {GUIDED_CAPTURE_WGSL,GUIDED_FILTER_WGSL} from './wavefront-guided-denoise-shader.js';
import {assertShaderModuleCompiles} from './wavefront-runtime-support.js';

export function resolveGuidedDenoise(options={}) {
  const flag='renderer.denoise.guidedSpatial.enabled',flags=options.featureFlags;
  const enabled=(options[flag]??flags?.[flag]??flags?.enabled?.[flag]??flags?.flags?.[flag]??flags?.renderer?.denoise?.guidedSpatial?.enabled??false)===true;
  if(!enabled)return Object.freeze({enabled:false,additionalBytes:0});
  const {width,height}=options,cap=options.guidedSpatialDenoise?.maximumAdditionalBytes??192*1024**2;
  if(![width,height,cap].every(n=>Number.isSafeInteger(n)&&n>0))throw new RangeError('Invalid guided denoise dimensions/allocation cap.');
  const textureBytes=width*height*(options.scratchView?20:28),additionalBytes=textureBytes+1024;
  if(!Number.isSafeInteger(additionalBytes)||additionalBytes>cap)throw new RangeError('Guided denoise allocation exceeds cap.');
  const strength=options.guidedSpatialDenoise?.strength??2,minimumBlend=options.guidedSpatialDenoise?.minimumBlend??0;
  if(!Number.isFinite(strength)||strength<0||!Number.isFinite(minimumBlend)||minimumBlend<0||minimumBlend>1)throw new RangeError('Invalid guided denoise strength/blend.');
  return Object.freeze({enabled:true,width,height,textureBytes,uniformBytes:1024,additionalBytes,maximumAdditionalBytes:cap,passes:3,strength,minimumBlend});
}

// Internal coordinator API. Own only added resources; caller owns raw radiance,
// completed counts, scratch and transport records. No implicit feature activation.
export async function createGuidedSpatialDenoiser(device,constants,options={}) {
  const memory=resolveGuidedDenoise(options);
  if(!memory.enabled)return null;
  const {width,height}=memory;
  if(Math.max(width,height)>device.limits.maxTextureDimension2D)throw new RangeError('Guided denoise exceeds texture limit.');
  const owned=[];let destroyed=false;
  const destroy=()=>{if(destroyed)return;destroyed=true;for(const resource of owned)resource.destroy();};
  try {
    const texture=(label,format)=>{const t=device.createTexture({label:'guided-denoise.'+label,size:{width,height},format,usage:constants.texture.STORAGE_BINDING|constants.texture.TEXTURE_BINDING|constants.texture.COPY_SRC|constants.texture.COPY_DST});owned.push(t);return t;};
    const normals=texture('normal-depth','rgba16float'),albedo=texture('albedo','rgba8unorm');
    const scratchA=options.scratchView??texture('scratch-a','rgba16float').createView(),scratchB=texture('scratch-b','rgba16float');
    const normalView=normals.createView(),albedoView=albedo.createView(),viewB=scratchB.createView();
    const uniforms=device.createBuffer({label:'guided-denoise.uniforms',size:1024,usage:constants.buffer.UNIFORM|constants.buffer.COPY_DST});owned.push(uniforms);
    const payload=new Uint32Array(256);
    for(const [slot,step] of [1,2,4,0].entries())payload.set([width,height,step,slot===3?0:1],slot*64);
    const floats=new Float32Array(payload.buffer);
    for(let slot=0;slot<4;slot++)floats.set([memory.strength,memory.minimumBlend,0,0],slot*64+4);
    device.queue.writeBuffer(uniforms,0,payload);
    const stage=constants.shader.COMPUTE;
    const buffer=(binding,type,size,dynamic=false)=>({binding,visibility:stage,buffer:{type,minBindingSize:size,...(dynamic?{hasDynamicOffset:true}:{})}});
    const sampled=binding=>({binding,visibility:stage,texture:{sampleType:'unfilterable-float'}});
    const storage=(binding,format)=>({binding,visibility:stage,storageTexture:{access:'write-only',format}});
    const captureLayout=device.createBindGroupLayout({entries:[buffer(0,'uniform',320,true),buffer(1,'read-only-storage',96),buffer(2,'read-only-storage',240),buffer(3,'storage',128),storage(4,'rgba16float'),storage(5,'rgba8unorm')]});
    const common=[buffer(0,'uniform',32,true),sampled(1),sampled(2),sampled(3),sampled(4),buffer(5,'read-only-storage',width*height*4)];
    const filterLayout=device.createBindGroupLayout({entries:[...common,storage(6,'rgba16float')]});
    const resolveLayout=device.createBindGroupLayout({entries:[buffer(0,'uniform',32,true),sampled(1),sampled(2),buffer(5,'read-only-storage',width*height*4),storage(7,'rgba8unorm')]});
    const module=async(label,code)=>{const m=device.createShaderModule({label,code});await assertShaderModuleCompiles(m,label);return m;};
    const captureModule=await module('guided-capture',GUIDED_CAPTURE_WGSL),filterModule=await module('guided-filter',GUIDED_FILTER_WGSL);
    const pipeline=(layout,module,entryPoint)=>device.createComputePipelineAsync({label:entryPoint,layout:device.createPipelineLayout({bindGroupLayouts:[layout]}),compute:{module,entryPoint}});
    const capturePipeline=await pipeline(captureLayout,captureModule,'capture_primary_guides');
    const filterPipeline=await pipeline(filterLayout,filterModule,'filter_guided');
    const resolvePipeline=await pipeline(resolveLayout,filterModule,'resolve_guided');
    const captureGroup=device.createBindGroup({layout:captureLayout,entries:[
      {binding:0,resource:{buffer:options.frameBuffer,size:320}},{binding:1,resource:{buffer:options.rayBuffer}},
      {binding:2,resource:{buffer:options.hitBuffer}},{binding:3,resource:{buffer:options.counterBuffer}},
      {binding:4,resource:normalView},{binding:5,resource:albedoView}]});
    const base=[{binding:0,resource:{buffer:uniforms,size:32}},{binding:2,resource:options.inputView},{binding:3,resource:normalView},{binding:4,resource:albedoView},{binding:5,resource:{buffer:options.pixelState}}];
    const filterGroups=[[options.inputView,scratchA],[scratchA,viewB],[viewB,scratchA]].map(([input,output])=>device.createBindGroup({layout:filterLayout,entries:[...base,{binding:1,resource:input},{binding:6,resource:output}]}));
    const resolveGroup=device.createBindGroup({layout:resolveLayout,entries:[...base.filter(e=>e.binding!==3&&e.binding!==4),{binding:1,resource:scratchA},{binding:7,resource:options.outputView}]});
    return Object.freeze({memory,normalTexture:normals,albedoTexture:albedo,filteredView:scratchA,
      // Native sample slots restart per tile; this seam deliberately does not
      // infer sample ordinals for arbitrary external coordinators.
      capture(configOffset){return configOffset===0?{pipeline:capturePipeline,bindGroup:captureGroup}:null;},
      encode(encoder,{filtered=true,timestampWrites}={}){
        if(destroyed)throw new Error('Guided denoiser destroyed.');
        const run=(label,pipeline,group,offset,writes)=>{const p=encoder.beginComputePass({label,...(writes?{timestampWrites:writes}:{})});p.setPipeline(pipeline);p.setBindGroup(0,group,[offset]);p.dispatchWorkgroups(Math.ceil(width/8),Math.ceil(height/8));p.end();};
        if(filtered)for(let i=0;i<3;i++)run('guided-denoise-'+(1<<i),filterPipeline,filterGroups[i],i*256,i===0&&timestampWrites?{querySet:timestampWrites.querySet,beginningOfPassWriteIndex:timestampWrites.beginningOfPassWriteIndex}:undefined);
        const writes=timestampWrites?{querySet:timestampWrites.querySet,...(!filtered?{beginningOfPassWriteIndex:timestampWrites.beginningOfPassWriteIndex}:{}),endOfPassWriteIndex:timestampWrites.endOfPassWriteIndex}:undefined;
        run('guided-denoise-resolve',resolvePipeline,resolveGroup,filtered?0:768,writes);
      },destroy});
  }catch(error){destroy();throw error;}
}
