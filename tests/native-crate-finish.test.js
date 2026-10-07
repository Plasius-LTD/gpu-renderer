import test from 'node:test';
import assert from 'node:assert/strict';
import { crateFinishRanges, createWornVarnishMap, createCrateFinishMaterials } from '../demo/native-crate-finish.js';

test('crate ropes and hardware are explicitly uncoated contiguous surfaces', () => {
  const body = crateFinishRanges('wooden_crate_01-0', 16524);
  assert.deepEqual(body.at(-1), { firstVertex: 5940, vertexCount: 10584, finish: 'rope' });
  for (const [name, count] of [['wooden_crate_01-0', 16524], ['wooden_crate_01_lid-0', 2076], ['wooden_crate_01_latch-0', 1128]]) {
    let next = 0;
    for (const range of crateFinishRanges(name, count)) {
      assert.equal(range.firstVertex, next);
      next += range.vertexCount;
    }
    assert.equal(next, count);
  }
  assert.deepEqual(crateFinishRanges('wooden_crate_01_latch-0', 1128), [
    { firstVertex: 0, vertexCount: 1128, finish: 'metal' },
  ]);
  assert.throws(() => crateFinishRanges('another-model', 16524), /reviewed/);
  assert.throws(() => crateFinishRanges('wooden_crate_01-0', 16521), /reviewed/);
});

const source = (roughness) => ({ width: 32, height: 32,
  data: new Uint8Array(Array.from({ length: 32 * 32 }, () => [255, roughness, 0, 255]).flat()) });
test('wear is deterministic and varies coverage and roughness independently of base colour', () => {
  const orm = source(160), original = orm.data.slice();
  const pristine = createWornVarnishMap(orm, 0);
  const worn = createWornVarnishMap(orm, 0.5);
  assert.deepEqual(worn, createWornVarnishMap(orm, 0.5));
  assert.deepEqual(orm.data, original);
  const red = [], green = [];
  for (let i = 0; i < worn.data.length; i += 4) {
    assert.equal(pristine.data[i], 255);
    assert.equal(pristine.data[i + 1], Math.round(0.24 * 255));
    assert.ok(worn.data[i] <= pristine.data[i]);
    assert.ok(worn.data[i + 1] >= pristine.data[i + 1]);
    red.push(worn.data[i]); green.push(worn.data[i + 1]);
  }
  assert.ok(Math.max(...red) - Math.min(...red) > 40);
  assert.ok(Math.max(...green) - Math.min(...green) > 20);
  const scuffed = createWornVarnishMap(source(245), 0.75);
  const smooth = createWornVarnishMap(source(90), 0.75);
  assert.ok(scuffed.data[0] < smooth.data[0]);
  assert.ok(scuffed.data[1] > smooth.data[1]);
});
test('finish authoring rejects invalid input without changing the source', () => {
  for (const wear of [-1, 1.1, NaN, Infinity]) assert.throws(() => createWornVarnishMap(source(100), wear), /wear/);
  assert.throws(() => createWornVarnishMap({ width: 2, height: 2, data: new Uint8Array(3) }), /texture/);
});


test('rope and hardware stay uncoated at both wear extremes and when toggling the coat', () => {
  for (const wear of [0, 1]) for (const coated of [false, true]) {
    const materials = createCrateFinishMaterials({ orm: source(160), clearcoat: 1 }, wear, coated);
    assert.equal(materials.wood.clearcoat, coated && wear < 1 ? 0.75 : 0);
    for (const name of ['rope', 'metal']) {
      assert.equal(materials[name].clearcoat, 0);
      assert.equal(materials[name].clearcoatMap, undefined);
    }
  }
  assert.throws(() => createWornVarnishMap(), /required/);
});


test('100% wear is bare at every texel and exactly matches coating disabled', () => {
  for (const roughness of [0, 90, 160, 220, 255]) {
    const orm = source(roughness);
    let previous = createWornVarnishMap(orm, 0);
    for (const wear of [0.25, 0.5, 0.75, 0.9, 0.99, 1]) {
      const map = createWornVarnishMap(orm, wear);
      for (let i = 0; i < map.data.length; i += 4) {
        assert.ok(map.data[i] <= previous.data[i], 'coverage never grows with wear');
        if (wear === 1) assert.equal(map.data[i], 0, 'no surviving varnish');
      }
      previous = map;
    }
    const on = createCrateFinishMaterials({ orm }, 1, true);
    const off = createCrateFinishMaterials({ orm }, 1, false);
    assert.equal(on.wood.clearcoat, 0);
    assert.deepEqual(on, off);
    assert.equal(on.wood.orm, orm, 'underlying wood is preserved');
  }
});
