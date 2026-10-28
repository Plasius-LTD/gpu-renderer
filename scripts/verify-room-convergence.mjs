// Offline/read-only qualification. Reuse gpu-lighting metrics; never a renderer.
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {roomConvergencePlan,validateConvergenceCapture,convergenceComparisons,assessReferenceConvergence,ROOM_CONVERGENCE_SCREEN} from '../tests/fixtures/room-convergence.js';
import {validateOpticalBudgetEvidence} from '../tests/fixtures/optical-budget-evidence.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
function inside(base,file){
 const actual=fs.realpathSync(file);
 if(!actual.startsWith(fs.realpathSync(base)+path.sep))throw Error('Evidence outside capture root');
 return actual;
}
export function readRoomHdr(root,file){
 // Check the requested path before opening it, as well as resolved symlinks.
 const requestedBase=path.resolve(root,'output/playwright/eames-environments');
 if(!path.resolve(file).startsWith(requestedBase+path.sep))throw Error('Evidence outside capture root');
 root=fs.realpathSync(root);const base=path.resolve(root,'output/playwright/eames-environments');
 file=inside(base,file);const receiptBytes=fs.readFileSync(file),r=JSON.parse(receiptBytes),{width,height}=r.settings??{};
 const bytes=width*height*16;
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||bytes>3840*2160*16||r.linearImage?.uncompressedBytes!==bytes||!Array.isArray(r.linearImage.chunks))throw Error('Invalid HDR extent');
 const raw=Buffer.alloc(bytes);let offset=0;
 for(const part of r.linearImage.chunks){
  const requested=path.resolve(root,part.artifact?.path?.replace(/\.png$/,'.json')??'');
  if(path.dirname(requested)!==path.dirname(file))throw Error('Chunk outside capture');
  const chunkReceipt=JSON.parse(fs.readFileSync(inside(path.dirname(file),requested))),c=chunkReceipt.chunk;
  if(JSON.stringify(chunkReceipt.provenance)!==JSON.stringify(r.provenance)||c?.format!=='float32-byteplanes-gzip-base64'||c.byteOffset!==offset||c.byteOffset!==part.byteOffset||
   c.totalBytes!==bytes||!Number.isSafeInteger(c.byteLength)||c.byteLength<16||c.byteLength%16||c.byteLength>8*1024**2||c.byteLength!==part.byteLength||offset+c.byteLength>bytes)throw Error('HDR chunk extent/source failure');
  const shuffled=gunzipSync(Buffer.from(c.data,'base64'),{maxOutputLength:c.byteLength});
  if(shuffled.length!==c.byteLength)throw Error('HDR decompression extent failure');
  const restored=Buffer.alloc(shuffled.length),n=restored.length/4;
  for(let p=0;p<4;p++)for(let i=0;i<n;i++)restored[i*4+p]=shuffled[p*n+i];
  if(hash(restored)!==c.sha256||c.sha256!==part.sha256)throw Error('HDR chunk hash failure');restored.copy(raw,offset);offset+=restored.length;
 }
 if(offset!==bytes||hash(raw)!==r.linearImage.sha256)throw Error('Incomplete/changed HDR hash');
 const image=new Float32Array(bytes/4);
 for(let i=0;i<image.length;i++){
  const value=raw.readFloatLE(i*4);
  if(!Number.isFinite(value)||value<0||(i%4===3&&value!==1))throw Error('Invalid/incomplete HDR pixel');image[i]=value;
 }
 const png=fs.readFileSync(inside(path.dirname(file),file.replace(/\.json$/,'.png')));
 if(png.length<24||png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||png.readUInt32BE(16)!==width||png.readUInt32BE(20)!==height)throw Error('PNG native extent failure');
 return {receipt:r,image,evidence:{file,receiptSha256:hash(receiptBytes),hdrSha256:hash(raw),pngSha256:hash(png),verifiedPixels:width*height,verifiedChunks:r.linearImage.chunks.length}};
}
export function compareRowMeans(a,b,width,height){
 if(a.length!==width*height*4||b.length!==a.length)throw Error('Row image extent mismatch');
 const rows=[];let maximumAbsoluteMeanDifference=0;
 for(let y=0;y<height;y++){
  let candidate=0,reference=0;
  for(let x=0;x<width;x++){
   const i=(y*width+x)*4;
   candidate+=.2126*a[i]+.7152*a[i+1]+.0722*a[i+2];reference+=.2126*b[i]+.7152*b[i+1]+.0722*b[i+2];
  }
  candidate/=width;reference/=width;const delta=candidate-reference;
  maximumAbsoluteMeanDifference=Math.max(maximumAbsoluteMeanDifference,Math.abs(delta));rows.push({y,candidate,reference,delta});
 }
 return {maximumAbsoluteMeanDifference,rows,scope:'signed row attribution, not proof of absence of local banding'};
}
function captureFile(root,id){
 if(typeof id!=='string'||!/^room-reference-[a-zA-Z0-9-]+$/.test(id))throw Error('Invalid retained capture identity');
 const base=path.resolve(root,'output/playwright/eames-environments'),directory=inside(base,path.join(base,id));
 const files=fs.readdirSync(directory).filter(f=>f.endsWith('.json')&&!f.includes('-hdr-')).map(f=>path.join(directory,f)).filter(f=>JSON.parse(fs.readFileSync(inside(directory,f))).scope==='room-eames-interior-reference');
 if(files.length!==1)throw Error('Missing/duplicate retained room receipt');return files[0];
}
export async function verifyRoomConvergence(root,lightingRoot,summaryFile){
 const summaryBytes=fs.readFileSync(inside(path.resolve(root,'output/playwright/eames-environments'),summaryFile)),s=JSON.parse(summaryBytes);
 if(s.status!=='captures-complete-convergence-pending'||s.failures?.length!==0||!Array.isArray(s.plan)||!Array.isArray(s.lanes))throw Error('Missing/failed convergence batch');
 const resolutions=[...new Set(s.plan.map(l=>l.resolution))],plan=roomConvergencePlan({resolutions});
 if(JSON.stringify(s.plan)!==JSON.stringify(plan)||s.lanes.length!==plan.length||s.completeness!==(plan.length===12?'both-native-resolutions':'partial-single-resolution')||new Set(s.lanes.map(l=>l.captureId)).size!==plan.length)throw Error('Missing/duplicate/reordered convergence plan');
 const source=s.sources?.lighting;if(!/^[a-f0-9]{40}$/.test(source))throw Error('Missing lighting source');
 const relative='demo/eames-environments/paired-adaptive-metrics.js',metricFile=path.resolve(lightingRoot,relative),metricBytes=fs.readFileSync(metricFile);
 if(!metricBytes.equals(execFileSync('git',['-C',lightingRoot,'show',`${source}:${relative}`],{maxBuffer:1024**2})))throw Error('Lighting metrics differ from capture pin');
 const {compareLinearImages,PAIRED_PROBE_LIMITS}=await import(pathToFileURL(metricFile).href);
 if(PAIRED_PROBE_LIMITS.referenceNormalizedRmse!==ROOM_CONVERGENCE_SCREEN.normalizedRmse||PAIRED_PROBE_LIMITS.absoluteEnergyDrift!==ROOM_CONVERGENCE_SCREEN.absoluteEnergyDrift)throw Error('Frozen convergence screen changed');
 let identity;const files=[];const evidence=[];
 for(let i=0;i<plan.length;i++){
  const lane=plan[i],file=captureFile(root,s.lanes[i].captureId),{receipt:r,evidence:e}=readRoomHdr(root,file);
  const verified=validateConvergenceCapture(r,lane,s.sources,identity);identity??=verified.identity;
  if(JSON.stringify(verified)!==JSON.stringify({...s.lanes[i],identity:verified.identity})||identity!==s.identity)throw Error('Retained convergence lane changed');
  validateOpticalBudgetEvidence({settings:{...r.settings,opticalInterfaceBudget:r.opticalInterfaceBudget},frame:r.frame,probe:r.opticalPathSamplingProbe});
  let primary=0;const seen=new Set();
  for(const [index,tile]of r.frame.tiles.entries()){
   const t=tile.tile,key=t.x+':'+t.y,counts=tile.telemetry.rayCounts;
   if(tile.tileIndex!==index||seen.has(key)||t.x<0||t.y<0||t.x>=lane.width||t.y>=lane.height||t.x%128||t.y%128||t.width!==Math.min(128,lane.width-t.x)||t.height!==Math.min(128,lane.height-t.y)||
    tile.sampleRounds!==lane.spp||tile.expectedPrimaryRays!==t.width*t.height*lane.spp||counts.expectedPrimaryRays!==tile.expectedPrimaryRays||counts.observedPrimaryRays!==tile.expectedPrimaryRays||counts.bounceHistogram[0]!==tile.expectedPrimaryRays||counts.bounceHistogram.some(n=>!Number.isSafeInteger(n)||n<0))throw Error('Native tile/count coverage failed');
   seen.add(key);primary+=counts.observedPrimaryRays;
  }
  if(seen.size!==Math.ceil(lane.width/128)*Math.ceil(lane.height/128)||primary!==lane.expectedSamples)throw Error('Missing native tile/sample');
  files.push(file);evidence.push({...e,resolution:lane.resolution,spp:lane.spp,seed:lane.seed,actualSamples:r.frame.actualSamples});
 }
 const comparisons=[];
 for(const pair of convergenceComparisons(plan)){
  const a=readRoomHdr(root,files[plan.indexOf(pair.candidate)]),b=readRoomHdr(root,files[plan.indexOf(pair.reference)]);
  comparisons.push({resolution:pair.resolution,kind:pair.kind,candidate:{spp:pair.candidate.spp,seed:pair.candidate.seed},reference:{spp:pair.reference.spp,seed:pair.reference.seed},
   metrics:compareLinearImages(a.image,b.image),rowAttribution:compareRowMeans(a.image,b.image,pair.candidate.width,pair.candidate.height)});
 }
 const groups=resolutions.map(resolution=>({resolution,referenceGate:assessReferenceConvergence(comparisons.filter(p=>p.resolution===resolution&&p.kind==='reference').map(p=>p.metrics))}));
 return {schemaVersion:1,status:groups.every(g=>g.referenceGate.passed)?'reference-screen-passed':'reference-screen-failed',completeness:s.completeness,
  summarySha256:hash(summaryBytes),sources:s.sources,metricsSourceSha256:hash(metricBytes),resolutions:groups,evidence,comparisons,
  claim:'Offline native reference prequalification only. No adaptive, production-quality, universal banding, performance or real-time acceptance.'};
}
export function convergenceEvidenceExitCode(report){
 return report?.status==='reference-screen-passed'&&report.completeness==='both-native-resolutions'&&report.resolutions?.length===2&&report.resolutions.every(r=>r.referenceGate?.passed===true)?0:1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const report=await verifyRoomConvergence(...process.argv.slice(2));console.log(JSON.stringify(report,null,2));process.exitCode=convergenceEvidenceExitCode(report);
}
