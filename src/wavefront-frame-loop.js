import { nowMs } from "./wavefront-runtime-support.js";

// One reusable task channel, never a polling loop or a display-rate delay.
function createTaskYield() {
  let channel = null, timer = null, pending = null;
  const wake = () => { const resolve = pending; pending = null; resolve?.(); };
  return {
    wait() {
      return new Promise(resolve => {
        pending = resolve;
        if (typeof globalThis.MessageChannel === "function") {
          if (!channel) {
            channel = new globalThis.MessageChannel();
            channel.port1.onmessage = wake;
          }
          channel.port2.postMessage(null);
        } else {
          timer = setTimeout(wake, 0);
        }
      });
    },
    close() {
      if (timer !== null) clearTimeout(timer);
      channel?.port1.close(); channel?.port2.close();
      wake();
    },
  };
}

export function createWavefrontFrameLoop(options = {}) {
  const { renderFrame, getRenderOptions, onFrameComplete, enabled = false, targetFrameTimeMs = 0 } = options;
  if (typeof renderFrame !== "function") throw new TypeError("renderFrame must be a completion-awaiting function.");
  if (typeof enabled !== "boolean") throw new TypeError("enabled must be a boolean.");
  if (!Number.isFinite(targetFrameTimeMs) || targetFrameTimeMs < 0) throw new RangeError("targetFrameTimeMs must be finite and non-negative.");
  for (const [name, value] of Object.entries({getRenderOptions, onFrameComplete})) {
    if (value !== undefined && typeof value !== "function") throw new TypeError(`${name} must be a function.`);
  }
  let status = enabled ? "idle" : "disabled", running = false, active = false;
  let runPromise = null, taskYield = null, previousResult;
  let frame = 0, completedFrames = 0, stage = null, startedAt = null, endedAt = null;
  let completedTiles = 0, totalTiles = null, lastError = null;
  const getProgress = () => {
    const elapsedMs = startedAt === null ? 0 : Math.max(0, (endedAt ?? nowMs()) - startedAt);
    return Object.freeze({status, frame, completedFrames, stage, elapsedMs,
      targetFrameTimeMs: targetFrameTimeMs || null,
      budgetRatio: targetFrameTimeMs > 0 ? elapsedMs / targetFrameTimeMs : null,
      overBudgetMs: targetFrameTimeMs > 0 ? Math.max(0, elapsedMs - targetFrameTimeMs) : null,
      completedTiles, totalTiles,
      completedTileFraction: totalTiles > 0 ? completedTiles / totalTiles : null,
      gpuCompletionFraction: null, lastError});
  };
  const run = async () => {
    try {
      while (running) {
        frame++; startedAt = nowMs(); endedAt = null; stage = "preparing";
        completedTiles = 0; totalTiles = null;
        const renderOptions = await getRenderOptions?.(Object.freeze({frame, previousResult})) ?? {};
        if (!running) break;
        if (typeof renderOptions !== "object" || Array.isArray(renderOptions)) throw new TypeError("getRenderOptions must return render options.");
        let acceptsProgress = true;
        const onProgress = event => {
          if (!acceptsProgress) return;
          stage = event.stage; completedTiles = event.completedTiles; totalTiles = event.totalTiles;
          renderOptions.onProgress?.(event);
        };
        try {
          stage = "encoding";
          previousResult = await renderFrame({readStats:false, readOutputProbe:false,
            ...renderOptions, awaitGPUCompletion:true, onProgress});
        } finally {
          acceptsProgress = false;
        }
        endedAt = nowMs(); stage = "complete"; completedFrames++;
        await onFrameComplete?.(previousResult, getProgress());
        if (running) {
          taskYield ??= createTaskYield();
          await taskYield.wait();
        }
      }
      status = "stopped";
    } catch (error) {
      status = "failed"; stage = "failed";
      lastError = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      endedAt ??= nowMs(); running = false; active = false;
      taskYield?.close(); taskYield = null;
    }
    return getProgress();
  };
  return Object.freeze({
    start() {
      if (!enabled) return Promise.resolve(getProgress());
      if (active || status === "failed") return runPromise;
      running = active = true; status = "running";
      runPromise = Promise.resolve().then(run);
      return runPromise;
    },
    stop() {
      if (active) { running = false; status = "stopping"; taskYield?.close(); }
      return runPromise ?? Promise.resolve(getProgress());
    },
    getProgress,
  });
}
