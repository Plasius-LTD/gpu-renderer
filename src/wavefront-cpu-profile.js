// Host elapsed intervals, NOT CPU utilization or GPU execution time.
const SYNC_STAGES = new Set(["budgetCalculation", "budgetPacking", "configPacking",
  "commandEncoding", "accelerationEncoding", "uploads", "finish", "submit"]);
const ASYNC_STAGES = new Set(["gpuWait", "telemetryReadback", "outputReadback"]);
const PASS_COUNTERS = Object.freeze({ setPipeline: "pipelineChanges", setBindGroup: "bindGroupChanges",
  dispatchWorkgroups: "directDispatches", dispatchWorkgroupsIndirect: "indirectDispatches" });
let nextProfileId = 0;

export function createWavefrontCpuProfile(options = {}) {
  if (options.enabled !== true) return null;
  const now = options.now ?? (() => performance.now());
  const timing = options.timing ?? globalThis.performance;
  const prefix = `plasius.cpu.${++nextProfileId}`;
  const stages = Object.create(null), stack = [];
  const timeline = { enabled: options.userTiming === true, emitted: 0, dropped: 0, errors: 0 };
  const commands = { commandEncoders: 0, computePasses: 0, renderPasses: 0,
    pipelineChanges: 0, bindGroupChanges: 0, directDispatches: 0, indirectDispatches: 0,
    bufferCopies: 0, bufferCopyBytes: 0, clears: 0, clearBytes: 0,
    uploadCalls: 0, uploadBytes: 0, submissions: 0, commandBuffers: 0 };
  const knownTemporaryBuffers = { count: 0, bytes: 0 };
  let pending = 0;
  function clock() {
    const value = now();
    if (!Number.isFinite(value)) throw new Error("Invalid profiling clock");
    return value;
  }
  function start(name, asynchronous) {
    if (!(asynchronous ? ASYNC_STAGES : SYNC_STAGES).has(name)) throw new RangeError("Unknown profiling stage");
    const started = clock();
    const record = stages[name] ??= { calls: 0, failures: 0, elapsedMs: 0, exclusiveMs: 0,
      kind: asynchronous ? "asynchronous-wait" : "synchronous-host" };
    return { name, started, record, children: 0 };
  }
  function end(span, failed, asynchronous) {
    const ended = clock(), elapsed = ended - span.started;
    if (elapsed < 0) throw new Error("Non-monotonic profiling clock");
    span.record.calls++;
    span.record.failures += Number(failed);
    span.record.elapsedMs += elapsed;
    span.record.exclusiveMs += Math.max(0, elapsed - span.children);
    if (!asynchronous && stack.length) stack.at(-1).children += elapsed;
    if (timeline.enabled) {
      if (timeline.emitted >= 128) { timeline.dropped++; return; }
      const name = `${prefix}.${span.name}.${timeline.emitted++}`;
      try { timing.measure(name, { start: span.started, end: ended }); }
      catch { timeline.errors++; }
      finally { try { timing.clearMeasures(name); } catch { /* Optional browser API. */ } }
    }
  }
  function measure(name, operation) {
    const span = start(name, false);
    stack.push(span);
    let failed = true;
    try { const result = operation(); failed = false; return result; }
    finally { stack.pop(); end(span, failed, false); }
  }
  async function measureAsync(name, operation) {
    const span = start(name, true);
    pending++;
    let failed = true;
    try { const result = await operation(); failed = false; return result; }
    finally { pending--; end(span, failed, true); }
  }
  // Cache bound forwarding functions locally; never patch a native GPU object.
  function facade(target, intercept) {
    const methods = new Map();
    return new Proxy(target, { get(object, key) {
      const value = Reflect.get(object, key, object);
      if (typeof value !== "function") return value;
      if (!methods.has(key)) methods.set(key, (...args) => intercept(key, args, () => Reflect.apply(Reflect.get(object, key, object), object, args)));
      return methods.get(key);
    } });
  }
  function wrapPass(pass) {
    return facade(pass, (key, args, call) => {
      const result = call();
      const counter = PASS_COUNTERS[key];
      if (counter) commands[counter]++;
      return result;
    });
  }
  function wrapEncoder(encoder) {
    return facade(encoder, (key, args, call) => {
      const result = key === "finish" ? measure("finish", call) : call();
      if (key === "beginComputePass" || key === "beginRenderPass") {
        commands[key === "beginComputePass" ? "computePasses" : "renderPasses"]++;
        return wrapPass(result);
      }
      if (key === "copyBufferToBuffer") { commands.bufferCopies++; commands.bufferCopyBytes += args[4]; }
      if (key === "clearBuffer") { commands.clears++; commands.clearBytes += args[2] ?? (args[0].size - (args[1] ?? 0)); }
      return result;
    });
  }
  function wrapDevice(device) {
    const queue = facade(device.queue, (key, args, call) => {
      if (key === "submit") {
        const result = measure("submit", call);
        commands.submissions++; commands.commandBuffers += args[0].length;
        return result;
      }
      if (key === "writeBuffer") {
        const result = measure("uploads", call);
        const data = args[2], elementBytes = data.BYTES_PER_ELEMENT ?? 1;
        commands.uploadCalls++;
        commands.uploadBytes += args[4] === undefined ? data.byteLength - (args[3] ?? 0) * elementBytes : args[4] * elementBytes;
        return result;
      }
      return call();
    });
    const wrapped = facade(device, (key, args, call) => {
      const result = call();
      if (key === "createCommandEncoder") { commands.commandEncoders++; return wrapEncoder(result); }
      return result;
    });
    return new Proxy(wrapped, { get(object, key) { return key === "queue" ? queue : Reflect.get(object, key); } });
  }
  return Object.freeze({ measure, measureAsync, wrapDevice,
    recordAllocation(bytes) {
      if (!Number.isSafeInteger(bytes) || bytes < 0) throw new RangeError("Invalid known allocation size");
      knownTemporaryBuffers.count++; knownTemporaryBuffers.bytes += bytes;
    },
    snapshot() {
      if (pending || stack.length) throw new Error("Cannot snapshot active profiling spans");
      return Object.freeze({ schemaVersion: 1, timingBasis: "host-elapsed-not-cpu-utilization",
        stages: Object.freeze(Object.fromEntries(Object.entries(stages).map(([name, value]) => [name, Object.freeze({ ...value })]))),
        commands: Object.freeze({ ...commands }), knownTemporaryBuffers: Object.freeze({ ...knownTemporaryBuffers }),
        timeline: Object.freeze({ ...timeline }) });
    },
  });
}
