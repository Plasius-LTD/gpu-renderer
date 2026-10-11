import test from 'node:test';
import assert from 'node:assert/strict';
import * as renderer from '../src/index.js';

test('shared authors use the same native material validation before allocating a GPU', () => {
  assert.equal(typeof renderer.validateNativeSurfaceMaterials,'function');
  assert.doesNotThrow(()=>renderer.validateNativeSurfaceMaterials([{clearcoat:.7}]));
  assert.throws(()=>renderer.validateNativeSurfaceMaterials([{clearcoat:2}]),/clearcoat/);
  assert.throws(()=>renderer.validateNativeSurfaceMaterials([{baseColor:{width:1,height:1,data:new Uint8Array(3)}}]),/RGBA8/);
});
