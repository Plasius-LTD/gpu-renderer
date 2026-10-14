export const PRIMARY_MIS_TOLERANCE = 0.00001;
export const PRIMARY_MIS_SPP = Object.freeze([1, 32, 128]);

export function primaryMisCase(name) {
  if (!["environment", "emissive", "metal", "dielectric"].includes(name)) {
    throw new RangeError("Unknown primary MIS fixture");
  }
  const expected = name === "emissive" ? [4, 2, 1] : [1, 1, 1];
  const extent = name === "dielectric" ? 0.45 : 10;
  return {
    name, expected,
    scene: name === "environment"
      ? { sceneObjects: [{ type: "sphere", center: [0, 0, 1000], radius: 1 }] }
      : { displayQuality: true, meshes: [{
        positions: [-extent, -extent, 0, extent, -extent, 0, extent, extent, 0, -extent, extent, 0],
        indices: [0, 1, 2, 0, 2, 3], materialKind: name, roughness: 0,
        color: [1, 1, 1, 1], emission: name === "emissive" ? [4, 2, 1, 1] : [0, 0, 0, 0],
        ior: 1.5, transmission: name === "dielectric" ? 1 : 0,
        metallic: name === "metal" ? 1 : 0,
      }] },
  };
}

// Linear accumulation, not tone-mapped pixels or inferred scheduler counts.
export function verifyPrimaryMisPixels(values, spp, expected) {
  if (!(values instanceof Float32Array) || values.length === 0 || values.length % 4 !== 0) {
    throw new RangeError("Invalid linear accumulation readback");
  }
  let sumSquared = 0, maxAbsoluteError = 0, energy = 0, expectedEnergy = 0;
  const pixels = values.length / 4;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    if (values[pixel * 4 + 3] !== spp) throw new Error("Actual completed SPP mismatch");
    for (let channel = 0; channel < 3; channel += 1) {
      const value = values[pixel * 4 + channel];
      const error = Math.abs(value - expected[channel]);
      if (!Number.isFinite(value) || error > PRIMARY_MIS_TOLERANCE) {
        throw new Error(`Linear radiance mismatch: pixel=${pixel}, channel=${channel}, value=${value}, expected=${expected[channel]}`);
      }
      maxAbsoluteError = Math.max(maxAbsoluteError, error);
      sumSquared += error * error;
      const weight = [0.2126, 0.7152, 0.0722][channel];
      energy += value * weight;
      expectedEnergy += expected[channel] * weight;
    }
  }
  return { pixels, actualCountMin: spp, actualCountMax: spp, maxAbsoluteError,
    rgbRmse: Math.sqrt(sumSquared / (pixels * 3)),
    meanLuminance: energy / pixels, relativeEnergyDrift: energy / expectedEnergy - 1 };
}
