// Read-only descriptive attribution. Never grants image/performance acceptance.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {captureFile,readRoomHdr,compareRowMeans} from './verify-room-convergence.mjs';
import {roomSkyImportancePlan,runRoomSkyImportance} from '../tests/fixtures/room-sky-importance.js';
import {ROOM_CONVERGENCE_SCREEN} from '../tests/fixtures/room-convergence.js';
import {validateOpticalBudgetEvidence} from '../tests/fixtures/optical-budget-evidence.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
export function assessSkyVariance(uniform,cosine,paired){
 if(![uniform,cosine,...paired??[]].every(m=>Number.isFinite(m?.rgbRmse)&&m.rgbRmse>=0&&Number.isFinite(m.relativeEnergyDrift))||paired?.length!==2)throw Error('Missing/invalid sky variance metrics');
 return {withinModePairMseRatio:uniform.rgbRmse>0?(cosine.rgbRmse/uniform.rgbRmse)**2:null,
  energyScreen:paired.every(m=>Math.abs(m.relativeEnergyDrift)<=ROOM_CONVERGENCE_SCREEN.absoluteEnergyDrift),energyLimit:ROOM_CONVERGENCE_SCREEN.absoluteEnergyDrift,
  claim:'Two-replicate descriptive attribution only; no confidence bound, converged reference, unbiasedness proof, adaptive/performance or memory acceptance.'};
}
export async function verifyRoomSkyImportance(root,lightingRoot,summaryFile){
 const base=fs.realpathSync(path.resolve(root,'output/playwright/eames-environments'));
 if(!fs.realpathSync(summaryFile).startsWith(base+path.sep))throw Error('Summary outside capture root');
 const bytes=fs.readFileSync(summaryFile),s=JSON.parse(bytes),resolution=s.plan?.[0]?.resolution,plan=roomSkyImportancePlan({resolution});
 if(s.status!=='captures-complete-variance-analysis-pending'||s.failures?.length!==0||JSON.stringify(s.plan)!==JSON.stringify(plan)||s.lanes?.length!==4)throw Error('Missing/failed/reordered sky comparison');
 const loaded=[];
 const rebuilt=await runRoomSkyImportance({settings:{resolution},configure:()=>{},capture:lane=>{
  const entry=readRoomHdr(root,captureFile(root,s.lanes[loaded.length].captureId));
  validateOpticalBudgetEvidence({settings:{...entry.receipt.settings,opticalInterfaceBudget:entry.receipt.opticalInterfaceBudget},frame:entry.receipt.frame,probe:entry.receipt.opticalPathSamplingProbe});
  if(entry.receipt.frame.seed!==lane.seed)throw Error('Reordered retained capture');loaded.push(entry);return entry.receipt;
 }});
 if(rebuilt.status!==s.status||JSON.stringify(rebuilt.lanes)!==JSON.stringify(s.lanes)||rebuilt.identity!==s.identity||rebuilt.baseFlags!==s.baseFlags||JSON.stringify(rebuilt.sources)!==JSON.stringify(s.sources))throw Error('Retained sky comparison changed or invalid: '+rebuilt.failures.join('; '));
 const relative='demo/eames-environments/paired-adaptive-metrics.js',metricFile=path.resolve(lightingRoot,relative),metricBytes=fs.readFileSync(metricFile);
 if(!metricBytes.equals(execFileSync('git',['-C',lightingRoot,'show',`${s.sources.lighting}:${relative}`],{maxBuffer:1024**2})))throw Error('Lighting metrics differ from capture pin');
 const {compareLinearImages,PAIRED_PROBE_LIMITS}=await import(pathToFileURL(metricFile).href);
 if(PAIRED_PROBE_LIMITS.absoluteEnergyDrift!==ROOM_CONVERGENCE_SCREEN.absoluteEnergyDrift||PAIRED_PROBE_LIMITS.referenceNormalizedRmse!==ROOM_CONVERGENCE_SCREEN.normalizedRmse)throw Error('Frozen image screens changed');
 const comparisons=[[0,3],[1,2],[1,0],[2,3]].map(([a,b])=>({candidate:plan[a],reference:plan[b],metrics:compareLinearImages(loaded[a].image,loaded[b].image),rowAttribution:compareRowMeans(loaded[a].image,loaded[b].image,plan[a].width,plan[a].height)}));
 return {schemaVersion:1,status:'descriptive-attribution-not-qualified',resolution,sources:s.sources,summarySha256:hash(bytes),metricsSourceSha256:hash(metricBytes),
  evidence:loaded.map(e=>e.evidence),sameSeedContinuationCountsMatch:true,counterScope:'Camera and continuation segments only; shadow/BVH queries and total GPU time are not counted here.',
  comparisons,assessment:assessSkyVariance(comparisons[0].metrics,comparisons[1].metrics,comparisons.slice(2).map(c=>c.metrics))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await verifyRoomSkyImportance(...process.argv.slice(2)),null,2));
