// Attribution only: reuse the existing sky NEE flag without changing transport.
import {roomConvergencePlan,validateConvergenceCapture} from './room-convergence.js';
export const SKY_IMPORTANCE_FLAG='renderer.environment.productStudioImportance.enabled';
export const SKY_IMPORTANCE_BIT=16;
export function roomSkyImportanceSettingsFromSearch(search){
 const values=new URLSearchParams(search).getAll('skyImportanceResolution');
 if(values.length>1||values.some(v=>!['1080p','4k'].includes(v)))throw Error('Invalid sky importance resolution');
 return values.length?{resolution:values[0]}:{};
}
export function roomSkyImportancePlan({resolution='1080p'}={}){
 const controls=roomConvergencePlan({resolutions:[resolution]}).filter(l=>l.spp===32);
 return [[7,false],[7,true],[19,true],[19,false]].map(([seed,environmentImportance])=>({...controls.find(l=>l.seed===seed),environmentImportance}));
}
export function validateSkyImportanceCapture(receipt,lane,sources,identity,baseFlags){
 // Preserve capture/device errors before checking metadata absent on failure.
 const transportFlags={...receipt?.transportFlags};delete transportFlags[SKY_IMPORTANCE_FLAG];
 const verified=validateConvergenceCapture({...receipt,transportFlags},lane,sources,identity);
 const bits=receipt?.admission?.transportExperimentFlags;
 if(typeof lane.environmentImportance!=='boolean'||receipt?.transportFlags?.[SKY_IMPORTANCE_FLAG]!==lane.environmentImportance||
  !Number.isSafeInteger(bits)||bits<0||bits>0xffffffff||Boolean(bits&SKY_IMPORTANCE_BIT)!==lane.environmentImportance||
  baseFlags!==undefined&&(bits&~SKY_IMPORTANCE_BIT)!==baseFlags)throw Error('Sky importance requested/resolved flag mismatch');
 // Only this explicitly controlled flag is removed from the common identity.
 const tiles=receipt.frame.tiles,columns=Math.ceil(lane.width/128),rows=Math.ceil(lane.height/128);
 if(!Array.isArray(tiles)||tiles.length!==columns*rows)throw Error('Sky importance missing native tile coverage');
 const counts=tiles.map((t,i)=>{
  const x=i%columns*128,y=Math.floor(i/columns)*128,width=Math.min(128,lane.width-x),height=Math.min(128,lane.height-y),primary=width*height*lane.spp,r=t.telemetry?.rayCounts;
  if(t.tileIndex!==i||t.tile?.x!==x||t.tile.y!==y||t.tile.width!==width||t.tile.height!==height||t.sampleRounds!==lane.spp||t.expectedPrimaryRays!==primary||
   r?.status!=='available'||r.expectedPrimaryRays!==primary||r.observedPrimaryRays!==primary||!Number.isSafeInteger(r.secondaryRays)||r.secondaryRays<0||r.totalPathSegments!==primary+r.secondaryRays)throw Error('Sky importance native ray/count evidence failed');
  return {primary,secondary:r.secondaryRays,segments:r.totalPathSegments,bounceHistogram:r.bounceHistogram,additionalOpticalSegments:r.additionalOpticalSegments};
 });
 return {...verified,environmentImportance:lane.environmentImportance,baseFlags:bits&~SKY_IMPORTANCE_BIT,counts};
}
export async function runRoomSkyImportance({configure,capture,signal,onLane=()=>{},onCheckpoint=()=>{},settings={}}){
 const plan=roomSkyImportancePlan(settings),report={schemaVersion:1,status:'running',scope:'fixed-SPP sky NEE attribution; no adaptive/performance/convergence acceptance',plan,lanes:[],failures:[],sources:null,identity:null};
 try{
  await onCheckpoint(structuredClone(report));
  for(const lane of plan){
   if(signal?.aborted)throw Error('Sky importance comparison cancelled');
   await configure(lane.controls);await onLane(lane,report.lanes.length,plan.length);
   const receipt=await capture(lane);report.failedCaptureId=receipt?.provenance?.captureId??null;
   if(signal?.aborted)throw Error('Sky importance comparison cancelled');
   const verified=validateSkyImportanceCapture(receipt,lane,report.sources,report.identity,report.baseFlags);
   if(report.lanes.some(l=>l.hdrSha256===verified.hdrSha256||l.captureId===verified.captureId))throw Error('Duplicate sky importance capture');
   const pair=report.lanes.find(l=>l.seed===lane.seed);
   if(pair&&JSON.stringify(pair.counts)!==JSON.stringify(verified.counts))throw Error('Sky importance changed same-seed continuation rays');
   report.lanes.push({...verified,identity:undefined});report.sources??=receipt.provenance.sources;report.identity??=verified.identity;report.baseFlags??=verified.baseFlags;delete report.failedCaptureId;
   await onCheckpoint(structuredClone(report));
  }
  report.status='captures-complete-variance-analysis-pending';
 }catch(error){report.status='failed';report.failures.push(error.message);}
 return report;
}
