import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeWgslSource} from '@plasius/gpu-shader/node';
import {canonicalSurfaceJournalShader,decodeSurfaceJournal} from './fixtures/optical-surface-journal.js';
import {encodeCanonicalReplay} from './fixtures/canonical-optical-replay.js';

test('surface journal reads original post-surface PathNodes and retains exact radiance/termination identity',()=>{
 const code=canonicalSurfaceJournalShader({pixel:100,sample:2,maxDepth:20,tilePixels:16384});
 assert.equal(analyzeWgslSource(code,'surface-journal').bindings.length,4);
 assert.doesNotMatch(code,/(?:rays|counters|nodes)\[[^\]]+\]\s*=/);
 assert.match(code,/ray.bounce\*16384u\+slot/);assert.match(code,/output\[ray.bounce\]=nodes\[node\]/);
 for(const value of [0,16385,1.5])assert.throws(()=>canonicalSurfaceJournalShader({pixel:100,sample:2,maxDepth:20,tilePixels:value}),/Invalid/);
 const bytes=new ArrayBuffer(128),u=new Uint32Array(bytes),f=new Float32Array(bytes);
 f.set([.125,.25,.5]);u[3]=1;f.set([2,3,4],4);u[7]=7;u[12]=100;u[13]=2;u[14]=19;
 const nodes=decodeSurfaceJournal(bytes);assert.equal(nodes.length,1);
 assert.deepEqual(nodes[0],{directRadiance:[.125,.25,.5],terminalRadiance:[2,3,4],flags:1,terminalKind:7,pixel:100,sample:2,bounce:19});
 assert.throws(()=>decodeSurfaceJournal(new ArrayBuffer(3)),/Invalid/);
 assert.equal(decodeSurfaceJournal(new ArrayBuffer(96*64)).length,0);
 assert.throws(()=>decodeSurfaceJournal(new ArrayBuffer(97*64)),/Invalid/);
});

test('selected surface journal dispatch is after canonical surface resolution and before queue swap',()=>{
 const calls=[],pass={setPipeline:p=>calls.push(p),setBindGroup(){},dispatchWorkgroups(){},dispatchWorkgroupsIndirect(){},end(){}};
 const encoder={clearBuffer(){},beginComputePass:()=>pass};
 const frameEncoder={encodePreparedTileSample(e){const p=e.beginComputePass({label:'plasius.wavefront.bounce.0'});p.setBindGroup(0,'original');
  for(const pipeline of ['intersect','resolve','swap']){p.setPipeline(pipeline);p.dispatchWorkgroups(1);}p.end();}};
 encodeCanonicalReplay(encoder,{frameEncoder,tile:{width:128,height:128},frameOffset:0,phaseOffset:0,counters:'counters',shared:{prepare:'prepare'},sharedGroup:'shared',dispatch:'dispatch',
  pipelines:{intersectActiveQueue:'intersect',resolveSurfaceRecords:'resolve',compactAndSwapQueues:'swap'},
  journal:{before:'before',after:'after',surface:'surface-journal',surfaceGroups:['surface-ping','surface-pong'],groups:['ping','pong']}});
 assert.deepEqual(calls,['prepare','before','intersect','after','resolve','surface-journal','swap']);
});
