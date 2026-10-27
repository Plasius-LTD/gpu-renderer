import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadWavefrontBuffer } from '../src/wavefront-upload.js';

test('large uploads bound each staging request and wait before submitting another',async()=>{
 const source=new Uint8Array(20);source.set([1,2,3,4],16);const target={},writes=[];let complete;
 const device={queue:{writeBuffer:(...args)=>writes.push(args),onSubmittedWorkDone:()=>new Promise(resolve=>complete=resolve)}};
 const uploading=uploadWavefrontBuffer(device,target,source.buffer,{chunkBytes:8});
 assert.equal(writes.length,1);assert.deepEqual(writes[0],[target,0,source.buffer,0,8]);
 complete();await new Promise(r=>setImmediate(r));assert.equal(writes.length,2);
 complete();await new Promise(r=>setImmediate(r));assert.equal(writes.length,3);
 assert.deepEqual(writes[2],[target,16,source.buffer,16,4]);complete();await uploading;
});
test('small payloads retain one direct upload without waiting',async()=>{
 const data=new ArrayBuffer(8),writes=[];await uploadWavefrontBuffer({queue:{writeBuffer:(...a)=>writes.push(a)}},{},data);
 assert.equal(writes.length,1);assert.equal(writes[0][2],data);
});
test('upload failure stops further chunks and malformed chunk bounds fail before writes',async()=>{
 let writes=0;const device={queue:{writeBuffer(){writes++;},onSubmittedWorkDone:()=>Promise.reject(new Error('device lost'))}};
 await assert.rejects(uploadWavefrontBuffer(device,{},new ArrayBuffer(20),{chunkBytes:8}),/device lost/);assert.equal(writes,1);
 for(const chunkBytes of [0,3,NaN,Infinity])await assert.rejects(uploadWavefrontBuffer(device,{},new ArrayBuffer(20),{chunkBytes}),/chunk/);
 assert.equal(writes,1);
});
