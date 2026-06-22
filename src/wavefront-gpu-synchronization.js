import { GPU_SUBMITTED_WORK_TIMEOUT_MS } from "./wavefront-core.js";
import { nowMs } from "./wavefront-runtime-support.js";

export async function waitForSubmittedGpuWork(device, options = {}) {
  if (typeof device.queue.onSubmittedWorkDone !== "function") {
    return true;
  }
  const timeoutMs = Math.max(
    1,
    Number.isFinite(options.timeoutMs)
      ? Number(options.timeoutMs)
      : GPU_SUBMITTED_WORK_TIMEOUT_MS
  );
  const maxWaitMs = Math.max(
    timeoutMs,
    Number.isFinite(options.maxWaitMs) ? Number(options.maxWaitMs) : timeoutMs
  );
  const allowTimeout = options.allowTimeout !== false;
  const completionPromise = device.queue.onSubmittedWorkDone().then(
    () => ({ status: "done" }),
    (error) => {
      throw error;
    }
  );
  const lossPromise =
    typeof device.lost?.then === "function"
      ? device.lost.then((info) => {
          throw new Error(
            `WebGPU device lost while waiting for submitted work (${info?.reason ?? "unknown"}).`
          );
        })
      : null;
  const startedAtMs = nowMs();
  while (true) {
    const elapsedMs = Math.max(0, nowMs() - startedAtMs);
    const remainingMs = Math.max(0, maxWaitMs - elapsedMs);
    if (remainingMs <= 0) {
      if (!allowTimeout) {
        throw new Error(`Timed out after ${Math.round(maxWaitMs)} ms waiting for submitted GPU work.`);
      }
      console.warn(
        `[plasius.wavefront] Submitted GPU work did not report completion within ${Math.round(maxWaitMs)} ms; continuing.`
      );
      return false;
    }
    const waitWindowMs = Math.max(1, Math.min(timeoutMs, remainingMs));
    let timeoutHandle = null;
    let resolveTimeoutPromise = null;
    let timeoutSettled = false;
    const settleTimeoutPromise = (value) => {
      if (timeoutSettled) {
        return;
      }
      timeoutSettled = true;
      resolveTimeoutPromise?.(value);
    };
    const timeoutPromise = new Promise((resolve) => {
      resolveTimeoutPromise = resolve;
      timeoutHandle = setTimeout(
        () => settleTimeoutPromise({ status: "timeout" }),
        waitWindowMs
      );
    });
    let result;
    try {
      result = await Promise.race(
        [completionPromise, timeoutPromise, lossPromise].filter(Boolean)
      );
    } finally {
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
        settleTimeoutPromise({ status: "cancelled" });
      }
    }
    if (result?.status === "done") {
      return true;
    }
    if (result?.status !== "timeout") {
      return true;
    }
  }
}
