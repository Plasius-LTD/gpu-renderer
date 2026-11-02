import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {roomConvergencePlan} from './fixtures/room-convergence.js';
import {createAdaptiveTilePlan} from '../src/wavefront-adaptive-tile-plan.js';
import {adaptiveSceneIdentity,validateAdaptiveRoomCapture,compareAdaptiveTiers,assessAdaptiveImageScreen} from './fixtures/room-adaptive-image-screen.js';
import {verifyRoomAdaptiveImages,adaptiveImageScreenExitCode} from '../scripts/verify-room-adaptive-images.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
function fixtures(){
 const lane=roomConvergencePlan({resolutions:['1080p']})[0],pixels=lane.width*lane.height;
 const sources=Object.fromEntries(['renderer','lighting','shared','site'].map(k=>[k,'a'.repeat(40)]));
 const reference={status:'captured-reference-not-qualified',failures:[],cleanupPassed:true,
  settings:{width:lane.width,height:lane.height,maximumSpp:32,maxDepth:20,sampler:'fixed-pattern',denoise:false},
  frame:{seed:7,mode:'uniform',sampler:'fixed-pattern',width:lane.width,height:lane.height,maximumSpp:32,diagnostics:true,fused:false,validationErrors:0,visibilityBefore:'visible',visibilityAfter:'visible',actualSamples:lane.expectedSamples,actualHistogram:{32:pixels},maximumPathEvents:2068},
  pipelineSetup:[{status:'complete',elapsedMs:1}],inspection:{distribution:'uniform'},splitDepth:0,
  lighting:{style:'daylight'},materialFlags:{sheen:false},referenceMaterialMaps:[{assetSha256:'c'.repeat(64)},{assetSha256:'d'.repeat(64)}],opticalInterfaceBudget:lane.opticalInterfaceBudget,
  transportFlags:{'renderer.transport.boundedDielectricBranching.enabled':true,'renderer.transport.nestedMediaRefraction.enabled':true,'renderer.transport.roughDielectricTransport.enabled':false,'renderer.transport.opticalInterfaceBudget.enabled':true},
  dielectricProbe:{passed:true},opticalPathSamplingProbe:{passed:true,opticalInterfaceBudgetProbe:{passed:true}},uvProbe:{passed:true},surfaceProbe:{passed:true},materialProbe:{passed:true},samplingParityProbe:{status:'passed'},
  scene:{proxyGeometry:false,referenceModels:[{asset:{sha256:'c'.repeat(64)}},{asset:{sha256:'d'.repeat(64)}}],camera:{position:[0,0,0]},room:{sha256:'b'.repeat(64)},glassWater:{settings:{mode:'filled',closeup:false}}},
  admission:{maximumPathEvents:2068,opticalInterfaceBudget:{enabled:true,maximumInterfaces:2048,storageMode:'streamed-linear-chain',additionalPathBytes:0,maximumAdditionalBytes:134217728}},
  eamesSource:{manifest:{files:[{sha256:'e'.repeat(64)}]}},linearImage:{sha256:'1'.repeat(64),chunks:[{}]},
  provenance:{sources,assets:{models:[{sha256:'c'.repeat(64)},{sha256:'d'.repeat(64)}]},captureId:'room-reference-control'},adapter:{isFallbackAdapter:false},
  referenceSampling:{mode:'frame-indexed-transport-v1',seed:7,sources:['plasius.wavefront.computeShader','camera','shared'].map(label=>({label,sha256:'f'.repeat(64)}))},
  referenceSamplingProbe:{status:'passed',mode:'frame-indexed-transport-v1',seeds:[0,7,19],cameraInvariant:true,transportSeedDifferentiated:true,sourceSha256:'e'.repeat(64)}};
 const budgets=new Uint8Array(pixels);budgets.fill(1);budgets.fill(32,0,pixels/2);
 const plan={width:lane.width,height:lane.height,budgets,bands:[{spp:32,pixels:pixels/2},{spp:1,pixels:pixels/2}],totalSamples:pixels/2*33,meanSpp:16.5,sha256:hash(budgets)};
 const candidate=structuredClone(reference);delete candidate.referenceSampling;delete candidate.referenceSamplingProbe;
 candidate.inspection.distribution='radial';candidate.linearImage.sha256='2'.repeat(64);candidate.provenance.captureId='room-reference-radial';
 candidate.memory={rendererBufferBytes:1024,textureInventory:[],adaptiveBufferBytes:pixels*4,telemetryBufferBytes:256,fixtureStagingBytes:256,cachedBudgetHostBytes:pixels*9};
 candidate.budgets={bands:plan.bands,totalSamples:plan.totalSamples,meanSpp:plan.meanSpp,sha256:plan.sha256};
 Object.assign(candidate.frame,{mode:'radial',actualSamples:plan.totalSamples,actualHistogram:{1:pixels/2,32:pixels/2}});
 candidate.frame.tiles=createAdaptiveTilePlan({enabled:true,...plan}).map((p,tileIndex)=>{
  const rounds=p.ranges.at(-1).sampleLimit,primary=p.expectedPrimaryRays,secondary=primary*2;
  return {tileIndex,tile:p.tile,sampleRounds:rounds,expectedPrimaryRays:primary,telemetry:{rayCounts:{status:'available',expectedPrimaryRays:primary,observedPrimaryRays:primary,secondaryRays:secondary,totalPathSegments:primary+secondary,bounceHistogram:[primary,secondary,...new Array(18).fill(0)]}}};
 });
 return {candidate,reference,plan,pixels};
}

test('adaptive identity omits only reference-only key evidence and retains every scene/source field',()=>{
 const {candidate,reference}=fixtures();assert.equal(adaptiveSceneIdentity(candidate),adaptiveSceneIdentity(reference));
 for(const change of [r=>r.scene.camera.position[0]++,r=>r.provenance.sources.renderer='b'.repeat(40),r=>r.lighting.style='night',r=>r.scene.referenceModels[0].asset.sha256='b'.repeat(64),r=>r.transportFlags.changed=true,r=>r.opticalInterfaceBudget.maximumInterfaces--]){
  const altered=structuredClone(candidate);change(altered);
  try{assert.notEqual(adaptiveSceneIdentity(altered),adaptiveSceneIdentity(reference));}catch(error){if(error.code==='ERR_ASSERTION')throw error;}
 }
});
test('native radial admission verifies edge tiles, actual budgets, every primary and bounded workload',()=>{
 const {candidate,reference,plan,pixels}=fixtures(),before=JSON.stringify(candidate);
 const evidence=validateAdaptiveRoomCapture(candidate,{reference,plan});
 assert.equal(candidate.frame.tiles.length,135);assert.equal(candidate.frame.tiles.at(-1).tile.height,56);
 assert.equal(evidence.primaryRays,plan.totalSamples);assert.equal(evidence.secondaryRays,plan.totalSamples*2);assert.equal(evidence.totalPathSegments,plan.totalSamples*3);
 assert.equal(evidence.uniform32PrimaryRays,pixels*32);assert.equal(evidence.primaryReductionFraction,1-16.5/32);
 assert.equal(JSON.stringify(candidate),before);
 for(const change of [r=>r.frame.tiles.pop(),r=>r.frame.tiles.reverse(),r=>r.frame.tiles[0].telemetry.rayCounts.observedPrimaryRays--,
  r=>r.frame.tiles[0].tile.height--,r=>r.frame.tiles[0].sampleRounds--,r=>r.frame.actualHistogram[1]--,r=>r.frame.actualSamples--,
  r=>r.frame.tiles[0].telemetry.rayCounts.totalPathSegments++,r=>r.frame.tiles[0].telemetry.rayCounts.bounceHistogram[1]++,
  r=>r.budgets.sha256='b'.repeat(64),r=>r.budgets.bands.reverse(),r=>r.scene.camera.position[0]++,r=>r.settings.width=128,
  r=>r.frame.visibilityAfter='hidden',r=>r.cleanupPassed=false,r=>r.adapter.isFallbackAdapter=true,r=>r.materialProbe.passed=false,
  r=>r.pipelineSetup[0].status='pending',r=>r.inspection.distribution='uniform',r=>r.frame.mode='uniform',r=>r.frame.fused=true,
  r=>r.frame.validationErrors++,r=>r.referenceSampling=reference.referenceSampling,r=>delete r.memory.adaptiveBufferBytes,r=>r.memory.adaptiveBufferBytes=0,
  r=>r.admission.maximumPathEvents--]){
  const altered=structuredClone(candidate);change(altered);assert.throws(()=>validateAdaptiveRoomCapture(altered,{reference,plan}));
 }
 assert.throws(()=>validateAdaptiveRoomCapture({status:'failed',failures:['original GPU failure']},{reference,plan}),/original GPU failure/);
 assert.throws(()=>validateAdaptiveRoomCapture(candidate,{reference,plan:{...plan,width:128}}));
});
test('tier algebra exposes signed low-SPP darkening hidden by a global mean without mutating images',()=>{
 const a=new Float32Array([.25,.25,.25,1,.75,.75,.75,1]),b=new Float32Array([.5,.5,.5,1,.5,.5,.5,1]);
 const compare=(x,y)=>({pixels:x.length/4,delta:x[0]-y[0]});
 const result=compareAdaptiveTiers(a,b,new Uint8Array([1,32]),compare);
 assert.equal(result.global.pixels,2);assert.deepEqual(result.tiers.map(t=>[t.spp,t.pixels,t.metrics.delta]),[[1,1,-.25],[32,1,.25]]);
 assert.deepEqual(Array.from(a),[.25,.25,.25,1,.75,.75,.75,1]);
 for(const budget of [new Uint8Array([0,32]),new Uint8Array([32]),[1,32]])assert.throws(()=>compareAdaptiveTiers(a,b,budget,compare));
 assert.throws(()=>compareAdaptiveTiers(a,b.subarray(0,4),new Uint8Array([1,32]),compare));
});
const metric=()=>({pixels:2,rgbRmse:.01,normalizedRmse:.02,p99LocalError:.03,relativeEnergyDrift:0});
const comparison=()=>({global:metric(),tiers:[{spp:1,pixels:1,metrics:{...metric(),pixels:1}},{spp:32,pixels:1,metrics:{...metric(),pixels:1}}]});
test('global success cannot hide a failed/uncertain tier; use lighting-owned quality assessment for both references',()=>{
 const pairs=[7,19].map(referenceSeed=>({referenceSeed,candidate:comparison(),baseline:comparison()})),uncertainty=comparison(),seen=[];
 const assess=(a,b,c)=>{seen.push([a,b,c]);return {passed:a.relativeEnergyDrift===0&&c.normalizedRmse<=.03,checks:{converged:c.normalizedRmse<=.03,energy:a.relativeEnergyDrift===0}};};
 const result=assessAdaptiveImageScreen(pairs,uncertainty,assess);assert.equal(result.passed,true);assert.equal(seen.length,6);
 pairs[0].candidate.tiers[0].metrics.relativeEnergyDrift=-.02;assert.equal(assessAdaptiveImageScreen(pairs,uncertainty,assess).passed,false);
 pairs[0].candidate.tiers[0].metrics.relativeEnergyDrift=0;uncertainty.tiers[0].metrics.normalizedRmse=.031;assert.equal(assessAdaptiveImageScreen(pairs,uncertainty,assess).passed,false);
 for(const alter of [v=>v.pop(),v=>v[1].referenceSeed=7,v=>v[0].candidate.global.rgbRmse=NaN,v=>v[0].baseline.tiers.pop(),v=>v[0].candidate.tiers[0].spp=2]){
  const copy=structuredClone(pairs);alter(copy);assert.throws(()=>assessAdaptiveImageScreen(copy,uncertainty,assess));
 }
 assert.throws(()=>assessAdaptiveImageScreen(pairs,uncertainty,()=>({passed:true})),/assessment/);
 assert.equal(adaptiveImageScreenExitCode(),1);
 assert.equal(adaptiveImageScreenExitCode({status:'adaptive-image-screen-passed-not-qualified',resolutions:[{passed:true}]}),1);
 assert.equal(adaptiveImageScreenExitCode({status:'adaptive-image-screen-passed-not-qualified',resolutions:[{resolution:'1080p',passed:true},{resolution:'4k',passed:true}]}),0);
});
test('incomplete corrected references block admission before any candidate is read, preserving evidence',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'adaptive-room-admission-'));
 try{
  const dir=path.join(root,'output/playwright/eames-environments/reference');fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,'checkpoint.json'),bytes=JSON.stringify({status:'running',lanes:[],failures:[]});fs.writeFileSync(file,bytes);
  const report=await verifyRoomAdaptiveImages(root,'/missing-lighting',file,['missing-candidate-1080p','missing-candidate-4k']);
  assert.equal(report.status,'blocked-reference-evidence');assert.match(report.reason,/convergence batch/);assert.equal(report.resolutions.length,0);assert.equal(adaptiveImageScreenExitCode(report),1);
  assert.equal(fs.readFileSync(file,'utf8'),bytes);
  const unsafe=await verifyRoomAdaptiveImages(root,'/missing-lighting',path.join(root,'outside.json'),[]);assert.equal(unsafe.status,'blocked-reference-evidence');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
