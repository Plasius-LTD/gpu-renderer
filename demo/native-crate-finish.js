import { validateNativeMaterials } from '../src/native-surface-materials.js';

// Authored against the unmodified Poly Haven Wooden Crate 01 1k glTF.
// Ranges are triangle offsets: ropes share the body mesh and its texture atlas.
// Keep these asset-specific decisions outside the generic renderer.
const ranges = {
  'wooden_crate_01_lid-0': [[0, 620, 'wood'], [620, 692, 'metal']],
  'wooden_crate_01-0': [[0, 600, 'wood'], [600, 672, 'metal'], [672, 1268, 'wood'],
    [1268, 1980, 'metal'], [1980, 5508, 'rope']],
  'wooden_crate_01_latch-0': [[0, 376, 'metal']],
};
export function crateFinishRanges(name, indexCount) {
  const authored = Object.hasOwn(ranges, name) ? ranges[name] : undefined;
  if (!authored || authored.at(-1)[1] * 3 !== indexCount) {
    throw new Error('The crate topology differs from the reviewed fixture. Re-author its finish ranges.');
  }
  return authored.map(([start, end, finish]) => ({
    firstVertex: start * 3, vertexCount: (end - start) * 3, finish,
  }));
}

const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => { const t = clamp(x); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const hash = (x, y) => {
  const value = Math.sin(x * 127.1 + y * 311.7 + 19.37) * 43758.5453;
  return value - Math.floor(value);
};
function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  return mix(mix(hash(ix, iy), hash(ix + 1, iy), smooth(x - ix)),
    mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), smooth(x - ix)), smooth(y - iy));
}

/** Review preset: immutable source ARM image, wear 0 (fresh) to 1 (rubbed/scuffed). */
export function createWornVarnishMap(orm, wear = 0.65) {
  if (!Number.isFinite(wear) || wear < 0 || wear > 1) throw new Error('wear must be between 0 and 1.');
  validateNativeMaterials([{ orm }]);
  if (!orm) throw new Error('An authored ORM texture is required.');
  const { width, height } = orm;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const u = (x + 0.5) / width, v = (y + 0.5) / height;
      const patches = smooth((noise(u * 15, v * 15) - 0.25) / 0.5);
      const rub = noise(u * 73, v * 29);
      const scuff = smooth((orm.data[i + 1] / 255 - 0.48) / 0.43);
      const damage = clamp(wear * (patches * 0.72 + scuff * 0.7 + rub * 0.10));
      data[i] = Math.round(255 * (1 - damage));
      data[i + 1] = Math.round(255 * (0.24 + damage * 0.46));
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

export function createCrateFinishMaterials(source, wear = 0.65, coated = true) {
  return {
    wood: { ...source, clearcoat: coated ? 0.75 : 0, clearcoatRoughness: 1,
      clearcoatMap: createWornVarnishMap(source.orm, wear) },
    rope: { ...source, clearcoat: 0, clearcoatRoughness: 0, clearcoatMap: undefined },
    metal: { ...source, clearcoat: 0, clearcoatRoughness: 0, clearcoatMap: undefined },
  };
}
