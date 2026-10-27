import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeWgslSource} from '@plasius/gpu-shader/node';
import {opticalTraceEventsFromSearch,opticalChainTraceShader,decodeOpticalChainTrace,captureOpticalChainTrace} from './fixtures/optical-chain-trace.js';
test('long-tail diagnostics default off, validate before GPU access and reuse canonical transport',async()=>{
 assert.equal(opticalTraceEventsFromSearch(''),0);assert.equal(opticalTraceEventsFromSearch('?opticalTraceEvents=4096'),4096);
 for(const n of ['0','4097','','01','1.5','NaN','64&opticalTraceEvents=32'])assert.throws(()=>opticalTraceEventsFromSearch('?opticalTraceEvents='+n),/Invalid/);
 const forbidden=new Proxy({},{get(){throw Error('disabled access');}});assert.equal(await captureOpticalChainTrace(forbidden,{maximumInterfaces:0}),null);
 for(const n of [0,4097,NaN])assert.throws(()=>opticalChainTraceShader({pixel:1,maximumInterfaces:n,sampler:'fixed-pattern'}),/Invalid/);
 const code=opticalChainTraceShader({pixel:95974,maximumInterfaces:4096,sampler:'fixed-pattern'});
 assert.deepEqual(analyzeWgslSource(code,'optical-tail').workgroupSizes.get('trace_optical_chain').map(v=>v.value),[1,1,1]);
 assert.match(code,/resolve_optical_chain\(first.ray,first.hit,4096u\)/);
 const entry=code.slice(code.indexOf('fn trace_optical_chain'));
 assert.doesNotMatch(entry,/pathNodes|nextQueue|resolved|record_weighted|commit_sample|activeQueue/);
 assert.match(entry,/make_ray\(root\)/);assert.match(code,/record_optical_chain_step/);
});
test('bounded tail decoding rejects missing extents, ordinals and non-finite geometry',()=>{
 assert.throws(()=>decodeOpticalChainTrace(new ArrayBuffer(1),64),/extent/);
 const limit=1,bytes=new ArrayBuffer((limit+1)*208+32),v=new Float32Array(bytes),end=(limit+1)*52;
 v[15]=2;v[end+3]=2;const result=decodeOpticalChainTrace(bytes,limit);assert.equal(result.ordinal,0);
 v[end]=2;assert.throws(()=>decodeOpticalChainTrace(bytes,limit),/summary/);v[end]=0;
 v[3]=1;assert.throws(()=>decodeOpticalChainTrace(bytes,limit),/ordinal/);v[3]=0;
 v[0]=NaN;assert.throws(()=>decodeOpticalChainTrace(bytes,limit),/Invalid/);
});
