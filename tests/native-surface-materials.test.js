import test from "node:test";
import assert from "node:assert/strict";
import {
  validateNativeMaterials,
  createNativeMaterialTextures,
} from "../src/native-surface-materials.js";

const image = (data, width = 2, height = 1) => ({
  width,
  height,
  data: new Uint8Array(data),
});
function fixture() {
  const allocations = [],
    uploads = [];
  return {
    allocations,
    uploads,
    device: {
      createTexture(d) {
        const t = { descriptor: d, createView: () => ({ texture: t }) };
        allocations.push(t);
        return t;
      },
      queue: {
        writeTexture(destination, bytes, layout, size) {
          uploads.push({ destination, bytes: [...bytes], layout, size });
        },
      },
    },
  };
}
test("material colour mips filter in linear light; data maps remain linear", () => {
  const f = fixture();
  const materials = [
    {
      baseColor: image([0, 0, 0, 255, 255, 255, 255, 255]),
      orm: image([0, 0, 0, 255, 255, 255, 255, 255]),
    },
  ];
  validateNativeMaterials(materials);
  createNativeMaterialTextures(f.device, materials, (x) => x);
  const colour = f.uploads.find(
    (x) =>
      x.destination.texture.descriptor.format === "rgba8unorm-srgb" &&
      x.destination.mipLevel === 1,
  );
  assert.equal(colour.bytes[0], 188);
  const orm = f.uploads.find(
    (x) =>
      x.destination.texture.descriptor.label.endsWith(".orm") &&
      x.destination.mipLevel === 1,
  );
  assert.equal(orm.bytes[0], 128);
});
test("fallback maps are opaque white, neutral normal and neutral ORM", () => {
  const f = fixture();
  const groups = createNativeMaterialTextures(f.device, [], (x) => x);
  assert.equal(groups.length, 1);
  assert.deepEqual(
    f.uploads.map((x) => x.bytes),
    [
      [255, 255, 255, 255],
      [128, 128, 255, 255],
      [255, 255, 255, 255],
      [255, 255, 255, 255],
    ],
  );
});

test("coating coverage and roughness maps validate, count toward the budget and mip in linear space", () => {
  assert.throws(() => validateNativeMaterials([{ clearcoatMap: image([1]) }]), /clearcoatMap/);
  const large = { width: 2048, height: 2048, data: new Uint8Array(2048 * 2048 * 4) };
  assert.throws(() => validateNativeMaterials(new Array(5).fill({ clearcoatMap: large })), /64 MiB/);
  const f = fixture();
  const clearcoatMap = image([0, 64, 255, 255, 255, 192, 255, 255]);
  validateNativeMaterials([{ clearcoat: 0.7, clearcoatMap }]);
  const groups = createNativeMaterialTextures(f.device, [{ clearcoat: 0.7, clearcoatMap }], (x) => x);
  assert.ok(groups[1].clearcoatMap);
  // A finish-only map must not suppress the legacy procedural substrate detail.
  assert.equal(groups[1].authored, false);
  const levels = f.uploads.filter(x => x.destination.texture.descriptor.label === "native.material.1.clearcoatMap");
  assert.equal(levels[0].destination.texture.descriptor.format, "rgba8unorm");
  assert.deepEqual(levels[0].bytes, [...clearcoatMap.data]);
  assert.deepEqual(levels[1].bytes, [128, 128, 255, 255]);
});
test("invalid materials fail bounded validation", () => {
  for (const input of [
    null,
    {},
    new Array(17).fill({}),
    [null],
    [{ baseColor: image([1]) }],
    [{ normal: { width: 3, height: 1, data: new Uint8Array(12) } }],
    [{ orm: { width: 4096, height: 1, data: new Uint8Array(16384) } }],
    [{ normalScale: NaN }],
    [{ normalScale: 5 }],
    [{ orm: { width: 1, height: 1, data: new Float32Array(4) } }],
  ]) {
    assert.throws(
      () => validateNativeMaterials(input),
      /material|texture|normalScale/i,
    );
  }
  const large = {
    width: 2048,
    height: 2048,
    data: new Uint8Array(2048 * 2048 * 4),
  };
  assert.throws(
    () => validateNativeMaterials(new Array(5).fill({ baseColor: large })),
    /64 MiB/,
  );
});
test("all mip levels reach 1x1 for rectangular maps and own every allocation", () => {
  const f = fixture(),
    owned = [];
  const material = {
    normal: { width: 1, height: 4, data: new Uint8ClampedArray(16).fill(128) },
    normalScale: 0.5,
  };
  validateNativeMaterials([material]);
  const groups = createNativeMaterialTextures(f.device, [material], (x) => {
    owned.push(x);
    return x;
  });
  assert.equal(groups.length, 2);
  assert.equal(owned.length, f.allocations.length);
  assert.equal(
    f.uploads.filter((x) => x.destination.texture.descriptor.size.height === 4)
      .length,
    3,
  );
  assert.equal(groups[1].normalScale, 0.5);
});

test("clearcoat parameters are independent and bounded, and default to uncoated", () => {
  for (const material of [
    { clearcoat: -1 },
    { clearcoat: 1.1 },
    { clearcoat: NaN },
    { clearcoatRoughness: Infinity },
    { clearcoatRoughness: -0.1 },
    { clearcoatRoughness: 2 },
  ]) {
    assert.throws(() => validateNativeMaterials([material]), /clearcoat/i);
  }
  const f = fixture();
  const materials = [
    { clearcoat: 0.7, clearcoatRoughness: 0.24 },
    { clearcoat: 0, clearcoatRoughness: 0 },
  ];
  validateNativeMaterials(materials);
  const uploaded = createNativeMaterialTextures(f.device, materials, (x) => x);
  assert.equal(uploaded[0].clearcoat, 0);
  assert.equal(uploaded[0].clearcoatRoughness, 0);
  assert.equal(uploaded[1].clearcoat, 0.7);
  assert.equal(uploaded[1].clearcoatRoughness, 0.24);
  assert.equal(uploaded[2].clearcoat, 0);
  assert.equal(uploaded[2].clearcoatRoughness, 0);
});
