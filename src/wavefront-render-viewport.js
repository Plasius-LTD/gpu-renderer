/** Frame work fits inside persistent full-resolution resources. */
export function resolveWavefrontRenderViewport(width, height, renderScale = 1) {
  if (typeof renderScale !== "number" || !Number.isFinite(renderScale) || renderScale <= 0 || renderScale > 1) {
    throw new Error("renderScale must be a finite number greater than zero and at most one.");
  }
  return Object.freeze({
    width: Math.max(1, Math.floor(width * renderScale)),
    height: Math.max(1, Math.floor(height * renderScale)),
    renderScale,
  });
}
