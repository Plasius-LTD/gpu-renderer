import {createClothResponseShader,CLOTH_RESPONSE_BINDINGS} from './cloth-response-shader.js';
import {clothResponseSettings,clothResponseMetrics} from './cloth-response-settings.js';
import {assertShaderModuleCompiles} from '../../src/wavefront-runtime-support.js';
import {createConfigPayload} from '../../src/wavefront-packers.js';
import {hashBytes} from './original-eames-scene.js';

// An optional post-setup diagnostic. All existing scene resources are read-only;
// the compiled canonical shader is extended, not patched in the live renderer.
export async function runClothResponse(c,{settings,meshIds,onProgress}){
 settings=clothResponseSettings(settings);
 const {device,renderer,native,descriptors,wait,active}=c,{width,height}=native;
 if(renderer.config.sceneObjectCount!==0)throw Error('Cloth response supports mesh-only scenes');
 if(!meshIds?.length||meshIds.some(id=>!Number.isInteger(id)||id<1))throw Error('Missing cloth mesh IDs');
 const owned=[],capacity=16384,outputBytes=capacity*5*16;
 const buffer=(size,usage)=>{const b=device.createBuffer({size,usage});owned.push(b);return b;};
 try{
  active();const output=buffer(outputBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),staging=buffer(outputBytes,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);
  const frame=buffer(320,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),light=buffer(16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);
  device.queue.writeBuffer(light,0,new Float32Array([...settings.direction,settings.intensity]));
  const module=device.createShaderModule({label:'cloth-response-diagnostic',code:createClothResponseShader()});
  await wait(assertShaderModuleCompiles(module,'cloth-response-diagnostic'));
  // Reuse the canonical resources referenced by the diagnostic entry point;
  // production output and transport buffers are deliberately not bound.
  const entries=descriptors.get('plasius.wavefront.bind.activeNext').entries;
  const pipeline=await wait(device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'cloth_response'}}));
  const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[
   ...entries.filter(e=>CLOTH_RESPONSE_BINDINGS.includes(e.binding)).map(e=>e.binding===3?{binding:3,resource:{buffer:output}}:e.binding===5?{binding:5,resource:{buffer:frame}}:e),
   {binding:46,resource:{buffer:light}}]});
  const images=Array.from({length:4},()=>new Float32Array(width*height*4)),mask=new Uint32Array(width*height),ids=new Set(meshIds);
  const stats={eligiblePixels:0,normalSamples:0,meanMappedTiltDegrees:0,meanCorrectionDegrees:0,maxCorrectionDegrees:0,correctedSamples:0,thresholdDegrees:.1};
  const tiles=[],config={...renderer.config,samplesPerPixel:settings.samples};const started=performance.now();
  for(let y=0;y<height;y+=128)for(let x=0;x<width;x+=128){
   active();const tile={x,y,width:Math.min(128,width-x),height:Math.min(128,height-y)},pixels=tile.width*tile.height;
   device.queue.writeBuffer(frame,0,createConfigPayload(config,tile,7,{sampleIndex:0,sampleWeight:1}));
   const e=device.createCommandEncoder(),p=e.beginComputePass();p.setPipeline(pipeline);p.setBindGroup(0,group);p.dispatchWorkgroups(Math.ceil(pixels/64));p.end();
   e.copyBufferToBuffer(output,0,staging,0,pixels*80);device.queue.submit([e.finish()]);
   await wait(staging.mapAsync(GPUMapMode.READ));const data=new Float32Array(staging.getMappedRange(0,pixels*80).slice(0));staging.unmap();
   if(!data.every(v=>Number.isFinite(v)&&v>=0))throw Error('Invalid cloth GPU output');
   for(let local=0;local<pixels;local++){
    const pixel=(y+Math.floor(local/tile.width))*width+x+local%tile.width,base=local*20;
    for(let mode=0;mode<4;mode++){images[mode].set(data.subarray(base+mode*4,base+mode*4+3),pixel*4);images[mode][pixel*4+3]=1;}
    mask[pixel]=data[base+11];
    if(ids.has(mask[pixel])){stats.eligiblePixels++;stats.normalSamples+=settings.samples;stats.meanMappedTiltDegrees+=data[base+16];stats.meanCorrectionDegrees+=data[base+17];stats.maxCorrectionDegrees=Math.max(stats.maxCorrectionDegrees,data[base+18]);stats.correctedSamples+=data[base+19];}
   }
   tiles.push({tile,primaryRays:pixels*settings.samples,sha256:await hashBytes(data.buffer)});
   onProgress?.({completedTiles:tiles.length,totalTiles:Math.ceil(width/128)*Math.ceil(height/128)});
  }
  if(!stats.eligiblePixels)throw Error('No visible cloth normals');
  stats.meanMappedTiltDegrees/=stats.eligiblePixels;stats.meanCorrectionDegrees/=stats.eligiblePixels;
  const error=await wait(device.popErrorScope());device.pushErrorScope('validation');if(error)throw Error(error.message);
  const metrics=clothResponseMetrics(images,mask,width,height,meshIds);
  if(settings.samples===1&&images[0].some((v,i)=>v!==images[2][i]||images[1][i]!==images[3][i]))throw Error('Single-sample centre equivalence failed');
  return {images,report:{settings,width,height,meshIds,stats,metrics,tiles,primaryRays:width*height*settings.samples,validationErrors:0,
   diagnosticJobMs:performance.now()-started,memory:{additionalGpuBufferBytes:outputBytes*2+336,hostImageAndMaskBytes:width*height*68,tileReadbackBytes:outputBytes},
   scope:'canonical first-hit BSDF only; one unoccluded white directional light; no shadows, indirect bounces or denoising; not a performance benchmark'}};
 }finally{owned.forEach(r=>r.destroy());}
}
