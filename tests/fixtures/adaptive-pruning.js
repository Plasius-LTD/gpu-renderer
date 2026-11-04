import { createPairedProbeRunner } from "./adaptive-paired-runner.js";
import { compareLinearImages, assessPairedTimings, assessQuality, PAIRED_PROBE_LIMITS } from "/lighting/demo/eames-environments/paired-adaptive-metrics.js";
import { createPrunedContinuationShader } from "/src/wavefront-pruned-continuations.js";
import { primaryMisCase, verifyPrimaryMisPixels } from "./primary-terminal-mis-cases.js";
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",typeof bytes==="string"?new TextEncoder().encode(bytes):bytes)),byte=>byte.toString(16).padStart(2,"0")).join("");
const check=(condition,message)=>{if(!condition)throw new Error(message);};
const progress=document.querySelector("#progress"),result=document.querySelector("#result"),button=document.querySelector("#run"),cancel=document.querySelector("#cancel"),previews=document.querySelector("#previews");
let cancellation;cancel.addEventListener("click",()=>cancellation?.abort());
const modes=[{name:"fixed32",mode:"fixed",variant:"off"},...Object.keys({off:0,zero:0,fused:0,combined:0}).map(variant=>({name:variant,mode:"reduced-shared",variant}))];
function preview(scene,image){const board=document.createElement("canvas");board.width=512;board.height=560;board.setAttribute("role","img");board.setAttribute("aria-label",`${scene}, combined pruning; identity is checked against shared baseline`);const ctx=board.getContext("2d");ctx.fillStyle="#10151d";ctx.fillRect(0,0,512,560);ctx.fillStyle="#edf2f7";ctx.font="16px system-ui";ctx.fillText(scene+": combined pruning",8,25);const bytes=new Uint8ClampedArray(128*128*4);for(let i=0;i<128*128;i++){for(let c=0;c<3;c++){const v=image[i*4+c];bytes[i*4+c]=Math.round(255*Math.pow(v/(1+v),1/2.2));}bytes[i*4+3]=255;}const tile=document.createElement("canvas");tile.width=tile.height=128;tile.getContext("2d").putImageData(new ImageData(bytes,128,128),0,0);ctx.imageSmoothingEnabled=false;ctx.drawImage(tile,0,40,512,512);previews.append(board);return board;}
button.addEventListener("click",async()=>{
  button.disabled=true;cancel.disabled=false;previews.replaceChildren();cancellation=new AbortController();let runner;
  const receipt={status:"running",scope:"independent-pruning-prequalification",timestamp:new Date().toISOString(),limits:PAIRED_PROBE_LIMITS,hashes:{},scenes:[],safety:[],faults:[],failures:[],limitations:["128x128 same-seed diagnostic, not production quality or full-resolution qualification","No temporal reuse, denoise, adaptive importance policy or site activation","GPU interval excludes uploads; job includes preparation/submission; both exclude setup/readback/presentation","Record traffic estimates are logical shader traffic, not physical bus measurements; allocations unchanged"]};
  const save=async(name,board,payload)=>{const response=await fetch("/__plasius-capture",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({path:`output/playwright/eames-environments/${receipt.provenance.captureId}/pruning-${name}.png`,dataUrl:board.toDataURL("image/png"),result:payload})});check(response.ok,"Evidence retention failed");return response.json();};
  try{
    receipt.provenance=await (await fetch("/__provenance")).json();
    for(const [name,options] of Object.entries({fixed:{},zero:{zeroEmptyDispatch:true},fused:{fusedHits:true},combined:{fusedHits:true,zeroEmptyDispatch:true}}))receipt.hashes[name]=await hash(createPrunedContinuationShader(options));
    for(const file of [import.meta.url,"/tests/fixtures/adaptive-paired-runner.js","/lighting/demo/eames-environments/paired-adaptive-metrics.js","/lighting/demo/eames-environments/paired-adaptive-scenes.js"])receipt.hashes[new URL(file,location.href).pathname]=await hash(await(await fetch(file)).text());
    for(const scene of ["smooth-environment","diffuse-silhouette"]){
      progress.textContent=`Preparing ${scene}`;runner=await createPairedProbeRunner(scene,cancellation.signal,{pruningVariants:true});
      const lane={scene,adapter:runner.adapter,memory:runner.memory,width:128,height:128,depth:4,seed:7,measurements:[],warmups:[],identity:{},quality:{},imageHashes:{}};receipt.scenes.push(lane);
      const r128=await runner.run("fixed",128),reference=await runner.run("fixed",256);const images={reference:reference.image};lane.referenceConvergence=compareLinearImages(r128.image,reference.image);lane.referenceMeasurements=[{...r128,image:undefined},{...reference,image:undefined}];lane.imageHashes.reference=await hash(reference.image.buffer);
      for(let round=0;round<PAIRED_PROBE_LIMITS.warmups+PAIRED_PROBE_LIMITS.rounds;round++)for(let order=0;order<modes.length;order++){
        const selected=modes[(round+order)%modes.length];progress.textContent=`${scene}: round ${round+1}, ${selected.name}`;const frame=await runner.run(selected.mode,32,null,selected.variant),imageHash=await hash(frame.image.buffer);
        const row={...frame,image:undefined,name:selected.name,round:round-PAIRED_PROBE_LIMITS.warmups,order,imageHash};
        if(round<PAIRED_PROBE_LIMITS.warmups){lane.warmups.push(row);continue;}lane.measurements.push(row);
        if(!images[selected.name]){images[selected.name]=frame.image;lane.imageHashes[selected.name]=imageHash;lane.quality[selected.name]=compareLinearImages(frame.image,reference.image);}else check(imageHash===lane.imageHashes[selected.name],"Nondeterministic image");
      }
      for(const variant of ["zero","fused","combined"]){lane.identity[variant]=compareLinearImages(images[variant],images.off);check(lane.identity[variant].maxAbsoluteError<=PAIRED_PROBE_LIMITS.identityAbsoluteError,`${variant} changed radiance`);
        const baseline=lane.measurements.find(m=>m.name==="off");for(const m of lane.measurements.filter(m=>m.name===variant))check(JSON.stringify(m.rayCounts.bounceHistogram)===JSON.stringify(baseline.rayCounts.bounceHistogram),`${variant} changed rays`);}
      lane.reducedQuality=assessQuality(lane.quality.combined,lane.quality.fixed32,lane.referenceConvergence);lane.timing={};const times=(name,field)=>lane.measurements.filter(m=>m.name===name).sort((a,b)=>a.round-b.round).map(m=>m[field]);
      for(const variant of ["zero","fused","combined"]){const before=times("off","gpuMs"),after=times(variant,"gpuMs");lane.timing[variant]={gpu:[...before,...after].every(n=>Number.isFinite(n)&&n>0)?assessPairedTimings(before,after):null,job:assessPairedTimings(times("off","linearOutputJobMs"),times(variant,"linearOutputJobMs"))};}
      const board=preview(scene,images.combined);runner.destroy();runner=null;lane.artifact=await save(scene,board,{receipt:{...receipt,scenes:[lane]},linearImages:Object.fromEntries(Object.entries(images).map(([key,value])=>[key,Array.from(value)])),reference128:Array.from(r128.image)});
    }
    for(const [name,maximum] of [["black",32],["emissive",32],["metal",32],["dielectric",32],["dielectric",128]]){
      progress.textContent=`Pruning safety: ${name} ${maximum} SPP`;const analytic=primaryMisCase(name==="black"?"environment":name),color=name==="black"?[0,0,0,1]:[1,1,1,1];
      runner=await createPairedProbeRunner({...analytic.scene,camera:{position:[0,0,3],target:[0,0,0],fovYDegrees:46},probeMaximum:maximum,probeDepth:8,environmentLighting:{horizonColor:color,zenithColor:color,sunColor:[0,0,0,1],intensity:1}},cancellation.signal,{pruningVariants:true});
      const lane={name,maximum,frames:[],identity:{},memory:runner.memory};receipt.safety.push(lane);let fixed,baseline;
      for(const [mode,variant] of [["fixed","off"],["uniform-shared","combined"],["reduced-shared","off"],["reduced-shared","zero"],["reduced-shared","fused"],["reduced-shared","combined"]]){
        const frame=await runner.run(mode,maximum,null,variant);const analyticCheck=verifyPrimaryMisPixels(frame.image,1,name==="black"?[0,0,0]:analytic.expected);delete analyticCheck.actualCountMin;delete analyticCheck.actualCountMax;analyticCheck.normalizedAlpha=1;
        lane.frames.push({...frame,image:undefined,imageHash:await hash(frame.image.buffer),analyticCheck});if(mode==="fixed")fixed=frame.image;else if(mode==="uniform-shared")lane.identity.uniform=compareLinearImages(frame.image,fixed);else if(variant==="off")baseline=frame.image;else lane.identity[variant]=compareLinearImages(frame.image,baseline);
      }
      for(const i of Object.values(lane.identity))check(i.maxAbsoluteError<=PAIRED_PROBE_LIMITS.identityAbsoluteError,"Analytic identity failed");runner.destroy();runner=null;
    }
    for(const fault of ["stale-count","failed-pixel","uncovered-budget","weighted","skipped-phase","duplicate-ordinal","pending","overflow","lineage"]){progress.textContent=`Combined pruning fault: ${fault}`;runner=await createPairedProbeRunner("smooth-environment",cancellation.signal,{pruningVariants:true});receipt.faults.push(await runner.run("reduced-shared",32,fault,"combined"));runner.destroy();runner=null;}
    receipt.status="measured";progress.textContent="Measurements and safety checks complete. See separate quality and timing gates.";
  }catch(error){receipt.status="failed";receipt.failures.push(error.message);progress.textContent=`Pruning test failed: ${error.message}`;}
  finally{
    runner?.destroy();cancellation.abort();if(receipt.provenance){try{const board=document.createElement("canvas");board.width=800;board.height=120;const ctx=board.getContext("2d");ctx.fillStyle="#10151d";ctx.fillRect(0,0,800,120);ctx.fillStyle="#edf2f7";ctx.font="18px system-ui";ctx.fillText(`Pruning: ${receipt.status}; ${receipt.scenes.length} scenes, ${receipt.safety.length} safety cases, ${receipt.faults.length} faults`,12,50);receipt.artifact=await save(`receipt-${receipt.timestamp.replaceAll(":","-")}`,board,receipt);}catch(error){receipt.status="failed";receipt.failures.push(error.message);}}
    result.textContent=JSON.stringify(receipt,null,2);button.disabled=false;cancel.disabled=true;
  }
});
