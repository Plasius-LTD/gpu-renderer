import {createPairedProbeRunner} from './adaptive-paired-runner.js';
import {roomRefinementSettings} from './room-refinement-settings.js';
import {hashBytes} from './original-eames-scene.js';
import {composeRoomEamesScene,roomReferenceSettings} from '/lighting/demo/eames-environments/room-eames.js';
import {withRoomGlass,GLASS_WATER_DEFAULTS} from '/lighting/demo/eames-environments/glass-water-reference.js';
import {encodeLinearImageChunks} from '/lighting/demo/eames-environments/linear-image-chunks.js';
import {roomConvergencePlan} from './room-convergence.js';

const el=id=>document.getElementById(id),check=(v,m)=>{if(!v)throw Error(m);};let busy=false;
export async function runRoomRefinement({loadAssets,clearCapture,roomCompositionControls,resetRoomControls}) {
 if(busy)throw Error('Refinement already running');busy=true;
 const abort=new AbortController(),stop=()=>abort.abort(),runners=[];
 const controls=[...document.querySelectorAll('#controls input,#controls select,#controls button,#run,#reset')],snapshot=controls.map(c=>[c,c.value]);
 const report={schemaVersion:1,scope:'native-room-progressive-refinement',status:'running',batches:[],captures:[],failures:[],limitations:['Experimental source-pinned development contracts; no production flag activation','Scripted interaction/focus phases use a stationary camera to verify history ownership; actual moving-view qualification remains separate','No reprojection/variance stopping; changed integrands invalidate history','Budget predicts indivisible work, not a guaranteed display frame; timings include diagnostic status readback','Prior failed convergence screens remain failed under provisional user acceptance']};
 const marker=document.createElement('canvas');marker.width=1;marker.height=1;
 const save=async(name,image,payload)=>{const response=await fetch('/__plasius-capture',{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(30000),body:JSON.stringify({path:`output/playwright/eames-environments/${report.provenance.captureId}/${name}.png`,dataUrl:image,result:payload})});check(response.ok,'Refinement evidence retention failed');return response.json();};
 const checkpoint=()=>save('refinement-checkpoint',marker.toDataURL(),report);
 try{
  const controlsConfig=roomRefinementSettings(location.search,Number(el('spp').value));report.controls=controlsConfig;
  report.provenance=await(await fetch('/__provenance')).json();check(report.provenance.sources.performanceBuild,'Missing pinned performance policy build');
  const {normalizeWavefrontRefinementPolicy,planWavefrontRefinement}=await import('/performance/refinement.js');
  const policy=normalizeWavefrontRefinementPolicy({enabled:true,maximumSamplesPerPixel:controlsConfig.maximum,movingMaximumSamplesPerPixel:controlsConfig.moving,maximumWorkUnitsPerBatch:controlsConfig.units,stationaryRefinement:controlsConfig.stationary,performanceBudget:controlsConfig.performance,foveation:{enabled:controlsConfig.focus}});
  report.flagSnapshot={'renderer.sampling.progressiveRefinement.enabled':true,'renderer.sampling.foveated.enabled':controlsConfig.focus,'renderer.sampling.stationaryRefinement.enabled':controlsConfig.stationary,'renderer.sampling.performanceBudget.enabled':controlsConfig.performance};
  report.flagScope='explicit local laboratory opt-in; remote defaults remain disabled';report.policy=policy;
  controls.forEach(c=>c.disabled=true);el('cancel').disabled=false;el('cancel').addEventListener('click',stop);clearCapture();
  for(const resolution of controlsConfig.resolutions){
   resetRoomControls();const lane=roomConvergencePlan({resolutions:[resolution]})[0];
   for(const [id,value]of Object.entries(lane.controls))el(id).value=value;controls.forEach(c=>c.disabled=true);
   const source=await loadAssets(report,abort.signal),composed=withRoomGlass(composeRoomEamesScene({...source,...roomCompositionControls(source)}),{...GLASS_WATER_DEFAULTS,mode:'filled',closeup:false,supportClearance:Number(el('glass-support-clearance').value)});
   composed.scene.probeDepth=lane.bounces;report.scene=composed.evidence;
   const settings=roomReferenceSettings(resolution,'fixed-pattern',controlsConfig.maximum,lane.bounces),canvas=document.createElement('canvas');canvas.width=settings.width;canvas.height=settings.height;
   const runner=await createPairedProbeRunner(composed.scene,abort.signal,{sampler:'fixed-pattern',boundedDielectricBranching:true,nestedMediaRefraction:true,opticalInterfaceBudget:lane.opticalInterfaceBudget,native:{...settings,canvas,refinement:{policy}}});runners.push(runner);
   check(composed.evidence.referenceModels.length===2&&runner.sceneSnapshot.triangleCount===composed.evidence.sceneTriangleCount,'Full-scene refinement admission failed');
   report.adapter=runner.adapter;report.memory??=[];report.memory.push({resolution,...runner.memory});
   let cost;
   const capture=async(name,provided,captureCanvas=canvas)=>{
    const frame=provided??await runner.readImage(),linearImage={sha256:await hashBytes(frame.image.buffer),bytes:frame.image.byteLength,chunks:[]};let index=0;
    for await(const chunk of encodeLinearImageChunks(frame.image))linearImage.chunks.push({byteOffset:chunk.byteOffset,byteLength:chunk.byteLength,sha256:chunk.sha256,artifact:await save(`${resolution}-${name}-hdr-${index++}`,marker.toDataURL(),{provenance:report.provenance,chunk})});
    const item={resolution,phase:name,actualSamples:frame.actualSamples,actualHistogram:frame.actualHistogram,linearImage};item.artifact=await save(`${resolution}-${name}`,captureCanvas.toDataURL(),item);report.captures.push(item);await checkpoint();return frame;
   };
   let final;
   for(const stage of ['coverage','focus',...(controlsConfig.stationary?['stationary']:[])]){
    let guard=0;
    for(;;){
     check(!abort.signal.aborted,'Refinement cancelled');check(++guard<100000,'Refinement queue failed to finish');
     const state=runner.snapshot(),plan=planWavefrontRefinement(policy,{moving:stage!=='stationary',previewComplete:state.previewComplete,effectiveSamplesPerPixel:controlsConfig.moving,frameTimeBudgetMs:controlsConfig.budget,estimatedWorkUnitMs:cost});
     if(!plan.canRun){report.batches.push({resolution,stage,skipped:true,reason:plan.budgetReason});break;}
     const frame=await runner.runBatch(plan,{onProgress:p=>{el('status').textContent=`${resolution} ${stage} · coverage ${p.completedCoverageTiles}/${p.totalTiles} · GPU work pending`;}});
     if(frame.issuedWorkUnits>0)cost=frame.elapsedMs/frame.issuedWorkUnits;
     report.batches.push({resolution,stage,...frame});
     if(stage==='coverage'&&frame.previewComplete||stage!=='coverage'&&frame.finished)break;
     await new Promise(resolve=>requestAnimationFrame(resolve));
    }
    final=await capture(stage);
    if(stage==='coverage')check(final.actualSamples===settings.width*settings.height&&Object.keys(final.actualHistogram).length===1,'One-SPP-first contract failed');
   }
   if(controlsConfig.stationary){
    check(final.actualSamples===settings.width*settings.height*controlsConfig.maximum,'Stationary peripheral catch-up failed');
    // Independent unpartitioned canonical reference uses the identical sequence period.
    const referenceCanvas=document.createElement('canvas');referenceCanvas.width=settings.width;referenceCanvas.height=settings.height;
    const reference=await createPairedProbeRunner(composed.scene,abort.signal,{sampler:'fixed-pattern',boundedDielectricBranching:true,nestedMediaRefraction:true,opticalInterfaceBudget:lane.opticalInterfaceBudget,native:{...settings,canvas:referenceCanvas,budgets:new Uint16Array(settings.width*settings.height).fill(controlsConfig.maximum)}});runners.push(reference);
    const canonical=await reference.run('uniform',{sampler:'fixed-pattern',seed:7,diagnostics:true,onProgress:p=>{el('status').textContent=`${resolution} canonical prefix comparison · ${p.completedTiles}/${p.totalTiles} tiles`;}});
    await capture('canonical',canonical,referenceCanvas);
    const a=new Uint32Array(final.image.buffer),b=new Uint32Array(canonical.image.buffer);let mismatches=0,maxAbsoluteError=0;
    for(let i=0;i<a.length;i++){if(a[i]!==b[i])mismatches++;maxAbsoluteError=Math.max(maxAbsoluteError,Math.abs(final.image[i]-canonical.image[i]));}
    report.comparison??=[];report.comparison.push({resolution,mismatches,maxAbsoluteError,canonicalHdrSha256:await hashBytes(canonical.image.buffer),progressiveHdrSha256:await hashBytes(final.image.buffer),actualSamples:canonical.actualSamples});
    check(mismatches===0,'Partitioned/canonical radiance identity failed');reference.destroy();runners.pop();
   }
   runner.reset({reason:'camera-cut-regression',camera:runner.sceneSnapshot.camera});check(!runner.snapshot().previewComplete,'Camera reset retained stale history');
   const resetPlan=planWavefrontRefinement(policy,{moving:true,previewComplete:false,frameTimeBudgetMs:0});
   while(!runner.snapshot().previewComplete)await runner.runBatch(resetPlan);
   const resetFrame=await capture('reset-coverage');check(resetFrame.actualSamples===settings.width*settings.height,'Reset did not discard prior samples');
   runner.destroy();runners.pop();await checkpoint();
  }
  report.status='native-prefix-identity-passed-experimental-not-performance-qualified';
 }catch(error){report.status='failed';report.failures.push(error.message);}
 finally{
  for(const runner of runners)try{runner.destroy();}catch(error){report.failures.push(error.message);report.status='failed';}
  report.cleanupPassed=report.failures.length===0;
  if(report.provenance)try{await save('refinement-report',marker.toDataURL(),report);}catch(error){report.failures.push(error.message);report.status='failed';}
  abort.abort();el('cancel').removeEventListener('click',stop);el('cancel').disabled=true;for(const[c,value]of snapshot){c.value=value;c.disabled=false;}busy=false;
  el('status').textContent=report.status==='failed'?`Refinement failed: ${report.failures.join('; ')}`:'Progressive native prefix evidence retained · experimental';el('result').textContent=JSON.stringify(report,null,2);
 }
 return report;
}
