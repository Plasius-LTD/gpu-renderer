import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {readRoomHdr,compareRowMeans,convergenceEvidenceExitCode} from '../scripts/verify-room-convergence.mjs';
import {convergenceSceneIdentity,validateConvergenceCapture,roomConvergencePlan,runRoomConvergence} from './fixtures/room-convergence.js';
const hash=b=>createHash('sha256').update(b).digest('hex');

test('portable HDR reconstruction rejects corruption, missing data and unsafe paths without changing input',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'room-convergence-')),dir=path.join(root,'output/playwright/eames-environments/capture');
 try{
  fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'room.json'),image=new Float32Array([.25,.5,.75,1,.75,.5,.25,1]),raw=Buffer.from(image.buffer),shuffled=Buffer.alloc(raw.length),n=raw.length/4;
  for(let p=0;p<4;p++)for(let i=0;i<n;i++)shuffled[p*n+i]=raw[i*4+p];
  const provenance={sources:{renderer:'a'.repeat(40)}};
  const c={format:'float32-byteplanes-gzip-base64',byteOffset:0,byteLength:raw.length,totalBytes:raw.length,sha256:hash(raw),data:gzipSync(shuffled).toString('base64')};
  const r={settings:{width:2,height:1},provenance,linearImage:{uncompressedBytes:raw.length,sha256:hash(raw),chunks:[{byteOffset:0,byteLength:raw.length,sha256:hash(raw),artifact:{path:'output/playwright/eames-environments/capture/hdr.png'}}]}};
  const png=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(png);png.writeUInt32BE(2,16);png.writeUInt32BE(1,20);fs.writeFileSync(file.replace('.json','.png'),png);
  const save=()=>{fs.writeFileSync(file,JSON.stringify(r));fs.writeFileSync(path.join(dir,'hdr.json'),JSON.stringify({chunk:c,provenance}));};save();
  assert.deepEqual(readRoomHdr(root,file).image,image);
  const before=fs.readFileSync(file);readRoomHdr(root,file);assert.deepEqual(fs.readFileSync(file),before);
  c.sha256='b'.repeat(64);save();assert.throws(()=>readRoomHdr(root,file),/hash/);c.sha256=hash(raw);
  c.byteOffset=16;save();assert.throws(()=>readRoomHdr(root,file),/extent/);c.byteOffset=0;
  r.linearImage.chunks=[];save();assert.throws(()=>readRoomHdr(root,file),/HDR/);
  assert.throws(()=>readRoomHdr(root,path.join(root,'outside.json')),/outside/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('row attribution retains signed spatial changes; missing/failed reports never qualify',()=>{
 const a=new Float32Array([.5,.5,.5,1,.5,.5,.5,1]),b=new Float32Array([.25,.25,.25,1,.75,.75,.75,1]);
 const rows=compareRowMeans(a,b,1,2);assert.equal(rows.maximumAbsoluteMeanDifference,.25);assert.equal(rows.rows[0].delta,.25);assert.equal(rows.rows[1].delta,-.25);
 assert.throws(()=>compareRowMeans(a,b,2,2));
 assert.equal(convergenceEvidenceExitCode(),1);assert.equal(convergenceEvidenceExitCode({status:'reference-screen-failed'}),1);
 assert.equal(convergenceEvidenceExitCode({status:'reference-screen-passed',completeness:'partial-single-resolution'}),1);
 assert.equal(convergenceEvidenceExitCode({status:'reference-screen-passed',completeness:'both-native-resolutions',resolutions:[{referenceGate:{passed:true}},{referenceGate:{passed:true}}]}),0);
});
function receipt(lane){return {status:'captured-reference-not-qualified',failures:[],cleanupPassed:true,
 referenceSampling:{mode:'frame-indexed-transport-v1',seed:lane.seed,sources:['plasius.wavefront.computeShader','wavefront-adaptive-camera','adaptive-shared-rounds'].map(label=>({label,sha256:'f'.repeat(64)}))},
 referenceSamplingProbe:{status:'passed',mode:'frame-indexed-transport-v1',seeds:[0,7,19],cameraInvariant:true,transportSeedDifferentiated:true,sourceSha256:'e'.repeat(64)},
 settings:{width:lane.width,height:lane.height,maximumSpp:lane.spp,maxDepth:lane.bounces,sampler:'fixed-pattern',denoise:false},
 frame:{seed:lane.seed,mode:'uniform',diagnostics:true,fused:false,validationErrors:0,visibilityBefore:'visible',visibilityAfter:'visible',actualSamples:lane.expectedSamples,actualHistogram:{[lane.spp]:lane.width*lane.height},maximumPathEvents:2068},
 pipelineSetup:[{status:'complete',elapsedMs:2}],inspection:{distribution:'uniform'},splitDepth:0,lighting:{style:'daylight'},materialFlags:{sheen:false},referenceMaterialMaps:[{assetSha256:'c'.repeat(64)},{assetSha256:'d'.repeat(64)}],opticalInterfaceBudget:lane.opticalInterfaceBudget,
 transportFlags:{'renderer.transport.boundedDielectricBranching.enabled':true,'renderer.transport.nestedMediaRefraction.enabled':true,'renderer.transport.roughDielectricTransport.enabled':false,'renderer.transport.opticalInterfaceBudget.enabled':true},
 dielectricProbe:{passed:true},opticalPathSamplingProbe:{passed:true,opticalInterfaceBudgetProbe:{passed:true}},uvProbe:{passed:true},surfaceProbe:{passed:true},materialProbe:{passed:true},samplingParityProbe:{status:'passed'},
 scene:{proxyGeometry:false,referenceModels:[{asset:{sha256:'c'.repeat(64)}},{asset:{sha256:'d'.repeat(64)}}],camera:{position:[0,0,0]},room:{sha256:'b'.repeat(64)},glassWater:{settings:{mode:'filled',closeup:false}}},
 admission:{maximumPathEvents:2068,opticalInterfaceBudget:{enabled:true,maximumInterfaces:2048,storageMode:'streamed-linear-chain',additionalPathBytes:0,maximumAdditionalBytes:134217728}},
 eamesSource:{manifest:{files:[{sha256:'e'.repeat(64)}]}},
 linearImage:{sha256:hash(lane.spp+':'+lane.seed),chunks:[{}]},provenance:{sources:Object.fromEntries(['renderer','lighting','shared','site'].map(k=>[k,'a'.repeat(40)])),assets:{models:[{sha256:'c'.repeat(64)},{sha256:'d'.repeat(64)}]},captureId:'retained'},adapter:{isFallbackAdapter:false}};}
test('successful capture batch remains unqualified and rejects actual seed, scene or asset changes',async()=>{
 const settings={resolutions:['1080p']},plan=roomConvergencePlan(settings);let index=0;const checkpoints=[];
 const r=await runRoomConvergence({settings,configure:()=>{},capture:()=>receipt(plan[index++]),onCheckpoint:c=>checkpoints.push(c)});assert.equal(r.status,'captures-complete-convergence-pending');assert.equal(r.lanes.length,6);assert.equal(r.completeness,'partial-single-resolution');
 assert.deepEqual(checkpoints.map(c=>c.lanes.length),[0,1,2,3,4,5,6]);assert(checkpoints.every(c=>c.status==='running'));
 const baseline=receipt(plan[0]),identity=convergenceSceneIdentity(baseline);
 for(const change of [r=>r.frame.seed++,r=>r.scene.camera.position[0]++,r=>r.provenance.assets.models.push('changed'),r=>r.materialFlags.sheen=true,r=>r.frame.visibilityAfter='hidden',r=>r.scene.proxyGeometry=true,r=>r.scene.referenceModels.pop(),r=>r.frame.fused=true,r=>r.pipelineSetup=[],r=>r.pipelineSetup[0].status='pending',r=>r.referenceMaterialMaps[0].assetSha256='f'.repeat(64),r=>delete r.referenceSampling,r=>r.referenceSampling.seed++,r=>r.referenceSamplingProbe.transportSeedDifferentiated=false]){
  const copy=structuredClone(baseline);change(copy);assert.throws(()=>validateConvergenceCapture(copy,plan[0],baseline.provenance.sources,identity));
 }
 index=0;const duplicates=await runRoomConvergence({settings,configure:()=>{},capture:()=>{const r=receipt(plan[index++]);r.linearImage.sha256='same-image';return r;}});
 assert.equal(duplicates.status,'failed');assert.equal(index,2);assert.match(duplicates.failures[0],/Duplicate/);
});
