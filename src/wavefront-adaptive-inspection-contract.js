import { createAdaptiveTilePlan } from "./wavefront-adaptive-tile-plan.js";

export function prepareAdaptiveFrame(config, { budgets } = {}) {
  const {
    width,
    height,
    samplesPerPixel: ceiling,
    tileSize,
    deferredPathResolve,
  } = config;
  if (
    !Number.isSafeInteger(ceiling) ||
    ceiling < 1 ||
    ceiling > 256 ||
    tileSize !== 128 ||
    !deferredPathResolve
  )
    throw new RangeError(
      "Adaptive inspection requires 128px tiles, deferred resolve and a 1–256 sample ceiling.",
    );
  if (!(budgets instanceof Uint8Array || budgets instanceof Uint16Array))
    throw new TypeError(
      "Adaptive budgets must be a Uint8Array or Uint16Array.",
    );
  // Snapshot caller-owned inputs before any await; mutation cannot change GPU work.
  const copy = budgets.slice(),
    tiles = createAdaptiveTilePlan({
      enabled: true,
      width,
      height,
      budgets: copy,
    });
  let totalSamples = 0;
  for (const value of copy) {
    if (value > ceiling)
      throw new RangeError("Adaptive budget exceeds the sample ceiling.");
    totalSamples += value;
  }
  return {
    budgets: copy,
    tiles,
    totalSamples,
    meanSpp: totalSamples / (width * height),
  };
}

export function inspectAdaptiveTileCounts(words, tile, width, budgets) {
  if (words.length !== tile.width * tile.height)
    throw new Error("Adaptive count readback size mismatch.");
  let samples = 0,
    minimum = 256,
    maximum = 0;
  for (let y = 0; y < tile.height; y++)
    for (let x = 0; x < tile.width; x++) {
      const word = words[y * tile.width + x],
        requested = budgets[(tile.y + y) * width + tile.x + x],
        completed = (word >>> 9) & 511;
      if (
        word >>> 18 !== 0 ||
        (word & 511) !== requested ||
        completed !== requested
      )
        throw new Error("Incomplete adaptive pixel: render rejected.");
      samples += completed;
      minimum = Math.min(minimum, completed);
      maximum = Math.max(maximum, completed);
    }
  return { samples, minimum, maximum };
}
