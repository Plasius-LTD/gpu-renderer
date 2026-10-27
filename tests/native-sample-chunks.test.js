import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeSampleChunks,nativePhaseRanges} from './fixtures/native-sample-chunks.js';
import {createTimestampSpanEncoder} from './fixtures/paired-timestamp-span.js';
test('optical capture submissions respect existing pass policy without repeating/skipping absolute ordinals',()=>{
 for(const samples of [1,32,128,256])for(const depth of [1,20,32])for(const passes of [1,64,256]){
  const chunks=nativeSampleChunks(samples,depth,passes,true),ordinals=chunks.flatMap(c=>Array.from({length:c.sampleLimit-c.firstSample},(_,i)=>c.firstSample+i));
  assert.deepEqual(ordinals,Array.from({length:samples},(_,i)=>i));
  assert(chunks.every(c=>c.sampleLimit-c.firstSample===1||(c.sampleLimit-c.firstSample)*(depth+2)<=passes));
  assert.deepEqual(nativeSampleChunks(samples,depth,passes,false),[{firstSample:0,sampleLimit:samples}]);
 }
 for(const args of [[0,20,256],[257,20,256],[32,33,256],[32,20,0]])assert.throws(()=>nativeSampleChunks(...args,true),/bounds/);
 const ranges=[{firstSample:0,sampleLimit:1},{firstSample:1,sampleLimit:8},{firstSample:8,sampleLimit:32}];
 const phases=nativeSampleChunks(32,20,64,true).flatMap(c=>nativePhaseRanges(c,ranges));
 assert.deepEqual(phases.filter(r=>r.initialize).map(r=>r.firstSample),[0,1,8]);
 assert.deepEqual(phases.flatMap(r=>Array.from({length:r.sampleLimit-r.firstSample},(_,i)=>[r.firstSample+i,r.phaseIndex])),ranges.flatMap((r,p)=>Array.from({length:r.sampleLimit-r.firstSample},(_,i)=>[r.firstSample+i,p])));
});
test('one diagnostic timestamp span covers bounded submissions and still requires its real final work pass',()=>{
 const calls=[],telemetry={started:false,ended:false,decorateFirstPass(d){if(!this.started){this.started=true;calls.push('first');}return d;},decorateFinalPass(d){this.ended=true;calls.push('last');return d;}};
 const encoder={beginComputePass:()=>({}),finish:()=>{calls.push('submit');return {};}};
 const first=createTimestampSpanEncoder(encoder,telemetry);first.beginComputePass();first.finish({continuation:true});
 assert.equal(telemetry.ended,false);
 const last=createTimestampSpanEncoder(encoder,telemetry);last.closeNextPass();last.beginComputePass();last.finish();
 assert.deepEqual(calls,['first','submit','last','submit']);
 assert.throws(()=>last.finish({continuation:true}),/span/);
});
