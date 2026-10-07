import { createMaterialAgeingProfile } from './material-ageing.js';
import { createCrateFinishMaterials } from './native-crate-finish.js';
import { createRopeFibres, createRopeFibreMaterial } from './native-rope-fibres.js';
import { createCrateRopeGuides } from './native-crate-groom.js';

/** Asset adapter: caller owns verified geometry, maps, caching and GPU lifetime. */
export function createCrateAgeing(options) {
  const profile = createMaterialAgeingProfile(options);
  return Object.freeze({
    profile,
    createMaterials(source, coated = true) {
      return { ...createCrateFinishMaterials(source, profile.varnishWear, coated),
        fibres: createRopeFibreMaterial(source) };
    },
    createFibres({ vertices, texcoords, ranges, heightOffset = 0 }) {
      return createRopeFibres({ vertices, texcoords, ranges,
        guides: createCrateRopeGuides(heightOffset),
        fray: profile.ropeFray, seed: profile.seed, length: 0.0045, radius: 0.00016,
        density: 64000, maxFibres: 4000 });
    },
  });
}
