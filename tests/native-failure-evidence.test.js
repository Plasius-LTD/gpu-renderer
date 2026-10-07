import test from 'node:test';
import assert from 'node:assert/strict';
import {retainNativeFailure,failedPathNodes} from './fixtures/native-failure-evidence.js';
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
