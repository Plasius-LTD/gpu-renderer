import assert from 'node:assert/strict';
import test from 'node:test';
import { createWavefrontPathTracingComputeConfig } from '../src/wavefront-config.js';
import { prepareWavefrontInstances } from '../src/wavefront-instances.js';

const mesh = { id: 7, positions: [-1,-1,0, 1,-1,0, 0,1,0], indices: [0,1,2], color: [1,1,1,1] };
const matrix = (x=0) => [1,0,0,0, 0,1,0,0, 0,0,1,0, x,0,0,1];
const instances = n => Array.from({length:n}, (_,i)=>({id:i+100,meshId:7,transform:matrix(i*3)}));

for (const count of [1,50,100,1000,5000,10000,30000]) test(`${count} instances retain one geometry and one BLAS`, () => {
  const config = createWavefrontPathTracingComputeConfig({meshes:[mesh],instances:instances(count)});
  assert.equal(config.triangleCount,1);
  assert.equal(config.instancing.instanceCount,count);
  assert.equal(config.instancing.geometryCount,1);
  assert.equal(config.instancing.blasNodeCount,1);
  assert.equal(config.instancing.instanceBytes,count*144);
  assert.equal(config.memory.triangleBytes,576);
  assert.equal(config.gpuAccelerationBuildRequired,false);
  assert.equal(config.instancing.records[0].root,config.instancing.tlasNodeCount);
});
test('distinct geometry has separate shared BLAS and unique triangle IDs', () => {
  const config=createWavefrontPathTracingComputeConfig({meshes:[mesh,{...mesh,id:8}],instances:[...instances(2),{id:900,meshId:8,transform:matrix()}]});
  assert.equal(config.triangleCount,2);
  assert.equal(config.instancing.geometryCount,2);
  assert.equal(new Set(config.meshAcceleration.triangles.map(t=>t.triangleId)).size,2);
});
test('invalid references, IDs and singular/nonaffine transforms fail before building', () => {
  for(const list of [[],[{id:1,meshId:99,transform:matrix()}],[...instances(1),...instances(1)], [{id:1,meshId:7,transform:Array(16).fill(0)}],[{id:1,meshId:7,transform:matrix().map((x,i)=>i===3?.5:x)}],[{id:1,meshId:7,transform:matrix().map((x,i)=>i===0?NaN:x)}]]) {
    assert.throws(()=>prepareWavefrontInstances([mesh],list),/instance|transform|mesh/iu);
  }
});
test('reflected nonuniform transforms retain inverse and conservative world bounds',()=>{
  const transform=[-2,0,0,0, 0,3,0,0, 0,0,.5,0, 10,2,4,1];
  const plan=prepareWavefrontInstances([mesh],[{id:1,meshId:7,transform}]);
  assert.deepEqual(plan.records[0].bounds,{min:[8,-1,4],max:[12,5,4]});
  assert.deepEqual(plan.records[0].inverse,[-.5,0,0,0, 0,1/3,0,0, 0,0,2,0, 5,-2/3,-8,1]);
  assert.equal(plan.records[0].handedness,-1);
});
test('mesh primitives sharing an immutable placement share affine storage without sharing bounds',()=>{
  const transform=Object.freeze(matrix(3));
  const second={...mesh,id:8,positions:mesh.positions.map(v=>v*2)};
  const list=[{id:1,meshId:7,transform},{id:2,meshId:8,transform}];
  const plan=prepareWavefrontInstances([mesh,second],list);
  assert.equal(plan.records[0].transform,plan.records[1].transform);
  assert.equal(plan.records[0].inverse,plan.records[1].inverse);
  assert.notDeepEqual(plan.records[0].bounds,plan.records[1].bounds);
  assert.ok(Object.isFrozen(plan.records[0].transform));
  // Build-local storage cannot retain a previous scene or mutable caller data.
  assert.notEqual(prepareWavefrontInstances([mesh,second],list).records[0].transform,plan.records[0].transform);
  const mutable=matrix(4), first=prepareWavefrontInstances([mesh],[{id:1,meshId:7,transform:mutable}]);
  mutable[12]=9;
  const next=prepareWavefrontInstances([mesh],[{id:1,meshId:7,transform:mutable}]);
  assert.equal(first.records[0].transform[12],4);
  assert.equal(next.records[0].transform[12],9);
});

test('world bounds retain all eight transformed corners for rotated and sheared placements',()=>{
  for(const transform of [
    [1,.3,-.2,0, .7,2,.1,0, .8,.2,-3,0, 123.4,-5.6,78.9,1],
    [0,1,0,0, -1,0,0,0, 0,0,2,0, -30,17,8,1],
  ]) {
    const volume={...mesh,positions:[-2,-3,-4, 2,3,4, -1,2,0]};
    const record=prepareWavefrontInstances([volume],[{id:1,meshId:7,transform}]).records[0];
    const m=record.transform, points=Array.from({length:8},(_,corner)=>{
      const p=[0,1,2].map(a=>(corner&(1<<a))?[2,3,4][a]:[-2,-3,-4][a]);
      return [0,1,2].map(r=>m[r]*p[0]+m[4+r]*p[1]+m[8+r]*p[2]+m[12+r]);
    });
    assert.deepEqual(record.bounds,{min:[0,1,2].map(a=>Math.min(...points.map(p=>p[a]))),max:[0,1,2].map(a=>Math.max(...points.map(p=>p[a])))});
  }
});
test('instanced emissive sources are refused until per-instance light sampling is supported',()=>{
  assert.throws(()=>createWavefrontPathTracingComputeConfig({meshes:[{...mesh,emission:[1,1,1,1]}],instances:instances(2)}),/emissive/iu);
});

test('unique resource bytes, not logical triangles, determine early admission',()=>{
  const config=createWavefrontPathTracingComputeConfig({meshes:[mesh],instances:instances(100),memoryBudgetBytes:576+14400+199*48});
  assert.equal(config.triangleCount,1);
  assert.throws(()=>createWavefrontPathTracingComputeConfig({meshes:[mesh],instances:instances(100),memoryBudgetBytes:576+14400+199*48-1}),/budget/iu);
  assert.throws(()=>createWavefrontPathTracingComputeConfig({meshes:[mesh],instances:instances(1),accelerationBuildMode:'gpu'}),/cpu-upload/iu);
});
