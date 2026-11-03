import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {nativeHostOptions} from './fixtures/native-host-packing.js';
import {roomSkyImportancePlan,roomSkyImportanceSettingsFromSearch,runRoomSkyImportance,validateSkyImportanceCapture,SKY_IMPORTANCE_FLAG} from './fixtures/room-sky-importance.js';
import {roomConvergencePlan} from './fixtures/room-convergence.js';
import {assessSkyVariance,verifyRoomSkyImportance} from '../scripts/verify-room-sky-importance.mjs';

function receipt(lane){return {status:'captured-reference-not-qualified',failures:[],cleanupPassed:true,
 referenceSampling:{mode:'frame-indexed-transport-v1',seed:lane.seed,sources:['plasius.wavefront.computeShader','wavefront-adaptive-camera','adaptive-shared-rounds'].map(label=>({label,sha256:'f'.repeat(64)}))},
 referenceSamplingProbe:{status:'passed',mode:'frame-indexed-transport-v1',seeds:[0,7,19],cameraInvariant:true,transportSeedDifferentiated:true,sourceSha256:'e'.repeat(64)},
 settings:{width:lane.width,height:lane.height,maximumSpp:lane.spp,maxDepth:lane.bounces,sampler:'fixed-pattern',denoise:false},
 frame:{seed:lane.seed,mode:'uniform',diagnostics:true,fused:false,validationErrors:0,visibilityBefore:'visible',visibilityAfter:'visible',actualSamples:lane.expectedSamples,actualHistogram:{[lane.spp]:lane.width*lane.height},maximumPathEvents:2068,
  tiles:Array.from({length:Math.ceil(lane.width/128)*Math.ceil(lane.height/128)},(_,i)=>{const x=i%Math.ceil(lane.width/128)*128,y=Math.floor(i/Math.ceil(lane.width/128))*128,width=Math.min(128,lane.width-x),height=Math.min(128,lane.height-y),primary=width*height*lane.spp;return {tileIndex:i,tile:{x,y,width,height},sampleRounds:lane.spp,expectedPrimaryRays:primary,telemetry:{rayCounts:{status:'available',expectedPrimaryRays:primary,observedPrimaryRays:primary,secondaryRays:100,totalPathSegments:primary+100}}};})},
 pipelineSetup:[{status:'complete',elapsedMs:2}],inspection:{distribution:'uniform'},splitDepth:0,lighting:{style:'daylight'},materialFlags:{sheen:false},referenceMaterialMaps:[{assetSha256:'c'.repeat(64)},{assetSha256:'d'.repeat(64)}],opticalInterfaceBudget:lane.opticalInterfaceBudget,
 transportFlags:{'renderer.transport.boundedDielectricBranching.enabled':true,'renderer.transport.nestedMediaRefraction.enabled':true,'renderer.transport.roughDielectricTransport.enabled':false,'renderer.transport.opticalInterfaceBudget.enabled':true,[SKY_IMPORTANCE_FLAG]:lane.environmentImportance},
 dielectricProbe:{passed:true},opticalPathSamplingProbe:{passed:true,opticalInterfaceBudgetProbe:{passed:true}},uvProbe:{passed:true},surfaceProbe:{passed:true},materialProbe:{passed:true},samplingParityProbe:{status:'passed'},
 scene:{proxyGeometry:false,referenceModels:[{asset:{sha256:'c'.repeat(64)}},{asset:{sha256:'d'.repeat(64)}}],camera:{position:[0,0,0]},room:{sha256:'b'.repeat(64)},glassWater:{settings:{mode:'filled',closeup:false}}},
 admission:{transportExperimentFlags:8|(lane.environmentImportance?16:0),maximumPathEvents:2068,opticalInterfaceBudget:{enabled:true,maximumInterfaces:2048,storageMode:'streamed-linear-chain',additionalPathBytes:0,maximumAdditionalBytes:134217728}},
 eamesSource:{manifest:{files:[{sha256:'e'.repeat(64)}]}},
 linearImage:{sha256:(lane.environmentImportance?'1':'2').repeat(32)+String(lane.seed).padStart(32,'0'),chunks:[{}]},provenance:{sources:Object.fromEntries(['renderer','lighting','shared','site'].map(k=>[k,'a'.repeat(40)])),assets:{models:[{sha256:'c'.repeat(64)},{sha256:'d'.repeat(64)}]},captureId:'retained-'+lane.seed+'-'+lane.environmentImportance},adapter:{isFallbackAdapter:false}};}

test('sky comparison uses four native fixed32 controls, bounded query and unchanged ordinary convergence',()=>{
 const plan=roomSkyImportancePlan();
 assert.deepEqual(plan.map(l=>[l.resolution,l.spp,l.seed,l.environmentImportance]),[['1080p',32,7,false],['1080p',32,7,true],['1080p',32,19,true],['1080p',32,19,false]]);
 for(const lane of plan){assert.equal(lane.expectedSamples,66355200);assert.equal(lane.bounces,20);assert.equal(lane.opticalInterfaceBudget.maximumInterfaces,2048);assert.equal(lane.controls['capture-seed'],String(lane.seed));assert.equal(lane.controls['sample-distribution'],'uniform');}
 assert.equal(roomSkyImportancePlan({resolution:'4k'})[0].expectedSamples,265420800);
 assert.deepEqual(roomSkyImportanceSettingsFromSearch(''),{});
 assert.deepEqual(roomSkyImportanceSettingsFromSearch('?skyImportanceResolution=4k'),{resolution:'4k'});
 for(const search of ['?skyImportanceResolution=128','?skyImportanceResolution=all','?skyImportanceResolution=4k&skyImportanceResolution=1080p'])assert.throws(()=>roomSkyImportanceSettingsFromSearch(search));
 assert.throws(()=>roomSkyImportancePlan({resolution:'128'}));assert.equal(roomConvergencePlan().length,12);
});
test('sky evidence requires actual bit, coherent controls and full same-seed continuation counts',()=>{
 assert.throws(()=>validateSkyImportanceCapture({status:'failed',failures:['original GPU timeout']},roomSkyImportancePlan()[0]),/original GPU timeout/);
 const [off,on]=roomSkyImportancePlan(),a=receipt(off),b=receipt(on),baseline=validateSkyImportanceCapture(a,off);
 assert.equal(validateSkyImportanceCapture(b,on,a.provenance.sources,baseline.identity,baseline.baseFlags).baseFlags,8);
 for(const mutate of [r=>delete r.admission.transportExperimentFlags,r=>r.admission.transportExperimentFlags=8,r=>r.admission.transportExperimentFlags|=32,r=>delete r.transportFlags[SKY_IMPORTANCE_FLAG],r=>r.frame.seed++,r=>r.scene.camera.position[0]++,r=>r.referenceSampling.sources[0].sha256='0'.repeat(64),r=>r.uvProbe.passed=false,r=>r.frame.tiles.pop(),r=>r.frame.tiles[0].tile.x=128,r=>r.frame.tiles[0].telemetry.rayCounts.secondaryRays=NaN,r=>r.frame.tiles[0].telemetry.rayCounts.totalPathSegments++,r=>r.cleanupPassed=false]){
  const copy=structuredClone(b);mutate(copy);assert.throws(()=>validateSkyImportanceCapture(copy,on,a.provenance.sources,baseline.identity,baseline.baseFlags));
 }
});
test('sky batch checkpoints each lane, rejects mismatched rays/duplicates and stops on cancellation or capture failure',async()=>{
 const plan=roomSkyImportancePlan(),checkpoints=[],captured=[];
 const result=await runRoomSkyImportance({configure:()=>{},capture:lane=>{captured.push(lane);return receipt(lane);},onCheckpoint:c=>checkpoints.push(c)});
 assert.equal(result.status,'captures-complete-variance-analysis-pending');assert.equal(result.lanes.length,4);assert.equal(captured.length,4);assert.deepEqual(checkpoints.map(c=>c.lanes.length),[0,1,2,3,4]);
 for(const kind of ['rays','duplicate','failure','cancel','sources']){let calls=0;const controller=new AbortController();const r=await runRoomSkyImportance({signal:controller.signal,configure:()=>{},capture:lane=>{calls++;const r=receipt(lane);if(calls===2){if(kind==='rays'){r.frame.tiles[0].telemetry.rayCounts.secondaryRays++;r.frame.tiles[0].telemetry.rayCounts.totalPathSegments++;}if(kind==='duplicate')r.linearImage.sha256=receipt(plan[0]).linearImage.sha256;if(kind==='failure'){r.status='failed';r.failures=['GPU failure'];}if(kind==='cancel')controller.abort();if(kind==='sources')r.provenance.sources.renderer='b'.repeat(40);}return r;}});
  assert.equal(r.status,'failed',kind);assert.equal(calls,2);assert.equal(r.lanes.length,1);assert(r.failedCaptureId);assert.equal(r.failures.length,1);
 }
});
test('actual paired runner forwards existing flag, defaults off and rejects non-booleans before GPU',async()=>{
 const file=new URL('./fixtures/adaptive-paired-runner.js',import.meta.url),source=readFileSync(file,'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'');let options;
 const context=vm.createContext({nativeHostOptions,setTimeout,clearTimeout,navigator:{gpu:{requestAdapter:async()=>({info:{isFallbackAdapter:false}})}},
  createWavefrontPathTracingComputeRenderer:async value=>{options=value;throw Error('stop before GPU');},ADAPTIVE_MAX_SAMPLES:256});new vm.Script(source,{filename:file.pathname}).runInContext(context);
 const native={width:1920,height:1080,maximumSpp:32,canvas:{}};
 for(const value of [undefined,false,true]){options=null;await assert.rejects(context.createPairedProbeRunner({},new AbortController().signal,{native,...(value===undefined?{}:{environmentImportance:value})}),/stop before GPU/);assert.equal(options[SKY_IMPORTANCE_FLAG],value??false);}
 options=null;await assert.rejects(context.createPairedProbeRunner({},undefined,{environmentImportance:'true'}),/boolean/);assert.equal(options,null);
});
test('descriptive attribution never substitutes for convergence; zero variance and missing evidence fail closed',async()=>{
 const metric=(rgbRmse,relativeEnergyDrift=0)=>({rgbRmse,relativeEnergyDrift});
 const a=assessSkyVariance(metric(2),metric(1),[metric(1),metric(1)]);assert.equal(a.withinModePairMseRatio,.25);assert.equal(a.energyScreen,true);assert.match(a.claim,/no confidence bound/);
 assert.equal(assessSkyVariance(metric(0),metric(1),[metric(1,.02),metric(1)]).withinModePairMseRatio,null);
 assert.equal(assessSkyVariance(metric(2),metric(1),[metric(1,.02),metric(1)]).energyScreen,false);
 for(const args of [[],[metric(1),metric(NaN),[metric(1),metric(1)]],[metric(1),metric(1),[]]])assert.throws(()=>assessSkyVariance(...args));
 await assert.rejects(verifyRoomSkyImportance('/missing-root','/missing-lighting','/missing-summary'));
});
