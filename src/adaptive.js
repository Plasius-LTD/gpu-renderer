import { createWavefrontPathTracingComputeRenderer } from "./wavefront-compute.js";

/** Experimental opt-in surface for the existing shared-round per-pixel sampler. */
export async function createAdaptiveWavefrontRenderer(options = {}) {
  if (options["renderer.sampling.adaptivePerPixel.enabled"] !== true)
    throw new Error("Adaptive sampling must be explicitly enabled.");
  const {
    width = 800,
    height = 600,
    samplesPerPixel = 32,
    maxDepth = 6,
  } = options;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 3840 ||
    height > 3840 ||
    width * height > 3840 * 2160 ||
    !Number.isInteger(samplesPerPixel) ||
    samplesPerPixel < 1 ||
    samplesPerPixel > 256 ||
    !Number.isInteger(maxDepth) ||
    maxDepth < 1 ||
    maxDepth > 20
  )
    throw new RangeError(
      "Adaptive dimensions, sample ceiling or depth exceed supported limits.",
    );
  return createWavefrontPathTracingComputeRenderer({
    ...options,
    width,
    height,
    samplesPerPixel,
    maxDepth,
    tileSize: 128,
    adaptiveInspection: true,
    deferredPathResolve: true,
    strictPhysicalLowSppLighting: true,
    "renderer.sampling.stablePattern.enabled": true,
    "renderer.sampling.roughBounceSplitting.enabled": false,
  });
}
