import { GPU_SUBMITTED_WORK_TIMEOUT_MS } from "./wavefront-core.js";
import { nowMs } from "./wavefront-runtime-support.js";

const deviceLossObservers = new WeakMap();

function observeDeviceLoss(device) {
  if (typeof device.lost?.then !== "function") return null;
  let state = deviceLossObservers.get(device);
  if (!state) {
    state = { loss: null, waiters: new Set() };
    deviceLossObservers.set(device, state);
    const notify = (error) => {
      state.loss = { status: "lost", error };
      for (const resolve of state.waiters) resolve(state.loss);
      state.waiters.clear();
    };
    // One reaction per device. Promise.race alone cannot detach a losing
    // reaction from the long-lived device.lost promise after each frame.
    device.lost.then((info) => notify(new Error(
      `WebGPU device lost while waiting for submitted work (${info?.reason ?? "unknown"}).`
    )), notify);
  }
  let finish;
  const promise = new Promise(resolve => { finish = resolve; });
  if (state.loss) finish(state.loss);
  else state.waiters.add(finish);
  return { promise, detach() {
    state.waiters.delete(finish);
    finish({ status: "cancelled" });
  } };
}

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
  const loss = observeDeviceLoss(device);
  const startedAtMs = nowMs();
  try {
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
          [completionPromise, timeoutPromise, loss?.promise].filter(Boolean)
        );
      } finally {
        if (timeoutHandle !== null) {
          clearTimeout(timeoutHandle);
          settleTimeoutPromise({ status: "cancelled" });
        }
      }
      if (result?.status === "lost") throw result.error;
      if (result?.status === "done") {
        return true;
      }
      if (result?.status !== "timeout") {
        return true;
      }
    }
  } finally {
    loss?.detach();
  }
}
