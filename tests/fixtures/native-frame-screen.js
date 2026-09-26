import { createWavefrontPathTracingComputeRenderer } from "/src/wavefront-compute.js";
import { createPairedProbeScene } from "/lighting/demo/eames-environments/paired-adaptive-scenes.js";
import { NATIVE_FRAME_TARGETS, summarizeNativeFrameScreen } from "/lighting/demo/eames-environments/native-frame-screen.js";

const check=(value,message)=>{if(!value)throw new Error(message);};
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),byte=>byte.toString(16).padStart(2,"0")).join("");
const runButton=document.querySelector("#run"),stopButton=document.querySelector("#stop"),status=document.querySelector("#status"),canvas=document.querySelector("#canvas"),output=document.querySelector("#result");
let stopped=false;
stopButton.addEventListener("click",()=>{stopped=true;status.textContent="Stopping after the current full frame completes.";});
runButton.addEventListener("click",async()=>{
  runButton.disabled=true;stopButton.disabled=false;stopped=false;
  let renderer,device;
  const receipt={schemaVersion:1,status:"running",timestamp:new Date().toISOString(),scope:"native-fixed-renderer-shortfall-screen",hashes:{},lanes:[],failures:[],
    limitations:["Simple diffuse-silhouette scene, not the Eames/product scene or final qualification",
      "One warmup and three measured frames per native resolution; not sustained 60 Hz proof",
      "Renderer promise includes present GPU commands, not physical display/compositor delivery or application work",
      "Timed diagnostics off: actual rays/counts/overflow and GPU-only timestamps are unmeasured, not inferred",
      "PNG is illustrative; no linear-HDR quality qualification; no adaptive full-frame comparison"]};
  const show=()=>{output.textContent=JSON.stringify(receipt,null,2);};
  try {
    const response=await fetch("/__provenance");check(response.ok,"Missing provenance");receipt.provenance=await response.json();
    for(const path of [import.meta.url,"/src/wavefront-compute.js","/src/wavefront-frame-dispatcher.js","/lighting/demo/eames-environments/paired-adaptive-scenes.js","/lighting/demo/eames-environments/native-frame-screen.js"]){const source=await fetch(path);check(source.ok,"Missing source");receipt.hashes[new URL(path,location.href).pathname]=await hash(await source.arrayBuffer());}
    const adapter=await navigator.gpu?.requestAdapter({powerPreference:"high-performance"});
    check(adapter?.info.isFallbackAdapter===false,"Physical WebGPU unavailable");
    receipt.adapter={vendor:adapter.info.vendor,architecture:adapter.info.architecture,isFallbackAdapter:false};
    for(const [name,{width,height}] of Object.entries(NATIVE_FRAME_TARGETS)){
      check(!stopped,"Stopped by user");status.textContent=`Preparing native ${name}: ${width}×${height}`;
      const errors=[];let loss=null;
      const observedAdapter={limits:adapter.limits,features:adapter.features,info:adapter.info,requestDevice:async descriptor=>{
        device=await adapter.requestDevice(descriptor);
        device.addEventListener("uncapturederror",event=>errors.push(event.error.message));
        device.lost.then(info=>{if(info.reason!=="destroyed")loss=info.reason;});return device;
      }};
      renderer=await createWavefrontPathTracingComputeRenderer({...createPairedProbeScene("diffuse-silhouette"),canvas,width,height,
        tileSize:128,maxDepth:4,samplesPerPixel:32,denoise:false,deferredPathResolve:true,strictPhysicalLowSppLighting:true,
        navigator:{gpu:{requestAdapter:async()=>observedAdapter,getPreferredCanvasFormat:()=>navigator.gpu.getPreferredCanvasFormat()}}});
      const snapshot=renderer.getSnapshot();check(snapshot.width===width&&snapshot.height===height&&canvas.width===width&&canvas.height===height,"Native dimensions mismatch");
      const lane={name,width,height,canvasWidth:canvas.width,canvasHeight:canvas.height,scene:"diffuse-silhouette",requestedSpp:32,maxDepth:4,denoise:false,
        frameTimeBudgetMs:0,perPixelAdaptive:false,motion:false,history:false,snapshot,warmups:[],measurements:[],actualGpuCounts:"not-read-back",errors};receipt.lanes.push(lane);
      device.pushErrorScope("validation");
      for(let index=0;index<4;index++){
        check(!stopped,"Stopped by user");check(!loss,"Device lost");
        status.textContent=`${name}: ${index===0?"warmup":`measured frame ${index}/3`}, ${snapshot.tiles} tiles, fixed32`;
        const visibility=document.visibilityState,start=performance.now();
        const frame=await renderer.renderFrame({samplesPerPixel:32,minimumSamplesPerPixel:32,frameTimeBudgetMs:0,readStats:false,readOutputProbe:false,awaitGPUCompletion:true});
        const completedFrameMs=performance.now()-start;
        check(frame.renderedSamplesPerPixel===32&&!frame.budgetConstrained,"Fixed32 integrity failed");
        check(!loss&&errors.length===0,"GPU error or device loss");
        (index===0?lane.warmups:lane.measurements).push({completedFrameMs,visibilityBefore:visibility,visibilityAfter:document.visibilityState,
          frame:frame.frame,renderedSpp:frame.renderedSamplesPerPixel,targetSpp:frame.targetSamplesPerPixel,tiles:frame.tiles,
          commandSubmissions:frame.commandSubmissions,timings:frame.timings,gpuWorkerJobs:frame.gpuWorkerJobs});
        show();
      }
      const validation=await device.popErrorScope();check(!validation,validation?.message);
      lane.summary=summarizeNativeFrameScreen({...lane,completedFrameTimesMs:lane.measurements.map(frame=>frame.completedFrameMs)});
      const dataUrl=canvas.toDataURL("image/png");
      const preview=document.createElement("img");preview.src=dataUrl;preview.alt=`Native ${width} by ${height} fixed32 output, illustrative only`;document.querySelector("#previews").append(preview);
      const retained=await fetch("/__plasius-capture",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({path:`output/playwright/eames-environments/${receipt.provenance.captureId}/native-${name}-${Date.now()}.png`,dataUrl,result:{...receipt,status:"screened",lanes:[lane]}})});check(retained.ok,"Evidence retention failed");lane.artifact=await retained.json();
      renderer.destroy();renderer=null;device.destroy();device=null;show();
    }
    receipt.status="screened-not-qualified";
  }catch(error){receipt.status="failed";receipt.failures.push(error.message);}
  finally{
    renderer?.destroy();device?.destroy();
    if(receipt.provenance)try{
      const board=document.createElement("canvas");board.width=1000;board.height=120;const ctx=board.getContext("2d");ctx.fillStyle="#10151d";ctx.fillRect(0,0,1000,120);ctx.fillStyle="#edf2f7";ctx.font="20px system-ui";ctx.fillText(`Native-resolution screen: ${receipt.status}`,20,45);ctx.fillText("Fixed32 / depth4, full tiled frames; not sustained real-time qualification",20,85);
      const response=await fetch("/__plasius-capture",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({path:`output/playwright/eames-environments/${receipt.provenance.captureId}/native-summary-${Date.now()}.png`,dataUrl:board.toDataURL("image/png"),result:receipt})});check(response.ok,"Summary retention failed");receipt.artifact=await response.json();
    }catch(error){receipt.status="failed";receipt.failures.push(error.message);}
    show();status.textContent=receipt.status==="screened-not-qualified"?receipt.lanes.map(lane=>`${lane.name}: ${lane.summary.timing.mean.toFixed(2)} ms mean, ${lane.summary.deadlineMisses}/3 over budget`).join("; "):`Failed: ${receipt.failures.join("; ")}`;
    runButton.disabled=false;stopButton.disabled=true;
  }
});
