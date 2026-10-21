// Sequential qualification of the real room capture path, not a performance
// benchmark. Each capture owns GPU cleanup and retains its own HDR/provenance.
export const ROOM_QUALIFICATION_DEFAULTS=Object.freeze({resolutions:Object.freeze(['1080p','4k']),spp:32,bounces:20});
const sizes={'1080p':[1920,1080],'4k':[3840,2160]};
const sourceKeys=['renderer','lighting','shared','site'];
export function roomQualificationPlan({resolutions=ROOM_QUALIFICATION_DEFAULTS.resolutions,spp=ROOM_QUALIFICATION_DEFAULTS.spp,bounces=ROOM_QUALIFICATION_DEFAULTS.bounces}={}){
 if(!Array.isArray(resolutions)||!resolutions.length||new Set(resolutions).size!==resolutions.length||resolutions.some(r=>!sizes[r])||!Number.isInteger(spp)||spp<1||spp>256||!Number.isInteger(bounces)||bounces<1||bounces>20)throw Error('Invalid room qualification settings');
 return resolutions.flatMap(resolution=>[['empty','glass'],['filled','glass'],['filled','entry']].map(([glass,focus])=>{
  const [width,height]=sizes[resolution];
  return {resolution,glass,focus,width,height,spp,bounces,expectedSamples:width*height*spp,
   controls:{resolution,'spp':String(spp),'max-depth':String(bounces),'sample-distribution':'uniform',sampler:'fixed-pattern',splitting:'0',denoise:'off','material-inspection':'off',models:'all',
    'glass-mode':glass,'focus-view':focus,'glass-support-clearance':'0.0001','bounded-dielectric':'on','nested-media':'on','rough-dielectric':'off',sheen:'off',clearcoat:'off','wood-coat':'off'}};
 }));
}
export function validateRoomQualification(receipt,lane,source){
 if(receipt?.status==='failed')throw Error('Room qualification capture failed: '+(receipt.failures?.join('; ')||'missing failure detail'));
 const s=receipt?.settings,f=receipt?.frame;
 if(receipt?.status!=='captured-reference-not-qualified'||receipt.failures?.length||!receipt.cleanupPassed||!s||!f||
  s.width!==lane.width||s.height!==lane.height||s.maximumSpp!==lane.spp||s.maxDepth!==lane.bounces||s.sampler!=='fixed-pattern'||s.denoise!==false||
  receipt.inspection?.distribution!=='uniform'||f.actualSamples!==lane.expectedSamples||
  f.actualHistogram?.[lane.spp]!==lane.width*lane.height||Object.keys(f.actualHistogram).length!==1||
  !receipt.linearImage?.sha256||!receipt.linearImage.chunks?.length||sourceKeys.some(key=>!receipt.provenance?.sources?.[key])||receipt.adapter?.isFallbackAdapter!==false)throw Error('Room qualification receipt failed');
 if(source&&sourceKeys.some(key=>source[key]!==receipt.provenance.sources[key]))throw Error('Room qualification source changed between lanes');
 const settings=receipt.scene?.glassWater?.settings;
 if(settings?.mode!==lane.glass||settings.closeup!==(lane.focus==='glass')||receipt.splitDepth!==0||
  !receipt.transportFlags?.['renderer.transport.boundedDielectricBranching.enabled']||!receipt.transportFlags?.['renderer.transport.nestedMediaRefraction.enabled']||
  receipt.transportFlags?.['renderer.transport.roughDielectricTransport.enabled']!==false||
  ['dielectricProbe','opticalPathSamplingProbe','uvProbe','surfaceProbe','materialProbe'].some(key=>receipt[key]?.passed!==true)||receipt.samplingParityProbe?.status!=='passed')throw Error('Room qualification controls or preflight failed');
 return {resolution:lane.resolution,glass:lane.glass,focus:lane.focus,actualSamples:f.actualSamples,hdrSha256:receipt.linearImage.sha256,captureId:receipt.provenance.captureId};
}
export async function runRoomQualification({configure,capture,signal,onLane=()=>{},settings={}}){
 const lanes=roomQualificationPlan(settings),report={status:'running',scope:'physical room count/preflight capture; image convergence and performance unqualified',lanes:[],failures:[],sources:null};
 try{
  for(const lane of lanes){
   if(signal?.aborted)throw Error('Room qualification cancelled');
   await configure(lane.controls);await onLane(lane,report.lanes.length,lanes.length);
   const receipt=await capture();if(signal?.aborted)throw Error('Room qualification cancelled');
   try{report.lanes.push(validateRoomQualification(receipt,lane,report.sources));}
   catch(error){report.failedLane={resolution:lane.resolution,glass:lane.glass,focus:lane.focus,captureId:receipt?.provenance?.captureId??null,captureFailures:receipt?.failures??[]};throw error;}
   report.sources??=receipt.provenance.sources;
  }
  report.status='captures-complete-image-review-pending';
 }catch(error){report.status='failed';report.failures.push(error.message);}
 return report;
}
