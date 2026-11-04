import { createPairedProbeRunner } from "./adaptive-paired-runner.js";
import { loadOriginalEames, hashBytes } from "./original-eames-scene.js";
import { probeStablePattern } from "./stable-pattern-probe.js";
import { createRadialSamplingPlan } from "/lighting/demo/eames-environments/radial-sampling-plan.js";
import { compareLinearImages } from "/lighting/demo/eames-environments/paired-adaptive-metrics.js";
import { compareSamplingRings } from "/lighting/demo/eames-environments/sampler-experiment.js";
import { meanLinearReference, assessStablePattern } from "/lighting/demo/eames-environments/fixed-pattern-experiment.js";
import { encodeLinearImageChunks } from "/lighting/demo/eames-environments/linear-image-chunks.js";

const check=(v,m)=>{if(!v)throw new Error(m);};
const canvas=document.querySelector("#canvas"),status=document.querySelector("#status"),result=document.querySelector("#result"),run=document.querySelector("#run"),cancel=document.querySelector("#cancel"),previews=document.querySelector("#previews");
let cancellation;
cancel.addEventListener("click",()=>cancellation?.abort());
run.addEventListener("click",async()=>{
  run.disabled=true;cancel.disabled=false;previews.replaceChildren();cancellation=new AbortController();let runner;
  const receipt={schemaVersion:1,scope:"original-eames-stable-pattern-correction",status:"running",timestamp:new Date().toISOString(),browser:{userAgent:navigator.userAgent,platform:navigator.platform},lanes:[],failures:[]};
  const save=async(name,snapshot,payload)=>{
    const response=await fetch("/__plasius-capture",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({path:`output/playwright/eames-environments/${receipt.provenance.captureId}/${name}.png`,dataUrl:snapshot,result:payload}),signal:AbortSignal.timeout(30000)});
    check(response.ok,`Retention failed: ${response.status}`);return response.json();
  };
  const marker=document.createElement("canvas");marker.width=32;marker.height=32;
  const retain=async(label,image,snapshot,diagnostic)=>{
    const linearImage={sha256:await hashBytes(image.buffer),format:"rgba-float32-little-endian",uncompressedBytes:image.byteLength,chunks:[]};
    let index=0;
    for await(const chunk of encodeLinearImageChunks(image)){
      check(!cancellation.signal.aborted,"Cancelled during retention");
      const artifact=await save(`${label}-hdr-${index++}`,marker.toDataURL(),{provenance:receipt.provenance,chunk});
      linearImage.chunks.push({byteOffset:chunk.byteOffset,byteLength:chunk.byteLength,sha256:chunk.sha256,artifact});
    }
    return save(label,snapshot,{provenance:receipt.provenance,width:canvas.width,height:canvas.height,diagnostic,linearImage});
  };
  try {
    const p=await fetch("/__provenance");check(p.ok,"Missing provenance");receipt.provenance=await p.json();
    status.textContent="Checking every sampling event against physical GPU output";
    receipt.probe=await probeStablePattern();
    const admitted=await loadOriginalEames(receipt,cancellation.signal);
    const resolution=document.querySelector("#resolution").value;
    for(const [name,width,height] of [["1080p",1920,1080],["4K",3840,2160]].filter(([name])=>resolution==="both"||resolution===name)){
      canvas.width=width;canvas.height=height;
      const plan=createRadialSamplingPlan(width,height),lane={name,width,height,maximumSpp:32,bounces:4,denoise:false,budgets:{bands:plan.bands,meanSpp:plan.meanSpp,totalSamples:plan.totalSamples,sha256:await hashBytes(plan.budgets.buffer)},setups:[],warmups:[],measurements:[],diagnostics:[],assessments:{}};receipt.lanes.push(lane);
      let activeSampler;
      const select=async sampler=>{
        if(runner&&sampler===activeSampler)return;
        runner?.destroy();runner=null;const started=performance.now();
        runner=await createPairedProbeRunner(admitted.scene,cancellation.signal,{sampler,native:{width,height,canvas,budgets:plan.budgets}});activeSampler=sampler;
        lane.admission=admitted.assertEamesRendererAdmission(runner.sceneSnapshot);lane.adapter=runner.adapter;
        lane.setups.push({sampler,excludedSetupMs:performance.now()-started,memory:runner.memory});
      };
      const render=async(sampler,mode,seed=7,diagnostics=false,label="")=>{
        await select(sampler);status.textContent=`${name} ${sampler} ${mode} ${label}`;
        return runner.run(mode,{sampler,seed,diagnostics,profile:diagnostics,onProgress:p=>{if(p.completedTiles%16===0||p.completedTiles===p.totalTiles)status.textContent=`${name} ${sampler} ${mode} ${label}: ${p.completedTiles}/${p.totalTiles} tiles`;}});
      };
      const modes=["fixed","radial"],samplers=["independent-random","fixed-pattern","stable-camera-random","stable-pattern"];
      for(let round=-1;round<3;round++)for(let s=0;s<samplers.length;s++)for(let m=0;m<2;m++){
        const sampler=samplers[(round+1+s)%samplers.length],mode=modes[(round+1+m)%2];
        const frame=await render(sampler,mode,7,false,round<0?"warmup":`timing ${round+1}/3`);delete frame.image;
        (round<0?lane.warmups:lane.measurements).push({...frame,round});
      }
      const references=[];let randomFixedHash;
      for(const seed of [7,19,43]){
        const d=await render("independent-random","fixed",seed,true,`reference seed${seed}`),image=d.image;delete d.image;
        d.imageSha256=await hashBytes(image.buffer);if(seed===7)randomFixedHash=d.imageSha256;
        d.artifact=await retain(`${name}-random-fixed-${seed}`,image,canvas.toDataURL(),d);lane.diagnostics.push(d);references.push(image);
      }
      const common=meanLinearReference(references),randomFixed=references[0];references.length=0;
      lane.commonReference={samples:96,converged:false,sha256:await hashBytes(common.buffer),artifact:await retain(`${name}-common96`,common,marker.toDataURL(),{kind:"linear-reference-not-display-preview"})};
      for(const sampler of samplers){
        let fixed=randomFixed,firstRadial;const repeatHashes=[];
        if(sampler!=="independent-random"){
          const d=await render(sampler,"fixed",7,true,"diagnostic"),image=d.image;delete d.image;fixed=image;
          d.imageSha256=await hashBytes(image.buffer);d.commonReference=compareLinearImages(image,common);
          d.artifact=await retain(`${name}-${sampler}-fixed`,image,canvas.toDataURL(),d);lane.diagnostics.push(d);
        }
        const uniform=await render(sampler,"uniform",7,true,"identity"),uniformImage=uniform.image;delete uniform.image;
        uniform.imageSha256=await hashBytes(uniformImage.buffer);uniform.identityPassed=uniform.imageSha256===(sampler==="independent-random"?randomFixedHash:await hashBytes(fixed.buffer));
        lane.diagnostics.push(uniform);check(uniform.identityPassed,"Uniform32 identity failed");
        for(const seed of [7,19,43]){
          const d=await render(sampler,"radial",seed,true,`diagnostic seed${seed}`),image=d.image;delete d.image;
          d.imageSha256=await hashBytes(image.buffer);d.commonReference=compareLinearImages(image,common);d.commonRings=compareSamplingRings(image,common,plan);
          d.sameSamplerFixed=compareLinearImages(image,fixed);d.sameSamplerRings=compareSamplingRings(image,fixed,plan);
          if(firstRadial)d.staticDifference=compareLinearImages(image,firstRadial);else firstRadial=image;
          check(d.actualSamples===plan.totalSamples,"Actual sample total mismatch");
          for(const band of plan.bands)check(d.actualHistogram[band.spp]===band.pixels,"Actual sample histogram mismatch");
          repeatHashes.push(d.imageSha256);
          if(seed===7 || sampler==="independent-random")d.artifact=await retain(`${name}-${sampler}-radial-${seed}`,image,canvas.toDataURL(),d);
          else d.identicalTo=repeatHashes.at(-1)===repeatHashes[0]?`${name}-${sampler}-radial-7`:null;
          if(seed!==7 && sampler!=="independent-random" && !d.identicalTo)d.artifact=await retain(`${name}-${sampler}-radial-${seed}`,image,canvas.toDataURL(),d);
          lane.diagnostics.push(d);
          if(seed===7){const heading=document.createElement("h2");heading.textContent=`${name} ${sampler}`;const preview=document.createElement("img");preview.src=canvas.toDataURL();preview.alt=`${name} ${sampler} radial full-fidelity output`;previews.append(heading,preview);}
          await save(`${name}-checkpoint-${sampler}-${seed}`,canvas.toDataURL(),receipt);
        }
      }
      for(const sampler of samplers.filter(s=>s!=="independent-random")){
        const rows=lane.diagnostics.filter(d=>d.sampler===sampler&&d.mode==="radial");
        lane.assessments[sampler]=assessStablePattern(rows.map(d=>d.imageSha256),rows[0].commonRings,rows[0].commonReference);
      }
      lane.timingSummary=Object.fromEntries(samplers.map(s=>[s,Object.fromEntries(modes.map(mode=>{const times=lane.measurements.filter(f=>f.sampler===s&&f.mode===mode).map(f=>f.completedFrameMs);return [mode,{times,meanMs:times.reduce((a,b)=>a+b,0)/times.length}];}))]));
      runner.destroy();runner=null;await save(`${name}-summary`,canvas.toDataURL(),receipt);
    }
    receipt.status="complete-experimental-not-qualified";
  } catch(error) {receipt.status="failed";receipt.failures.push(error.message);}
  finally {
    runner?.destroy();cancellation.abort();
    if(receipt.provenance)try{await save("stable-pattern-summary",canvas.toDataURL(),receipt);}catch(error){receipt.failures.push(error.message);receipt.status="failed";}
    result.textContent=JSON.stringify({status:receipt.status,failures:receipt.failures,provenance:receipt.provenance,lanes:receipt.lanes.map(l=>({name:l.name,timings:l.timingSummary,assessments:l.assessments}))},null,2);status.textContent=`${receipt.status}: ${receipt.failures.join("; ")||"See retained quality and repeatability results below"}`;run.disabled=false;cancel.disabled=true;
  }
});
