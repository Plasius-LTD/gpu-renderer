import { createPairedProbeRunner } from "./adaptive-paired-runner.js";
import { primaryMisCase, verifyPrimaryMisPixels } from "./primary-terminal-mis-cases.js";
import { compareLinearImages, PAIRED_PROBE_LIMITS } from "/lighting/demo/eames-environments/paired-adaptive-metrics.js";
import { createPairedProbeScene } from "/lighting/demo/eames-environments/paired-adaptive-scenes.js";
const button=document.querySelector("#run"),cancel=document.querySelector("#cancel"),progress=document.querySelector("#progress"),result=document.querySelector("#result");
const check=(condition,message)=>{if(!condition)throw new Error(message);};
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",typeof bytes==="string"?new TextEncoder().encode(bytes):bytes)),byte=>byte.toString(16).padStart(2,"0")).join("");
let cancellation;
cancel.addEventListener("click",()=>cancellation?.abort());
button.addEventListener("click",async()=>{
  button.disabled=true;cancel.disabled=false;cancellation=new AbortController();let runner;
  const receipt={status:"running",scope:"shared-scheduler-physical-safety",timestamp:new Date().toISOString(),cases:[],faults:[],failures:[],hashes:{},limits:{absoluteError:PAIRED_PROBE_LIMITS.identityAbsoluteError},limitations:["128x128, not full-resolution qualification","No production budget-policy or performance claim","Fixture-injected pending/overflow/lineage state, not induced hardware device loss"]};
  try{
    receipt.provenance=await (await fetch("/__provenance")).json();
    for(const file of [import.meta.url,"/tests/fixtures/adaptive-paired-runner.js","/tests/fixtures/primary-terminal-mis-cases.js","/src/wavefront-adaptive-shared-shader.js"])
      receipt.hashes[new URL(file,location.href).pathname]=await hash(await (await fetch(file)).text());
    for(const [name,maximum] of [["black",32],["emissive",32],["metal",32],["dielectric",32],["dielectric",128]]){
      progress.textContent=`Checking ${name}, ${maximum} SPP, eight bounces`;
      const analytic=primaryMisCase(name==="black"?"environment":name),color=name==="black"?[0,0,0,1]:[1,1,1,1];
      runner=await createPairedProbeRunner({...analytic.scene,camera:{position:[0,0,3],target:[0,0,0],fovYDegrees:46},probeMaximum:maximum,probeDepth:8,
        environmentLighting:{horizonColor:color,zenithColor:color,sunColor:[0,0,0,1],intensity:1}},cancellation.signal);
      const lane={name,maximum,maxDepth:8,adapter:runner.adapter,memory:runner.memory,frames:[],identity:{}};receipt.cases.push(lane);const images={};
      for(const mode of ["fixed","uniform-shared","reduced","reduced-shared"]){const frame=await runner.run(mode,maximum);images[mode]=frame.image;
        // Alpha is normalized by the runner only after every real completed count is checked.
        const analyticCheck=verifyPrimaryMisPixels(frame.image,1,name==="black"?[0,0,0]:analytic.expected);
        // The helper examines normalized alpha here, not the camera sample count.
        delete analyticCheck.actualCountMin;delete analyticCheck.actualCountMax;analyticCheck.normalizedAlpha=1;
        lane.frames.push({...frame,image:undefined,imageHash:await hash(frame.image.buffer),analyticCheck});}
      for(const [a,b] of [["fixed","uniform-shared"],["reduced","reduced-shared"]]){const identity=compareLinearImages(images[a],images[b]);lane.identity[`${a}/${b}`]=identity;check(identity.maxAbsoluteError<=PAIRED_PROBE_LIMITS.identityAbsoluteError,`${name} identity mismatch`);}
      runner.destroy();runner=null;
    }
    for(const fault of ["stale-count","failed-pixel","uncovered-budget","weighted","skipped-phase","duplicate-ordinal","pending","overflow","lineage"]){
      progress.textContent=`Checking rejection: ${fault}`;
      runner=await createPairedProbeRunner(createPairedProbeScene("smooth-environment"),cancellation.signal);
      receipt.faults.push(await runner.run("reduced-shared",32,fault));runner.destroy();runner=null;
    }
    receipt.status="passed";progress.textContent="Physical safety checks passed. This is not production qualification.";
  }catch(error){receipt.status="failed";receipt.failures.push(String(error.message));progress.textContent=`Safety check failed: ${error.message}`;}
  finally{
    runner?.destroy();cancellation.abort();
    // Retain failed runs as well as successful runs through the existing local bridge.
    if(receipt.provenance){try{const board=document.createElement("canvas");board.width=800;board.height=160;const ctx=board.getContext("2d");ctx.fillStyle="#10151d";ctx.fillRect(0,0,800,160);ctx.fillStyle="#edf2f7";ctx.font="18px system-ui";ctx.fillText(`Shared scheduler safety: ${receipt.status}`,20,40);ctx.fillText(`${receipt.cases.length} scene cases; ${receipt.faults.length} injected faults`,20,80);
      const response=await fetch("/__plasius-capture",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({path:`output/playwright/eames-environments/${receipt.provenance.captureId}/shared-safety-${receipt.timestamp.replaceAll(":","-")}.png`,dataUrl:board.toDataURL("image/png"),result:receipt})});check(response.ok,"Safety evidence retention failed");receipt.artifact=await response.json();
    }catch(error){receipt.status="failed";receipt.failures.push(error.message);}}
    result.textContent=JSON.stringify(receipt,null,2);button.disabled=false;cancel.disabled=true;
  }
});
