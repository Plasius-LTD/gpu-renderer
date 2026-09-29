import { createPairedProbeRunner } from "./adaptive-paired-runner.js";
import { compareLinearImages, assessPairedTimings, assessQuality, PAIRED_PROBE_LIMITS } from "/lighting/demo/eames-environments/paired-adaptive-metrics.js";
import { createPairedProbeBudgets } from "/lighting/demo/eames-environments/paired-adaptive-scenes.js";
import { WAVEFRONT_COMPUTE_WGSL } from "/src/wavefront-shaders.js";
import { ADAPTIVE_COMPLETION_WGSL } from "/src/wavefront-adaptive-completion-shader.js";
import { SHARED_ADAPTIVE_WGSL } from "/src/wavefront-adaptive-shared-shader.js";
const sharedComparison=location.pathname.endsWith("adaptive-shared.html");

const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",typeof bytes==="string"?new TextEncoder().encode(bytes):bytes)),byte=>byte.toString(16).padStart(2,"0")).join("");
const check=(condition,message)=>{if(!condition)throw new Error(message);};
const progress=document.querySelector("#progress"),result=document.querySelector("#result"),button=document.querySelector("#run"),cancel=document.querySelector("#cancel"),previews=document.querySelector("#previews");
let cancellation;
cancel.addEventListener("click",()=>cancellation?.abort());
const preview=(scene,images)=>{
  const board=document.createElement("canvas");board.width=800;board.height=610;board.setAttribute("role","img");board.setAttribute("aria-label",`${scene}: fixed, equal-budget adaptive, reduced adaptive, reference, error and sample-budget images`);
  const ctx=board.getContext("2d");ctx.fillStyle="#10151d";ctx.fillRect(0,0,800,610);ctx.fillStyle="#edf2f7";ctx.font="16px system-ui";ctx.fillText(scene,12,22);
  const budgets=createPairedProbeBudgets(128,128,"reduced");
  const labels=["Fixed 32 SPP","Adaptive uniform 32 SPP","Adaptive preassigned 2 / 8 / 32","Reference fixed 256 SPP","Reduced/reference error ×4","Requested SPP (blue=2, red=32)"];
  for(let panel=0;panel<6;panel+=1){const pixels=new Uint8ClampedArray(128*128*4);
    for(let id=0;id<128*128;id+=1){for(let channel=0;channel<3;channel+=1){let value;
      if(panel===4) value=channel===0?Math.min(1,4*Math.max(...[0,1,2].map(c=>Math.abs(images.reduced[id*4+c]-images.reference[id*4+c])))):0;
      else if(panel===5)value=channel===0?budgets[id]/32:channel===2?1-budgets[id]/32:0;
      else{value=images[["fixed","uniform","reduced","reference"][panel]][id*4+channel];value=Math.pow(value/(1+value),1/2.2);}
      pixels[id*4+channel]=Math.round(Math.max(0,Math.min(1,value))*255); }pixels[id*4+3]=255;}
    const tile=document.createElement("canvas");tile.width=tile.height=128;tile.getContext("2d").putImageData(new ImageData(pixels,128,128),0,0);
    const x=12+(panel%3)*264,y=54+Math.floor(panel/3)*280;ctx.fillText(labels[panel],x,y-9);ctx.imageSmoothingEnabled=false;ctx.drawImage(tile,x,y,256,256);
  }
  previews.append(board);return board;
};
button.addEventListener("click",async()=>{
  button.disabled=true;cancel.disabled=false;cancellation=new AbortController();previews.replaceChildren();
  const receipt={status:"running",timestamp:new Date().toISOString(),scope:"prequalification-paired-linear-output",limits:PAIRED_PROBE_LIMITS,scenes:[],failures:[],
    limitations:["128x128 diagnostic scenes, not Eames/full matrix", "Preset budgets, not a production importance policy", "Same corrected transport in both lanes, not released-vs-new transport", "No denoise, motion, temporal reuse or public rollout", "Steady-state GPU interval excludes configuration uploads; linear-output job includes preparation through queue completion", "Setup, readback and canvas presentation excluded; fixed native output writes and adaptive final texture output included", "Single deterministic seed (7); repeated timing runs are not independent noise samples"]};
  let runner;
  try{
    receipt.provenance=await (await fetch("/__provenance")).json();
    receipt.hashes={fixedShader:await hash(WAVEFRONT_COMPUTE_WGSL),completionShader:await hash(ADAPTIVE_COMPLETION_WGSL),sharedShader:await hash(SHARED_ADAPTIVE_WGSL)};
    receipt.sharedComparison=sharedComparison;
    for(const file of [import.meta.url,"/tests/fixtures/adaptive-paired-runner.js","/lighting/demo/eames-environments/paired-adaptive-metrics.js","/lighting/demo/eames-environments/paired-adaptive-scenes.js"]){receipt.hashes[new URL(file,location.href).pathname]=await hash(await (await fetch(file)).text());}
    for(const scene of ["smooth-environment","diffuse-silhouette"]){
      progress.textContent=`Preparing ${scene}`;runner=await createPairedProbeRunner(scene,cancellation.signal);
      const lane={scene,width:128,height:128,maxDepth:4,seed:7,adapter:runner.adapter,memory:runner.memory,measurements:[],warmups:[],quality:{},imageHashes:{}};
      receipt.scenes.push(lane);
      progress.textContent=`Reference convergence: ${scene}, 128 then 256 SPP`;
      const reference128=await runner.run("fixed",128),reference256=await runner.run("fixed",256);
      lane.referenceConvergence=compareLinearImages(reference128.image,reference256.image);
      lane.referenceMeasurements=[{...reference128,image:undefined},{...reference256,image:undefined}];
      lane.imageHashes.reference128=await hash(reference128.image.buffer);lane.imageHashes.reference256=await hash(reference256.image.buffer);
      const modes=sharedComparison?["fixed","uniform-shared","reduced","reduced-shared"]:["fixed","uniform","reduced"],images={reference:reference256.image};
      for(let round=0;round<PAIRED_PROBE_LIMITS.warmups+PAIRED_PROBE_LIMITS.rounds;round+=1){
        for(let offset=0;offset<modes.length;offset+=1){const mode=modes[(round+offset)%modes.length];
          progress.textContent=`${scene}: ${round<2?"warmup":"measurement"} ${round<2?round+1:round-1}, ${mode}`;
          const frame=await runner.run(mode),imageHash=await hash(frame.image.buffer);
          const measurement={...frame,image:undefined,round:round-PAIRED_PROBE_LIMITS.warmups,order:offset,imageHash};
          if(round<PAIRED_PROBE_LIMITS.warmups){lane.warmups.push(measurement);continue;}
          if(!images[mode]){images[mode]=frame.image;lane.imageHashes[mode]=imageHash;lane.quality[mode]=compareLinearImages(frame.image,reference256.image);}
          else check(lane.imageHashes[mode]===imageHash,`${scene}/${mode}: deterministic image changed across repeats`);
          lane.measurements.push(measurement);
        }
      }
      lane.identity=compareLinearImages(images[sharedComparison?"uniform-shared":"uniform"],images.fixed);
      check(lane.identity.maxAbsoluteError<=PAIRED_PROBE_LIMITS.identityAbsoluteError,"Equal-budget identity regression");
      if(sharedComparison){lane.schedulingIdentity=compareLinearImages(images["reduced-shared"],images.reduced);check(lane.schedulingIdentity.maxAbsoluteError<=PAIRED_PROBE_LIMITS.identityAbsoluteError,"Shared scheduling changed the image");}
      const reducedMode=sharedComparison?"reduced-shared":"reduced";
      lane.reducedQuality=assessQuality(lane.quality[reducedMode],lane.quality.fixed,lane.referenceConvergence);
      const times=(mode,field)=>lane.measurements.filter(row=>row.mode===mode).sort((a,b)=>a.round-b.round).map(row=>row[field]);
      lane.timing={};for(const mode of modes.filter(mode=>mode!=="fixed")){lane.timing[mode]={linearOutputJob:assessPairedTimings(times("fixed","linearOutputJobMs"),times(mode,"linearOutputJobMs"))};
        lane.timing[mode].gpu=times(mode,"gpuMs").every(value=>Number.isFinite(value)&&value>0)&&times("fixed","gpuMs").every(value=>Number.isFinite(value)&&value>0)
          ?assessPairedTimings(times("fixed","gpuMs"),times(mode,"gpuMs")):null;}
      if(sharedComparison)lane.schedulerTiming={gpu:lane.timing.reduced.gpu&&lane.timing["reduced-shared"].gpu?assessPairedTimings(times("reduced","gpuMs"),times("reduced-shared","gpuMs")):null,linearOutputJob:assessPairedTimings(times("reduced","linearOutputJobMs"),times("reduced-shared","linearOutputJobMs"))};
      lane.diagnosticImprovementPassed=lane.reducedQuality.passed&&lane.timing[reducedMode].gpu?.timingPassed===true;
      const board=preview(scene,sharedComparison?{...images,uniform:images["uniform-shared"],reduced:images["reduced-shared"]}:images);runner.destroy();runner=null;
      const artifactPath=`output/playwright/eames-environments/${receipt.provenance.captureId}/${scene}.png`;
      const uploaded=await fetch("/__plasius-capture",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({path:artifactPath,dataUrl:board.toDataURL("image/png"),result:{receipt:{...receipt,scenes:[lane]},linearImages:Object.fromEntries(Object.entries(images).map(([name,image])=>[name,Array.from(image)])),reference128:Array.from(reference128.image)}})});
      check(uploaded.ok,"Evidence retention failed");lane.artifact=await uploaded.json();
      const note=document.createElement("p");note.textContent=`${scene}: equal-budget identity passed${sharedComparison?"; shared/legacy reduced identity passed":""}; reduced quality ${lane.reducedQuality.passed?"passed":"FAILED"}; diagnostic GPU-time gate ${lane.timing[reducedMode].gpu?.timingPassed?"passed":"not passed"}.`;previews.append(note);
    }
    receipt.status="measured";progress.textContent="Measurements complete. Read quality and timing gates separately; this does not approve production claims.";
  }catch(error){receipt.status="failed";receipt.failures.push(String(error.message));progress.textContent=`Measurement failed: ${error.message}`;}
  finally{runner?.destroy();cancellation.abort();result.textContent=JSON.stringify(receipt,null,2);button.disabled=false;cancel.disabled=true;}
});
