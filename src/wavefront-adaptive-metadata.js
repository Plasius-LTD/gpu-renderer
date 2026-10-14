import {
  ADAPTIVE_COUNT_BITS, ADAPTIVE_COUNT_MASK, ADAPTIVE_FLAG_SHIFT,
  ADAPTIVE_MAX_FLAGS, ADAPTIVE_MAX_SAMPLES,
} from "./wavefront-adaptive-shader.js";
import {
  ADAPTIVE_PIXEL_STATE_BYTE_SIZE, ADAPTIVE_FIRST_HIT_DISTANCE_BYTE_SIZE,
  ADAPTIVE_NORMAL_MATERIAL_RISK_BYTE_SIZE, ADAPTIVE_WORKLIST_ENTRY_BYTE_SIZE,
  ADAPTIVE_HISTORY_WORD_BYTE_SIZE, ADAPTIVE_DISPATCH_ARGUMENTS_BYTE_SIZE,
} from "./wavefront-adaptive-byte-constants.js";
import { ADAPTIVE_CAMERA_SAMPLE_BYTE_SIZE, ADAPTIVE_RESOLVE_CONFIG_BYTE_SIZE } from "./wavefront-adaptive-resolve-constants.js";
import { ACCUMULATION_RECORD_BYTES } from "./wavefront-core.js";

export const DEFAULT_ADAPTIVE_ALLOCATION_CAP_BYTES = 128 * 1024 ** 2;
export const ADAPTIVE_RESOLVE_CONFIG_SLOT_BYTES = 256;
const MAX_TILE_PIXELS = 16384;
const U32_MAX = 0xffffffff;

function integer(name, value, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer in ${minimum}..${maximum}.`);
  }
  return value;
}

export function packAdaptivePixelState({ requested, completed = 0, flags = 0 }) {
  integer("requested", requested, 0, ADAPTIVE_MAX_SAMPLES);
  integer("completed", completed, 0, requested);
  integer("flags", flags, 0, ADAPTIVE_MAX_FLAGS);
  return (requested | (completed << ADAPTIVE_COUNT_BITS) | (flags << ADAPTIVE_FLAG_SHIFT)) >>> 0;
}

export function unpackAdaptivePixelState(word) {
  integer("packed adaptive word", word, 0, U32_MAX);
  const state = {
    requested: word & ADAPTIVE_COUNT_MASK,
    completed: (word >>> ADAPTIVE_COUNT_BITS) & ADAPTIVE_COUNT_MASK,
    flags: word >>> ADAPTIVE_FLAG_SHIFT,
  };
  // Do not silently accept unused nine-bit values or impossible completion.
  packAdaptivePixelState(state);
  return Object.freeze(state);
}

function refuse(plan, reason) {
  return Object.freeze({ ...plan, enabled: false, reason });
}

function admitDevice(plan, limits) {
  if (!plan.enabled) return plan;
  const maxBufferSize = limits?.maxBufferSize;
  const maxBindingSize = limits?.maxStorageBufferBindingSize;
  if (![maxBufferSize, maxBindingSize].every((value) => Number.isSafeInteger(value) && value > 0)) {
    return refuse(plan, "adaptive-device-limits-unavailable");
  }
  if (plan.buffers.some(({ size, uniform }) => size > maxBufferSize || (!uniform && size > maxBindingSize))) {
    return refuse(plan, "adaptive-device-buffer-limit");
  }
  if (plan.bytes.resolveConfig > 0) {
    const alignment = limits?.minUniformBufferOffsetAlignment;
    const bindingSize = limits?.maxUniformBufferBindingSize;
    if (!Number.isSafeInteger(alignment) || alignment <= 0 || ADAPTIVE_RESOLVE_CONFIG_SLOT_BYTES % alignment !== 0
      || !Number.isSafeInteger(bindingSize) || bindingSize < ADAPTIVE_RESOLVE_CONFIG_BYTE_SIZE) {
      return refuse(plan, "adaptive-device-uniform-limits");
    }
  }
  return plan;
}

export function planAdaptiveResources(options = {}, limits) {
  const bytes = {
    pixelState: 0, firstHitDistance: 0, normalMaterialRisk: 0,
    worklist: 0, dispatch: 0, history: 0, total: 0,
    cameraSamples: 0, radianceSums: 0, resolvedRadiance: 0, resolveConfig: 0,
  };
  if (options.enabled !== true) {
    return Object.freeze({ enabled: false, reason: "adaptive-disabled",
      bytes: Object.freeze(bytes), buffers: Object.freeze([]) });
  }
  for (const key of ["firstHitDistance", "normalMaterialRisk", "history", "countResolve"]) {
    if (options[key] !== undefined && typeof options[key] !== "boolean") {
      throw new TypeError(`${key} must be a boolean.`);
    }
  }
  const width = integer("width", options.width, 1, U32_MAX);
  const height = integer("height", options.height, 1, U32_MAX);
  const pixelCount = integer("pixelCount", width * height, 1, U32_MAX);
  const tilePixelCapacity = integer("tilePixelCapacity",
    options.tilePixelCapacity === undefined ? MAX_TILE_PIXELS : options.tilePixelCapacity, 1, MAX_TILE_PIXELS);
  const cap = integer("maximumAllocationBytes", options.maximumAllocationBytes === undefined
    ? DEFAULT_ADAPTIVE_ALLOCATION_CAP_BYTES : options.maximumAllocationBytes, 1, Number.MAX_SAFE_INTEGER);
  bytes.pixelState = pixelCount * ADAPTIVE_PIXEL_STATE_BYTE_SIZE;
  bytes.firstHitDistance = options.firstHitDistance === true ? pixelCount * ADAPTIVE_FIRST_HIT_DISTANCE_BYTE_SIZE : 0;
  bytes.normalMaterialRisk = options.normalMaterialRisk === true ? pixelCount * ADAPTIVE_NORMAL_MATERIAL_RISK_BYTE_SIZE : 0;
  bytes.worklist = tilePixelCapacity * ADAPTIVE_WORKLIST_ENTRY_BYTE_SIZE;
  bytes.dispatch = ADAPTIVE_DISPATCH_ARGUMENTS_BYTE_SIZE;
  bytes.history = options.history === true ? 2 * Math.ceil(pixelCount / 32) * ADAPTIVE_HISTORY_WORD_BYTE_SIZE : 0;
  if (options.countResolve === true) {
    const slots = integer("resolveConfigSlots", options.resolveConfigSlots === undefined ? 1 : options.resolveConfigSlots, 1, 1_000_000);
    bytes.cameraSamples = tilePixelCapacity * ADAPTIVE_CAMERA_SAMPLE_BYTE_SIZE;
    bytes.radianceSums = tilePixelCapacity * ACCUMULATION_RECORD_BYTES;
    bytes.resolvedRadiance = tilePixelCapacity * ACCUMULATION_RECORD_BYTES;
    bytes.resolveConfig = slots * ADAPTIVE_RESOLVE_CONFIG_SLOT_BYTES;
  }
  bytes.total = Object.values(bytes).reduce((sum, value) => sum + value, 0);
  const buffers = ["pixelState", "firstHitDistance", "normalMaterialRisk", "worklist", "dispatch", "cameraSamples", "radianceSums", "resolvedRadiance", "resolveConfig"]
    .filter((key) => bytes[key] > 0)
    .map((key) => Object.freeze({ key, size: bytes[key], indirect: key === "dispatch", uniform: key === "resolveConfig" }));
  if (bytes.history) {
    for (const key of ["previousHistory", "currentHistory"]) {
      buffers.push(Object.freeze({ key, size: bytes.history / 2, indirect: false }));
    }
  }
  const plan = Object.freeze({ enabled: true, reason: null, pixelCount, tilePixelCapacity,
    maximumAllocationBytes: cap, bytes: Object.freeze(bytes), buffers: Object.freeze(buffers) });
  if (bytes.total > cap) return refuse(plan, "adaptive-allocation-cap");
  return limits === undefined ? plan : admitDevice(plan, limits);
}

export function createAdaptiveResourceOwner(device, usage, options = {}) {
  // Snapshot configuration now; a caller cannot expand the allocation while it is pending.
  let plan = planAdaptiveResources(options);
  let disposed = false;
  let pending = null;
  let result = null;
  let allocatedBytes = 0;
  const buffers = new Map();

  function cleanup() {
    for (const buffer of buffers.values()) buffer.destroy();
    buffers.clear();
    allocatedBytes = 0;
  }

  function disabled(reason) {
    result = Object.freeze({ status: "disabled", reason, buffers: Object.freeze({}), allocatedBytes: 0 });
    return result;
  }

  async function allocate() {
    if (disposed) return disabled("adaptive-disposed");
    if (!plan.enabled) return disabled(plan.reason);
    plan = admitDevice(plan, device?.limits);
    if (!plan.enabled) return disabled(plan.reason);
    if (typeof device.pushErrorScope !== "function" || typeof device.popErrorScope !== "function") {
      return disabled("adaptive-error-scopes-unavailable");
    }
    let scopeCount = 0;
    let failed = false;
    try {
      for (const key of ["STORAGE", "COPY_DST", "INDIRECT"]) integer(`GPUBufferUsage.${key}`, usage?.[key], 1, U32_MAX);
      if (plan.bytes.resolveConfig) integer("GPUBufferUsage.UNIFORM", usage?.UNIFORM, 1, U32_MAX);
      device.pushErrorScope("out-of-memory");
      scopeCount += 1;
      device.pushErrorScope("validation");
      scopeCount += 1;
      for (const descriptor of plan.buffers) {
        const buffer = device.createBuffer({
          label: `wavefront-adaptive-${descriptor.key}`,
          size: descriptor.size,
          usage: (descriptor.uniform ? usage.UNIFORM : usage.STORAGE) | usage.COPY_DST | (descriptor.indirect ? usage.INDIRECT : 0),
        });
        buffers.set(descriptor.key, buffer);
        allocatedBytes += descriptor.size;
      }
    } catch {
      failed = true;
    }
    // Pop both scopes synchronously before awaiting: scopes are a device-wide stack.
    const completions = [];
    while (scopeCount > 0) {
      scopeCount -= 1;
      try { completions.push(Promise.resolve(device.popErrorScope())); }
      catch { failed = true; }
    }
    const errors = await Promise.allSettled(completions);
    failed ||= errors.some((entry) => entry.status === "rejected" || entry.value !== null);
    if (failed || disposed) {
      cleanup();
      return disabled(disposed ? "adaptive-disposed" : "adaptive-allocation-failed");
    }
    result = Object.freeze({ status: "ready", reason: null,
      buffers: Object.freeze(Object.fromEntries(buffers)), allocatedBytes });
    return result;
  }

  function acquire() {
    if (disposed && !pending) return Promise.resolve(disabled("adaptive-disposed"));
    if (result) return Promise.resolve(result);
    // No automatic retry after allocation failure: the caller owns recovery.
    pending ??= allocate().finally(() => { pending = null; });
    return pending;
  }

  return Object.freeze({
    acquire,
    snapshot: () => Object.freeze({ plan, allocatedBytes, disposed,
      status: disposed ? "disposed" : result?.status ?? "unallocated",
      reason: disposed ? "adaptive-disposed" : result?.reason ?? plan.reason }),
    destroy() {
      if (disposed) return;
      disposed = true;
      cleanup();
    },
  });
}
