import { createMaterialAgeingProfile } from './material-ageing.js';
import { createCrateFinishMaterials } from './native-crate-finish.js';
import { createRopeFibres, createRopeFibreMaterial } from './native-rope-fibres.js';

/** Asset adapter: caller owns verified geometry, maps, caching and GPU lifetime. */
export function createCrateAgeing(options) {
  const profile = createMaterialAgeingProfile(options);
  return Object.freeze({
    profile,
    createMaterials(source, coated = true) {
      return { ...createCrateFinishMaterials(source, profile.varnishWear, coated),
        fibres: createRopeFibreMaterial(source) };
    },
    createFibres({ vertices, texcoords, ranges }) {
      return createRopeFibres({ vertices, texcoords, ranges,
        fray: profile.ropeFray, seed: profile.seed, length: 0.014, radius: 0.00032 });
    },
  });
}
