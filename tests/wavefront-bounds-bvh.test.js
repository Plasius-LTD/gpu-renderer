import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWavefrontBoundsBvh } from '../src/wavefront-mesh-sources.js';

// Independent retained reference: stable median hierarchy is observable through
// instance ordering, including equal-distance hit tie ownership.
function reference(records, leafSize, padding = 0) {
  const nodes = [], ordered = [];
  function build(items) {
    const index = nodes.length; nodes.push(null);
    const min = [0,1,2].map(a => Math.min(...items.map(v => v.bounds.min[a])));
    const max = [0,1,2].map(a => Math.max(...items.map(v => v.bounds.max[a])));
    const bounds = { min: min.map((v,a) => v - Math.max(1,Math.abs(v),Math.abs(max[a])) * padding),
      max: max.map((v,a) => v + Math.max(1,Math.abs(min[a]),Math.abs(v)) * padding) };
    if (items.length <= leafSize) {
      nodes[index] = { bounds, firstTriangle: ordered.length, triangleCount: items.length, leftChild: 0, rightChild: 0 };
      ordered.push(...items); return index;
    }
    const spans = [0,1,2].map(a => Math.max(...items.map(v => v.centroid[a])) - Math.min(...items.map(v => v.centroid[a])));
    const axis = spans[0] >= spans[1] && spans[0] >= spans[2] ? 0 : spans[1] >= spans[2] ? 1 : 2;
    const sorted = [...items].sort((a,b) => a.centroid[axis] - b.centroid[axis]);
    const middle = Math.floor(items.length / 2), leftChild = build(sorted.slice(0,middle)), rightChild = build(sorted.slice(middle));
    nodes[index] = { bounds, firstTriangle:leftChild, triangleCount:0, leftChild, rightChild };
    return index;
  }
  if(records.length) build(records);
  return { nodes, triangles:ordered };
}

function fixture(count) {
  return Object.freeze(Array.from({length:count},(_,i) => {
    // Deliberate equal centroids and varying extents exercise stable ties.
    const centroid = [i % 7, (i * 13) % 5, (i * 19) % 11];
    return Object.freeze({id:i,centroid:Object.freeze(centroid),bounds:Object.freeze({
      min:Object.freeze(centroid.map((v,a) => v - (i % (a+2) + 1) / 8)),
      max:Object.freeze(centroid.map((v,a) => v + (i % (a+3) + 1) / 4)) })});
  }));
}

for(const count of [0,1,2,17,257]) for(const leaf of [1,4]) {
  test(`stable complete hierarchy preserves ${count} inputs at leaf size ${leaf}`, () => {
    const records = fixture(count), before = JSON.stringify(records), result = buildWavefrontBoundsBvh(records,leaf);
    assert.deepEqual(result,reference(records,leaf));
    assert.equal(JSON.stringify(records),before);
    assert.equal(new Set(result.triangles).size,count);
    assert.ok(Object.isFrozen(result.nodes) && Object.isFrozen(result.triangles));
  });
}

test('TLAS padding is applied during construction without changing partition or stable identities', () => {
  const records = fixture(257), result = buildWavefrontBoundsBvh(records,1,1e-6);
  assert.deepEqual(result,reference(records,1,1e-6));
  for (const node of result.nodes) assert.ok(Object.isFrozen(node) && Object.isFrozen(node.bounds.min));
});

test('rejects invalid outward padding before building bounds', () => {
  for (const padding of [-1, NaN, Infinity, '0', null]) {
    assert.throws(() => buildWavefrontBoundsBvh(fixture(1), 1, padding), /padding/i);
  }
});
