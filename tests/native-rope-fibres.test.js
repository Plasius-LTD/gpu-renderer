import test from "node:test";
import assert from "node:assert/strict";
import { createRopeFibres, createRopeFibreMaterial } from "../demo/native-rope-fibres.js";

function fixture() {
  const points = [[0, 0, 0], [0.1, 0, 0], [0, 0, 0.1],
    [10, 0, 0], [10.2, 0, 0], [10, 0, 0.2]];
  return {
    vertices: new Float32Array(points.flatMap(p => [...p, 0, 1, 0, 0.6, 0.5, 0.4, 1, 0, 0])),
    texcoords: new Float32Array(points.flatMap((_, i) => i < 3 ? [0.2, 0.3] : [0.7, 0.8])),
    ranges: [{ firstVertex: 0, vertexCount: 6 }],
    density: 4000,
  };
}
const points = (out) => Array.from({ length: out.vertices.length / 12 }, (_, i) => [...out.vertices.slice(i * 12, i * 12 + 3)]);

test("fibres are deterministic, source-preserving and restricted to selected rope ranges", () => {
  const input = fixture(), original = structuredClone(input);
  input.ranges = [{ firstVertex: 0, vertexCount: 3 }];
  const out = createRopeFibres(input);
  assert.equal(out.fibreCount, 20);
  assert.deepEqual(out, createRopeFibres(input));
  assert.notDeepEqual(out, createRopeFibres({ ...input, seed: 123 }));
  assert.deepEqual(input.vertices, original.vertices);
  assert.deepEqual(input.texcoords, original.texcoords);
  assert.equal(out.vertices.length, out.fibreCount * 63 * 12);
  assert.equal(out.texcoords.length, out.fibreCount * 63 * 2);
  for (const p of points(out)) assert.ok(p[0] < 0.11 && p[2] < 0.11);
  for (let i = 0; i < out.fibreCount; i++) {
    const centre = [0, 2].map(j => [0, 1, 7].reduce((sum, v) => sum + out.vertices[(i * 63 + v) * 12 + j], 0) / 3);
    assert.ok(centre[0] >= -1e-8 && centre[1] >= -1e-8 && centre[0] + centre[1] <= 0.100001);
  }
  for (let i = 0; i < out.texcoords.length; i += 2) {
    assert.equal(out.texcoords[i], input.texcoords[0]);
    assert.equal(out.texcoords[i + 1], input.texcoords[1]);
  }
});

test("area-weighted sampling avoids triangle-density clumps and caps geometry", () => {
  const out = createRopeFibres({ ...fixture(), density: 1_000_000, maxFibres: 2000 });
  assert.equal(out.fibreCount, 2000);
  let large = 0;
  for (let i = 0; i < out.fibreCount; i++) if (out.vertices[i * 63 * 12] > 9) large++;
  assert.ok(large > 1500 && large < 1700, `${large} roots on the triangle with four times the area`);
  assert.equal(createRopeFibres({ ...fixture(), maxFibres: 7 }).fibreCount, 7);
  assert.equal(createRopeFibres({ ...fixture(), density: 0 }).fibreCount, 0);
  assert.equal(createRopeFibres({ ...fixture(), ranges: [] }).fibreCount, 0);
});

test("curved fibres have finite unit normals, tapered tips and remain small", () => {
  const out = createRopeFibres({ ...fixture(), maxFibres: 1, length: 0.006, radius: 0.00012 });
  for (let i = 0; i < out.vertices.length; i += 12) {
    const v = out.vertices.slice(i, i + 12);
    assert.ok([...v].every(Number.isFinite));
    assert.ok(Math.abs(Math.hypot(...v.slice(3, 6)) - 1) < 0.00001);
    assert.equal(v[9], 1); assert.equal(v[10], 0); assert.equal(v[11], 0);
  }
  const p = points(out);
  // Root ring and third ring: lateral width tapers before three faces share a tip.
  const dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
  assert.ok(dist(p[0], p[1]) > dist(p[36], p[37]) * 2);
  assert.deepEqual(p[56], p[59]); assert.deepEqual(p[59], p[62]);
  assert.ok(dist(p[0], p[56]) > 0.0005 && dist(p[0], p[56]) < 0.01);
  assert.ok(p[56][1] > p[0][1]);
});

test("degenerate triangles produce no fibres and zero source normals use a finite face normal", () => {
  const flat = fixture(); flat.vertices.fill(0);
  assert.equal(createRopeFibres(flat).fibreCount, 0);
  const missingNormals = fixture();
  for (let i = 0; i < missingNormals.vertices.length; i += 12) missingNormals.vertices.fill(0, i + 3, i + 6);
  assert.ok([...createRopeFibres(missingNormals).vertices].every(Number.isFinite));
  const vertical = fixture();
  for (let i = 0; i < vertical.vertices.length; i += 12) vertical.vertices.set([1, 0, 0], i + 3);
  assert.ok([...createRopeFibres(vertical).vertices].every(Number.isFinite));
});

test("invalid fibre inputs fail before allocation", () => {
  for (const changes of [
    { vertices: [] }, { vertices: new Float32Array(13) },
    { vertices: new Float32Array(600_003 * 12) }, { texcoords: new Float32Array(1) },
    { ranges: null }, { ranges: new Array(257).fill({ firstVertex: 0, vertexCount: 3 }) },
    { ranges: [{ firstVertex: 1, vertexCount: 3 }] },
    { ranges: [{ firstVertex: 0, vertexCount: 9 }] },
    { ranges: [{ firstVertex: 0, vertexCount: 3 }, { firstVertex: 0, vertexCount: 3 }] },
    { density: -1 }, { density: Infinity }, { density: 1_000_001 },
    { maxFibres: 0 }, { maxFibres: 2001 }, { maxFibres: 1.5 },
    { length: 0 }, { length: 0.1 }, { radius: 0 }, { radius: 0.01 },
    { seed: NaN }, { seed: -1 }, { seed: 1.5 },
  ]) assert.throws(() => createRopeFibres({ ...fixture(), ...changes }), /fibre/i);
  for (const key of ["vertices", "texcoords"]) {
    const input = fixture(); input[key][0] = NaN;
    assert.throws(() => createRopeFibres(input), /fibre/i);
  }
});

test("fibre face winding agrees with outward normals for the native two-sided lighting", () => {
  const { vertices } = createRopeFibres({ ...fixture(), maxFibres: 10 });
  for (let i = 0; i < vertices.length; i += 36) {
    const a = vertices.slice(i, i + 3), b = vertices.slice(i + 12, i + 15), c = vertices.slice(i + 24, i + 27);
    const ab = b.map((v, j) => v - a[j]), ac = c.map((v, j) => v - a[j]);
    const face = [ab[1]*ac[2]-ab[2]*ac[1], ab[2]*ac[0]-ab[0]*ac[2], ab[0]*ac[1]-ab[1]*ac[0]];
    const n = [0, 1, 2].map(j => vertices[i + 3 + j] + vertices[i + 15 + j] + vertices[i + 27 + j]);
    assert.ok(face.reduce((sum, v, j) => sum + v * n[j], 0) > 0, `triangle ${i / 36} faces outwards`);
  }
});

test("exposed fibres inherit rope colour without core creases, occlusion or varnish", () => {
  const map = { width: 1, height: 1, data: new Uint8Array([120, 90, 60, 255]) };
  const source = { baseColor: map, normal: map, orm: map, clearcoat: 1, clearcoatMap: map };
  const material = createRopeFibreMaterial(source);
  assert.deepEqual(material, { baseColor: map, clearcoat: 0 });
  assert.equal(source.clearcoat, 1);
  assert.throws(() => createRopeFibreMaterial({ baseColor: { ...map, width: 3 } }), /texture/);
});
