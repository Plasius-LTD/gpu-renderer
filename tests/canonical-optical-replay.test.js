import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeWgslSource} from '@plasius/gpu-shader/node';
import {canonicalJournalShader,decodeCanonicalJournal,encodeCanonicalReplay,replayCanonicalFailure,captureCanonicalSelection} from './fixtures/canonical-optical-replay.js';

test('canonical journal is bounded, read-only on transport and rejects ambiguous siblings',()=>{
 const code=canonicalJournalShader({pixel:2470753,sample:92,maxDepth:20});
 assert.match(code,/2470753u/);assert.match(code,/92u/);
 assert.match(code,/bounce >= 20u/);
 const reflection=analyzeWgslSource(code,'canonical-journal');
 assert.equal(reflection.bindings.length,4);
 assert.doesNotMatch(code,/(?:rays|hits|counters)\[[^\]]+\]\s*=/);
 assert.throws(()=>canonicalJournalShader({pixel:-1,sample:92,maxDepth:20}),/Invalid/);
 assert.throws(()=>canonicalJournalShader({pixel:1,sample:256,maxDepth:20}),/Invalid/);
 assert.match(canonicalJournalShader({pixel:1,sample:0,maxDepth:96}),/bounce >= 96u/);
 assert.throws(()=>canonicalJournalShader({pixel:1,sample:0,maxDepth:2081}),/Invalid/);
});

test('failure-only replay guards unsupported histories, reuses config, and cleans up on every exit',async t=>{
 const previous={GPUBufferUsage:globalThis.GPUBufferUsage,GPUShaderStage:globalThis.GPUShaderStage};
 globalThis.GPUBufferUsage={STORAGE:1,COPY_SRC:2};globalThis.GPUShaderStage={COMPUTE:4};
 t.after(()=>{for(const [k,v]of Object.entries(previous)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}});
 const allocated=[],writes=[],calls=[];
 const pass={setPipeline(){},setBindGroup(){},dispatchWorkgroupsIndirect(){},end(){}};
 const descriptors=new Map(['activeNext','nextActive'].map(name=>[`plasius.wavefront.bind.${name}`,{entries:[0,2,6,22].map(binding=>({binding,resource:{buffer:{name,binding}}}))}]));
 const device={createBuffer:d=>{const b={size:d.size,destroy(){this.destroyed=true;}};allocated.push(b);return b;},
  createShaderModule:()=>({getCompilationInfo:async()=>({messages:[]})}),createBindGroupLayout:x=>x,createPipelineLayout:x=>x,createBindGroup:x=>x,
  createComputePipelineAsync:async x=>x,createCommandEncoder:()=>({clearBuffer(){},beginComputePass:()=>pass,finish:()=>({})}),
  queue:{writeBuffer:(...a)=>writes.push(a),submit(){},onSubmittedWorkDone:async()=>{}}};
 const c={device,descriptors,wait:x=>x,read:async(b,size)=>new ArrayBuffer(size),setMode:(...args)=>calls.push(args),b:{primaryControl:'control',dispatch:'dispatch'},shared:{prepare:'prepare'},
  frameEncoder:{encodePreparedTileSample(_e,_t,offset){assert.equal(offset,92*512);}},pipelines:{}};
 const options={config:{transportExperimentFlags:16384,maxDepth:20,memory:{configBufferStride:512}},tile:{width:128,height:128},ranges:[{firstSample:0,sampleLimit:128}],failure:{pixel:2470753,sample:92}};
 const result=await replayCanonicalFailure(c,options);
 assert.equal(result.status,'captured');assert.equal(result.allocatedBytes,10240);assert.deepEqual(result.records,[]);
 assert.deepEqual(calls,[[false,false]]);assert.equal(writes.length,1);assert.equal(writes[0][0],'control');assert.equal(writes[0][1],4);
 assert.ok(allocated.every(b=>b.destroyed));
 const successful=await captureCanonicalSelection(c,{...options,selection:options.failure});
 assert.equal(successful.status,'captured');assert.match(successful.scope,/selected-sample/);
 assert.equal(successful.allocatedBytes,11520);assert.deepEqual(successful.surfaceNodes,[]);
 assert.equal(writes.length,1,'successful selection never clears a failure word');assert.ok(allocated.every(b=>b.destroyed));
 c.read=async()=>{throw Error('lost');};await assert.rejects(replayCanonicalFailure(c,options),/lost/);assert.ok(allocated.every(b=>b.destroyed));
 device.createShaderModule=()=>{throw Error('compile');};await assert.rejects(replayCanonicalFailure(c,options),/compile/);assert.ok(allocated.every(b=>b.destroyed));
 await assert.rejects(captureCanonicalSelection(c,{...options,selection:options.failure}),/compile/);assert.ok(allocated.every(b=>b.destroyed));
 const before=allocated.length;
 assert.equal((await replayCanonicalFailure(c,{...options,config:{...options.config,roughBounceSplitting:{enabled:true}}})).status,'unsupported');
 assert.equal((await replayCanonicalFailure(c,{...options,ranges:[...options.ranges,{firstSample:128,sampleLimit:256}]})).reason,'original-phase-worklist-no-longer-retained');
 await assert.rejects(replayCanonicalFailure(c,{...options,failure:{pixel:1,sample:256}}),/outside/);
 assert.equal(allocated.length,before);
});

test('canonical journal decodes raw identities, medium stack and hit data without float coercion',()=>{
 const bytes=new ArrayBuffer(64*4*2),u=new Uint32Array(bytes),f=new Float32Array(bytes);
 u.set([1,7,0,0]);u.set([12,9,2470753,92,0,92,1,2],4);
 f.set([2.85,-.6,-.1,1],12);f.set([0,1,0,0],16);u.set([92,93,0,0],24);
 u.set([1,353336,1,92],28);f[36]=.07;
 const records=decodeCanonicalJournal(bytes);
 assert.equal(records.length,1);assert.equal(records[0].pixel,2470753);
 assert.deepEqual(records[0].mediumStack,[92,93,0,0]);assert.equal(records[0].stage,'before-intersection');
 assert.equal(records[0].hit,null);assert.equal(records[0].queueSlot,7);
 assert.equal(records[0].originW,1);assert.equal(records[0].directionW,0);
 u[2]=1;assert.equal(decodeCanonicalJournal(bytes)[0].hit.primitive,353336);
 f[38]=1e-7;let hit=decodeCanonicalJournal(bytes)[0].hit;
 assert.equal(hit.failure,0);assert.equal(hit.positionError,Math.fround(1e-7));
 u[28]=5;f[38]=7;hit=decodeCanonicalJournal(bytes)[0].hit;
 assert.equal(hit.failure,7);assert.equal(hit.positionError,null);
 assert.throws(()=>decodeCanonicalJournal(new ArrayBuffer(3)),/Invalid/);
});

test('canonical replay reuses compiled prepare and bounce encoder; no sample commit, output or geometry replay',()=>{
 const calls=[],pass={setPipeline:p=>calls.push(['pipeline',p]),setBindGroup:(...a)=>calls.push(['group',...a]),dispatchWorkgroups:(...a)=>calls.push(['direct',...a]),dispatchWorkgroupsIndirect:(...a)=>calls.push(['indirect',...a]),end:()=>calls.push(['end'])};
 const encoder={clearBuffer:b=>calls.push(['clear',b]),beginComputePass:d=>{calls.push(['begin',d.label]);return pass;}};
 const frameEncoder={encodePreparedTileSample(e,t,offset){assert.equal(t.width,128);assert.equal(offset,92*512);const p=e.beginComputePass({label:'plasius.wavefront.bounce.0'});p.setBindGroup(0,'canonical-ping',[offset]);p.setPipeline('intersect');p.dispatchWorkgroupsIndirect('args',0);p.setPipeline('surface');p.dispatchWorkgroupsIndirect('args',0);p.setPipeline('swap');p.dispatchWorkgroups(1);p.end();}};
 encodeCanonicalReplay(encoder,{frameEncoder,tile:{width:128,height:128},frameOffset:92*512,phaseOffset:256,counters:'counters',shared:{prepare:'prepare'},sharedGroup:'shared',dispatch:'dispatch',pipelines:{intersectActiveQueue:'intersect',resolveSurfaceRecords:'surface'},journal:{before:'before',after:'after',groups:['journal-ping','journal-pong']}});
 assert.deepEqual(calls.filter(x=>x[0]==='pipeline').map(x=>x[1]),['prepare','before','intersect','after','surface','swap']);
 assert.deepEqual(calls.slice(0,6),[['clear','counters'],['begin','failure-only-canonical-prepare'],['pipeline','prepare'],['group',0,'shared',[92*512,256]],['indirect','dispatch',0],['end']]);
 assert.equal(calls.filter(x=>x[0]==='group'&&x[2]==='canonical-ping').length,3);
});
