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

/** Optional submission bounds; never change the stationary pixel/sample target. */
export function resolveWavefrontFrameControl(options, allocationTileSize) {
  const { maxTileSize, signal } = options;
  if (maxTileSize !== undefined && (!Number.isSafeInteger(maxTileSize) ||
      maxTileSize < 8 || maxTileSize > allocationTileSize)) {
    throw new Error("maxTileSize must be an integer from 8 through the allocated tile size.");
  }
  if (signal !== undefined && (!signal || typeof signal.aborted !== "boolean" ||
      typeof signal.throwIfAborted !== "function")) {
    throw new Error("signal must be an AbortSignal.");
  }
  const cooperative = maxTileSize !== undefined || signal !== undefined;
  if (cooperative && options.awaitGPUCompletion === false) {
    throw new Error("Cooperative frames must await GPU completion.");
  }
  signal?.throwIfAborted();
  return { tileSize: maxTileSize ?? allocationTileSize, signal, cooperative };
}
