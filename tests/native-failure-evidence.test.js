import test from 'node:test';
import assert from 'node:assert/strict';
import {retainNativeFailure} from './fixtures/native-failure-evidence.js';
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
