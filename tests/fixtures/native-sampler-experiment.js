import { createPairedProbeRunner } from "./adaptive-paired-runner.js";
import { loadOriginalEames,hashBytes } from "./original-eames-scene.js";
import { probeProgressiveSampling } from "./progressive-sampling-probe.js";
import { createRadialSamplingPlan } from "/lighting/demo/eames-environments/radial-sampling-plan.js";
import { compareLinearImages } from "/lighting/demo/eames-environments/paired-adaptive-metrics.js";
import { encodeLinearImageChunks } from "/lighting/demo/eames-environments/linear-image-chunks.js";
import { SAMPLING_EXPERIMENT,compareSamplingRings,assessSamplingExperiment } from "/lighting/demo/eames-environments/sampler-experiment.js";
const check=(v,m)=>{if(!v)throw new Error(m);};
const canvas=document.querySelector("#canvas"),status=document.querySelector("#status"),result=document.querySelector("#result"),run=document.querySelector("#run"),cancel=document.querySelector("#cancel"),previews=document.querySelector("#previews");
let cancellation;cancel.addEventListener("click",()=>cancellation?.abort());
run.addEventListener("click",async()=>{
  run.disabled=true;cancel.disabled=false;cancellation=new AbortController();previews.replaceChildren();let runner;
  const receipt={schemaVersion:1,scope:"original-eames-progressive-sampling-experiment",status:"running",timestamp:new Date().toISOString(),protocol:SAMPLING_EXPERIMENT,lanes:[],failures:[]};
  const save=async(name,board,payload)=>{
    const response=await fetch("/__plasius-capture",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({path:`output/playwright/eames-environments/${receipt.provenance.captureId}/${name}.png`,dataUrl:typeof board==="string"?board:board.toDataURL("image/png"),result:payload})});
    check(response.ok,`Retention failed: ${response.status}`);return response.json();
  };
  try{
    const provenance=await fetch("/__provenance");check(provenance.ok,"Missing source provenance");receipt.provenance=await provenance.json();
    status.textContent="Compiling sampling WGSL and comparing GPU sample words";receipt.samplingProbe=await probeProgressiveSampling();
    status.textContent="Verifying and loading original Eames scene";const admitted=await loadOriginalEames(receipt,cancellation.signal);
    for(const [name,width,height] of [["1080p",1920,1080],["4K",3840,2160]]){
      check(!cancellation.signal.aborted,"Cancelled");
      const plan=createRadialSamplingPlan(width,height),samplers=name==="1080p"?SAMPLING_EXPERIMENT.samplers:["owen-sobol"];
      const lane={name,width,height,maximumSpp:32,maxDepth:4,denoise:false,frameBudgetReduction:false,budgets:{bands:plan.bands,meanSpp:plan.meanSpp,totalSamples:plan.totalSamples,sha256:await hashBytes(plan.budgets.buffer)},warmups:[],measurements:[],diagnostics:[]};receipt.lanes.push(lane);
      status.textContent=`${name}: constructing full Eames pipelines`;
      runner=await createPairedProbeRunner(admitted.scene,cancellation.signal,{pruningVariants:true,native:{width,height,canvas,budgets:plan.budgets}});
      lane.admission=admitted.assertEamesRendererAdmission(runner.sceneSnapshot);lane.adapter=runner.adapter;lane.memory=runner.memory;lane.tiles=runner.tiles;
      const progress=label=>p=>{if(p.completedTiles%16===0||p.completedTiles===p.totalTiles)status.textContent=`${name} ${label}: ${p.completedTiles}/${p.totalTiles} tiles`;};
      // Rotate sampler and mode order. Diagnostic readback/retention never enters timings.
      for(let round=-1;round<3;round++)for(let j=0;j<samplers.length;j++)for(let k=0;k<2;k++){
        const sampler=samplers[(j+round+1)%samplers.length],mode=["fixed","radial"][(round+1+k)%2];
        const frame=await runner.run(mode,{sampler,seed:7,onProgress:progress(`${sampler} ${mode} ${round<0?"warmup":`timing ${round+1}/3`}`)});
        delete frame.image;(round<0?lane.warmups:lane.measurements).push({...frame,round});
      }
      for(const [seedIndex,seed] of (name==="1080p"?SAMPLING_EXPERIMENT.seeds:[7]).entries())for(let j=0;j<samplers.length;j++){
        const sampler=samplers[(seedIndex+j)%samplers.length],frames={};
        const modes=seedIndex%2?["radial","fixed"]:["fixed","radial"];if(seed===7)modes.push("uniform");
        for(const mode of modes){
          const diagnostic=await runner.run(mode,{sampler,seed,diagnostics:true,profile:true,onProgress:progress(`${sampler} ${mode} seed ${seed} diagnostic`)}),image=diagnostic.image;delete diagnostic.image;
          diagnostic.imageSha256=await hashBytes(image.buffer);frames[mode]={diagnostic,image,snapshot:canvas.toDataURL("image/png")};
        }
        const fixed=frames.fixed;
        for(const mode of ["fixed","radial",...(seed===7?["uniform"]:[])]){
          const {diagnostic,image,snapshot}=frames[mode],label=`${name}-${sampler}-seed${seed}-${mode}`;
          if(mode!=="fixed")diagnostic.differenceFromFixed32=compareLinearImages(image,fixed.image);
          if(mode==="uniform"){
            diagnostic.identityPassed=diagnostic.imageSha256===fixed.diagnostic.imageSha256;
            check(diagnostic.identityPassed,`${label} uniform32 is not bit-identical`);
          }
          if(mode==="radial"){
            check(diagnostic.actualSamples===plan.totalSamples,"Actual samples mismatch");
            for(const b of plan.bands)check(diagnostic.actualHistogram[b.spp]===b.pixels,"Actual radial histogram mismatch");
            diagnostic.rings=compareSamplingRings(image,fixed.image,plan);
          }
          if(name==="1080p"&&sampler==="legacy"&&seed===7&&mode==="fixed")check(diagnostic.imageSha256===SAMPLING_EXPERIMENT.historicalFixed1080pSha256,"Flag-off historical HDR hash mismatch");
          const linearImage={format:"rgba-float32-little-endian",sha256:diagnostic.imageSha256,uncompressedBytes:image.byteLength,chunks:[],retained:seed===7};
          if(seed===7&&mode==="uniform")linearImage.identicalTo=`${name}-${sampler}-seed7-fixed`;
          else if(seed===7){
            const marker=document.createElement("canvas");marker.width=320;marker.height=32;
            let index=0;for await(const chunk of encodeLinearImageChunks(image)){
              check(!cancellation.signal.aborted,"Cancelled retaining HDR");
              const artifact=await save(`${label}-hdr-${String(index++).padStart(3,"0")}`,marker,{provenance:receipt.provenance,width,height,chunk});
              linearImage.chunks.push({byteOffset:chunk.byteOffset,byteLength:chunk.byteLength,sha256:chunk.sha256,artifact});
            }
          }
          diagnostic.artifact=await save(label,snapshot,{provenance:receipt.provenance,width,height,diagnostic,linearImage});lane.diagnostics.push(diagnostic);
          if(seed===7&&mode!=="uniform"){const preview=document.createElement("img");preview.src=snapshot;preview.alt=label;previews.append(preview);}
        }
        await save(`${name}-checkpoint-${sampler}-${seed}`,canvas,receipt);
      }
      if(name==="1080p")receipt.bandScreen=assessSamplingExperiment(lane.diagnostics.filter(d=>d.mode==="radial"));
      runner.destroy();runner=null;
      lane.timingSummary=Object.fromEntries(samplers.map(s=>[s,Object.fromEntries(["fixed","radial"].map(mode=>{
        const times=lane.measurements.filter(f=>f.sampler===s&&f.mode===mode).map(f=>f.completedFrameMs);
        return [mode,{times,meanMs:times.reduce((a,b)=>a+b,0)/times.length}];
      }))]));
      await save(`${name}-summary`,canvas,receipt);
    }
    receipt.status=receipt.bandScreen.passed?"diagnostic-band-screen-passed-not-qualified":"diagnostic-band-screen-failed";
  }catch(error){receipt.status="failed";receipt.failures.push(error.message);}
  finally{
    runner?.destroy();cancellation.abort();
    if(receipt.provenance)try{await save("sampler-summary",canvas,receipt);}catch(error){receipt.failures.push(error.message);receipt.status="failed";}
    result.textContent=JSON.stringify(receipt,null,2);status.textContent=`${receipt.status}${receipt.failures.length?": "+receipt.failures.join("; "):""}`;
    run.disabled=false;cancel.disabled=true;
  }
});
