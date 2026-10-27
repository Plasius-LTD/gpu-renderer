import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeWgslSource} from '@plasius/gpu-shader/node';
import {opticalTraceEventsFromSearch,opticalChainTraceShader,decodeOpticalChainTrace,captureOpticalChainTrace,packOpticalTracePrimary} from './fixtures/optical-chain-trace.js';
test('long-tail diagnostics default off, validate before GPU access and reuse canonical transport',async()=>{
 assert.equal(opticalTraceEventsFromSearch(''),0);assert.equal(opticalTraceEventsFromSearch('?opticalTraceEvents=4096'),4096);
 for(const n of ['0','4097','','01','1.5','NaN','64&opticalTraceEvents=32'])assert.throws(()=>opticalTraceEventsFromSearch('?opticalTraceEvents='+n),/Invalid/);
 const forbidden=new Proxy({},{get(){throw Error('disabled access');}});assert.equal(await captureOpticalChainTrace(forbidden,{maximumInterfaces:0}),null);
 for(const n of [0,4097,NaN])assert.throws(()=>opticalChainTraceShader({pixel:1,maximumInterfaces:n,sampler:'fixed-pattern'}),/Invalid/);
 const code=opticalChainTraceShader({pixel:95974,maximumInterfaces:4096,sampler:'fixed-pattern'});
 assert.deepEqual(analyzeWgslSource(code,'optical-tail').workgroupSizes.get('trace_optical_chain').map(v=>v.value),[1,1,1]);
 assert.match(code,/resolve_optical_chain\(first.ray,first.hit,4096u\)/);
 const entry=code.slice(code.indexOf('fn trace_optical_chain'));
 assert.doesNotMatch(entry,/pathNodes|nextQueue|resolved|record_weighted|commit_sample|make_ray/);
 assert.match(entry,/let ray=activeQueue\[0\]/);assert.match(code,/record_optical_chain_step/);
});
test('tail diagnostic uploads the exact captured camera packet without renormalization',()=>{
 const r={stage:'before-intersection',rayId:7654,parentRayId:0xffffffff,pixel:95974,sample:2,bounce:0,medium:0,flags:0,mediumDepth:0,
  origin:[3.176982879638672,-.4139057993888855,.1437508463859558],originW:1,
  direction:[-.7179039716720581,-.5479844808578491,-.42933303117752075],directionW:0,throughput:[1,1,1,1],mediumStack:[0,0,0,0]};
 const selection={pixel:r.pixel,sample:r.sample},bytes=packOpticalTracePrimary(r,selection),u=new Uint32Array(bytes),f=new Float32Array(bytes);
 assert.equal(bytes.byteLength,96);assert.deepEqual([...u.slice(0,8)],[7654,0xffffffff,95974,2,0,0,0,0]);
 assert.deepEqual([...f.slice(12,15)],r.direction);assert.equal(f[11],1);assert.equal(f[15],0);
 for(const change of [{originW:undefined},{directionW:NaN},{sample:1},{origin:[0,0,Infinity]},{stage:'after-intersection'}])assert.throws(()=>packOpticalTracePrimary({...r,...change},selection),/original/);
});
test('bounded tail decoding rejects missing extents, ordinals and non-finite geometry',()=>{
 assert.throws(()=>decodeOpticalChainTrace(new ArrayBuffer(1),64),/extent/);
 const limit=1,bytes=new ArrayBuffer((limit+1)*208+32),v=new Float32Array(bytes),end=(limit+1)*52;
 v[15]=2;v[end+3]=2;const result=decodeOpticalChainTrace(bytes,limit);assert.equal(result.ordinal,0);
 v[end]=2;assert.throws(()=>decodeOpticalChainTrace(bytes,limit),/summary/);v[end]=0;
 v[3]=1;assert.throws(()=>decodeOpticalChainTrace(bytes,limit),/ordinal/);v[3]=0;
 v[0]=NaN;assert.throws(()=>decodeOpticalChainTrace(bytes,limit),/Invalid/);
});
test('partial diagnostic allocation failure destroys the already allocated primary packet',async t=>{
 const previous=globalThis.GPUBufferUsage;globalThis.GPUBufferUsage={STORAGE:1,COPY_SRC:2,COPY_DST:4,MAP_READ:8};
 t.after(()=>{if(previous===undefined)delete globalThis.GPUBufferUsage;else globalThis.GPUBufferUsage=previous;});
 const selection={pixel:95974,sample:2},record={stage:'before-intersection',rayId:7654,parentRayId:0xffffffff,...selection,bounce:0,medium:0,flags:0,mediumDepth:0,
  origin:[3,-.4,.1],originW:1,direction:[0,-1,0],directionW:0,throughput:[1,1,1,1],mediumStack:[0,0,0,0]};
 const allocated=[];const device={createBuffer(d){if(allocated.length)throw Error('allocation failed');const b={...d,destroy(){this.destroyed=true;}};allocated.push(b);return b;}};
 await assert.rejects(captureOpticalChainTrace({device},{config:{transportExperimentFlags:180224},tile:{x:128,y:128,width:128,height:128},selection,sampler:'fixed-pattern',maximumInterfaces:64,original:{records:[record]}}),/allocation failed/);
 assert.equal(allocated.length,1);assert.equal(allocated[0].destroyed,true);
});
