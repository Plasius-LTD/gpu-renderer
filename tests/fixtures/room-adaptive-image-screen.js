// Read-only prescribed-budget admission; never a production quality governor.
import {createAdaptiveTilePlan} from '../../src/wavefront-adaptive-tile-plan.js';
import {convergenceSceneIdentity,roomConvergencePlan,validateConvergenceCapture} from './room-convergence.js';

const check=(value,message)=>{if(!value)throw Error('Adaptive room screen: '+message);};
const histogramEntries=value=>Object.entries(value??{}).sort(([a],[b])=>Number(a)-Number(b));
export function adaptiveSceneIdentity(receipt){
 const identity=JSON.parse(convergenceSceneIdentity(receipt));
 // Reference uncertainty changes frame keys only. No scene/transport field is removed.
 delete identity.referenceSources;delete identity.referenceProbeSource;
 return JSON.stringify(identity);
}
export function validateAdaptiveRoomCapture(receipt,{reference,plan}){
 if(receipt?.status==='failed')throw Error('Adaptive room capture failed: '+(receipt.failures?.join('; ')||'missing failure detail'));
 const resolution=plan?.width===1920&&plan.height===1080?'1080p':plan?.width===3840&&plan.height===2160?'4k':null;
 check(resolution,'native 1080p/4K required');
 const lane=roomConvergencePlan({resolutions:[resolution]})[0];validateConvergenceCapture(reference,lane);
 check(receipt?.status==='captured-reference-not-qualified'&&receipt.failures?.length===0&&receipt.cleanupPassed===true,'capture or cleanup failed');
 check(adaptiveSceneIdentity(receipt)===adaptiveSceneIdentity(reference),'source/scene/camera/assets/material/transport changed');
 check(JSON.stringify(receipt.settings)===JSON.stringify(reference.settings)&&receipt.splitDepth===0&&Object.values(receipt.materialFlags).every(v=>v===false),'settings changed');
 check(JSON.stringify(receipt.admission)===JSON.stringify(reference.admission),'resolved GPU admission/flags changed');
 check(receipt.adapter?.isFallbackAdapter===false&&receipt.pipelineSetup?.length>0&&receipt.pipelineSetup.every(p=>p.status==='complete'&&Number.isFinite(p.elapsedMs)&&p.elapsedMs>=0),'physical adapter/setup evidence missing');
 check(['dielectricProbe','opticalPathSamplingProbe','uvProbe','surfaceProbe','materialProbe'].every(k=>receipt[k]?.passed===true)&&receipt.samplingParityProbe?.status==='passed','preflight failed');
 check(!receipt.referenceSampling&&!receipt.referenceSamplingProbe,'candidate must use normal production transport keys');
 const f=receipt.frame;
 check(receipt.inspection?.distribution==='radial'&&f?.mode==='radial'&&f.diagnostics===true&&f.fused===false&&f.validationErrors===0&&f.visibilityBefore==='visible'&&f.visibilityAfter==='visible','mode/visibility/validation failed');
 check(['width','height','maximumSpp','sampler'].every(k=>f[k]===receipt.settings[k])&&Number.isSafeInteger(f.seed)&&f.seed>=0&&f.seed<=0xffffffff,'frame settings/seed mismatch');
 const tiles=createAdaptiveTilePlan({enabled:true,width:plan.width,height:plan.height,budgets:plan.budgets});
 const histogram={};let expected=0;
 for(const tile of tiles){expected+=tile.expectedPrimaryRays;for(const [spp,pixels]of Object.entries(tile.histogram))histogram[spp]=(histogram[spp]??0)+pixels;}
 const bandHistogram={};
 check(Array.isArray(plan.bands)&&plan.bands.length>0,'missing lighting-owned bands');
 for(const band of plan.bands){check(Number.isSafeInteger(band.spp)&&band.spp>=1&&band.spp<=lane.spp&&Number.isSafeInteger(band.pixels)&&band.pixels>0,'invalid band');bandHistogram[band.spp]=(bandHistogram[band.spp]??0)+band.pixels;}
 check(JSON.stringify(histogramEntries(histogram))===JSON.stringify(histogramEntries(bandHistogram))&&plan.totalSamples===expected&&plan.meanSpp===expected/(plan.width*plan.height),'budget map/bands mismatch');
 check(receipt.budgets?.totalSamples===expected&&receipt.budgets.meanSpp===plan.meanSpp&&JSON.stringify(receipt.budgets.bands)===JSON.stringify(plan.bands)&&/^[a-f0-9]{64}$/.test(plan.sha256)&&receipt.budgets.sha256===plan.sha256,'retained budget identity changed');
 check(f.actualSamples===expected&&JSON.stringify(histogramEntries(f.actualHistogram))===JSON.stringify(histogramEntries(histogram)),'completed sample/histogram mismatch');
 check(Array.isArray(f.tiles)&&f.tiles.length===tiles.length,'missing native tiles');
 let primary=0,secondary=0,segments=0;
 for(const [i,p]of tiles.entries()){
  const t=f.tiles[i],r=t?.telemetry?.rayCounts,rounds=p.ranges.at(-1).sampleLimit;
  check(t?.tileIndex===i&&JSON.stringify(t.tile)===JSON.stringify(p.tile)&&t.sampleRounds===rounds&&t.expectedPrimaryRays===p.expectedPrimaryRays,'tile extent/order/rounds mismatch');
  check(r?.status==='available'&&r.expectedPrimaryRays===p.expectedPrimaryRays&&r.observedPrimaryRays===p.expectedPrimaryRays&&r.bounceHistogram?.[0]===p.expectedPrimaryRays&&
   r.bounceHistogram.length===lane.bounces&&r.bounceHistogram.every(n=>Number.isSafeInteger(n)&&n>=0)&&Number.isSafeInteger(r.secondaryRays)&&r.secondaryRays>=0&&Number.isSafeInteger(r.totalPathSegments)&&
   r.totalPathSegments===r.observedPrimaryRays+r.secondaryRays&&r.totalPathSegments===r.bounceHistogram.reduce((a,b)=>a+b,0)+(r.additionalOpticalSegments??0),'tile primary/continuation accounting failed');
  primary+=r.observedPrimaryRays;secondary+=r.secondaryRays;segments+=r.totalPathSegments;
 }
 const memory=receipt.memory;
 check(memory&&['rendererBufferBytes','adaptiveBufferBytes','telemetryBufferBytes','fixtureStagingBytes','cachedBudgetHostBytes'].every(k=>Number.isSafeInteger(memory[k])&&memory[k]>0)&&memory.adaptiveBufferBytes>=plan.width*plan.height*4&&Array.isArray(memory.textureInventory),'missing allocation inventory');
 const uniform=lane.width*lane.height*lane.spp;
 return {resolution,primaryRays:primary,secondaryRays:secondary,totalPathSegments:segments,uniform32PrimaryRays:uniform,primaryReductionFraction:1-primary/uniform,
  actualHistogram:histogram,memory,counterScope:'Camera and continuation segments; excludes shadow/BVH queries. No timing or physical-residency inference.',
  samplingScope:'Normal production fixed-pattern transport; frame seed metadata is not independent replication.'};
}
export function compareAdaptiveTiers(candidate,reference,budgets,compare){
 check(candidate instanceof Float32Array&&reference instanceof Float32Array&&candidate.length>0&&candidate.length===reference.length&&candidate.length%4===0,'invalid image extent');
 check((budgets instanceof Uint8Array||budgets instanceof Uint16Array)&&budgets.length===candidate.length/4&&budgets.every(n=>n>=1&&n<=256),'invalid pixel budget map');
 const global=compare(candidate,reference),tiers=[];
 const counts=new Map();for(const n of budgets)counts.set(n,(counts.get(n)??0)+1);
 for(const [spp,pixels]of [...counts].sort(([a],[b])=>a-b)){
  const a=new Float32Array(pixels*4),b=new Float32Array(pixels*4);let offset=0;
  for(let i=0;i<budgets.length;i++)if(budgets[i]===spp){a.set(candidate.subarray(i*4,i*4+4),offset);b.set(reference.subarray(i*4,i*4+4),offset);offset+=4;}
  tiers.push({spp,pixels,metrics:compare(a,b)});
 }
 return {global,tiers};
}
function validMetric(m,pixels){
 check(Number.isSafeInteger(m?.pixels)&&m.pixels>0&&(pixels===undefined||m.pixels===pixels)&&['rgbRmse','normalizedRmse','p99LocalError'].every(k=>Number.isFinite(m[k])&&m[k]>=0)&&Number.isFinite(m.relativeEnergyDrift),'missing/invalid quality metrics');
}
export function assessAdaptiveImageScreen(pairs,uncertainty,assessQuality){
 check(Array.isArray(pairs)&&pairs.length===2&&JSON.stringify(pairs.map(p=>p.referenceSeed).sort((a,b)=>a-b))==='[7,19]','two independent references required');
 validMetric(uncertainty?.global);check(uncertainty.tiers?.length>0,'missing local reference uncertainty');
 const tiers=uncertainty.tiers.map(t=>[t.spp,t.pixels]);
 check(new Set(tiers.map(t=>t[0])).size===tiers.length&&tiers.every(([spp,pixels])=>Number.isSafeInteger(spp)&&spp>=1&&spp<=256&&Number.isSafeInteger(pixels)&&pixels>0)&&tiers.reduce((n,t)=>n+t[1],0)===uncertainty.global.pixels,'invalid uncertainty tiers');
 const assess=(a,b,c,pixels)=>{
  for(const metric of [a,b,c])validMetric(metric,pixels);
  const result=assessQuality(a,b,c),values=Object.values(result?.checks??{});
  check(typeof result?.passed==='boolean'&&values.length>0&&values.every(v=>typeof v==='boolean')&&result.passed===values.every(Boolean),'invalid lighting quality assessment');return result;
 };
 const checks=pairs.map(p=>{
  for(const group of [p.candidate,p.baseline])check(JSON.stringify(group?.tiers?.map(t=>[t.spp,t.pixels]))===JSON.stringify(tiers),'candidate/baseline tier mismatch');
  return {referenceSeed:p.referenceSeed,global:assess(p.candidate.global,p.baseline.global,uncertainty.global,uncertainty.global.pixels),
   tiers:uncertainty.tiers.map((t,i)=>({spp:t.spp,pixels:t.pixels,...assess(p.candidate.tiers[i].metrics,p.baseline.tiers[i].metrics,t.metrics,t.pixels)}))};
 });
 return {passed:checks.every(c=>c.global.passed&&c.tiers.every(t=>t.passed)),checks,
  scope:'Prescribed-budget image prequalification only; no local/temporal/disabled-path/performance/release acceptance.'};
}
