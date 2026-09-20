import { createWavefrontPathTracingComputeRenderer } from "/src/wavefront-compute.js";
import { createWavefrontFrameEncoder } from "/src/wavefront-frame-encoder.js";
import { createGpuParallelismCounters } from "/src/wavefront-frame-runtime.js";
import { createWavefrontFrameTelemetryResources } from "/src/wavefront-frame-telemetry.js";
import { createConfigPayload } from "/src/wavefront-packers.js";
import { createAdaptiveResourceOwner, packAdaptivePixelState } from "/src/wavefront-adaptive-metadata.js";
import { createAdaptivePrimaryPipelines, packAdaptivePrimaryConfig, encodeAdaptivePrimaryWorklist } from "/src/wavefront-adaptive-primary.js";
import { createAdaptiveBootstrapPipelines } from "/src/wavefront-adaptive-bootstrap.js";
import { createAdaptiveCameraRayPipeline } from "/src/wavefront-adaptive-camera.js";
import { createAdaptivePreparedSampleEncoder } from "/src/wavefront-adaptive-prepared-sample.js";
import { createAdaptiveCompletionPipeline, encodeAdaptiveSampleCompletion } from "/src/wavefront-adaptive-completion.js";
import { createAdaptiveResolvePipelines, packAdaptiveResolveConfig } from "/src/wavefront-adaptive-resolve.js";
import { WAVEFRONT_SHADER_KERNELS_WGSL } from "/src/wavefront-shader-kernels.js";
import { assertShaderModuleCompiles } from "/src/wavefront-runtime-support.js";
import { createPairedProbeScene, createPairedProbeBudgets } from "/lighting/demo/eames-environments/paired-adaptive-scenes.js";
import { createTimestampSpanEncoder } from "./paired-timestamp-span.js";
import { createSharedSampleRanges, packSharedPhase, createSharedAdaptivePipelines, encodeSharedPhase, encodeSharedSample } from "/src/wavefront-adaptive-shared.js";

const check = (condition, message) => { if (!condition) throw new Error(message); };
export async function createPairedProbeRunner(scene, signal) {
  let device, renderer, owner, telemetry, lost = false, disposed = false;
  const timestampPairs = [];
  const extras = [], errors = [], buffers = new Map(), bindings = new Map(), descriptors = new Map(), pipelines = {}, textures = [];
  const active = () => check(!signal.aborted && !lost && !disposed, "Probe cancelled or device lost");
  const destroy = () => { disposed=true;telemetry?.destroy(); owner?.destroy(); renderer?.destroy(); extras.forEach(buffer=>buffer.destroy()); device?.destroy(); };
  const wait = async promise => {
    let timer;
    try { const value = await Promise.race([promise, new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error("GPU operation exceeded 30 seconds")),30000);})]); active(); return value; }
    finally { clearTimeout(timer); }
  };
  try {
    const adapter = await wait(navigator.gpu?.requestAdapter());
    check(adapter?.info.isFallbackAdapter === false, "Physical WebGPU unavailable");
    const observedAdapter = { limits:adapter.limits, features:adapter.features, info:adapter.info,
      requestDevice: async descriptor => {
        device = await adapter.requestDevice(descriptor); if(disposed || signal.aborted)device.destroy();active();
        device.lost.then(({reason})=>{if(reason!=="destroyed") lost=true;});
        device.addEventListener("uncapturederror",event=>errors.push(event.error.message));
        device.pushErrorScope("validation");
        for(const [method,map] of [["createBuffer",buffers],["createBindGroup",bindings]]) {
          const original=device[method].bind(device);
          device[method]=descriptor=>{const result=original(descriptor); if(descriptor.label){map.set(descriptor.label,result); if(method==="createBindGroup") descriptors.set(descriptor.label,descriptor);}
            if(method==="createBuffer" && descriptor.label==="plasius.wavefront.timestamps.readback"){
              const mapped=result.getMappedRange.bind(result);result.getMappedRange=(...args)=>{const value=mapped(...args);timestampPairs.push(Array.from(new BigUint64Array(value.slice(0,descriptor.size)),String));return value;};
            }
            return result;};
        }
        const createTexture=device.createTexture.bind(device);
        device.createTexture=descriptor=>{textures.push(descriptor); return createTexture(descriptor);};
        const createPipeline=device.createComputePipelineAsync.bind(device);
        device.createComputePipelineAsync=async descriptor=>{const value=await createPipeline(descriptor);pipelines[descriptor.compute.entryPoint]=value;return value;};
        return device;
      } };
    const width=128,height=128,pixels=width*height,tile={x:0,y:0,width,height};
    renderer = await wait(createWavefrontPathTracingComputeRenderer({ ...createPairedProbeScene(scene), canvas:new OffscreenCanvas(width,height), width,height,tileSize:128,maxDepth:4,
      samplesPerPixel:256,denoise:false,deferredPathResolve:true,strictPhysicalLowSppLighting:true,
      navigator:{gpu:{requestAdapter:async()=>observedAdapter,getPreferredCanvasFormat:()=>navigator.gpu.getPreferredCanvasFormat()}} }));
    const rendererBufferBytes=[...buffers.values()].reduce((sum,buffer)=>sum+buffer.size,0);
    const textureInventory=textures.map(item=>({format:item.format,size:item.size,mipLevelCount:item.mipLevelCount??1,sampleCount:item.sampleCount??1}));
    const get=name=>{const value=buffers.get(`plasius.wavefront.${name}`);check(value,`Missing ${name}`);return value;};
    const queue=get("activeQueue"), counters=get("counters"), paths=get("pathVertices"), frame=get("frameConfig"), accumulation=get("accumulation");
    owner=createAdaptiveResourceOwner(device,GPUBufferUsage,{enabled:true,width,height,tilePixelCapacity:pixels,primaryWorklist:true,primaryConfigSlots:3,countResolve:true,resolveConfigSlots:43});
    const resources=await wait(owner.acquire()); check(resources.status==="ready",resources.reason); const b=resources.buffers;
    const compact=await wait(createAdaptivePrimaryPipelines(device,GPUShaderStage,{enabled:true}));
    const bootstrap=await wait(createAdaptiveBootstrapPipelines(device,GPUShaderStage,{enabled:true}));
    const camera=await wait(createAdaptiveCameraRayPipeline(device,GPUShaderStage,{enabled:true}));
    const producer=await wait(createAdaptiveCompletionPipeline(device,GPUShaderStage,{enabled:true}));
    const resolve=await wait(createAdaptiveResolvePipelines(device,GPUShaderStage,{enabled:true}));
    const shared=await wait(createSharedAdaptivePipelines(device,GPUShaderStage,{enabled:true}));
    const group=(layout,entries)=>device.createBindGroup({layout,entries:entries.map(([binding,buffer,size])=>({binding,resource:{buffer,...(size?{size}:{})}}))});
    const compactGroup=group(compact.layout,[[0,b.pixelState],[1,b.worklist],[2,b.primaryControl],[3,b.dispatch],[4,b.primaryConfig,32]]);
    const producerGroup=group(producer.layout,[[0,frame,320],[1,paths],[2,b.pixelState],[3,b.cameraSamples],[4,b.primaryControl],[5,counters],[6,b.resolveConfig,48]]);
    const resolveGroup=group(resolve.layout,[[0,b.pixelState],[1,b.cameraSamples],[2,b.radianceSums],[3,b.resolvedRadiance],[4,b.resolveConfig,48]]);
    const sharedGroup=group(shared.layout,[[0,frame,320],[1,b.primaryConfig,32],[2,b.pixelState],[3,b.worklist],[4,b.primaryControl],[5,b.dispatch],[6,queue],[7,paths],[8,counters],[9,b.radianceSums],[10,b.resolvedRadiance]]);
    const preparedBindings={ bootstrapFrame:group(bootstrap.frameLayout,[[0,queue],[3,accumulation],[5,frame,320],[6,counters],[22,paths]]),
      bootstrapWorklist:group(bootstrap.worklistLayout,[[0,b.worklist],[1,b.primaryControl],[2,b.primaryConfig,32]]),
      cameraFrame:group(camera.rayLayout,[[0,queue],[5,frame,320]]),cameraWorklist:group(camera.worklistLayout,[[0,b.worklist],[1,b.primaryControl],[2,b.primaryConfig,32]]) };
    telemetry=createWavefrontFrameTelemetryResources({device,constants:{buffer:GPUBufferUsage,map:GPUMapMode},maxRayCountRecords:256*4,timestampPassPairs:true});
    check(telemetry.available,"Ray telemetry unavailable");
    let config=renderer.config;
    const frameEncoder=createWavefrontFrameEncoder({getConfig:()=>config,getBindGroups:()=>[bindings.get("plasius.wavefront.bind.activeNext"),bindings.get("plasius.wavefront.bind.nextActive")],
      pipelines,counterBuffer:counters,activeDispatchBuffer:get("activeDispatchArgs"),getFrameTelemetry:()=>telemetry});
    const prepared=createAdaptivePreparedSampleEncoder({enabled:true,bootstrapPipelines:bootstrap,cameraPipeline:camera,frameEncoder,counterBuffer:counters,primaryDispatchBuffer:b.dispatch,getBindGroups:()=>preparedBindings});
    const makeBuffer=(size,usage)=>{const value=device.createBuffer({size,usage});extras.push(value);return value;};
    const copied=makeBuffer(pixels*16,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC), staging=makeBuffer(pixels*16,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);
    const copyModule=device.createShaderModule({code:`@group(0) @binding(0) var<storage,read> copyInput:array<u32>;
      @group(0) @binding(1) var<storage,read_write> copyOutput:array<u32>;
      @compute @workgroup_size(64) fn copy_words(@builtin(global_invocation_id) id:vec3<u32>){if(id.x<arrayLength(&copyInput)){copyOutput[id.x]=copyInput[id.x];}}`});
    await wait(assertShaderModuleCompiles(copyModule,"paired-copy"));
    const copy=await wait(device.createComputePipelineAsync({layout:"auto",compute:{module:copyModule,entryPoint:"copy_words"}}));
    const read=async(source,size)=>{const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(copy);pass.setBindGroup(0,group(copy.getBindGroupLayout(0),[[0,source,size],[1,copied]]));pass.dispatchWorkgroups(Math.ceil(size/256));pass.end();encoder.copyBufferToBuffer(copied,0,staging,0,size);device.queue.submit([encoder.finish()]);
      await wait(staging.mapAsync(GPUMapMode.READ));const value=staging.getMappedRange(0,size).slice(0);staging.unmap();return value;};
    // Fixture adapter only: publish adaptive linear output into the same textures
    // as fixed output. Reuse the exact fixed tone-map function, not a new transfer.
    const toneMap=WAVEFRONT_SHADER_KERNELS_WGSL.slice(WAVEFRONT_SHADER_KERNELS_WGSL.indexOf("fn tone_map_radiance"),WAVEFRONT_SHADER_KERNELS_WGSL.indexOf("fn present_radiance"));
    const outputModule=device.createShaderModule({code:toneMap+`
      @group(0) @binding(0) var<storage,read> inputRadiance:array<vec4<f32>>;
      @group(0) @binding(1) var linearOutput:texture_storage_2d<rgba16float,write>;
      @group(0) @binding(2) var displayOutput:texture_storage_2d<rgba8unorm,write>;
      @compute @workgroup_size(64) fn write_output(@builtin(global_invocation_id) id:vec3<u32>){
        if(id.x>=16384u){return;} let pixel=vec2<i32>(i32(id.x%128u),i32(id.x/128u));let value=inputRadiance[id.x];
        textureStore(linearOutput,pixel,value);textureStore(displayOutput,pixel,vec4<f32>(tone_map_radiance(value.xyz),value.w));}`});
    await wait(assertShaderModuleCompiles(outputModule,"paired-output"));
    const output=await wait(device.createComputePipelineAsync({layout:"auto",compute:{module:outputModule,entryPoint:"write_output"}}));
    const traceEntries=descriptors.get("plasius.wavefront.bind.activeNext").entries;
    const outputGroup=device.createBindGroup({layout:output.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:b.resolvedRadiance}},
      {binding:1,resource:traceEntries.find(item=>item.binding===16).resource},{binding:2,resource:traceEntries.find(item=>item.binding===7).resource}]});
    const tileConfig=tier=>({width,height,tileX:0,tileY:0,tileWidth:width,tileHeight:height,tier});
    const sampleConfig=(tier,ordinal)=>({...tileConfig(tier),selectedTier:tier,sampleOrdinal:ordinal,frameValid:true});
    await wait(device.queue.onSubmittedWorkDone());
    const setupError=await wait(device.popErrorScope());check(!setupError,setupError?.message);device.pushErrorScope("validation");
    return { adapter:{vendor:adapter.info.vendor,architecture:adapter.info.architecture,isFallbackAdapter:false},
      memory:{rendererBufferBytes,textureInventory,adaptiveBufferBytes:resources.allocatedBytes,telemetryBufferBytes:telemetry.memoryBytes,fixtureStagingBytes:extras.reduce((sum,item)=>sum+item.size,0)},
      async run(mode, samples=32, fault=null) {
        active();check(["fixed","uniform","reduced","uniform-shared","reduced-shared"].includes(mode),"Invalid probe mode");
        check(mode==="fixed" || samples===32,"Adaptive ceiling must stay 32");
        const useShared=mode.endsWith("-shared"),budgetMode=mode.replace("-shared","");
        check(!fault || useShared,"Fault injection requires shared mode");
        const started=performance.now();config={...renderer.config,samplesPerPixel:samples};
        const budgets=mode==="fixed"?null:createPairedProbeBudgets(width,height,budgetMode);
        const tiers=budgetMode==="uniform"?[32]:[2,8,32],ranges=createSharedSampleRanges(tiers);
        const expectedPrimaryRays=budgets?budgets.reduce((sum,value)=>sum+value,0):pixels*samples;
        if(budgets) {const words=Uint32Array.from(budgets,requested=>packAdaptivePixelState({requested}));
          if(fault==="stale-count")words[0]|=1<<9;
          if(fault==="failed-pixel")words[0]|=0x80000000;
          if(fault==="uncovered-budget")words[0]=packAdaptivePixelState({requested:3});
          device.queue.writeBuffer(b.pixelState,0,words);}
        const frameBatch=useShared?new Uint8Array(samples*config.memory.configBufferStride):null;
        for(let ordinal=0;ordinal<samples;ordinal+=1) {const payload=createConfigPayload(config,tile,7,{sampleIndex:ordinal,sampleWeight:mode==="fixed"?1/samples:fault==="weighted"?0.5:1});
          if(frameBatch)frameBatch.set(new Uint8Array(payload),ordinal*config.memory.configBufferStride);
          else device.queue.writeBuffer(frame,ordinal*config.memory.configBufferStride,payload);}
        if(frameBatch)device.queue.writeBuffer(frame,0,frameBatch);
        let slot=0;
        if(budgets && !useShared) for(const [tierIndex,tier] of tiers.entries()) {
          device.queue.writeBuffer(b.primaryConfig,tierIndex*256,packAdaptivePrimaryConfig(tileConfig(tier)));
          for(let ordinal=0;ordinal<tier;ordinal+=1,slot+=1) device.queue.writeBuffer(b.resolveConfig,slot*256,packAdaptiveResolveConfig(sampleConfig(tier,ordinal)));
        }
        if(budgets && !useShared)device.queue.writeBuffer(b.resolveConfig,slot*256,packAdaptiveResolveConfig(sampleConfig(0,0)));
        if(useShared){const phaseBatch=new Uint8Array(ranges.length*256);for(const [index,range] of ranges.entries())phaseBatch.set(new Uint8Array(packSharedPhase({...tileConfig(0),...range,...(fault==="skipped-phase"&&index===1?{firstSample:3}:{})})),index*256);device.queue.writeBuffer(b.primaryConfig,0,phaseBatch);}
        telemetry.beginFrame();const encoder=createTimestampSpanEncoder(device.createCommandEncoder(),telemetry),parallelism=createGpuParallelismCounters();
        if(mode==="fixed") for(let ordinal=0;ordinal<samples;ordinal+=1) {
          frameEncoder.encodeTileSample(encoder,tile,ordinal*config.memory.configBufferStride,parallelism);
          if(ordinal===samples-1)encoder.closeNextPass();
          frameEncoder.encodeTileOutput(encoder,tile,ordinal*config.memory.configBufferStride,parallelism);
        } else if(useShared) {
          const sharedRequest={pipelines:shared,bindGroup:sharedGroup,tile,dispatchBuffer:b.dispatch,counterBuffer:counters,frameEncoder,parallelism};
          for(const [index,range] of ranges.entries()) {
            encodeSharedPhase(encoder,{...sharedRequest,frameOffset:range.firstSample*config.memory.configBufferStride,phaseOffset:index*256});
            for(let ordinal=range.firstSample;ordinal<range.sampleLimit;ordinal++)encodeSharedSample(encoder,{...sharedRequest,frameOffset:ordinal*config.memory.configBufferStride,phaseOffset:index*256});
          }
          const pass=encoder.beginComputePass();pass.setPipeline(shared.resolve);pass.setBindGroup(0,sharedGroup,[(samples-1)*config.memory.configBufferStride,(ranges.length-1)*256]);pass.dispatchWorkgroups(pixels/64);pass.end();
          encoder.closeNextPass();const outputPass=encoder.beginComputePass();outputPass.setPipeline(output);outputPass.setBindGroup(0,outputGroup);outputPass.dispatchWorkgroups(pixels/64);outputPass.end();
        } else {
          let resolveSlot=0;
          for(const [tierIndex,tier] of tiers.entries()) {
            encodeAdaptivePrimaryWorklist(encoder,compact,compactGroup,tierIndex*256,tileConfig(tier));
            for(let ordinal=0;ordinal<tier;ordinal+=1,resolveSlot+=1) {
              const frameOffset=ordinal*config.memory.configBufferStride,resolveOffset=resolveSlot*256;
              prepared.encode(encoder,{tile,frameOffset,tileOffset:tierIndex*256,parallelism});
              encodeAdaptiveSampleCompletion(encoder,{producer,resolve,producerGroup,resolveGroup,frameOffset,resolveOffset,tilePixelCount:pixels});
            }
          }
          const pass=encoder.beginComputePass();pass.setPipeline(resolve.resolve);pass.setBindGroup(0,resolveGroup,[slot*256]);pass.dispatchWorkgroups(pixels/64);pass.end();
          encoder.closeNextPass();const outputPass=encoder.beginComputePass();outputPass.setPipeline(output);outputPass.setBindGroup(0,outputGroup);outputPass.dispatchWorkgroups(pixels/64);outputPass.end();
        }
        device.queue.submit([encoder.finish()]);await wait(device.queue.onSubmittedWorkDone());
        const linearOutputJobMs=performance.now()-started;
        const sampleIterations=mode==="fixed"||useShared?samples:tiers.reduce((sum,value)=>sum+value,0);
        const measured=await wait(telemetry.readFrame({expectedPrimaryRays,expectedRayCounts:sampleIterations*4,waitForSubmittedGpuWork:()=>wait(device.queue.onSubmittedWorkDone())}));
        check(measured.rayCounts.status==="available",measured.rayCounts.reason);
        const image=new Float32Array(await read(budgets?b.resolvedRadiance:accumulation,pixels*16));
        const counts=budgets?new Uint32Array(await read(b.pixelState,pixels*4)):null;
        const error=await wait(device.popErrorScope());device.pushErrorScope("validation");check(!error && !errors.length,error?.message??errors[0]);
        for(let id=0;id<pixels;id+=1) {
          if(counts) check(!(counts[id]&0x80000000) && ((counts[id]>>>9)&511)===budgets[id] && image[id*4+3]===1,`Incomplete adaptive pixel ${id}`);
          else {check(image[id*4+3]===samples,`Incomplete fixed pixel ${id}: ${image[id*4+3]} of ${samples}; timestamp ${measured.reason}; raw ${timestampPairs.at(-1)}`);image[id*4+3]=1;}
        }
        return {image,mode,samples,actualSamples:expectedPrimaryRays,sampleIterations,linearOutputJobMs,
          gpuMs:measured.totalGpuTimeMs,timestampStatus:measured.timestampQueryStatus,timestampReason:measured.reason,rawTimestampPair:timestampPairs.at(-1)??null,rayCounts:measured.rayCounts};
      },
      destroy(){destroy();check(owner.snapshot().allocatedBytes===0,"Adaptive cleanup failed");},
    };
  } catch(error){destroy();throw error;}
}
