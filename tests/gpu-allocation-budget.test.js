import assert from 'node:assert/strict';
import test from 'node:test';
import { createGpuAllocationTracker } from '../src/gpu-allocation-budget.js';

function fixture(budgetBytes=1024) {
  const created=[];
  const device={limits:{maxBufferSize:4096,maxStorageBufferBindingSize:2048,maxTextureDimension2D:64,maxTextureArrayLayers:4},
    createBuffer(d){const r={descriptor:d,destroy(){this.destroyed=true;}};created.push(r);return r;},
    createTexture(d){const r={descriptor:d,destroy(){this.destroyed=true;}};created.push(r);return r;},destroy(){this.destroyed=true;}};
  return {created,raw:device,...createGpuAllocationTracker(device,{budgetBytes,storageUsage:128})};
}
test('actual requested allocation descriptors enforce exact total byte budget',()=>{
  const f=fixture();const a=f.device.createBuffer({size:512,usage:128,label:'geometry'});
  const b=f.device.createTexture({size:[8,8],format:'rgba16float'});
  assert.equal(f.snapshot().allocatedBytes,1024);
  assert.throws(()=>f.device.createBuffer({size:4}),/budget/iu);
  assert.equal(f.created.length,2);
  a.destroy();a.destroy();assert.equal(f.snapshot().allocatedBytes,512);
  b.destroy();assert.equal(f.snapshot().allocatedBytes,0);assert.equal(f.snapshot().peakAllocatedBytes,1024);
});
test('buffer and texture device limits reject before allocation',()=>{
  const f=fixture(100000);
  for(const descriptor of [{size:4097},{size:2049,usage:128},{size:NaN},{size:-1},{size:Number.MAX_SAFE_INTEGER+1}]) assert.throws(()=>f.device.createBuffer(descriptor));
  assert.throws(()=>f.device.createTexture({size:[65,1],format:'rgba8unorm'}),/limit/iu);
  assert.throws(()=>f.device.createTexture({size:[1,1,5],format:'rgba8unorm'}),/limit/iu);
  assert.equal(f.created.length,0);
});
test('mips, sample count, layers and cleanup count correctly',()=>{
  const f=fixture(100000);
  f.device.createTexture({size:{width:8,height:4,depthOrArrayLayers:2},mipLevelCount:4,format:'rgba8unorm',sampleCount:1});
  assert.equal(f.snapshot().allocatedBytes,(32+8+2+1)*2*4);
  f.destroy();assert.equal(f.snapshot().allocatedBytes,0);assert.ok(f.created.every(r=>r.destroyed));
});
test('invalid budgets, unknown formats and overflow fail closed',()=>{
  assert.throws(()=>fixture(0));assert.throws(()=>fixture(NaN));
  const f=fixture();assert.throws(()=>f.device.createTexture({size:[1,1],format:'unknown'}));
  assert.equal(f.created.length,0);
});
