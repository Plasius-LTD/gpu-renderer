// Read-only native image admission. References are reverified, never trusted by label.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {verifyRoomConvergence,convergenceEvidenceExitCode,readRoomHdr,captureFile,compareRowMeans} from './verify-room-convergence.mjs';
import {validateOpticalBudgetEvidence} from '../tests/fixtures/optical-budget-evidence.js';
import {validateAdaptiveRoomCapture,compareAdaptiveTiers,assessAdaptiveImageScreen} from '../tests/fixtures/room-adaptive-image-screen.js';

const hash=value=>createHash('sha256').update(value).digest('hex');
const claim='Prescribed radial image screen only. No adaptive flag enablement, classifier, disabled-path, matched-quality performance, sustained60Hz, memory-saving or release qualification.';
function pinnedModule(root,source,relative){
 const file=path.resolve(root,relative),bytes=fs.readFileSync(file);
 if(!/^[a-f0-9]{40}$/.test(source)||!bytes.equals(execFileSync('git',['-C',root,'show',`${source}:${relative}`],{maxBuffer:1024**2})))throw Error('Lighting screen source differs from capture pin');
 return {url:pathToFileURL(file).href,sha256:hash(bytes)};
}
export async function verifyRoomAdaptiveImages(root,lightingRoot,referenceSummary,candidateIds){
 let references;
 try{
  references=await verifyRoomConvergence(root,lightingRoot,referenceSummary);
  if(convergenceEvidenceExitCode(references)!==0)return {schemaVersion:1,status:'blocked-reference-evidence',reason:'Complete native reference convergence/energy screen failed',references,resolutions:[],claim};
 }catch(error){return {schemaVersion:1,status:'blocked-reference-evidence',reason:error.message,resolutions:[],claim};}
 if(!Array.isArray(candidateIds)||candidateIds.length!==2||new Set(candidateIds).size!==2)throw Error('One distinct radial capture at each native resolution is required');
 const metricsModule=pinnedModule(lightingRoot,references.sources.lighting,'demo/eames-environments/paired-adaptive-metrics.js');
 const radialModule=pinnedModule(lightingRoot,references.sources.lighting,'demo/eames-environments/radial-sampling-plan.js');
 const {compareLinearImages,assessQuality,PAIRED_PROBE_LIMITS}=await import(metricsModule.url);
 const {createRadialSamplingPlan}=await import(radialModule.url);
 if(metricsModule.sha256!==references.metricsSourceSha256||PAIRED_PROBE_LIMITS.errorRatio!==1.10||PAIRED_PROBE_LIMITS.errorSlack!==1e-5||PAIRED_PROBE_LIMITS.absoluteEnergyDrift!==.01||PAIRED_PROBE_LIMITS.referenceNormalizedRmse!==.03)throw Error('Frozen adaptive image screen changed');
 const resolutions=[];
 for(const [index,resolution]of ['1080p','4k'].entries()){
  const ref=(spp,seed)=>{const found=references.evidence.filter(e=>e.resolution===resolution&&e.spp===spp&&e.seed===seed);if(found.length!==1)throw Error('Missing/duplicate verified reference');return found[0].file;};
  const file=captureFile(root,candidateIds[index]);
  const size=resolution==='1080p'?[1920,1080]:[3840,2160],plan=createRadialSamplingPlan(...size,32);
  const budgetPlan={...plan,sha256:hash(Buffer.from(plan.budgets.buffer,plan.budgets.byteOffset,plan.budgets.byteLength))};
  // Each helper keeps at most a full-image pair and one tier pair live.
  const admission=()=>{
   const candidate=readRoomHdr(root,file),baseline=readRoomHdr(root,ref(32,7));
   const workload=validateAdaptiveRoomCapture(candidate.receipt,{reference:baseline.receipt,plan:budgetPlan});
   if(workload.resolution!==resolution)throw Error('Reordered native candidate captures');
   validateOpticalBudgetEvidence({settings:{...candidate.receipt.settings,opticalInterfaceBudget:candidate.receipt.opticalInterfaceBudget},frame:candidate.receipt.frame,probe:candidate.receipt.opticalPathSamplingProbe});
   return {workload,evidence:candidate.evidence};
  };
  const {workload,evidence}=admission();
  const compare=(candidateFile,referenceFile)=>{
   const a=readRoomHdr(root,candidateFile),b=readRoomHdr(root,referenceFile);
   return {...compareAdaptiveTiers(a.image,b.image,plan.budgets,compareLinearImages),rowAttribution:compareRowMeans(a.image,b.image,...size)};
  };
  const uncertainty=compare(ref(256,7),ref(256,19));
  const pairs=[7,19].map(referenceSeed=>({referenceSeed,candidate:compare(file,ref(256,referenceSeed)),baseline:compare(ref(32,referenceSeed===7?19:7),ref(256,referenceSeed))}));
  const assessment=assessAdaptiveImageScreen(pairs,uncertainty,assessQuality);
  resolutions.push({resolution,...assessment,evidence,workload,pairs,uncertainty});
 }
 return {schemaVersion:1,status:resolutions.every(r=>r.passed)?'adaptive-image-screen-passed-not-qualified':'adaptive-image-screen-failed',
  sources:references.sources,referenceSummarySha256:references.summarySha256,metricsSourceSha256:metricsModule.sha256,radialSourceSha256:radialModule.sha256,
  referenceStatus:references.status,resolutions,claim};
}
export function adaptiveImageScreenExitCode(report){
 return report?.status==='adaptive-image-screen-passed-not-qualified'&&report.resolutions?.length===2&&JSON.stringify(report.resolutions.map(r=>r.resolution).sort())==='["1080p","4k"]'&&report.resolutions.every(r=>r.passed===true)?0:1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [root,lightingRoot,summary,...ids]=process.argv.slice(2);
 try{const report=await verifyRoomAdaptiveImages(root,lightingRoot,summary,ids);console.log(JSON.stringify(report,null,2));process.exitCode=adaptiveImageScreenExitCode(report);}
 catch(error){console.error(error.message);process.exitCode=1;}
}
