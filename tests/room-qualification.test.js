import test from 'node:test';
import assert from 'node:assert/strict';
import {roomQualificationPlan,runRoomQualification} from './fixtures/room-qualification.js';

function receipt(lane){return {status:'captured-reference-not-qualified',failures:[],cleanupPassed:true,
 settings:{width:lane.width,height:lane.height,maximumSpp:lane.spp,maxDepth:lane.bounces,sampler:'fixed-pattern',denoise:false},
 frame:{actualSamples:lane.expectedSamples,actualHistogram:{[lane.spp]:lane.width*lane.height}},inspection:{distribution:'uniform'},splitDepth:0,
 transportFlags:{'renderer.transport.boundedDielectricBranching.enabled':true,'renderer.transport.nestedMediaRefraction.enabled':true,'renderer.transport.roughDielectricTransport.enabled':false},
 dielectricProbe:{passed:true},opticalPathSamplingProbe:{passed:true},uvProbe:{passed:true},surfaceProbe:{passed:true},materialProbe:{passed:true},samplingParityProbe:{status:'passed'},scene:{glassWater:{settings:{mode:lane.glass,closeup:lane.focus==='glass'}}},
 linearImage:{sha256:'retained-hdr-hash',chunks:[{sha256:'retained-chunk'}]},provenance:{sources:{renderer:'same-commit',lighting:'lighting',shared:'shared',site:'site'},captureId:'retained-capture'},adapter:{isFallbackAdapter:false}};}

test('scene qualification configures six sequential uniform captures and retains separate image-review status',async()=>{
 const plan=roomQualificationPlan(),configured=[];let active=0,index=0;
 const report=await runRoomQualification({configure:values=>configured.push(values),capture:async()=>{
  assert.equal(active++,0);await Promise.resolve();const result=receipt(plan[index++]);active--;return result;
 }});
 assert.equal(report.status,'captures-complete-image-review-pending');assert.equal(report.lanes.length,6);
 assert.equal(report.lanes[0].actualSamples,66355200);assert.equal(report.lanes[3].actualSamples,265420800);
 assert(configured.every(c=>c['sample-distribution']==='uniform'&&c.sampler==='fixed-pattern'&&c.splitting==='0'));
 assert.deepEqual(plan.map(p=>[p.resolution,p.glass,p.focus]),[['1080p','empty','glass'],['1080p','filled','glass'],['1080p','filled','entry'],['4k','empty','glass'],['4k','filled','glass'],['4k','filled','entry']]);
});
test('qualification stops on wrong counts, radial evidence, failed preflight, cleanup or changed source',async()=>{
 for(const mutate of [r=>r.frame.actualSamples--,r=>r.inspection.distribution='radial',r=>r.dielectricProbe.passed=false,r=>delete r.uvProbe,r=>delete r.materialProbe,r=>delete r.surfaceProbe,r=>r.samplingParityProbe.status='failed',r=>r.linearImage.chunks=[],r=>delete r.provenance.sources.site,r=>r.cleanupPassed=false,r=>r.adapter.isFallbackAdapter=true,r=>r.settings.maxDepth=6]){
  let calls=0;const result=await runRoomQualification({configure:()=>{},capture:()=>{calls++;const r=receipt(roomQualificationPlan()[0]);mutate(r);return r;}});
  assert.equal(result.status,'failed');assert.equal(calls,1);assert.equal(result.lanes.length,0);
 }
 const plan=roomQualificationPlan();let calls=0;
 const result=await runRoomQualification({configure:()=>{},capture:()=>{const r=receipt(plan[calls++]);if(calls===2)r.provenance.sources.renderer='other';return r;}});
 assert.equal(result.status,'failed');assert.equal(calls,2);assert.equal(result.lanes.length,1);
});
test('qualification validates before side effects and never starts another lane after cancellation',async()=>{
 assert.throws(()=>roomQualificationPlan({spp:0}),/Invalid/);assert.throws(()=>roomQualificationPlan({resolutions:['small']}),/Invalid/);assert.throws(()=>roomQualificationPlan({bounces:21}),/Invalid/);
 const controller=new AbortController();let calls=0;
 const report=await runRoomQualification({configure:()=>{},signal:controller.signal,capture:()=>{calls++;controller.abort();return receipt(roomQualificationPlan()[0]);}});
 assert.equal(report.status,'failed');assert.equal(calls,1);assert.equal(report.lanes.length,0);
});
test('qualification preserves the failed capture identity and root rejection instead of masking it',async()=>{
 const lane=roomQualificationPlan()[0],failed=receipt(lane);failed.status='failed';failed.failures=['primary-ray-count-mismatch:163840/524288'];
 let calls=0;const report=await runRoomQualification({configure:()=>{},capture:()=>{calls++;return failed;}});
 assert.equal(calls,1);assert.equal(report.status,'failed');assert.match(report.failures[0],/primary-ray-count-mismatch:163840\/524288/);
 assert.deepEqual(report.failedLane,{resolution:'1080p',glass:'empty',focus:'glass',captureId:'retained-capture',captureFailures:failed.failures});
});
