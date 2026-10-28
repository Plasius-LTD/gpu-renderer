// Capture integrity and reference convergence are deliberately separate gates.
import {roomQualificationPlan,validateRoomQualification} from './room-qualification.js';
import {MAX_OPTICAL_INTERFACES} from '../../src/wavefront-optical-interface-budget.js';

export const ROOM_CONVERGENCE_SCREEN=Object.freeze({normalizedRmse:0.03,absoluteEnergyDrift:0.01});
export function roomConvergenceSettingsFromSearch(search){
 const values=new URLSearchParams(search).getAll('convergenceResolution');
 if(values.length>1||values.some(v=>!['all','1080p','4k'].includes(v)))throw Error('Invalid convergence resolution');
 return values.length&&values[0]!=='all'?{resolutions:[values[0]]}:{};
}
export function roomConvergencePlan({resolutions=['1080p','4k']}={}){
 if(!Array.isArray(resolutions)||!resolutions.length||new Set(resolutions).size!==resolutions.length||resolutions.some(r=>!['1080p','4k'].includes(r)))throw Error('Invalid convergence resolutions');
 return resolutions.flatMap(resolution=>[32,128,256].flatMap(spp=>[7,19].map(seed=>{
  const lane=roomQualificationPlan({resolutions:[resolution],spp,opticalInterfaceBudget:{enabled:true,maximumInterfaces:MAX_OPTICAL_INTERFACES}}).find(l=>l.focus==='entry');
  return {...lane,seed,controls:{...lane.controls,'capture-seed':String(seed),'lighting-style':'daylight'}};
 })));
}
export function convergenceSceneIdentity(receipt){
 const r=receipt;
 if(!r?.scene||r.scene.proxyGeometry!==false||r.scene.referenceModels?.length!==2||!r.provenance?.assets||
  !r.lighting||!r.materialFlags||r.referenceMaterialMaps?.length!==2||!r.scene.camera||!(/^[a-f0-9]{64}$/).test(r.scene.room?.sha256)||
  !r.eamesSource?.manifest?.files?.length||r.eamesSource.manifest.files.some(f=>!(/^[a-f0-9]{64}$/).test(f.sha256))||
  ['renderer','lighting','shared','site'].some(key=>!(/^[a-f0-9]{40}$/).test(r.provenance.sources?.[key])))throw Error('Missing full-scene convergence identity');
 for(let i=0;i<2;i++)if(!(/^[a-f0-9]{64}$/).test(r.referenceMaterialMaps[i]?.assetSha256)||r.referenceMaterialMaps[i].assetSha256!==r.scene.referenceModels[i]?.asset?.sha256||
  r.referenceMaterialMaps[i].assetSha256!==r.provenance.assets.models?.[i]?.sha256)throw Error('Reference model/map identity mismatch');
 return JSON.stringify({sources:r.provenance.sources,assets:r.provenance.assets,scene:r.scene,lighting:r.lighting,
  eamesManifest:r.eamesSource.manifest,materialFlags:r.materialFlags,transportFlags:r.transportFlags,referenceMaterialMaps:r.referenceMaterialMaps,opticalInterfaceBudget:r.opticalInterfaceBudget});
}
export function validateConvergenceCapture(receipt,lane,sources,identity){
 const evidence=validateRoomQualification(receipt,lane,sources);
 if(receipt.frame.seed!==lane.seed||receipt.frame.mode!=='uniform'||receipt.frame.diagnostics!==true||receipt.frame.fused!==false||
  receipt.frame.validationErrors!==0||receipt.frame.visibilityBefore!=='visible'||receipt.frame.visibilityAfter!=='visible')throw Error('Convergence seed/mode/visibility failed');
 if(!receipt.pipelineSetup?.length||receipt.pipelineSetup.some(p=>p.status!=='complete'||!Number.isFinite(p.elapsedMs)||p.elapsedMs<0))throw Error('Missing/incomplete setup observation');
 if(Object.values(receipt.materialFlags??{}).some(Boolean))throw Error('Unexpected material experiment');
 const current=convergenceSceneIdentity(receipt);
 if(identity&&current!==identity)throw Error('Convergence scene/camera/assets/transport changed');
 return {...evidence,seed:lane.seed,identity:current};
}
export async function runRoomConvergence({configure,capture,signal,onLane=()=>{},onCheckpoint=()=>{},settings={}}){
 const plan=roomConvergencePlan(settings),report={schemaVersion:1,status:'running',scope:'native room convergence prequalification; not adaptive/performance acceptance',
  completeness:plan.length===12?'both-native-resolutions':'partial-single-resolution',plan,lanes:[],failures:[],sources:null,identity:null};
 try{
  await onCheckpoint(structuredClone(report));
  for(const lane of plan){
   if(signal?.aborted)throw Error('Room convergence cancelled');
   await configure(lane.controls);await onLane(lane,report.lanes.length,plan.length);
   const receipt=await capture();report.failedCaptureId=receipt?.provenance?.captureId??null;
   if(signal?.aborted)throw Error('Room convergence cancelled');
   const verified=validateConvergenceCapture(receipt,lane,report.sources,report.identity);
   report.lanes.push({...verified,identity:undefined});report.sources??=receipt.provenance.sources;report.identity??=verified.identity;delete report.failedCaptureId;
   await onCheckpoint(structuredClone(report));
  }
  report.status='captures-complete-convergence-pending';
 }catch(error){report.status='failed';report.failures.push(error.message);}
 return report;
}
export function convergenceComparisons(plan){
 const result=[];
 for(const resolution of new Set(plan.map(l=>l.resolution))){
  const get=(spp,seed)=>{const found=plan.filter(l=>l.resolution===resolution&&l.spp===spp&&l.seed===seed);if(found.length!==1)throw Error('Missing/duplicate convergence lane');return found[0];};
  for(const seed of [7,19])result.push({resolution,kind:'reference',candidate:get(128,seed),reference:get(256,seed)});
  result.push({resolution,kind:'reference',candidate:get(256,7),reference:get(256,19)});
  for(const seed of [7,19])result.push({resolution,kind:'candidate',candidate:get(32,seed),reference:get(256,seed===7?19:7)});
 }
 return result;
}
export function assessReferenceConvergence(metrics){
 if(metrics?.length!==3||metrics.some(m=>!Number.isFinite(m?.normalizedRmse)||m.normalizedRmse<0||!Number.isFinite(m.relativeEnergyDrift)))throw Error('Missing/invalid convergence metrics');
 const checks=metrics.map(m=>({rmse:m.normalizedRmse<=ROOM_CONVERGENCE_SCREEN.normalizedRmse,energy:Math.abs(m.relativeEnergyDrift)<=ROOM_CONVERGENCE_SCREEN.absoluteEnergyDrift}));
 return {passed:checks.every(c=>c.rmse&&c.energy),checks,limits:ROOM_CONVERGENCE_SCREEN,scope:'reference prequalification only; not production image or adaptive acceptance'};
}
