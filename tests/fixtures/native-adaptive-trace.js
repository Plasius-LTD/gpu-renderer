import { createPairedProbeRunner } from "./adaptive-paired-runner.js";
import { createRadialSamplingPlan } from "/lighting/demo/eames-environments/radial-sampling-plan.js";
import { NATIVE_FRAME_TARGETS,summarizeNativeFrameScreen } from "/lighting/demo/eames-environments/native-frame-screen.js";
import { compareLinearImages } from "/lighting/demo/eames-environments/paired-adaptive-metrics.js";
import { encodeLinearImageChunks } from "/lighting/demo/eames-environments/linear-image-chunks.js";
const check=(v,m)=>{if(!v)throw new Error(m);};
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),n=>n.toString(16).padStart(2,"0")).join("");
const canvas=document.querySelector("#canvas"),status=document.querySelector("#status"),result=document.querySelector("#result"),run=document.querySelector("#run"),cancel=document.querySelector("#cancel"),previews=document.querySelector("#previews");
let cancellation;cancel.addEventListener("click",()=>cancellation?.abort());
function budgetPreview(plan){
  const board=document.createElement("canvas");board.width=plan.width;board.height=plan.height;
  const pixels=new Uint8ClampedArray(plan.budgets.length*4),colors={32:[255,80,80],16:[255,160,55],8:[235,225,60],4:[70,210,125],2:[55,155,245],1:[90,70,155]};
  for(let i=0;i<plan.budgets.length;i++){pixels.set(colors[plan.budgets[i]],i*4);pixels[i*4+3]=255;}
  board.getContext("2d").putImageData(new ImageData(pixels,plan.width,plan.height),0,0);board.setAttribute("aria-label","SPP map: red 32, orange 16, yellow 8, green 4, blue 2, purple 1");previews.append(board);return board;
}
function ringDifferences(image,reference,plan){
  return plan.bands.map(band=>{
    const candidate=new Float32Array(band.pixels*4),baseline=new Float32Array(band.pixels*4);let offset=0;
    for(let id=0;id<plan.budgets.length;id++)if(plan.budgets[id]===band.spp){candidate.set(image.subarray(id*4,id*4+4),offset);baseline.set(reference.subarray(id*4,id*4+4),offset);offset+=4;}
    return {spp:band.spp,...compareLinearImages(candidate,baseline)};
  });
}
run.addEventListener("click",async()=>{
  run.disabled=true;cancel.disabled=false;cancellation=new AbortController();previews.replaceChildren();let runner;
  const receipt={schemaVersion:1,status:"running",scope:"native-prescribed-radial-adaptive-trace",timestamp:new Date().toISOString(),hashes:{},lanes:[],failures:[],
    limitations:["Prescribed circular budgets, not a qualified production classifier or governor","Simple diffuse-silhouette scene, not Eames/site; depth ceiling four; seed seven; denoise off",
      "Timing-only includes full renderer frame and GPU presentation, not physical display/application work","Instrumented frames include per-tile diagnostics and must not replace timing-only results",
      "GPU spans cover tile compute through output, excluding uploads and final presentation; not whole-job GPU time",
      "Fixed32 image differences are not converged-reference quality qualification; no adaptive publication claim",
      "Optional fused-hit transport is disabled: the retained isolation run failed its 4K uniform identity control"]};
  const show=()=>{result.textContent=JSON.stringify(receipt,null,2);};
  const save=async(name,board,payload)=>{
    const response=await fetch("/__plasius-capture",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({path:`output/playwright/eames-environments/${receipt.provenance.captureId}/${name}.png`,dataUrl:typeof board==="string"?board:board.toDataURL("image/png"),result:payload})});check(response.ok,`Trace retention failed: ${response.status} ${response.ok?"":await response.text()}`);return response.json();
  };
  try{
    const provenance=await fetch("/__provenance");check(provenance.ok,"Missing provenance");receipt.provenance=await provenance.json();
    for(const path of [import.meta.url,"/tests/fixtures/native-adaptive-runner.js","/tests/fixtures/adaptive-paired-runner.js","/src/wavefront-adaptive-tile-plan.js","/src/wavefront-adaptive-tile-output.js","/src/wavefront-adaptive-shared-shader.js","/lighting/demo/eames-environments/radial-sampling-plan.js","/lighting/demo/eames-environments/linear-image-chunks.js","/lighting/demo/eames-environments/paired-adaptive-metrics.js","/lighting/demo/eames-environments/paired-adaptive-scenes.js"]){const source=await fetch(path);check(source.ok,"Missing source");receipt.hashes[new URL(path,location.href).pathname]=await hash(await source.arrayBuffer());}
    for(const [name,{width,height}] of Object.entries(NATIVE_FRAME_TARGETS)){
      check(!cancellation.signal.aborted,"Cancelled");status.textContent=`Preparing ${name} radial budget and pipelines`;
      const started=performance.now(),plan=createRadialSamplingPlan(width,height),budgetSetupMs=performance.now()-started;
      const lane={name,width,height,scene:"diffuse-silhouette",maximumSpp:32,maxDepth:4,denoise:false,frameBudgetReduction:false,seed:7,
        budgets:{bands:plan.bands,meanSpp:plan.meanSpp,expectedPrimaryRays:plan.totalSamples,sha256:await hash(plan.budgets.buffer),setupMs:budgetSetupMs},warmups:[],measurements:[],diagnostics:[],summary:{}};
      receipt.lanes.push(lane);const board=budgetPreview(plan);lane.budgetArtifact=await save(`${name}-budget`,board,{provenance:receipt.provenance,...lane.budgets,width,height});
      runner=await createPairedProbeRunner("diffuse-silhouette",cancellation.signal,{pruningVariants:true,native:{width,height,canvas,budgets:plan.budgets}});
      lane.adapter=runner.adapter;lane.memory=runner.memory;lane.planSetupMs=runner.planSetupMs;lane.tileCount=runner.tiles;
      const progress=(mode,diagnostic)=>state=>{if(state.completedTiles%16===0||state.completedTiles===state.totalTiles)status.textContent=`${name} ${mode} ${diagnostic?"diagnostic":"timing"}: ${state.completedTiles}/${state.totalTiles} tiles`;};
      for(let round=-1;round<3;round++)for(let order=0;order<2;order++){
        const mode=["fixed","radial"][(round+1+order)%2];status.textContent=`${name} ${mode}: ${round<0?"warmup":`measured frame ${round+1}/3`}`;
        const frame=await runner.run(mode,{onProgress:progress(mode,false)});delete frame.image;
        (round<0?lane.warmups:lane.measurements).push({...frame,round,order});
      }
      for(const mode of ["fixed","radial"])lane.summary[mode]=summarizeNativeFrameScreen({width,height,canvasWidth:canvas.width,canvasHeight:canvas.height,completedFrameTimesMs:lane.measurements.filter(f=>f.mode===mode).map(f=>f.completedFrameMs)});
      let fixed,fixedHash;
      for(const label of ["fixed","uniform","radial"]){
        const mode=label;
        status.textContent=`${name}: ${label} diagnostic, actual counts/HDR/CPU/GPU`;
        const diagnostic=await runner.run(mode,{diagnostics:true,profile:true,fused:false,onProgress:progress(label,true)}),image=diagnostic.image;delete diagnostic.image;
        diagnostic.label=label;
        const displaySnapshot=canvas.toDataURL("image/png");
        if(mode==="fixed")fixed=image;
        else {diagnostic.differenceFromFixed32=compareLinearImages(image,fixed);if(mode==="uniform"){
          diagnostic.identityPassed=diagnostic.differenceFromFixed32.maxAbsoluteError<=1e-5;
          if(!diagnostic.identityPassed)receipt.failures.push(`${name} ${label} identity failed: max error ${diagnostic.differenceFromFixed32.maxAbsoluteError}`);
        }}
        if(mode==="radial"){
          check(diagnostic.actualSamples===plan.totalSamples,"Actual native sample total mismatch");
          for(const band of plan.bands)check(diagnostic.actualHistogram[band.spp]===band.pixels,"Actual radial histogram mismatch");
          diagnostic.ringDifferencesFromFixed32=ringDifferences(image,fixed,plan);
        }
        status.textContent=`${name}: retaining ${mode} HDR and trace`;
        diagnostic.imageSha256=await hash(image.buffer);lane.diagnostics.push(diagnostic);
        const linearImage={format:"rgba-float32-little-endian",uncompressedBytes:image.byteLength,sha256:diagnostic.imageSha256,chunks:[]};
        if(mode==="fixed")fixedHash=diagnostic.imageSha256;
        if(mode==="uniform"&&fixedHash===diagnostic.imageSha256)linearImage.identicalTo=`${name}-fixed`;
        else {
          const marker=document.createElement("canvas");marker.width=640;marker.height=80;const ctx=marker.getContext("2d");ctx.fillStyle="#10151d";ctx.fillRect(0,0,640,80);ctx.fillStyle="#edf2f7";ctx.font="18px system-ui";ctx.fillText(`${name} ${label}: lossless HDR data chunk`,12,42);
          let index=0;for await(const chunk of encodeLinearImageChunks(image)){
            check(!cancellation.signal.aborted,"Cancelled while retaining HDR");
            const artifact=await save(`${name}-${label}-hdr-${String(index++).padStart(3,"0")}`,marker,{provenance:receipt.provenance,width,height,chunk});
            linearImage.chunks.push({byteOffset:chunk.byteOffset,byteLength:chunk.byteLength,sha256:chunk.sha256,artifact});
          }
        }
        diagnostic.artifact=await save(`${name}-${label}`,displaySnapshot,{provenance:receipt.provenance,hashes:receipt.hashes,width,height,diagnostic,linearImage});
        const preview=document.createElement("img");preview.src=displaySnapshot;preview.alt=`${name} ${label}, native ${width} by ${height}`;previews.append(preview);
      }
      runner.destroy();runner=null;show();lane.artifact=await save(`${name}-trace`,canvas,{...receipt,lanes:[lane]});
    }
    receipt.status=receipt.failures.length?"traced-with-validation-failures":"traced-not-qualified";
  }catch(error){receipt.status="failed";receipt.failures.push(error.message);}
  finally{
    runner?.destroy();cancellation.abort();
    if(receipt.provenance)try{receipt.artifact=await save("native-adaptive-summary",canvas,receipt);}catch(error){receipt.status="failed";receipt.failures.push(error.message);}
    show();status.textContent=receipt.status==="traced-not-qualified"?receipt.lanes.map(l=>`${l.name}: fixed ${l.summary.fixed.timing.mean.toFixed(2)} ms / radial ${l.summary.radial.timing.mean.toFixed(2)} ms`).join("; "):`Failed: ${receipt.failures.join("; ")}`;
    run.disabled=false;cancel.disabled=true;
  }
});
