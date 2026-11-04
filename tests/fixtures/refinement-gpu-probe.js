import {createRefinementPipelines,packRefinementConfig} from '/src/wavefront-refinement-gpu.js';
import {packSharedPhase} from '/src/wavefront-adaptive-shared.js';
import {createTiles} from '/src/wavefront-packers.js';
const check=(v,m)=>{if(!v)throw Error(m);};
// Small arithmetic/layout control. Deliberately makes no throughput claim.
export async function runRefinementGpuProbe() {
 const adapter=await navigator.gpu.requestAdapter();check(adapter&&!adapter.info.isFallbackAdapter,'Physical GPU required');
 const device=await adapter.requestDevice(),buffers=[];device.pushErrorScope('validation');
 const width=129,height=129,pixels=width*height;
 const buffer=(size,uniform=false)=>{const b=device.createBuffer({size,usage:(uniform?GPUBufferUsage.UNIFORM:GPUBufferUsage.STORAGE)|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});buffers.push(b);return b;};
 const read=async(b,size=b.size)=>{const staging=device.createBuffer({size,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});try{const e=device.createCommandEncoder();e.copyBufferToBuffer(b,0,staging,0,size);device.queue.submit([e.finish()]);await staging.mapAsync(GPUMapMode.READ);return staging.getMappedRange().slice(0);}finally{staging.destroy();}};
 try{
  const p=await createRefinementPipelines(device,GPUShaderStage,{enabled:true}),config=buffer(112,true),state=buffer(pixels*4),sums=buffer(pixels*16),resolved=buffer(16384*16),status=buffer(16),control=buffer(16),tileConfig=buffer(256,true);
  const group=device.createBindGroup({layout:p.layout,entries:[config,state,sums,resolved,status,control,tileConfig].map((b,binding)=>({binding,resource:{buffer:b,...(binding===6?{size:32}:{})}}))});
  const run=async(key,x,y=1)=>{const e=device.createCommandEncoder(),pass=e.beginComputePass();pass.setPipeline(p[key]);pass.setBindGroup(0,group,[0]);pass.dispatchWorkgroups(x,y);pass.end();device.queue.submit([e.finish()]);await device.queue.onSubmittedWorkDone();};
  const focus={focusPointUv:[.5,.5],innerRadius:.15,outerRadius:.6,edgeImportance:0};
  device.queue.writeBuffer(config,0,packRefinementConfig({width,height,maximumSamplesPerPixel:8,tiers:[1,2,4,8],focus,focusImportanceActive:true,reset:true}));await run('targets',Math.ceil(width/8),Math.ceil(height/8));
  const requested=new Uint32Array(await read(state)),histogram={};for(const n of requested){check([1,2,4,8].includes(n),'Invalid target tier');histogram[n]=(histogram[n]??0)+1;}
  check(requested[0]===1&&requested[Math.floor(pixels/2)]===8,'Focus boundary contract');
  const packed=new Uint32Array(pixels),radiance=new Float32Array(pixels*4);
  for(let i=0;i<pixels;i++){const count=requested[i];packed[i]=count|(count<<9);radiance.set([count,2*count,4*count,0],i*4);}
  device.queue.writeBuffer(state,0,packed);device.queue.writeBuffer(sums,0,radiance);
  for(const tile of createTiles(width,height,128)){
   device.queue.writeBuffer(tileConfig,0,packSharedPhase({width,height,tileX:tile.x,tileY:tile.y,tileWidth:tile.width,tileHeight:tile.height,firstSample:0,sampleLimit:1}));await run('gather',Math.ceil(tile.width*tile.height/64));
   const values=new Float32Array(await read(resolved,tile.width*tile.height*16));for(let i=0;i<values.length;i+=4)check(values[i]===1&&values[i+1]===2&&values[i+2]===4&&values[i+3]===1,'Unequal-count normalization failed');
  }
  device.queue.writeBuffer(config,0,packRefinementConfig({width,height,maximumSamplesPerPixel:1,tiers:[1],focus,reset:false,epoch:1}));await run('targets',Math.ceil(width/8),Math.ceil(height/8));
  const retained=new Uint32Array(await read(state));for(let i=0;i<pixels;i++)check(retained[i]===packed[i],'Earned focus samples discarded');
  device.queue.writeBuffer(config,0,packRefinementConfig({width,height,maximumSamplesPerPixel:1,tiers:[1],focus,reset:true,epoch:2}));await run('targets',Math.ceil(width/8),Math.ceil(height/8));
  check(new Uint32Array(await read(state)).every(n=>n===1),'Epoch reset retained counts');
  check(new Uint32Array(await read(status)).every(n=>n===0),'GPU failure status');
  const validation=await device.popErrorScope();check(!validation,validation?.message);
  return {status:'passed',scope:'small-arithmetic-control-not-performance',width,height,pixels,histogram,checks:['GPU tiering','partial tile addressing','unequal actual-count normalization','focus retention','epoch reset'],adapter:{vendor:adapter.info.vendor,architecture:adapter.info.architecture,isFallbackAdapter:adapter.info.isFallbackAdapter}};
 }finally{buffers.forEach(b=>b.destroy());device.destroy();}
}
