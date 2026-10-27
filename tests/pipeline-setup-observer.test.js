import test from 'node:test';
import assert from 'node:assert/strict';
import {observePipelineSetup} from './fixtures/pipeline-setup-observer.js';
test('pipeline setup evidence retains pending stages, exact descriptors, results and failures without changing policy',async()=>{
 let release,time=1;const descriptor={compute:{entryPoint:'surface'},label:'original'},result={pipeline:1};
 const device={createComputePipelineAsync:async d=>{assert.equal(d,descriptor);return new Promise(r=>release=r);},createRenderPipelineAsync:async()=>{throw Error('compile');}};
 const snapshot=observePipelineSetup(device,()=>time);const pending=device.createComputePipelineAsync(descriptor);
 time=30002;assert.equal(snapshot()[0].elapsedMs,30001);assert.equal(snapshot()[0].status,'pending');
 release(result);assert.equal(await pending,result);assert.equal(snapshot()[0].status,'complete');
 await assert.rejects(device.createRenderPipelineAsync({label:'present'}),/compile/);
 assert.equal(snapshot()[1].status,'failed');assert.equal(snapshot()[1].error,'compile');
 const copy=snapshot();copy[0].status='changed';assert.equal(snapshot()[0].status,'complete');
 assert.deepEqual(observePipelineSetup({})(),[]);
});
