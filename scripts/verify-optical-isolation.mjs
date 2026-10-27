// Read-only evidence verification and attribution, never a renderer.
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {OPTICAL_ISOLATION as c,opticalIsolationPlan,validateOpticalFurnace} from '../tests/fixtures/optical-lighting-isolation.js';
import {validateOpticalBudgetEvidence} from '../tests/fixtures/optical-budget-evidence.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
export function readOpticalLane(root,summary,lane){
 const base=path.resolve(root,'output/playwright/eames-environments'),file=path.resolve(root,lane.artifact.path.replace(/\.png$/,'.json'));
 if(!file.startsWith(base+path.sep))throw Error('Optical evidence outside capture root');
 const bytes=fs.readFileSync(file),r=JSON.parse(bytes),size=c.width*c.height*16,raw=Buffer.alloc(size);let offset=0;
 if(JSON.stringify(r.provenance)!==JSON.stringify(summary.provenance)||['renderer','lighting','shared','site'].some(k=>!(/^[a-f0-9]{40}$/).test(r.provenance?.sources?.[k]))||!r.cleanupPassed||r.adapter?.isFallbackAdapter!==false||
  r.frame.width!==c.width||r.frame.height!==c.height||r.frame.maximumSpp!==c.spp||r.frame.sampler!=='fixed-pattern'||r.frame.mode!=='uniform'||r.frame.diagnostics!==true||r.frame.fused!==false||
  r.frame.actualSamples!==c.width*c.height*c.spp||r.frame.actualHistogram?.[c.spp]!==c.width*c.height||Object.keys(r.frame.actualHistogram).length!==1||r.frame.validationErrors!==0)throw Error('Optical count/source/cleanup failure');
 for(const part of r.chunks){
  const chunkPath=path.resolve(root,part.path.replace(/\.png$/,'.json'));
  if(path.dirname(chunkPath)!==path.dirname(file))throw Error('Optical chunk outside capture');
  const chunkReceipt=JSON.parse(fs.readFileSync(chunkPath)),chunk=chunkReceipt.chunk;
  if(JSON.stringify(chunkReceipt.provenance)!==JSON.stringify(r.provenance)||chunk.format!=='float32-byteplanes-gzip-base64'||chunk.byteOffset!==offset||chunk.totalBytes!==size||chunk.byteLength%16||chunk.byteLength>8*1024**2||offset+chunk.byteLength>size)throw Error('Optical chunk extent/source failure');
  const shuffled=gunzipSync(Buffer.from(chunk.data,'base64'),{maxOutputLength:chunk.byteLength});
  if(shuffled.length!==chunk.byteLength)throw Error('Optical compression extent failure');
  const restored=Buffer.alloc(shuffled.length),n=restored.length/4;
  for(let p=0;p<4;p++)for(let i=0;i<n;i++)restored[i*4+p]=shuffled[p*n+i];
  if(hash(restored)!==chunk.sha256)throw Error('Optical chunk hash failure');restored.copy(raw,offset);offset+=restored.length;
 }
 if(offset!==size||hash(raw)!==r.hdrSha256)throw Error('Optical HDR hash failure');
 const image=new Float32Array(raw.buffer,raw.byteOffset,raw.length/4);
 for(let i=0;i<image.length;i++)if(!Number.isFinite(image[i])||image[i]<0||(i%4===3&&image[i]!==1))throw Error('Optical invalid pixel');
 const png=fs.readFileSync(file.replace(/\.json$/,'.png'));
 if(png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||png.readUInt32BE(16)!==c.width||png.readUInt32BE(20)!==c.height)throw Error('Optical PNG extent failure');
 if(JSON.stringify(r.settings)!==JSON.stringify(summary.settings))throw Error('Optical lane settings changed');
 const opticalBudget=validateOpticalBudgetEvidence({settings:summary.settings,frame:r.frame,probe:summary.opticalPathSamplingProbe});
 let furnace,error;
 if(r.lane.furnace)try{furnace=validateOpticalFurnace({...r.frame,image},c.spp);}catch(e){error=e.message;}
 return {name:r.lane.name,receiptSha256:hash(bytes),pngSha256:hash(png),hdrSha256:r.hdrSha256,actualSamples:r.frame.actualSamples,opticalBudget,furnace,error,image};
}
export function compareOpticalRows(a,b,width=c.width,height=c.height){
 if(a.length!==width*height*4||b.length!==a.length)throw Error('Optical reference extent mismatch');
 const rows=[];let sq=0,meanA=0,meanB=0;
 for(let y=Math.floor(height*c.region.y0);y<Math.ceil(height*c.region.y1);y++){
  let xsum=0,ysum=0,n=0;
  for(let x=Math.floor(width*c.region.x0);x<Math.ceil(width*c.region.x1);x++){
   const o=(y*width+x)*4;for(let k=0;k<3;k++)if(!Number.isFinite(a[o+k])||!Number.isFinite(b[o+k]))throw Error('Invalid reference radiance');
   xsum+=.2126*a[o]+.7152*a[o+1]+.0722*a[o+2];ysum+=.2126*b[o]+.7152*b[o+1]+.0722*b[o+2];n++;
  }
  const native=xsum/n,reference=ysum/n;rows.push({y,native,reference,delta:native-reference});sq+=(native-reference)**2;meanA+=native;meanB+=reference;
 }
 return {rowRmse:Math.sqrt(sq/rows.length),nativeMean:meanA/rows.length,referenceMean:meanB/rows.length,rows,
  scope:'linear row attribution over frozen central glass region; not full-room accuracy or convergence'};
}
export function verifyOpticalBatch(root,summaryFile,referenceDirectory){
 const bytes=fs.readFileSync(summaryFile),summary=JSON.parse(bytes),plan=opticalIsolationPlan();
 if(summary.lanes.length!==plan.length||summary.lanes.some((l,i)=>JSON.stringify(l.lane)!==JSON.stringify(plan[i])))throw Error('Missing/reordered optical lane');
 const lanes=summary.lanes.map(l=>readOpticalLane(root,summary,l));
 const referenceBytes=fs.readFileSync(path.join(referenceDirectory,'reference.f32')),referenceReceipt=JSON.parse(fs.readFileSync(path.join(referenceDirectory,'receipt.json')));
 if(hash(referenceBytes)!==referenceReceipt.linearSha256||referenceReceipt.settings.width!==c.width||referenceReceipt.settings.height!==c.height||referenceReceipt.settings.spp!==c.spp||referenceReceipt.settings.pedestal!==.35||referenceReceipt.settings.mode!=='filled'||
  JSON.stringify(referenceReceipt.camera)!==JSON.stringify({...c.camera,up:[0,1,0]})||referenceReceipt.geometrySources.lighting!==summary.provenance.sources.lighting)throw Error('Independent reference identity failure');
 const reference=new Float32Array(referenceBytes.buffer,referenceBytes.byteOffset,referenceBytes.length/4);
 for(let i=0;i<reference.length;i++)if(!Number.isFinite(reference[i])||reference[i]<0||(i%4===3&&reference[i]!==1))throw Error('Invalid independent reference pixel');
 const comparison=compareOpticalRows(lanes.at(-1).image,reference);
 return {summarySha256:hash(bytes),sources:summary.provenance.sources,status:summary.status,failures:summary.failures,lanes:lanes.map(({image,...l})=>l),comparison,reference:referenceReceipt,
  qualification:'attribution only; any furnace failure keeps image/adaptive gates closed'};
}
export function opticalEvidenceExitCode(report){return report?.status==='controls-complete-image-review-pending'&&report.lanes?.length===4&&report.lanes.every(l=>!l.error)&&report.failures?.length===0?0:1;}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const report=verifyOpticalBatch(...process.argv.slice(2));console.log(JSON.stringify(report,null,2));process.exitCode=opticalEvidenceExitCode(report);
}
