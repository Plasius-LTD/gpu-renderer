import {createPairedProbeRunner} from './adaptive-paired-runner.js';
import {hashBytes} from './original-eames-scene.js';
import {composeRoomEamesScene,roomReferenceSettings,validateRoomFrame} from '/lighting/demo/eames-environments/room-eames.js';
import {createRadialSamplingPlan} from '/lighting/demo/eames-environments/radial-sampling-plan.js';
import {encodeLinearImageChunks} from '/lighting/demo/eames-environments/linear-image-chunks.js';
import {createRoughSplittingScene,validateRoughSplittingProbe} from '/lighting/demo/eames-environments/rough-splitting-scenes.js';
const check=(v,m)=>{if(!v)throw Error(m);},el=id=>document.getElementById(id);
let busy=false;
export async function runRoomSplittingBenchmark({loadAssets,clearCapture,roomCompositionControls}){
 if(busy)return;busy=true;
 const abort=new AbortController(),stop=()=>abort.abort(),runners=[],canvases=[];
 const locked=[...document.querySelectorAll('#controls input,#controls select,#run,#reset,#benchmark')];
 const report={schemaVersion:1,scope:'room-rough-bounce-splitting',status:'running',timings:[],diagnostics:[],failures:[],qualification:'experimental-not-converged-not-matched-quality'};
 let finalImage;
 const marker=document.createElement('canvas');marker.width=32;marker.height=32;
 const save=async(name,result,dataUrl=marker.toDataURL())=>{
  const response=await fetch('/__plasius-capture',{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(30000),body:JSON.stringify({
   path:`output/playwright/eames-environments/${report.provenance.captureId}/${name}.png`,dataUrl,result})});
  check(response.ok,'Cannot retain splitting evidence');return response.json();
 };
 try{
  for(const control of locked)if(!control.checkValidity()){control.reportValidity();throw Error('Invalid placement');}
  clearCapture();locked.forEach(c=>c.disabled=true);el('cancel').disabled=false;el('cancel').addEventListener('click',stop);
  el('sampler').value='stable-pattern';
  el('denoise').value='off';
  const settings=roomReferenceSettings(el('resolution').value,'stable-pattern');report.settings=settings;
  report.provenance=await (await fetch('/__provenance',{signal:AbortSignal.timeout(10000)})).json();
  report.correctness=[];
  for(const name of ['black','emissive','diffuse-constant']){
   let control;
   for(const splitDepth of [0,1,2]){
    check(!abort.signal.aborted,'Cancelled');el('status').textContent=`Correctness only · ${name} · split ${splitDepth}`;
    const probe=await createPairedProbeRunner(createRoughSplittingScene(name),abort.signal,{splitDepth,sampler:'stable-pattern'});
    try{
     const frame=await probe.run('uniform-shared',32);
     if(splitDepth===0)control=frame.image;
     report.correctness.push({name,splitDepth,...validateRoughSplittingProbe(name,frame.image,control),actualSamples:frame.actualSamples,rayCounts:frame.rayCounts});
    }finally{probe.destroy();}
   }
  }
  el('status').textContent='Preparing matching splitting controls';
  const source=await loadAssets(report,abort.signal),composed=composeRoomEamesScene({...source,...roomCompositionControls(source)});report.scene=composed.evidence;
  const plan=createRadialSamplingPlan(settings.width,settings.height);report.budgets={totalSamples:plan.totalSamples,bands:plan.bands,sha256:await hashBytes(plan.budgets.buffer)};
  // Separate setup from measurement. Only one runner submits work at a time.
  for(const splitDepth of [0,1,2]){
   check(!abort.signal.aborted,'Cancelled');
   const canvas=document.createElement('canvas');canvas.width=settings.width;canvas.height=settings.height;canvases.push(canvas);
   runners.push(await createPairedProbeRunner(composed.scene,abort.signal,{splitDepth,sampler:'stable-pattern',native:{...settings,canvas,budgets:plan.budgets}}));
  }
  report.memory=runners.map((r,splitDepth)=>({splitDepth,...r.memory}));report.adapter=runners[0].adapter;
  report.memoryNote='Three independent benchmark renderer instances coexist; per-instance allocations, not exact physical VRAM residency.';
  const run=async(splitDepth,diagnostics=false)=>{
   check(!abort.signal.aborted,'Cancelled');check(document.visibilityState==='visible','Keep the benchmark tab visible');
   return runners[splitDepth].run('radial',{sampler:'stable-pattern',seed:7,diagnostics,onProgress:p=>{el('status').textContent=`${diagnostics?'Diagnostic capture':'Timing'} · split depth ${splitDepth} · ${p.completedTiles}/${p.totalTiles} tiles`;}});
  };
  for(const depth of [0,1,2])await run(depth);
  for(let round=0;round<3;round++)for(let offset=0;offset<3;offset++){
   const splitDepth=(round+offset)%3,frame=await run(splitDepth);
   check(frame.visibilityBefore==='visible'&&frame.visibilityAfter==='visible','Hidden timing run');
   report.timings.push({round,splitDepth,completedFrameMs:frame.completedFrameMs});
  }
  let baseline;
  for(const splitDepth of [0,1,2]){
   const frame=await run(splitDepth,true);validateRoomFrame(frame,plan,settings);
   const image=frame.image;delete frame.image;
   if(splitDepth===0)baseline=image;
   let squared=0,mean=0,baseMean=0,max=0;
   for(let i=0;i<image.length;i++)if(i%4!==3){const d=image[i]-baseline[i];squared+=d*d;max=Math.max(max,Math.abs(d));mean+=image[i];baseMean+=baseline[i];}
   const item={splitDepth,frame,comparison:{rgbRmseFromUnconvergedControl:Math.sqrt(squared/(image.length/4*3)),maxAbsoluteDifference:max,meanRgbRatio:mean/baseMean},linearImage:{sha256:await hashBytes(image.buffer),uncompressedBytes:image.byteLength,chunks:[]}};
   let index=0;for await(const chunk of encodeLinearImageChunks(image)){
    check(!abort.signal.aborted,'Cancelled during retention');
    item.linearImage.chunks.push(await save(`split-${splitDepth}-hdr-${index++}`,{provenance:report.provenance,chunk}));
   }
   const png=canvases[splitDepth].toDataURL();item.png=await save(`room-split-${splitDepth}`,{provenance:report.provenance,settings,scene:report.scene,...item},png);
   report.diagnostics.push(item);if(splitDepth===2)finalImage=png;
  }
  report.summary=[0,1,2].map(splitDepth=>{
   const times=report.timings.filter(t=>t.splitDepth===splitDepth).map(t=>t.completedFrameMs).sort((a,b)=>a-b);
   return {splitDepth,medianJobMs:times[1],minJobMs:times[0],maxJobMs:times[2]};
  });
  report.status='measured-not-qualified';
 }catch(error){report.status='failed';report.failures.push(error.message);}
 finally{
  for(const runner of runners)try{runner.destroy();}catch(error){report.status='failed';report.failures.push(error.message);}
  report.cleanupPassed=report.failures.length===0;
  if(report.provenance)try{await save('rough-splitting-report',report);}catch(error){report.status='failed';report.failures.push(error.message);}
  abort.abort();locked.forEach(c=>c.disabled=false);el('cancel').disabled=true;el('cancel').removeEventListener('click',stop);busy=false;
  if(report.status==='measured-not-qualified'){
   el('splitting').value='2';el('preview').src=finalImage;el('preview').hidden=false;el('preview').alt='Room and Eames, stable sampler, splitting at first two bounces, experimental';
   el('download').href=finalImage;el('download').download='room-stable-split-depth2.png';el('download').hidden=false;
  }
  el('status').textContent=report.status==='failed'?`Failed: ${report.failures.join('; ')}`:'Splitting comparison retained — not quality-qualified';
  el('result').textContent=JSON.stringify({status:report.status,settings:report.settings,summary:report.summary,comparisons:report.diagnostics.map(d=>({splitDepth:d.splitDepth,...d.comparison})),failures:report.failures,provenance:report.provenance},null,2);
 }
}
