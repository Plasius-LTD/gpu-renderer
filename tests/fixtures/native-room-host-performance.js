import {createPairedProbeRunner} from './adaptive-paired-runner.js';
import {hashBytes} from './original-eames-scene.js';
import {composeRoomEamesScene,roomReferenceSettings,validateRoomFrame} from '/lighting/demo/eames-environments/room-eames.js';
import {createRadialSamplingPlan} from '/lighting/demo/eames-environments/radial-sampling-plan.js';
import {withRoomGlass,GLASS_WATER_DEFAULTS} from '/lighting/demo/eames-environments/glass-water-reference.js';
import {encodeLinearImageChunks} from '/lighting/demo/eames-environments/linear-image-chunks.js';
import {roomConvergencePlan} from './room-convergence.js';
import {compareHostDiagnosticFrames} from './native-host-measurements.js';

const el=id=>document.getElementById(id),check=(v,m)=>{if(!v)throw Error(m);};let busy=false;
export async function runRoomHostPerformance({loadAssets,clearCapture,roomCompositionControls,resetRoomControls}){
 if(busy)return;busy=true;
 const abort=new AbortController(),stop=()=>abort.abort(),runners=[];
 const controls=[...document.querySelectorAll('#controls input,#controls select,#controls button,#run,#reset')],snapshot=controls.map(c=>[c,c.value]);
 const report={schemaVersion:1,scope:'native-room-host-performance',status:'running',baselineAcceptance:'User provisionally accepts current convergence for experimentation,3 November2026; failed reference screens remain failed',timings:[],diagnostics:[],comparisons:[],memory:[],memorySharing:[],failures:[]};
 const marker=document.createElement('canvas');marker.width=1;marker.height=1;
 const save=async(name,dataUrl,payload)=>{
  const response=await fetch('/__plasius-capture',{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(30000),body:JSON.stringify({path:`output/playwright/eames-environments/${report.provenance.captureId}/${name}.png`,dataUrl,result:payload})});
  check(response.ok,'Host performance retention failed');return response.json();
 };
 const checkpoint=()=>save('host-performance-checkpoint',marker.toDataURL(),report);
 try{
  const values=new URLSearchParams(location.search).getAll('hostPerformanceResolution');
  check(values.length<=1&&values.every(v=>['1080p','4k','all'].includes(v)),'Invalid host performance resolution');
  const resolutions=values.length&&values[0]!=='all'?[values[0]]:['1080p','4k'];report.completeness=resolutions.length===2?'both-native-resolutions':'partial-single-resolution';
  controls.forEach(c=>c.disabled=true);el('cancel').disabled=false;el('cancel').addEventListener('click',stop);clearCapture();
  report.provenance=await (await fetch('/__provenance',{signal:AbortSignal.timeout(10000)})).json();
  report.browser={userAgent:navigator.userAgent,platform:navigator.platform};
  report.limitations=['Three timed pairs are exploratory, not a confidence/sustained60Hz qualification','Time is completed renderer job including GPU presentation, not application/physical display pacing','Profile/HDR/ray readbacks are separate diagnostic frames','Two independent GPU instances coexist; allocation classes are per-instance, not physical VRAM','No resolution/SPP/depth/material/asset reduction or shader change'];
  for(const resolution of resolutions){
   check(!abort.signal.aborted,'Host performance cancelled');resetRoomControls();
   const lane=roomConvergencePlan({resolutions:[resolution]})[0];
   for(const [id,value]of Object.entries(lane.controls)){const node=el(id);check(node,'Missing host comparison control: '+id);node.value=value;}
   controls.forEach(c=>c.disabled=true);
   const source=await loadAssets(report,abort.signal);
   const composed=withRoomGlass(composeRoomEamesScene({...source,...roomCompositionControls(source)}),{...GLASS_WATER_DEFAULTS,mode:'filled',closeup:false,supportClearance:Number(el('glass-support-clearance').value)});
   composed.scene.probeDepth=lane.bounces;report.scene=composed.evidence;
   const settings=roomReferenceSettings(resolution,'fixed-pattern',lane.spp,lane.bounces),plan=createRadialSamplingPlan(settings.width,settings.height,settings.maximumSpp);
   const canvases=[],local=[];
   for(const optimized of [false,true]){
    check(!abort.signal.aborted,'Host performance cancelled');el('status').textContent=`Preparing ${resolution} ${optimized?'template/lazy':'legacy/eager'} pipelines`;
    const canvas=document.createElement('canvas');canvas.width=settings.width;canvas.height=settings.height;canvases.push(canvas);
    const runner=await createPairedProbeRunner(composed.scene,abort.signal,{sampler:'fixed-pattern',boundedDielectricBranching:true,nestedMediaRefraction:true,opticalInterfaceBudget:lane.opticalInterfaceBudget,
     native:{...settings,canvas,budgets:plan.budgets,hostOptimizations:{templateConfigPacking:optimized,lazyUniformBudget:optimized}}});
    check(runner.sceneSnapshot.triangleCount===composed.evidence.sceneTriangleCount&&composed.evidence.referenceModels.length===2&&runner.sceneSnapshot.displayQuality===true,'Full-fidelity host benchmark admission failed');
    local.push(runner);runners.push(runner);
    report.memory.push({resolution,optimized,...runner.memory});report.adapter=runner.adapter;
   }
   for(const key of ['rendererBufferBytes','adaptiveBufferBytes','telemetryBufferBytes','fixtureStagingBytes','textureInventory'])check(JSON.stringify(local[0].memory[key])===JSON.stringify(local[1].memory[key]),'Changed GPU resource inventory: '+key);
   check(local[0].memory.cachedBudgetHostBytes-local[1].memory.cachedBudgetHostBytes===settings.width*settings.height*4,'Lazy host backing allocation mismatch');
   report.memorySharing.push({resolution,sharedInputBudgetBytes:plan.budgets.byteLength,combinedKnownBudgetHostBackingBytes:local.reduce((s,r)=>s+r.memory.cachedBudgetHostBytes,0)-plan.budgets.byteLength});
   const run=async(index,diagnostics=false)=>{
    check(!abort.signal.aborted&&document.visibilityState==='visible','Cancelled or hidden host comparison');
    const frame=await local[index].run('radial',{sampler:'fixed-pattern',seed:7,diagnostics,profile:diagnostics,onProgress:p=>{
     if(p.completedTiles%16===0||p.completedTiles===p.totalTiles)el('status').textContent=`${resolution} ${diagnostics?'identity/profile':'timing'} · ${index?'template/lazy':'legacy/eager'} · ${p.completedTiles}/${p.totalTiles} tiles`;
    }});
    check(frame.visibilityBefore==='visible'&&frame.visibilityAfter==='visible'&&frame.validationErrors===0,'Invalid host comparison frame');return frame;
   };
   for(const index of [0,1])await run(index);
   for(let round=0;round<3;round++)for(const index of round%2?[1,0]:[0,1]){
    const frame=await run(index);report.timings.push({resolution,optimized:index===1,round,completedFrameMs:frame.completedFrameMs,hostOptimizations:frame.hostOptimizations});await checkpoint();
   }
   let baseline;
   for(const index of [0,1]){
    const frame=await run(index,true);validateRoomFrame(frame,plan,settings);
    if(index===0)baseline=frame;else report.comparisons.push({resolution,...compareHostDiagnosticFrames(baseline,frame)});
    const image=frame.image,linearImage={sha256:await hashBytes(image.buffer),format:'rgba-float32-little-endian',uncompressedBytes:image.byteLength,chunks:[]};
    let chunkIndex=0;for await(const chunk of encodeLinearImageChunks(image)){
     check(!abort.signal.aborted,'Host comparison retention cancelled');const artifact=await save(`${resolution}-${index}-hdr-${chunkIndex++}`,marker.toDataURL(),{provenance:report.provenance,chunk});
     linearImage.chunks.push({byteOffset:chunk.byteOffset,byteLength:chunk.byteLength,sha256:chunk.sha256,artifact});
    }
    const stored={...frame};delete stored.image;
    const item={scope:'native-host-performance-capture',provenance:report.provenance,settings,scene:composed.evidence,optimized:index===1,frame:stored,linearImage};
    item.artifact=await save(`${resolution}-${index}-host-comparison`,canvases[index].toDataURL(),item);report.diagnostics.push(item);
   }
   baseline=null;for(const runner of local)runner.destroy();runners.splice(0,runners.length);await checkpoint();
  }
  report.summary=report.memory.map(({resolution,optimized,cachedBudgetHostBytes})=>{
   const times=report.timings.filter(t=>t.resolution===resolution&&t.optimized===optimized).map(t=>t.completedFrameMs).sort((a,b)=>a-b);
   return {resolution,optimized,medianCompletedJobMs:times[1],minimumCompletedJobMs:times[0],maximumCompletedJobMs:times[2],knownBudgetHostBackingBytes:cachedBudgetHostBytes};
  });
  report.status='measured-provisional-baseline-not-release-qualified';
 }catch(error){report.status='failed';report.failures.push(error.message);}
 finally{
  for(const runner of runners)try{runner.destroy();}catch(error){report.status='failed';report.failures.push(error.message);}
  report.cleanupPassed=report.failures.length===0;
  if(report.provenance)try{await save('host-performance-report',marker.toDataURL(),report);}catch(error){report.status='failed';report.failures.push(error.message);}
  abort.abort();el('cancel').removeEventListener('click',stop);el('cancel').disabled=true;
  for(const [control,value]of snapshot){control.value=value;control.disabled=false;}busy=false;
  el('status').textContent=report.status==='failed'?`Host comparison failed: ${report.failures.join('; ')}`:'Host comparison retained · provisional baseline · not sustained60Hz';
  el('result').textContent=JSON.stringify(report,null,2);
 }
 return report;
}
