import test from 'node:test';
import assert from 'node:assert/strict';
import { createMaterialAgeingProfile } from '../demo/material-ageing.js';
import { createCrateAgeing } from '../demo/native-crate-ageing.js';
import { createCrateRopeGuides } from '../demo/native-crate-groom.js';

const texture = { width: 32, height: 32,
  data: new Uint8Array(Array.from({ length: 1024 }, () => [255, 220, 0, 255]).flat()) };
const source = { baseColor: texture, orm: texture };
const geometry = {
  vertices: new Float32Array([[0,0,0], [1,0,0], [0,0,1]].flatMap(p => [...p, 0,1,0, 1,1,1, 1,0,0])),
  texcoords: new Float32Array([0,0, 1,0, 0,1]), ranges: [{ firstVertex: 0, vertexCount: 3 }],
};

test('ageing profiles are bounded, serializable, immutable and versioned', () => {
  const preset = createMaterialAgeingProfile();
  assert.deepEqual(preset, { version: 1, ropeFray: 0.3, varnishWear: 0.9, seed: 7349 });
  assert.ok(Object.isFrozen(preset));
  assert.deepEqual(createMaterialAgeingProfile(JSON.parse(JSON.stringify(preset))), preset);
  const input = { ropeFray: 0, varnishWear: 1, seed: 0xffffffff };
  const profile = createMaterialAgeingProfile(input);
  input.ropeFray = 1;
  assert.equal(profile.ropeFray, 0);
  assert.throws(() => { profile.ropeFray = 0.5; }, TypeError);
  for (const invalid of [null, [], 3, { version: 2 }, { unknown: 1 },
    { ropeFray: NaN }, { ropeFray: -1 }, { ropeFray: 1.1 }, { ropeFray: '0.3' },
    { varnishWear: Infinity }, { varnishWear: -1 }, { varnishWear: 1.1 },
    { seed: -1 }, { seed: 0x100000000 }, { seed: 0.1 }]) {
    assert.throws(() => createMaterialAgeingProfile(invalid), /ageing/);
  }
});

test('crate adapter applies 30% fraying and heavy wood-only wear without mutating sources', () => {
  const original = structuredClone({ source, geometry });
  const ageing = createCrateAgeing();
  assert.ok(Object.isFrozen(ageing));
  assert.deepEqual(ageing.profile, createMaterialAgeingProfile());
  const materials = ageing.createMaterials(source), fibres = ageing.createFibres(geometry);
  assert.equal(fibres.fibreCount, 4000);
  assert.equal(fibres.looseEndCount, 1200);
  assert.equal(materials.wood.clearcoat, 0.75);
  for (const key of ['rope', 'metal', 'fibres']) assert.equal(materials[key].clearcoat, 0);
  assert.equal(materials.fibres.orm, undefined);
  assert.deepEqual(materials.wood.baseColor, source.baseColor);
  assert.equal(ageing.createMaterials(source, false).wood.clearcoat, 0);
  assert.deepEqual({ source, geometry }, original);
  const coat = materials.wood.clearcoatMap.data;
  const strengths = Array.from({ length: coat.length / 4 }, (_, i) => coat[i * 4]);
  assert.ok(strengths.filter(v => v < 32).length > strengths.length * 0.1, 'heavy scuffing exposes wood');
  assert.ok(Math.max(...strengths) > 8, 'patches of coating survive');
});

test('varnish and rope channels are independent, deterministic and preserve rollback paths', () => {
  const fresh = createCrateAgeing({ ropeFray: 0, varnishWear: 0, seed: 7349 });
  const rope = createCrateAgeing({ ropeFray: 0.3, varnishWear: 0, seed: 7349 });
  const aged = createCrateAgeing();
  assert.deepEqual(fresh.createMaterials(source), rope.createMaterials(source));
  assert.deepEqual(rope.createFibres(geometry), aged.createFibres(geometry));
  assert.notDeepEqual(fresh.createFibres(geometry), rope.createFibres(geometry));
  assert.notDeepEqual(rope.createMaterials(source).wood.clearcoatMap, aged.createMaterials(source).wood.clearcoatMap);
  assert.deepEqual(createCrateAgeing({ seed: 1 }).createMaterials(source), aged.createMaterials(source));
  assert.notDeepEqual(createCrateAgeing({ seed: 1 }).createFibres(geometry), aged.createFibres(geometry));
  assert.throws(() => createCrateAgeing({ ropeFray: 10 }), /ageing/);
  assert.throws(() => aged.createFibres({ ...geometry, ranges: [{ firstVertex: 0, vertexCount: 6 }] }), /fibre/);
  assert.throws(() => aged.createMaterials({ orm: {} }), /texture/);
});

test('fixture groom guides mirror both handles and follow grounding without mutating paths', () => {
  const original = createCrateRopeGuides(), moved = createCrateRopeGuides(0.008);
  assert.equal(original.length, 4);
  for (let guide = 0; guide < original.length; guide++) for (let i = 0; i < original[guide].length; i++) {
    const p = original[guide][i], q = moved[guide][i];
    assert.ok(p.every(Number.isFinite));
    assert.equal(q[0], p[0]); assert.equal(q[2], p[2]); assert.equal(q[1], p[1] + 0.008);
    assert.ok(p[0] * (guide < 2 ? -1 : 1) > 0.34, 'guides stay on their handle side');
    if (guide < 2) assert.deepEqual(original[guide + 2][i], [-p[0], p[1], p[2]]);
  }
  assert.deepEqual(createCrateRopeGuides(), original);
  assert.throws(() => createCrateRopeGuides(Infinity), /offset/);
  const out = createCrateAgeing().createFibres(geometry);
  assert.equal(out.vertices.length / 12, 252000);
  assert.ok(out.vertices.length / 12 + 19734 < 300000, 'fixture fits unchanged native budget');
});
