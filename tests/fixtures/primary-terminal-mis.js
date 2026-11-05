import { WAVEFRONT_COMPUTE_WGSL } from "/src/wavefront-shaders.js";
import { createWavefrontPathTracingComputeRenderer } from "/src/wavefront-compute.js";
import { COUNTER_BUFFER_BYTES, COUNTER_TERMINATION_QUEUE_OVERFLOW_OFFSET } from "/src/wavefront-core.js";
import { PRIMARY_MIS_SPP, PRIMARY_MIS_TOLERANCE, primaryMisCase, verifyPrimaryMisPixels } from "./primary-terminal-mis-cases.js";

const status = document.querySelector("#result");
const button = document.querySelector("#run");
const baseline = new URLSearchParams(location.search).has("baseline");
const stress = new URLSearchParams(location.search).has("stress");
const hash = async (source) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",
  new TextEncoder().encode(source))), (value) => value.toString(16).padStart(2, "0")).join("");
const check = (condition, message) => { if (!condition) throw new Error(message); };

async function readLinear(gpu, source, pixels) {
  const size = pixels * 16;
  const copy = gpu.createBuffer({ size, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const staging = gpu.createBuffer({ size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  try {
    const module = gpu.createShaderModule({ code: `
      @group(0) @binding(0) var<storage, read> input: array<vec4<u32>>;
      @group(0) @binding(1) var<storage, read_write> output: array<vec4<u32>>;
      @compute @workgroup_size(64) fn copy_bits(@builtin(global_invocation_id) id: vec3<u32>) {
        if (id.x < arrayLength(&output)) { output[id.x] = input[id.x]; }
      }` });
    const pipeline = await gpu.createComputePipelineAsync({ layout: "auto", compute: { module, entryPoint: "copy_bits" } });
    const group = gpu.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: source } }, { binding: 1, resource: { buffer: copy } },
    ] });
    const encoder = gpu.createCommandEncoder();
    const pass = encoder.beginComputePass(); pass.setPipeline(pipeline); pass.setBindGroup(0, group);
    pass.dispatchWorkgroups(Math.ceil(pixels / 64)); pass.end();
    encoder.copyBufferToBuffer(copy, 0, staging, 0, size); gpu.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    return new Float32Array(staging.getMappedRange().slice(0));
  } finally { staging.destroy(); copy.destroy(); }
}

// Capture the real termination counters before the next sample resets them.
function captureSampleTerminations(device, allocations, maxDepth, spp, deferred) {
  const recordBytes = COUNTER_BUFFER_BYTES;
  const readback = device.createBuffer({ size: recordBytes * spp, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const create = device.createCommandEncoder.bind(device);
  const completedPass = deferred
    ? "plasius.wavefront.outputPass"
    : `plasius.wavefront.bounce.${maxDepth - 1}`;
  let count = 0;
  device.createCommandEncoder = (descriptor) => {
    const encoder = create(descriptor);
    const begin = encoder.beginComputePass.bind(encoder);
    encoder.beginComputePass = (options) => {
      const pass = begin(options);
      if (options?.label === completedPass) {
        const end = pass.end.bind(pass);
        pass.end = () => {
          end();
          check(count < spp, "Too many sample passes");
          encoder.copyBufferToBuffer(allocations.get("plasius.wavefront.counters"), 0,
            readback, count++ * recordBytes, recordBytes);
        };
      }
      return pass;
    };
    return encoder;
  };
  return {
    async verify(pixelCount) {
      check(count === spp, `Captured ${count}/${spp} sample termination records`);
      await readback.mapAsync(GPUMapMode.READ);
      try {
        const records = new Uint32Array(readback.getMappedRange());
        for (let i = 0; i < count; i += 1) {
          const offset = i * (recordBytes / Uint32Array.BYTES_PER_ELEMENT);
          // Counters starts with activeCount, nextCount, terminatedCount.
          check(records[offset + 2] === pixelCount, `Incomplete camera sample ${i}`);
          check(records[offset + COUNTER_TERMINATION_QUEUE_OVERFLOW_OFFSET] === 0, `Queue overflow in sample ${i}`);
        }
        return count;
      } finally { readback.unmap(); }
    },
    destroy() { device.createCommandEncoder = create; readback.destroy(); },
  };
}

async function verifyPredicate(device) {
  // Execute the production predicate and heuristic from the entire assembled shader.
  const module = device.createShaderModule({ code: WAVEFRONT_COMPUTE_WGSL + `
    @compute @workgroup_size(1) fn mis_probe() {
      for (var bounce = 0u; bounce < 3u; bounce = bounce + 1u) {
        for (var flags = 0u; flags < 4u; flags = flags + 1u) {
          var ray = RayRecord(); ray.bounce = bounce; ray.flags = flags;
          var weight = 1.0;
          if (terminal_mis_enabled(ray)) { weight = power_heuristic(0.5, 0.25); }
          accumulation[bounce * 4u + flags] = vec4<f32>(weight);
        }
      }
    }` });
  const messages = await module.getCompilationInfo();
  check(!messages.messages.some(({ type }) => type === "error"), "Assembled shader compilation failed");
  const output = device.createBuffer({ size: 12 * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const staging = device.createBuffer({ size: 12 * 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  try {
    const pipeline = await device.createComputePipelineAsync({ layout: "auto", compute: { module, entryPoint: "mis_probe" } });
    const group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 3, resource: { buffer: output } }] });
    const encoder = device.createCommandEncoder(); const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline); pass.setBindGroup(0, group); pass.dispatchWorkgroups(1); pass.end();
    encoder.copyBufferToBuffer(output, 0, staging, 0, 12 * 16); device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const values = new Float32Array(staging.getMappedRange());
    const weights = Array.from({ length: 12 }, (_, i) => values[i * 4]);
    weights.forEach((weight, i) => check(Math.abs(weight - (i >= 4 && (i % 4 & 2) === 0 ? 0.8 : 1)) < 0.000001, "Secondary MIS predicate changed"));
    return weights;
  } finally { staging.destroy(); output.destroy(); }
}

button.addEventListener("click", async () => {
  button.disabled = true;
  let device, renderer, deadline, sampleCapture;
  let cancelled = false, unexpectedDeviceLoss = false;
  const active = () => check(!cancelled, "Physical verification cancelled");
  const cases = [];
  const receipt = { status: "running", timestamp: new Date().toISOString(),
    shaderSha256: await hash(WAVEFRONT_COMPUTE_WGSL), fixtureSha256: await hash(await (await fetch(import.meta.url)).text()),
    userAgent: navigator.userAgent, absoluteTolerance: PRIMARY_MIS_TOLERANCE, cases,
    baseline, stress, denoise: false, frameIndex: 0 };
  try {
    await Promise.race([(async () => {
      const predicateAdapter = await navigator.gpu?.requestAdapter(); active();
      check(predicateAdapter?.info.isFallbackAdapter === false, "Physical adapter unavailable");
      receipt.adapter = { vendor: predicateAdapter.info.vendor, architecture: predicateAdapter.info.architecture,
        description: predicateAdapter.info.description, isFallbackAdapter: predicateAdapter.info.isFallbackAdapter };
      if (!baseline) {
        device = await predicateAdapter.requestDevice(); active(); device.pushErrorScope("validation");
        receipt.predicateWeights = await verifyPredicate(device);
        check(!(await device.popErrorScope()), "Predicate validation error");
        device.destroy(); device = null;
      }
      const names = baseline ? ["environment", "emissive"] : ["environment", "emissive", "metal", "dielectric"];
      const lanes = names.flatMap((name) => [false, true].flatMap((deferredPathResolve) =>
        PRIMARY_MIS_SPP.map((samplesPerPixel) => ({ name, deferredPathResolve, samplesPerPixel, width: 16, height: 16, maxDepth: 2 }))));
      if (stress) {
        for (const [width, height, maxDepth, samplesPerPixel] of [[1920, 1080, 1, 4], [2560, 1440, 4, 4], [3840, 2160, 8, 4]]) {
          lanes.push({ name: "metal", deferredPathResolve: true, width, height, maxDepth, samplesPerPixel });
        }
      }
      for (const { name, deferredPathResolve, samplesPerPixel, width, height, maxDepth } of lanes) {
        active(); status.textContent = `Running ${name}, ${width}×${height}, deferred=${deferredPathResolve}, SPP=${samplesPerPixel}`;
        const adapter = await navigator.gpu.requestAdapter(); active();
        check(adapter?.info.isFallbackAdapter === false, "Physical render adapter unavailable");
        const allocations = new Map();
        const navigatorForTest = { gpu: {
          getPreferredCanvasFormat: () => navigator.gpu.getPreferredCanvasFormat(),
          requestAdapter: async () => ({ limits: adapter.limits, features: adapter.features, info: adapter.info,
            requestDevice: async (descriptor) => {
              const real = await adapter.requestDevice(descriptor);
              if (cancelled) { real.destroy(); active(); }
              device = real; real.pushErrorScope("validation");
              real.lost.then(({ reason }) => { if (reason !== "destroyed") unexpectedDeviceLoss = true; });
              const create = real.createBuffer.bind(real);
              real.createBuffer = (description) => {
                const value = create(description); if (description.label) allocations.set(description.label, value); return value;
              };
              if (width === 16) sampleCapture = captureSampleTerminations(real, allocations, maxDepth, samplesPerPixel, deferredPathResolve);
              return real;
            },
          }),
        } };
        const { scene, expected } = primaryMisCase(name);
        const jobStart = performance.now();
        renderer = await createWavefrontPathTracingComputeRenderer({
          ...scene, canvas: document.querySelector("#canvas"), navigator: navigatorForTest,
          width, height, tileSize: width === 16 ? 16 : 256, maxDepth, samplesPerPixel,
          frameIndex: 0, progressive: false, denoise: false, deferredPathResolve, strictPhysicalLowSppLighting: true,
          camera: { position: [0, 0, 3], target: [0, 0, 0], fovYDegrees: 46 },
          environmentLighting: { horizonColor: [1, 1, 1, 1], zenithColor: [1, 1, 1, 1], sunColor: [0, 0, 0, 1], intensity: 1 },
        }); active();
        const frame = await renderer.renderFrame({ awaitGPUCompletion: true, readStats: true, readOutputProbe: false }); active();
        const jobMs = performance.now() - jobStart;
        check(frame.queueOverflow === 0, "Queue overflow");
        check(frame.frameTimeBudgetMs === null && !frame.budgetConstrained, "Reference is not fixed SPP");
        check(frame.rayCounts.status === "available" && frame.rayCounts.observedPrimaryRays === width * height * samplesPerPixel,
          `Observed primary count mismatch: ${JSON.stringify(frame.rayCounts)}`);
        let metrics = {}, values, completedSpp;
        if (width === 16) {
          // The fixed deferred resolve stores a written marker in alpha. Both
          // modes verify per-sample GPU termination counts separately.
          values = await readLinear(device, allocations.get("plasius.wavefront.accumulation"), width * height); active();
          completedSpp = await sampleCapture.verify(width * height); active();
          if (baseline) {
            metrics = { centerRgb: Array.from(values.slice(4 * (8 + 8 * 16), 4 * (8 + 8 * 16) + 3)) };
            check(metrics.centerRgb.some((value, channel) => Math.abs(value - expected[channel]) > PRIMARY_MIS_TOLERANCE),
              "Baseline did not reproduce primary attenuation");
          } else {
            metrics = verifyPrimaryMisPixels(values, deferredPathResolve ? 1 : samplesPerPixel, expected);
          }
        }
        const validation = await device.popErrorScope(); active(); check(!validation, validation?.message);
        check(!unexpectedDeviceLoss, "Unexpected device loss");
        cases.push({ name, width, height, maxDepth, deferredPathResolve, requestedSpp: samplesPerPixel,
          effectiveSpp: frame.renderedSamplesPerPixel, observedPrimarySpp: frame.rayCounts.observedPrimaryRays / (width * height),
          completedSpp, ...metrics, linearRgba: values ? Array.from(values) : undefined, queueOverflow: frame.queueOverflow,
          rayCounts: frame.rayCounts, timings: frame.timings, memory: frame.memory, jobMs });
        sampleCapture?.destroy(); sampleCapture = null;
        renderer.destroy(); renderer = null; device.destroy(); device = null;
      }
    })(), new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error("300-second verification deadline exceeded")), 300000); })]);
    receipt.status = "passed"; receipt.validationErrors = 0; receipt.unexpectedDeviceLoss = unexpectedDeviceLoss;
  } catch (error) { receipt.status = "failed"; receipt.reason = String(error.message).slice(0, 1500); }
  finally {
    cancelled = true; clearTimeout(deadline); sampleCapture?.destroy(); renderer?.destroy(); device?.destroy();
    // Full linear readback is downloadable; keep the on-screen receipt compact.
    status.textContent = JSON.stringify({ ...receipt, cases: cases.map(({ linearRgba: _pixels, ...result }) => result) }, null, 2);
    const link = document.createElement("a"); link.textContent = "Download full linear-HDR receipt";
    link.download = "task-212-primary-terminal-mis.json";
    const url = URL.createObjectURL(new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" }));
    link.href = url; document.body.append(link); button.disabled = false;
    link.addEventListener("click", () => setTimeout(() => URL.revokeObjectURL(url), 1000), { once: true });
  }
});
