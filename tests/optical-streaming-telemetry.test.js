import test from 'node:test';
import assert from 'node:assert/strict';
import {createWavefrontFrameTelemetryResources as create} from '../src/wavefront-frame-telemetry.js';
const constants={buffer:{COPY_DST:1,COPY_SRC:2,MAP_READ:4},map:{READ:1}};
function fixture(extra=1){
 const buffers=[];
 const device={features:new Set(),createBuffer(d){const b={...d,bytes:new Uint8Array(d.size),destroy(){this.destroyed=true;},
  async mapAsync(){if(this.fail)throw Error('map rejected');this.mapped=true;},getMappedRange(){return this.bytes.buffer;},unmap(){this.mapped=false;}};
  buffers.push(b);return b;},queue:{submit(){}},createCommandEncoder(){return {copyBufferToBuffer(a,ao,b,bo,n){b.bytes.set(a.bytes.subarray(ao,ao+n),bo);},finish(){return {};}};}};
 const resource=create({device,constants,maxRayCountRecords:2,maxOpticalSegmentRecords:extra});
 const encoder=device.createCommandEncoder(),counter={bytes:new Uint8Array(128)},words=new Uint32Array(counter.bytes.buffer);
 return {resource,buffers,encoder,counter,words};
}
test('streamed telemetry adds internal optical queries, labels queue histograms and resets between frames',async()=>{
 const f=fixture();assert.equal(f.resource.opticalSegmentsAvailable,true);assert.equal(f.resource.memoryBytes,24);
 for(let frame=0;frame<2;frame++){
  f.resource.beginFrame();f.words[0]=64;f.resource.recordActiveRayCount(f.encoder,f.counter,0);
  f.words[0]=16;f.resource.recordActiveRayCount(f.encoder,f.counter,1);
  f.words[27]=100+frame;f.resource.recordOpticalSegmentCount(f.encoder,f.counter);
  const r=(await f.resource.readFrame({expectedPrimaryRays:64,expectedRayCounts:2,expectedOpticalSegmentRecords:1,waitForSubmittedGpuWork:async()=>{}})).rayCounts;
  assert.equal(r.status,'available');assert.deepEqual(r.bounceHistogram,[64,16]);assert.equal(r.histogramDomain,'queue-iteration');
  assert.equal(r.queuePathSegments,80);assert.equal(r.additionalOpticalSegments,100+frame);
  assert.equal(r.totalPathSegments,180+frame);assert.equal(r.secondaryRays,116+frame);assert.equal(r.capturedOpticalSegmentRecords,1);
 }
 f.resource.destroy();assert(f.buffers.every(b=>b.destroyed&&!b.mapped));
});
test('optical diagnostics allocate nothing when off and reject missing or overflowing records',async()=>{
 const off=fixture(0);assert.equal(off.resource.opticalSegmentsAvailable,false);assert.equal(off.resource.memoryBytes,16);
 off.resource.beginFrame();off.resource.recordOpticalSegmentCount(off.encoder,off.counter);
 assert.equal(off.buffers.length,2);off.resource.destroy();
 for(const overflow of [false,true]){
  const f=fixture();f.resource.beginFrame();
  if(overflow){f.resource.recordOpticalSegmentCount(f.encoder,f.counter);f.resource.recordOpticalSegmentCount(f.encoder,f.counter);}
  const r=await f.resource.readFrame({expectedRayCounts:0,expectedOpticalSegmentRecords:1});
  assert.equal(r.rayCounts.status,'failed');assert.match(r.rayCounts.reason,overflow?/capacity-exceeded/:/record-mismatch/);
  f.resource.destroy();
 }
 assert.throws(()=>create({device:{},constants,maxOpticalSegmentRecords:-1}),/capacity/);
});
test('optical readback failures do not return fabricated counts and all owned buffers remain recoverable',async()=>{
 const f=fixture();f.resource.beginFrame();f.words[0]=1;f.resource.recordActiveRayCount(f.encoder,f.counter,0);
 f.resource.recordOpticalSegmentCount(f.encoder,f.counter);f.buffers.find(b=>b.label.endsWith('opticalSegments.readback')).fail=true;
 const r=await f.resource.readFrame({expectedPrimaryRays:1,expectedRayCounts:1,expectedOpticalSegmentRecords:1,waitForSubmittedGpuWork:async()=>{}});
 assert.equal(r.rayCounts.status,'failed');assert.match(r.reason,/map rejected/);f.resource.destroy();
 assert(f.buffers.every(b=>b.destroyed&&!b.mapped));
});
test('partial optical telemetry allocation failure releases existing buffers',()=>{
 const buffers=[];const device={createBuffer(d){if(buffers.length===3)throw Error('allocation');const b={...d,destroy(){this.destroyed=true;}};buffers.push(b);return b;}};
 assert.throws(()=>create({device,constants,maxRayCountRecords:2,maxOpticalSegmentRecords:1}),/allocation/);
 assert(buffers.every(b=>b.destroyed));
});
