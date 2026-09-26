import { createWavefrontFrameLoop } from "/src/wavefront-frame-loop.js";
import { createPairedProbeRunner } from "./adaptive-paired-runner.js";

const check=(value,message)=>{if(!value)throw new Error(message);};
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),byte=>byte.toString(16).padStart(2,"0")).join("");
const runButton=document.querySelector("#run"),stopButton=document.querySelector("#stop"),status=document.querySelector("#status"),progress=document.querySelector("#progress"),output=document.querySelector("#result");
let loop, stopped=false;
stopButton.addEventListener("click",()=>{stopped=true;loop?.stop().catch(()=>{});});
runButton.addEventListener("click",async()=>{
  runButton.disabled=true;stopButton.disabled=false;stopped=false;
  const cancellation=new AbortController();let runner,heartbeat=null,display=null;
  const receipt={schemaVersion:1,status:"running",timestamp:new Date().toISOString(),scope:"completion-driven-scheduling",hashes:{},lanes:[],failures:[],
    limitations:["128x128 fixed synthetic scene; no site/full-resolution or quality qualification",
      "Heartbeat confirms some independent work ran, not available CPU milliseconds",
      "Tile fraction is not GPU-time percentage; elapsed/budget ratio is not remaining time",
      "Sequential identity verification, not randomized timing or speedup evidence; readback and observers drain before next frame"]};
  try {
    const response=await fetch("/__provenance");check(response.ok,"Missing provenance");receipt.provenance=await response.json();
    for(const path of [import.meta.url,"/src/wavefront-frame-loop.js","/src/wavefront-compute.js","/tests/fixtures/adaptive-paired-runner.js"]){const source=await fetch(path);check(source.ok,"Missing source");receipt.hashes[new URL(path,location.href).pathname]=await hash(await source.arrayBuffer());}
    runner=await createPairedProbeRunner("diffuse-silhouette",cancellation.signal,{pruningVariants:true});receipt.adapter=runner.adapter;receipt.memory=runner.memory;
    for(const [name,mode,pruning] of [["fixed32","fixed","off"],["shared","reduced-shared","off"],["fused","reduced-shared","fused"]]){
      check(!stopped,"Stopped by user");status.textContent=`Verifying ${name}`;
      const before=await runner.run(mode,32,null,pruning,{enabled:true});
      const identity=async frame=>JSON.stringify([await hash(frame.image.buffer),frame.actualSamples,frame.completedCountMin,frame.completedCountMax,frame.rayCounts.bounceHistogram]);
      const expected=await identity(before);
      const lane={name,baseline:{...before,image:Array.from(before.image)},identity:expected,frames:[],heartbeatsDuringGpuWait:0};receipt.lanes.push(lane);
      loop=createWavefrontFrameLoop({enabled:true,targetFrameTimeMs:1000/60,
        renderFrame:options=>runner.run(mode,32,null,pruning,{enabled:true},options.onProgress),
        onFrameComplete:async(frame,snapshot)=>{
          check(await identity(frame)===expected,"HDR/count/ray identity changed");
          check(JSON.stringify(frame.cpuProfile.commands)===JSON.stringify(before.cpuProfile.commands),"GPU command counts changed");
          lane.frames.push({...frame,image:undefined,progress:snapshot});
          if(lane.frames.length===6)loop.stop();
        }});
      heartbeat=setInterval(()=>{if(loop.getProgress().stage==="waiting-gpu")lane.heartbeatsDuringGpuWait++;},1);
      display=setInterval(()=>{progress.textContent=JSON.stringify(loop.getProgress(),null,2);},100);
      const final=await loop.start();clearInterval(heartbeat);heartbeat=null;clearInterval(display);display=null;
      lane.final=final;progress.textContent=JSON.stringify(final,null,2);
      check(!stopped&&final.completedFrames===6,"Stopped before verification completed");
      check(lane.heartbeatsDuringGpuWait>0,"No independent CPU heartbeat observed during GPU waits");
    }
    receipt.status="verified";
  }catch(error){receipt.status="failed";receipt.failures.push(error.message);}
  finally{
    if(heartbeat!==null)clearInterval(heartbeat);if(display!==null)clearInterval(display);
    try{await loop?.stop();runner?.destroy();}catch(error){receipt.status="failed";receipt.failures.push(error.message);}
    loop=null;cancellation.abort();
    if(receipt.provenance)try{
      const board=document.createElement("canvas");board.width=1000;board.height=120;const ctx=board.getContext("2d");ctx.fillStyle="#10151d";ctx.fillRect(0,0,1000,120);ctx.fillStyle="#edf2f7";ctx.font="20px system-ui";ctx.fillText(`Completion-driven loop: ${receipt.status}`,20,45);ctx.fillText("Identity and nonblocking wait verification, not a performance claim",20,85);
      const response=await fetch("/__plasius-capture",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({path:`output/playwright/eames-environments/${receipt.provenance.captureId}/frame-loop-${Date.now()}.png`,dataUrl:board.toDataURL("image/png"),result:receipt})});check(response.ok,"Retention failed");receipt.artifact=await response.json();
    }catch(error){receipt.status="failed";receipt.failures.push(error.message);}
    output.textContent=JSON.stringify({...receipt,lanes:receipt.lanes.map(lane=>({...lane,baseline:{...lane.baseline,image:undefined}}))},null,2);
    status.textContent=receipt.status==="verified"?"Verified: independent CPU work ran during waits; images, counts and commands unchanged.":`Failed: ${receipt.failures.join("; ")}`;
    runButton.disabled=false;stopButton.disabled=true;
  }
});
