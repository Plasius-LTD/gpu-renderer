import {createPairedProbeRunner} from "./adaptive-paired-runner.js";
import {loadOriginalEames,hashBytes} from "./original-eames-scene.js";
import {probeStablePattern} from "./stable-pattern-probe.js";
import {STABLE_REFERENCE,validateStableReferenceFrame} from "./stable-reference-contract.js";
import {createRadialSamplingPlan} from "/lighting/demo/eames-environments/radial-sampling-plan.js";
import {encodeLinearImageChunks} from "/lighting/demo/eames-environments/linear-image-chunks.js";

const check=(v,m)=>{if(!v)throw new Error(m);};
const canvas=document.querySelector("#canvas"),status=document.querySelector("#status"),result=document.querySelector("#result");
const run=document.querySelector("#run"),cancel=document.querySelector("#cancel"),preview=document.querySelector("#preview"),download=document.querySelector("#download");
let cancellation;
cancel.addEventListener("click",()=>cancellation?.abort());
run.addEventListener("click",async()=>{
 run.disabled=true;cancel.disabled=false;preview.hidden=true;download.hidden=true;result.textContent="";
 cancellation=new AbortController();let runner,snapshot;
 const receipt={schemaVersion:1,scope:"original-eames-six-bounce-visual-reference",status:"running",settings:STABLE_REFERENCE,
  timestamp:new Date().toISOString(),browser:{userAgent:navigator.userAgent,platform:navigator.platform},failures:[],qualification:"visual-reference-only-not-performance-or-convergence"};
 const marker=document.createElement("canvas");marker.width=32;marker.height=32;
 const save=async(name,image,payload)=>{
  const response=await fetch("/__plasius-capture",{method:"POST",headers:{"content-type":"application/json"},signal:AbortSignal.timeout(30000),
   body:JSON.stringify({path:`output/playwright/eames-environments/${receipt.provenance.captureId}/${name}.png`,dataUrl:image,result:payload})});
  check(response.ok,`Capture retention failed: ${response.status}`);return response.json();
 };
 try{
  status.textContent="Checking source provenance and physical GPU sampling";
  const response=await fetch("/__provenance",{signal:AbortSignal.timeout(10000)});check(response.ok,"Missing source provenance");receipt.provenance=await response.json();
  receipt.probe=await probeStablePattern();
  const admitted=await loadOriginalEames(receipt,cancellation.signal,{maxDepth:STABLE_REFERENCE.maxDepth});
  const plan=createRadialSamplingPlan(STABLE_REFERENCE.width,STABLE_REFERENCE.height);
  receipt.budgets={bands:plan.bands,meanSpp:plan.meanSpp,totalSamples:plan.totalSamples,sha256:await hashBytes(plan.budgets.buffer)};
  status.textContent="Preparing native 4K, six-bounce renderer";
  runner=await createPairedProbeRunner(admitted.scene,cancellation.signal,{sampler:STABLE_REFERENCE.sampler,native:{width:STABLE_REFERENCE.width,height:STABLE_REFERENCE.height,canvas,budgets:plan.budgets}});
  receipt.admission=admitted.assertEamesRendererAdmission(runner.sceneSnapshot,{maxDepth:STABLE_REFERENCE.maxDepth});receipt.adapter=runner.adapter;receipt.memory=runner.memory;
  const render=seed=>runner.run("radial",{sampler:STABLE_REFERENCE.sampler,seed,diagnostics:true,profile:true,onProgress:p=>{
   status.textContent=`${seed===7?"Rendering reference":"Verifying static repeatability"}: ${p.completedTiles}/${p.totalTiles} tiles`;
  }});
  const frame=await render(7);snapshot=canvas.toDataURL("image/png");validateStableReferenceFrame(frame,plan);
  const image=frame.image;delete frame.image;receipt.frame=frame;
  receipt.linearImage={sha256:await hashBytes(image.buffer),format:"rgba-float32-little-endian",uncompressedBytes:image.byteLength,chunks:[]};
  status.textContent="Retaining native PNG and full linear HDR";
  let index=0;
  for await(const chunk of encodeLinearImageChunks(image)){
   check(!cancellation.signal.aborted,"Cancelled during retention");
   const artifact=await save(`4k-stable-6-bounces-hdr-${index++}`,marker.toDataURL(),{provenance:receipt.provenance,chunk});
   receipt.linearImage.chunks.push({byteOffset:chunk.byteOffset,byteLength:chunk.byteLength,sha256:chunk.sha256,artifact});
  }
  const repeat=await render(19);validateStableReferenceFrame(repeat,plan);receipt.repeatSha256=await hashBytes(repeat.image.buffer);delete repeat.image;receipt.repeat=repeat;
  check(receipt.repeatSha256===receipt.linearImage.sha256,"Static repeatability failed");
  runner.destroy();runner=null;receipt.cleanupPassed=true;
  receipt.status="captured-reference-not-qualified";
  await save("4k-stable-6-bounces",snapshot,receipt);
  preview.src=snapshot;preview.hidden=false;download.href=snapshot;download.hidden=false;
 }catch(error){receipt.status="failed";receipt.failures.push(error.message);
  if(receipt.provenance)try{await save("failed-reference",marker.toDataURL(),receipt);}catch(retentionError){receipt.failures.push(retentionError.message);}
 }finally{
  try{runner?.destroy();}catch(error){receipt.status="failed";receipt.failures.push(error.message);}
  cancellation.abort();run.disabled=false;cancel.disabled=true;
  status.textContent=receipt.status==="failed"?`Failed: ${receipt.failures.join("; ")}`:"Captured native 4K reference; sample counts and static repeatability verified";
  result.textContent=JSON.stringify({status:receipt.status,settings:receipt.settings,budgets:receipt.budgets,admission:receipt.admission,
   actualSamples:receipt.frame?.actualSamples,linearSha256:receipt.linearImage?.sha256,repeatSha256:receipt.repeatSha256,cleanupPassed:receipt.cleanupPassed,
   provenance:receipt.provenance,failures:receipt.failures,qualification:receipt.qualification},null,2);
 }
});
