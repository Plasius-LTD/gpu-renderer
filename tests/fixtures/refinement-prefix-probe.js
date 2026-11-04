import {createPairedProbeRunner} from './adaptive-paired-runner.js';
import {createPairedProbeScene} from '/lighting/demo/eames-environments/paired-adaptive-scenes.js';
import {normalizeWavefrontRefinementPolicy,planWavefrontRefinement} from '/performance/refinement.js';
const check=(v,m)=>{if(!v)throw Error(m);};
const equal=(a,b)=>{const x=new Uint32Array(a.buffer),y=new Uint32Array(b.buffer);return x.length===y.length&&x.every((n,i)=>n===y[i]);};
// Small actual-transport regression, not a native performance workload.
export async function runRefinementPrefixProbe({maximum=256,moving=17,splitDepth=1}={}){
 const width=17,height=13,scene={...createPairedProbeScene('diffuse-silhouette'),probeDepth:2};
 const controller=new AbortController(),runners=[],canvas=()=>{const c=document.createElement('canvas');c.width=width;c.height=height;return c;};
 const policy=normalizeWavefrontRefinementPolicy({enabled:true,maximumSamplesPerPixel:maximum,movingMaximumSamplesPerPixel:moving,maximumWorkUnitsPerBatch:16,stationaryRefinement:true,foveation:{enabled:true}});
 try{
  const runner=await createPairedProbeRunner(scene,controller.signal,{sampler:'fixed-pattern',splitDepth,native:{width,height,maximumSpp:maximum,canvas:canvas(),refinement:{policy}}});runners.push(runner);
  const input=(stationary=false)=>planWavefrontRefinement(policy,{moving:!stationary,previewComplete:runner.snapshot().previewComplete,frameTimeBudgetMs:0});
  await runner.runBatch(input());const preview=await runner.readImage();check(preview.actualSamples===width*height,'Missing first coverage');
  let guard=0;
  for(const focusPointUv of [[.5,.5],[.25,.75]]){
   do{check(++guard<100,'Focus queue stalled');await runner.runBatch(input(),{focusPointUv});}while(!runner.snapshot().finished);
  }
  const focused=await runner.readImage();check(focused.actualSamples>preview.actualSamples&&Object.keys(focused.actualHistogram).some(n=>Number(n)===moving),'Non-power focus endpoint missing');
  do{check(++guard<100,'Stationary queue stalled');await runner.runBatch(input(true));}while(!runner.snapshot().finished);
  const final=await runner.readImage();check(final.actualSamples===width*height*maximum&&final.counts.every(n=>n===maximum),'Stationary count/prefix failure');
  const canonical=await createPairedProbeRunner(scene,controller.signal,{sampler:'fixed-pattern',splitDepth,native:{width,height,maximumSpp:maximum,canvas:canvas(),budgets:new Uint16Array(width*height).fill(maximum)}});runners.push(canonical);
  const reference=await canonical.run('uniform',{sampler:'fixed-pattern',diagnostics:true});check(equal(final.image,reference.image),'256-ordinal split-path prefix mismatch');canonical.destroy();runners.pop();
  runner.reset({reason:'same-view',camera:scene.camera});await runner.runBatch(input());const reset=await runner.readImage();check(equal(preview.image,reset.image),'Authored same-view camera reset changed sample zero');
  runner.reset({reason:'budget-control',camera:scene.camera});
  const budgetPolicy=normalizeWavefrontRefinementPolicy({...policy,performanceBudget:true});
  const overrun=planWavefrontRefinement(budgetPolicy,{moving:true,previewComplete:false,frameTimeBudgetMs:1,estimatedWorkUnitMs:1000});
  const pending=runner.runBatch(overrun);check(runner.snapshot().pending,'No pending GPU promise');
  await runner.runBatch(overrun).then(()=>{throw Error('Concurrent batch admitted');},error=>check(error.message.includes('already pending'),'Wrong concurrent error'));
  const completed=await pending;check(completed.budgetReason==='minimum-work-unit-over-budget','Mandatory overrun hidden');
  const exhausted=planWavefrontRefinement(budgetPolicy,{moving:true,previewComplete:true,frameTimeBudgetMs:1,estimatedWorkUnitMs:1000});
  const skipped=await runner.runBatch(exhausted);check(skipped.issuedWorkUnits===0,'Budget exhaustion emitted optional work');
  const moved={...scene.camera,position:[scene.camera.position[0]+.25,...scene.camera.position.slice(1)]};
  runner.reset({reason:'changed-view',camera:moved});await runner.runBatch(input());const changed=await runner.readImage();check(changed.actualSamples===width*height&&!equal(changed.image,preview.image),'Changed view reused radiance');
  runner.destroy();runners.pop();
  return {status:'passed',scope:'small-transport-regression-not-performance',width,height,maximum,moving,splitDepth,focusedHistogram:focused.actualHistogram,completedSamples:final.actualSamples,canonicalPrimarySamples:reference.actualSamples,checks:['complete coverage','focus change retaining earned samples','non-power endpoint17','absolute ordinals0..255','split-camera-sample normalization','bitwise canonical HDR identity','identical-view reset','changed-view invalidation','one pending GPU promise','mandatory overrun','zero optional budget'],cleanupPassed:true};
 }finally{for(const r of runners)r.destroy();controller.abort();}
}
