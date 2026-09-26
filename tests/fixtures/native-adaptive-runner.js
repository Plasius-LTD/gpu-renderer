import { createAdaptiveTilePlan } from "/src/wavefront-adaptive-tile-plan.js";
import { createAdaptiveTileOutputPipelines } from "/src/wavefront-adaptive-tile-output.js";
import { createConfigPayload } from "/src/wavefront-packers.js";
import { createGpuParallelismCounters } from "/src/wavefront-frame-runtime.js";
import { createWavefrontCpuProfile } from "/src/wavefront-cpu-profile.js";
import { packSharedPhase,encodeSharedPhase,encodeSharedSample } from "/src/wavefront-adaptive-shared.js";
import { createTimestampSpanEncoder } from "./paired-timestamp-span.js";

const check=(v,m)=>{if(!v)throw new Error(m);};
export async function createNativeAdaptiveRunner(c) {
  const {native,device,renderer,b,frame,counters,accumulation,frameEncoder,shared,sharedGroup,sharedPhaseGroup,
    telemetry,timestampPairs,read,makeBuffer,group,descriptors,wait,active,destroy,errors,owner}=c;
  const {width,height,canvas,budgets}=native,pixelCount=width*height;
  check(canvas.width===width&&canvas.height===height,"Native canvas mismatch");
  check(renderer.config.tileSize===128,"Native tile capacity changed");
  const setupStart=performance.now();
  const plan=createAdaptiveTilePlan({enabled:true,width,height,budgets});
  const words=Uint32Array.from(budgets),uniform=new Uint32Array(pixelCount).fill(32);
  const uniformPlan=plan.map(item=>({...item,expectedPrimaryRays:item.tile.width*item.tile.height*32,ranges:[{firstSample:0,sampleLimit:32}]}));
  const planSetupMs=performance.now()-setupStart;
  const output=await wait(createAdaptiveTileOutputPipelines(device,GPUShaderStage,{enabled:true}));
  const gathered=makeBuffer(16384*4,GPUBufferUsage.STORAGE);
  const traceEntries=descriptors.get("plasius.wavefront.bind.activeNext").entries;
  const outputGroup=device.createBindGroup({layout:output.outputLayout,entries:[{binding:0,resource:{buffer:b.resolvedRadiance}},
    {binding:1,resource:traceEntries.find(e=>e.binding===16).resource},{binding:2,resource:traceEntries.find(e=>e.binding===7).resource},{binding:3,resource:{buffer:frame,size:320}}]});
  const gatherGroup=group(output.gatherLayout,[[3,frame,320],[4,b.pixelState],[5,gathered]]);
  await wait(device.queue.onSubmittedWorkDone());
  const setupError=await wait(device.popErrorScope());check(!setupError,setupError?.message);device.pushErrorScope("validation");
  const memory={...c.memory,fixtureStagingBytes:c.memory.fixtureStagingBytes+gathered.size,
    cachedBudgetHostBytes:budgets.byteLength+words.byteLength+uniform.byteLength};
  return {adapter:c.adapter,memory,planSetupMs,tiles:plan.length,
    sceneSnapshot:{triangleCount:renderer.config.triangleCount,bvhNodeCount:renderer.config.bvhNodeCount,
      displayQuality:renderer.config.displayQuality,accelerationBuildMode:renderer.config.accelerationBuildMode,
      maxDepth:renderer.config.maxDepth,samplesPerPixel:renderer.config.samplesPerPixel,camera:renderer.config.camera},
    async run(mode,{diagnostics=false,profile=false,onProgress,fused=false}={}){
      active();check(["fixed","uniform","radial"].includes(mode),"Invalid native mode");
      const adaptive=mode!=="fixed",selected=mode==="radial"?plan:uniformPlan;
      c.setMode(diagnostics,adaptive&&fused);
      const config={...renderer.config,samplesPerPixel:32};c.setConfig(config);
      const cpu=createWavefrontCpuProfile({enabled:profile}),frameDevice=cpu?cpu.wrapDevice(device):device;
      const stage=(name,fn)=>cpu?cpu.measure(name,fn):fn();
      const asyncStage=(name,fn)=>cpu?cpu.measureAsync(name,fn):fn();
      const image=diagnostics?new Float32Array(pixelCount*4):null,actualHistogram={},tiles=[];
      const started=performance.now(),visibilityBefore=document.visibilityState;
      if(adaptive)frameDevice.queue.writeBuffer(b.pixelState,0,mode==="radial"?words:uniform);
      let readbackMs=0,actualSamples=0;
      for(const [tileIndex,item] of selected.entries()){
        active();const {tile,ranges,expectedPrimaryRays}=item;
        const tilePixels=tile.width*tile.height,groups=Math.ceil(tilePixels/64),samples=adaptive?ranges.at(-1).sampleLimit:32;
        const tileStarted=performance.now(),trace={tileIndex,tile,sampleRounds:samples,expectedPrimaryRays};
        stage("configPacking",()=>{
          const batch=new Uint8Array(samples*config.memory.configBufferStride);cpu?.recordAllocation(batch.byteLength);
          for(let ordinal=0;ordinal<samples;ordinal++){
            const value=createConfigPayload(config,tile,7,{sampleIndex:ordinal,sampleWeight:adaptive?1:1/32});
            cpu?.recordAllocation(value.byteLength);batch.set(new Uint8Array(value),ordinal*config.memory.configBufferStride);
          }
          frameDevice.queue.writeBuffer(frame,0,batch);
          if(adaptive){const phases=new Uint8Array(ranges.length*256);cpu?.recordAllocation(phases.byteLength);
            for(const [i,range] of ranges.entries())phases.set(new Uint8Array(packSharedPhase({width,height,tileX:tile.x,tileY:tile.y,tileWidth:tile.width,tileHeight:tile.height,...range})),i*256);
            frameDevice.queue.writeBuffer(b.primaryConfig,0,phases);
          }
        });
        if(diagnostics)telemetry.beginFrame();
        const parallelism=createGpuParallelismCounters(),lastOffset=(samples-1)*config.memory.configBufferStride;
        const encoder=stage("commandEncoding",()=>{
          const encoder=diagnostics?createTimestampSpanEncoder(frameDevice.createCommandEncoder(),telemetry):frameDevice.createCommandEncoder();
          if(!adaptive){for(let ordinal=0;ordinal<32;ordinal++){
            frameEncoder.encodeTileSample(encoder,tile,ordinal*config.memory.configBufferStride,parallelism);
            if(ordinal===31&&diagnostics)encoder.closeNextPass();
            frameEncoder.encodeTileOutput(encoder,tile,ordinal*config.memory.configBufferStride,parallelism);
          }}else{
            const request={pipelines:shared,bindGroup:sharedGroup,phaseBindGroup:sharedPhaseGroup,tile,dispatchBuffer:b.dispatch,counterBuffer:counters,frameEncoder,parallelism};
            for(const [i,range] of ranges.entries()){
              encodeSharedPhase(encoder,{...request,frameOffset:range.firstSample*config.memory.configBufferStride,phaseOffset:i*256});
              for(let ordinal=range.firstSample;ordinal<range.sampleLimit;ordinal++)encodeSharedSample(encoder,{...request,frameOffset:ordinal*config.memory.configBufferStride,phaseOffset:i*256});
            }
            const resolve=encoder.beginComputePass({label:"native-adaptive-resolve"});resolve.setPipeline(shared.resolve);resolve.setBindGroup(0,sharedGroup,[lastOffset,(ranges.length-1)*256]);resolve.dispatchWorkgroups(groups);resolve.end();
            if(diagnostics)encoder.closeNextPass();
            const publish=encoder.beginComputePass({label:"native-adaptive-output"});publish.setPipeline(output.output);publish.setBindGroup(0,outputGroup,[lastOffset]);publish.dispatchWorkgroups(groups);publish.end();
          }
          return encoder;
        });
        frameDevice.queue.submit([encoder.finish()]);
        await asyncStage("gpuWait",()=>wait(device.queue.onSubmittedWorkDone()));
        trace.renderIntervalMs=performance.now()-tileStarted;trace.parallelism=parallelism;
        if(diagnostics){const readStarted=performance.now();
          const measured=await asyncStage("telemetryReadback",()=>wait(telemetry.readFrame({expectedPrimaryRays,expectedRayCounts:samples*config.maxDepth,waitForSubmittedGpuWork:()=>wait(device.queue.onSubmittedWorkDone())})));
          check(measured.rayCounts.status==="available",measured.rayCounts.reason);
          trace.telemetry=measured;trace.rawTimestampPair=timestampPairs.at(-1)??null;
          await asyncStage("outputReadback",async()=>{
            let counts;
            if(adaptive){const gather=device.createCommandEncoder(),pass=gather.beginComputePass();pass.setPipeline(output.gather);pass.setBindGroup(0,gatherGroup,[lastOffset]);pass.dispatchWorkgroups(groups);pass.end();device.queue.submit([gather.finish()]);counts=new Uint32Array(await read(gathered,tilePixels*4));}
            const local=new Float32Array(await read(adaptive?b.resolvedRadiance:accumulation,tilePixels*16));
            for(let y=0;y<tile.height;y++)for(let x=0;x<tile.width;x++){
              const localId=y*tile.width+x,id=(tile.y+y)*width+tile.x+x,requested=mode==="radial"?budgets[id]:32;
              const completed=adaptive?(counts[localId]>>>9)&511:local[localId*4+3];
              check(completed===requested&&(!adaptive||(!(counts[localId]&0x80000000)&&(counts[localId]&511)===requested&&local[localId*4+3]===1)),`Incomplete native pixel ${id}`);
              for(let channel=0;channel<3;channel++){const value=local[localId*4+channel];check(Number.isFinite(value)&&value>=0,"Invalid native radiance");image[id*4+channel]=value;}
              image[id*4+3]=1;actualHistogram[completed]=(actualHistogram[completed]??0)+1;actualSamples+=completed;
            }
          });
          readbackMs+=performance.now()-readStarted;
        }
        tiles.push(trace);onProgress?.({mode,diagnostics,completedTiles:tileIndex+1,totalTiles:plan.length});
      }
      // Close the tile query interval before encoding the canonical full-frame present.
      c.setMode(false,adaptive&&fused);
      const present=stage("commandEncoding",()=>{const e=frameDevice.createCommandEncoder();frameEncoder.encodePresent(e);return e;});
      frameDevice.queue.submit([present.finish()]);await asyncStage("gpuWait",()=>wait(device.queue.onSubmittedWorkDone()));
      const elapsed=performance.now()-started,visibilityAfter=document.visibilityState;
      const validation=await wait(device.popErrorScope());device.pushErrorScope("validation");check(!validation&&!errors.length,validation?.message??errors[0]);
      return {mode,fused:adaptive&&fused,diagnostics,profile,width,height,image,completedFrameMs:diagnostics?null:elapsed,readbackInclusiveElapsedMs:diagnostics?elapsed:null,
        diagnosticReadbackMs:diagnostics?readbackMs:null,diagnosticRenderIntervalsMs:diagnostics?elapsed-readbackMs:null,
        actualSamples:diagnostics?actualSamples:null,actualHistogram:diagnostics?actualHistogram:null,tiles,
        ...(cpu?{cpuProfile:cpu.snapshot()}:{}),visibilityBefore,visibilityAfter,validationErrors:0};
    },
    destroy(){destroy();check(owner.snapshot().allocatedBytes===0,"Native adaptive cleanup failed");},
  };
}
