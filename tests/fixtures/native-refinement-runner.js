import {createRefinementQueue} from '/src/wavefront-refinement-queue.js';
import {createRefinementPipelines,packRefinementConfig} from '/src/wavefront-refinement-gpu.js';
import {packSharedPhase,encodeSharedPhase,encodeSharedSample} from '/src/wavefront-adaptive-shared.js';
import {createAdaptiveTileOutputPipelines} from '/src/wavefront-adaptive-tile-output.js';
import {createTiles,createConfigPayloadBatch} from '/src/wavefront-packers.js';
import {createGpuParallelismCounters} from '/src/wavefront-frame-runtime.js';
import {nativeSampleChunks} from './native-sample-chunks.js';
import {pathQueueCapacity} from '/src/wavefront-optical-interface-budget.js';

const check=(v,m)=>{if(!v)throw Error(m);};
// Native qualification adapter. Budget/governor logic is supplied by gpu-performance.
export async function createNativeRefinementRunner(c) {
 const {device,native,renderer,b,frame,frameEncoder,shared,sharedGroup,sharedPhaseGroup,group,wait,read,active}=c;
 const {width,height,canvas,refinement}=native,maximum=renderer.config.samplesPerPixel,tiles=createTiles(width,height,128);
 check(refinement.policy.enabled&&refinement.policy.sequencePeriodSamplesPerPixel===maximum,'Refinement policy/sequence mismatch');
 const work=createRefinementQueue({enabled:true,width,height,maximumSamplesPerPixel:maximum});
 const gpu=await wait(createRefinementPipelines(device,GPUShaderStage,{enabled:true}));
 const gpuGroup=group(gpu.layout,[[0,b.refinementConfig,112],[1,b.pixelState],[2,b.radianceSums],[3,b.resolvedRadiance],[4,b.refinementStatus],[5,b.primaryControl],[6,b.primaryConfig,32]]);
 const output=await wait(createAdaptiveTileOutputPipelines(device,GPUShaderStage,{enabled:true}));
 const gathered=c.makeBuffer(16384*4,GPUBufferUsage.STORAGE);
 const entries=c.descriptors.get('plasius.wavefront.bind.activeNext').entries;
 const outputGroup=device.createBindGroup({layout:output.outputLayout,entries:[{binding:0,resource:{buffer:b.resolvedRadiance}},{binding:1,resource:entries.find(e=>e.binding===16).resource},{binding:2,resource:entries.find(e=>e.binding===7).resource},{binding:3,resource:{buffer:frame,size:320}}]});
 const gatherGroup=group(output.gatherLayout,[[3,frame,320],[4,b.pixelState],[5,gathered]]);
 let busy=false,needsReset=true,lastKey=null,policy=refinement.policy,config=renderer.config,seed=7;
 const history=[];
 function encodeGpu(encoder,key,groups=1) {
  const p=encoder.beginComputePass({label:`refinement-${key}`});p.setPipeline(gpu[key]);p.setBindGroup(0,gpuGroup,[0]);
  if(key==='targets')p.dispatchWorkgroups(Math.ceil(width/8),Math.ceil(height/8));else p.dispatchWorkgroups(groups);p.end();
 }
 function packTile(tile,range) {
  device.queue.writeBuffer(frame,0,createConfigPayloadBatch(config,tile,seed,{sampleCount:range.sampleLimit,sampleWeight:1}));
  device.queue.writeBuffer(b.primaryConfig,0,packSharedPhase({width,height,tileX:tile.x,tileY:tile.y,tileWidth:tile.width,tileHeight:tile.height,...range}));
 }
 async function validate() {
  const status=new Uint32Array(await read(b.refinementStatus,16));check(status.every(n=>n===0),`Progressive GPU failure: ${[...status]}`);
  const error=await wait(device.popErrorScope());device.pushErrorScope('validation');check(!error&&!c.errors.length,error?.message??c.errors[0]);
 }
 async function publish() {
  const e=device.createCommandEncoder();frameEncoder.encodePresent(e);device.queue.submit([e.finish()]);await wait(device.queue.onSubmittedWorkDone());
 }
 const setupError=await wait(device.popErrorScope());check(!setupError,setupError?.message);device.pushErrorScope('validation');
 return {adapter:c.adapter,memory:{...c.memory,fixtureStagingBytes:c.memory.fixtureStagingBytes+gathered.size,progressiveHistoryBytes:width*height*16,knownBudgetHostBackingBytes:0},
  sceneSnapshot:{triangleCount:renderer.config.triangleCount,bvhNodeCount:renderer.config.bvhNodeCount,maxDepth:config.maxDepth,maximumPathEvents:config.maximumPathEvents,opticalInterfaceBudget:config.opticalInterfaceBudget,samplesPerPixel:maximum,camera:config.camera},
  snapshot:()=>({...work.snapshot(),pending:busy,history:[...history]}),
  async runBatch(plan,{focusPointUv=policy.foveation.focusPointUv,onProgress}={}) {
   active();check(!busy,'Progressive job already pending');check(Number.isSafeInteger(plan.maximumWorkUnits)&&plan.maximumWorkUnits>=0,'Invalid admitted work units');
   if(!plan.canRun)return {...work.snapshot(),phase:plan.phase,issuedWorkUnits:0,elapsedMs:0,budgetReason:plan.budgetReason,estimatedWorkMs:plan.estimatedWorkMs};
   busy=true;const started=performance.now(),before=work.snapshot();let issued=0;
   try {
    c.setMode(false,false);
    const nextPolicy={...policy,foveation:{...policy.foveation,focusPointUv:[...focusPointUv]}};
    const key=JSON.stringify([plan.phase,plan.maximumSamplesPerPixel,plan.tiers,plan.canRun,focusPointUv]);
    if(key!==lastKey||needsReset){
     work.update(plan,focusPointUv);device.queue.writeBuffer(b.refinementConfig,0,packRefinementConfig({width,height,maximumSamplesPerPixel:plan.maximumSamplesPerPixel,tiers:plan.tiers,focus:nextPolicy.foveation,focusImportanceActive:plan.focusImportanceActive,reset:needsReset,epoch:work.snapshot().epoch}));
     if(needsReset)device.queue.writeBuffer(b.refinementStatus,0,new Uint32Array(4));
     const e=device.createCommandEncoder();encodeGpu(e,'targets');device.queue.submit([e.finish()]);await wait(device.queue.onSubmittedWorkDone());
     needsReset=false;lastKey=key;policy=nextPolicy;
    }
    for(;issued<plan.maximumWorkUnits;issued++){
     active();const ticket=work.next();if(!ticket)break;
     try{
      const {tile,range}=ticket;packTile(tile,range);
      const chunks=nativeSampleChunks(range.sampleLimit,pathQueueCapacity(config),config.maxFramePassesPerSubmission,config.opticalInterfaceBudget.enabled);
      const request={pipelines:shared,bindGroup:sharedGroup,phaseBindGroup:sharedPhaseGroup,tile,dispatchBuffer:b.dispatch,counterBuffer:c.counters,frameEncoder,parallelism:createGpuParallelismCounters(),phaseOffset:0};
      for(const chunk of chunks){
       const first=Math.max(chunk.firstSample,range.firstSample),limit=Math.min(chunk.sampleLimit,range.sampleLimit);if(first>=limit)continue;
       active();const e=device.createCommandEncoder();
       if(first===range.firstSample)encodeSharedPhase(e,{...request,frameOffset:first*config.memory.configBufferStride});
       for(let ordinal=first;ordinal<limit;ordinal++)encodeSharedSample(e,{...request,frameOffset:ordinal*config.memory.configBufferStride});
       encodeGpu(e,'fold');
       if(limit===range.sampleLimit){
        encodeGpu(e,'gather',Math.ceil(tile.width*tile.height/64));
        const p=e.beginComputePass();p.setPipeline(output.output);p.setBindGroup(0,outputGroup,[(limit-1)*config.memory.configBufferStride]);p.dispatchWorkgroups(Math.ceil(tile.width*tile.height/64));p.end();
       }
       device.queue.submit([e.finish()]);await wait(device.queue.onSubmittedWorkDone());
      }
      work.complete(ticket);
     }catch(error){work.fail(ticket,error.message);throw error;}
     try{onProgress?.(work.snapshot());}catch(error){work.reset('progress-observer-failure');needsReset=true;lastKey=null;throw error;}
     // One complete coherent view must exist before optional work in another batch.
     if(!before.previewComplete&&work.snapshot().previewComplete){issued++;break;}
    }
    await validate();if(work.snapshot().previewComplete)await publish();
    const result={...work.snapshot(),phase:plan.phase,issuedWorkUnits:issued,elapsedMs:performance.now()-started,budgetReason:plan.budgetReason,estimatedWorkMs:plan.estimatedWorkMs};
    history.push(result);return result;
   }catch(error){
    if(!needsReset){work.reset('gpu-or-job-failure');needsReset=true;lastKey=null;}
    throw error;
   }finally{busy=false;}
  },
  reset({reason='explicit-reset',camera,frameSeed=7}={}) {
   check(!busy,'Drain the active GPU promise before resetting history');
   check(Number.isInteger(frameSeed)&&frameSeed>=0&&frameSeed<=0xffffffff,'Invalid frame seed');
   if(camera)config=renderer.updateCamera(camera);c.setConfig(config);seed=frameSeed;
   work.reset(reason);needsReset=true;lastKey=null;
  },
  async readImage() {
   check(!busy&&work.snapshot().previewComplete,'Coherent coverage required before readback');busy=true;
   try{
    const image=new Float32Array(width*height*4),counts=new Uint16Array(width*height),histogram={};let actualSamples=0;
    for(const tile of tiles){
     active();packTile(tile,{firstSample:0,sampleLimit:1});
     const e=device.createCommandEncoder();encodeGpu(e,'gather',Math.ceil(tile.width*tile.height/64));
     const p=e.beginComputePass();p.setPipeline(output.gather);p.setBindGroup(0,gatherGroup,[0]);p.dispatchWorkgroups(Math.ceil(tile.width*tile.height/64));p.end();device.queue.submit([e.finish()]);
     const words=new Uint32Array(await read(gathered,tile.width*tile.height*4)),local=new Float32Array(await read(b.resolvedRadiance,tile.width*tile.height*16));
     for(let y=0;y<tile.height;y++)for(let x=0;x<tile.width;x++){
      const k=y*tile.width+x,id=(tile.y+y)*width+tile.x+x,count=(words[k]>>>9)&511;
      check(count>0&&count<=maximum&&local[k*4+3]===1,'Incomplete progressive readback');
      counts[id]=count;actualSamples+=count;histogram[count]=(histogram[count]??0)+1;image.set(local.subarray(k*4,k*4+4),id*4);
     }
    }
    await validate();return {width,height,image,counts,actualHistogram:histogram,actualSamples};
   }finally{busy=false;}
  },
  destroy(){check(!busy,'Drain pending refinement before disposal');c.destroy();check(c.owner.snapshot().allocatedBytes===0,'Progressive resources leaked');},
 };
}
