import test from 'node:test';
import assert from 'node:assert/strict';
import {retainNativeFailure,failedPathNodes,readFailedPathNodes} from './fixtures/native-failure-evidence.js';
test('failure gather has bounded staging, reads storage-only nodes and cleans up on mapping failure',async t=>{
 const originalUsage=globalThis.GPUBufferUsage,originalMode=globalThis.GPUMapMode;
 globalThis.GPUBufferUsage={STORAGE:1,COPY_SRC:2,MAP_READ:4,COPY_DST:8};globalThis.GPUMapMode={READ:1};
 t.after(()=>{if(originalUsage)globalThis.GPUBufferUsage=originalUsage;else delete globalThis.GPUBufferUsage;if(originalMode)globalThis.GPUMapMode=originalMode;else delete globalThis.GPUMapMode;});
 const allocated=[],words=new Uint32Array(449);words.set([1,3,27,14,4,2,321,3]);
 const pass={setPipeline(){},setBindGroup(){},dispatchWorkgroups(n){assert.equal(n,1024);},end(){}};
 const device={createBuffer(d){assert.equal(d.size,1796);const b={size:d.size,destroyed:false,async mapAsync(){},getMappedRange:()=>words.buffer,unmap(){},destroy(){this.destroyed=true;}};allocated.push(b);return b;},
  createShaderModule:({code})=>{assert.match(code,/slot>=32u/);return {};},createComputePipeline:()=>({getBindGroupLayout(){return {};}}),createBindGroup:()=>({}),
  createCommandEncoder:()=>({beginComputePass:()=>pass,copyBufferToBuffer(){},finish:()=>({})}),queue:{submit(){}}};
 assert.deepEqual(await readFailedPathNodes(device,{size:4*1024*1024},p=>p),[{node:3,pixel:27,sample:14,bounce:4,reason:2,primitive:321,flags:3,origin:[0,0,0],direction:[0,0,0],distance:0}]);
 assert.ok(allocated.every(b=>b.destroyed));
 await assert.rejects(readFailedPathNodes(device,{size:4*1024*1024},async()=>{throw Error('lost');}),/lost/);
 assert.ok(allocated.every(b=>b.destroyed));
});
test('failure-only path-node decoding is bounded and retains the failing sample and primitive',()=>{
 const words=new Uint32Array(16*40);for(let i=0;i<40;i++){const o=i*16;words[o+3]=3;words[o+12]=27;words[o+13]=14;words[o+14]=4;words[o+15]=(321<<4)|2;}
 const failures=failedPathNodes(words.buffer);assert.equal(failures.length,32);
 assert.deepEqual(failures[0],{node:0,pixel:27,sample:14,bounce:4,reason:2,primitive:321});
 assert.deepEqual(failedPathNodes(new Uint32Array(16).buffer),[]);
});
test('native failure retains diagnostics without accepting incomplete samples',async()=>{
 const error=new Error('incomplete'),trace={tileIndex:2,expectedPrimaryRays:42};
 assert.equal(await retainNativeFailure(error,trace,async()=>({queueOverflow:3})),error);
 assert.equal(error.message,'incomplete');assert.equal(error.captureFailure.tileIndex,2);
 assert.equal(error.captureFailure.finalSample.queueOverflow,3);
 assert.equal(error.captureFailure.counterScope,'last-encoded-camera-sample-only');
 const failed=new Error('original');await retainNativeFailure(failed,trace,async()=>{throw Error('device lost');});
 assert.equal(failed.message,'original');assert.equal(failed.captureFailure.readbackError,'device lost');
 assert.equal(trace.finalSample,undefined);
});
