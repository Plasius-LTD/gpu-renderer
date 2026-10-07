// Renderer-independent authoring intent. Levels are visual controls, not years
// or structural damage. Kept source-only until a second asset proves the API.
const fields = new Set(['version', 'ropeFray', 'varnishWear', 'seed']);
const normalized = value => Number.isFinite(value) && value >= 0 && value <= 1;

export function createMaterialAgeingProfile(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options) ||
      Object.keys(options).some(key => !fields.has(key))) {
    throw new Error('Invalid material ageing profile.');
  }
  const { version = 1, ropeFray = 0.3, varnishWear = 0.9, seed = 7349 } = options;
  if (version !== 1 || !normalized(ropeFray) || !normalized(varnishWear) ||
      !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error('Invalid material ageing version, levels or seed.');
  }
  return Object.freeze({ version, ropeFray, varnishWear, seed });
}
