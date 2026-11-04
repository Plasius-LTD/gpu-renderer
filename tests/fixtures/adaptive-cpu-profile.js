import { createPairedProbeRunner } from "./adaptive-paired-runner.js";
import { summarizeCpuLane } from "./cpu-profile-summary.js";
import { PAIRED_PROBE_LIMITS } from "/lighting/demo/eames-environments/paired-adaptive-metrics.js";

const check = (condition, message) => { if (!condition) throw Error(message); };
const hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2,"0")).join("");
const button = document.querySelector("#run"), cancel = document.querySelector("#cancel"), timeline = document.querySelector("#timeline"), progress = document.querySelector("#progress"), output = document.querySelector("#result");
const modes = [{ name:"fixed32", mode:"fixed", pruning:"off" }, { name:"shared", mode:"reduced-shared", pruning:"off" }, { name:"fused", mode:"reduced-shared", pruning:"fused" }];
let cancellation;
cancel.addEventListener("click", () => cancellation?.abort());
button.addEventListener("click", async () => {
  button.disabled = timeline.disabled = true; cancel.disabled = false;
  cancellation = new AbortController(); let runner;
  const receipt = { schemaVersion:1, status:"running", timestamp:new Date().toISOString(), userTiming:timeline.checked,
    scope:"cpu-attribution-observer-overhead", scenes:[], failures:[], hashes:{},
    limitations:["128x128 synthetic stationary scenes; no site/full-resolution or matched-quality claim",
      "Host elapsed intervals are not CPU utilization; async wait includes GPU and scheduling",
      "Known temporary buffers exclude JS object/GC/driver allocations; GPU resources unchanged",
      "Job excludes setup, diagnostic readback and preview; diagnostic queue copies remain enabled",
      "Profiler command wrappers add overhead; retain off/on and raw measurements; no subtraction correction"] };
  try {
    const response = await fetch("/__provenance"); check(response.ok,"Missing source provenance"); receipt.provenance = await response.json();
    for (const file of [import.meta.url,"/src/wavefront-cpu-profile.js","/src/wavefront-compute.js","/tests/fixtures/adaptive-paired-runner.js","/tests/fixtures/cpu-profile-summary.js"]) {
      const source = await fetch(file); check(source.ok,"Source hash unavailable"); receipt.hashes[new URL(file,location.href).pathname] = await hash(await source.arrayBuffer());
    }
    for (const scene of ["smooth-environment","diffuse-silhouette"]) {
      progress.textContent = `Preparing ${scene}`;
      runner = await createPairedProbeRunner(scene,cancellation.signal,{pruningVariants:true});
      const lane = {scene,adapter:runner.adapter,memory:runner.memory,width:128,height:128,depth:4,seed:7,measurements:[],warmups:[],summaries:{},images:{}};
      receipt.scenes.push(lane);
      const identities = new Map();
      for (let round = 0; round < PAIRED_PROBE_LIMITS.warmups + PAIRED_PROBE_LIMITS.rounds; round++) {
        for (let order = 0; order < modes.length; order++) {
          const mode = modes[(round+order)%modes.length];
          for (const enabled of round%2 ? [true,false] : [false,true]) {
            check(!cancellation.signal.aborted,"Cancelled");
            progress.textContent = `${scene}: round ${round+1}, ${mode.name}, profiling ${enabled?"on":"off"}`;
            const frame = await runner.run(mode.mode,32,null,mode.pruning,{enabled,userTiming:timeline.checked});
            const imageHash = await hash(frame.image.buffer);
            const identity = JSON.stringify([imageHash,frame.completedCountMin,frame.completedCountMax,frame.actualSamples,frame.rayCounts.bounceHistogram]);
            if (!identities.has(mode.name)) { identities.set(mode.name,identity); lane.images[mode.name]={hash:imageHash,linear:Array.from(frame.image)}; }
            check(identities.get(mode.name)===identity,"Profiling changed image/count/rays");
            check(Boolean(frame.cpuProfile)===enabled,"Profiler opt-in failed");
            if (enabled) {
              const p = frame.cpuProfile;
              check(p.commands.submissions===1 && p.stages.gpuWait.calls===1,"Unexpected submission/wait count");
              check(p.commands.computePasses===(mode.name==="fixed32"?192:206),"Pass count drift");
              check(p.commands.directDispatches+p.commands.indirectDispatches===({fixed32:448,shared:462,fused:334}[mode.name]),"Dispatch count drift");
              check(p.commands.uploadCalls===(mode.name==="fixed32"?32:3),"Upload count drift");
            }
            const row = {...frame,image:undefined,imageHash,name:mode.name,profileEnabled:enabled,round:round-PAIRED_PROBE_LIMITS.warmups,order};
            (round<PAIRED_PROBE_LIMITS.warmups?lane.warmups:lane.measurements).push(row);
          }
        }
      }
      check(lane.images.shared.hash===lane.images.fused.hash,"Fused transport identity drift");
      for (const mode of modes) lane.summaries[mode.name]=summarizeCpuLane(lane.measurements.filter(row=>row.name===mode.name));
      runner.destroy(); runner=null;
    }
    receipt.status="measured";
  } catch (error) { receipt.status="failed"; receipt.failures.push(error.message); }
  finally {
    try { runner?.destroy(); } catch (error) { receipt.status="failed"; receipt.failures.push(error.message); }
    cancellation.abort();
    const board=document.createElement("canvas");board.width=1000;board.height=160;board.setAttribute("role","img");board.setAttribute("aria-label",`CPU measurements ${receipt.status}`);
    const ctx=board.getContext("2d");ctx.fillStyle="#10151d";ctx.fillRect(0,0,1000,160);ctx.fillStyle="#edf2f7";ctx.font="20px system-ui";
    ctx.fillText(`CPU attribution: ${receipt.status}; ${receipt.scenes.length} scenes`,20,50);ctx.fillText("Profiling on/off; host elapsed and GPU waiting reported separately",20,90);
    document.querySelector("#previews").replaceChildren(board);
    if (receipt.provenance) try {
      const response=await fetch("/__plasius-capture",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({path:`output/playwright/eames-environments/${receipt.provenance.captureId}/cpu-profile.png`,dataUrl:board.toDataURL("image/png"),result:receipt})});
      check(response.ok,"Evidence retention failed");receipt.artifact=await response.json();
    } catch (error) { receipt.status="failed";receipt.failures.push(error.message); }
    output.textContent=JSON.stringify({...receipt,scenes:receipt.scenes.map(lane=>({...lane,images:undefined,warmups:undefined,measurements:undefined}))},null,2);
    progress.textContent=receipt.status==="measured"?"Measurements retained. Inspect on/off overhead before drawing conclusions.":`Failed: ${receipt.failures.join("; ")}`;
    button.disabled=timeline.disabled=false;cancel.disabled=true;
  }
});
