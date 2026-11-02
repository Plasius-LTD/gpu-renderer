import test from 'node:test';
import assert from 'node:assert/strict';
import { createInspectionProjection, copyInspectionCamera } from '../src/animated-inspection-camera.js';

const pose = { position:[0,1,5], target:[0,1,0], fovYDegrees:45 };
test('inspection projection applies actual position, orientation and lens', () => {
  const project = camera => createInspectionProjection(camera,800,500).project([1,1,0]);
  const start=project(pose);
  for (const change of [
    {position:[5,1,0]}, // orbit
    {position:[1,1,5],target:[1,1,0]}, // truck
    {target:[1,1,0]}, // pan
    {position:[0,1,3]}, // dolly
    {fovYDegrees:25}, // optical zoom
  ]) assert.notEqual(project({...pose,...change}).x,start.x);
  assert.ok(start.visible); assert.ok(Number.isFinite(start.scale));
  const p=createInspectionProjection(pose,800,500);
  assert.equal(p.project([0,1,6]).visible,false);
  assert.equal(p.project([100,1,0]).visible,false);
  assert.equal(p.project([0,1,4.995]).visible,false);
  assert.ok(p.project([0,1,5]).x===400,'camera-plane projection stays finite');
});

test('inspection camera validates values and copies caller-owned arrays', () => {
  const input=structuredClone(pose), copied=copyInspectionCamera(input);
  input.position[0]=900;assert.equal(copied.position[0],0);
  assert.equal(copyInspectionCamera(null),null);
  for(const input of [undefined,{}, {...pose,position:[NaN,1,5]}, {...pose,target:pose.position}, {...pose,fovYDegrees:Infinity}, {...pose,fovYDegrees:2}, {...pose,fovYDegrees:150}])
    assert.throws(()=>copyInspectionCamera(input),/Invalid inspection camera/);
});
