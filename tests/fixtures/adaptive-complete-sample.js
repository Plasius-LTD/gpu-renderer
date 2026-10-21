import { createWavefrontPathTracingComputeRenderer } from "/src/wavefront-compute.js";
import { createWavefrontFrameEncoder } from "/src/wavefront-frame-encoder.js";
import { createGpuParallelismCounters } from "/src/wavefront-frame-runtime.js";
import { createConfigPayload } from "/src/wavefront-packers.js";
import { createAdaptiveResourceOwner, packAdaptivePixelState } from "/src/wavefront-adaptive-metadata.js";
import { createAdaptivePrimaryPipelines, packAdaptivePrimaryConfig, encodeAdaptivePrimaryWorklist } from "/src/wavefront-adaptive-primary.js";
import { createAdaptiveBootstrapPipelines } from "/src/wavefront-adaptive-bootstrap.js";
import { createAdaptiveCameraRayPipeline } from "/src/wavefront-adaptive-camera.js";
import { createAdaptivePreparedSampleEncoder } from "/src/wavefront-adaptive-prepared-sample.js";
import { createAdaptiveCompletionPipeline, encodeAdaptiveSampleCompletion } from "/src/wavefront-adaptive-completion.js";
import { createAdaptiveResolvePipelines, packAdaptiveResolveConfig } from "/src/wavefront-adaptive-resolve.js";
import { WAVEFRONT_COMPUTE_WGSL } from "/src/wavefront-shaders.js";
import { ADAPTIVE_COMPLETION_WGSL } from "/src/wavefront-adaptive-completion-shader.js";
import { assertShaderModuleCompiles } from "/src/wavefront-runtime-support.js";
import { primaryMisCase, PRIMARY_MIS_TOLERANCE } from "./primary-terminal-mis-cases.js";

const check = (condition, message) => { if (!condition) throw new Error(message); };
const hash = async (source) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source))), (byte) => byte.toString(16).padStart(2, "0")).join("");
const button = document.querySelector("#run"), status = document.querySelector("#result");
button.addEventListener("click", async () => {
  button.disabled = true;
  let device, renderer, owner, timer, cancelled = false, lost = false;
  let fixtureBuffers = [];
  const cases = [], failures = [], errors = [];
  const receipt = { status: "running", timestamp: new Date().toISOString(), scope: "experimental-complete-adaptive-pixels",
    fixedShaderSha256: await hash(WAVEFRONT_COMPUTE_WGSL), completionShaderSha256: await hash(ADAPTIVE_COMPLETION_WGSL),
    fixtureSha256: await hash(await (await fetch(import.meta.url)).text()), absoluteTolerance: PRIMARY_MIS_TOLERANCE,
    cases, failures, limitations: ["16x16 analytic scenes, not Eames or a benchmark", "No noise, speedup or memory-saving claim", "Experimental prerequisite transport, not released", "No temporal reuse; budgets selected before sampling"] };
  const active = () => check(!cancelled, "Cancelled");
  const cleanup = () => { owner?.destroy(); renderer?.destroy(); fixtureBuffers.forEach((buffer) => buffer.destroy()); fixtureBuffers = []; device?.destroy(); };
  try {
    await Promise.race([(async () => {
      for (const name of ["environment", "black", "emissive", "metal", "dielectric", "environment-128", "diffuse"]) {
        const maximum = name === "environment-128" ? 128 : 32, tiers = maximum === 128 ? [2, 8, 32, 128] : [2, 4, 8, 32];
        const slots = tiers.reduce((sum, tier) => sum + tier, 0) + 1;
        const adapter = await navigator.gpu?.requestAdapter(); active(); check(adapter?.info.isFallbackAdapter === false, "Physical adapter unavailable");
        receipt.adapter = { vendor: adapter.info.vendor, architecture: adapter.info.architecture, isFallbackAdapter: false };
        const buffers = new Map(), groups = new Map(), pipelines = {};
        const observedAdapter = { limits: adapter.limits, features: adapter.features, info: adapter.info,
          requestDevice: async (descriptor) => {
            device = await adapter.requestDevice(descriptor); if (cancelled) { device.destroy(); active(); }
            device.lost.then(({ reason }) => { if (reason !== "destroyed") lost = true; });
            device.addEventListener("uncapturederror", (event) => errors.push(event.error.message)); device.pushErrorScope("validation");
            for (const [method, entries] of [["createBuffer", buffers], ["createBindGroup", groups]]) {
              const original = device[method].bind(device);
              device[method] = (descriptor) => { const value = original(descriptor); if (descriptor.label) entries.set(descriptor.label, value); return value; };
            }
            const original = device.createComputePipelineAsync.bind(device);
            device.createComputePipelineAsync = async (descriptor) => { const value = await original(descriptor); pipelines[descriptor.compute.entryPoint] = value; return value; };
            return device;
          } };
        const analytic = primaryMisCase(name === "diffuse" ? "metal" : ["black", "environment-128"].includes(name) ? "environment" : name);
        if (name === "diffuse") Object.assign(analytic.scene.meshes[0], { materialKind: "diffuse", metallic: 0, roughness: 1, color: [0.7, 0.3, 0.1, 1] });
        const expected = name === "black" ? [0, 0, 0] : analytic.expected;
        // Use a real uploaded mesh BVH for environment misses, not analytic defaults.
        const scene = ["environment", "black", "environment-128"].includes(name)
          ? { displayQuality: true, meshes: [{ positions: [-1, -1, 10, 1, -1, 10, 0, 1, 10], indices: [0, 1, 2] }] }
          : analytic.scene;
        const sky = name === "black" ? [0, 0, 0, 1] : [1, 1, 1, 1];
        renderer = await createWavefrontPathTracingComputeRenderer({ ...scene, width: 16, height: 16, tileSize: 16, maxDepth: 8,
          canvas: new OffscreenCanvas(16, 16), samplesPerPixel: maximum, denoise: false, deferredPathResolve: true, strictPhysicalLowSppLighting: true,
          camera: { position: [0, 0, 3], target: [0, 0, 0], fovYDegrees: 46 },
          environmentLighting: { horizonColor: name === "diffuse" ? [0.5, 0.6, 0.8, 1] : sky,
            zenithColor: name === "diffuse" ? [2, 0.8, 0.3, 1] : sky, sunColor: [0, 0, 0, 1], intensity: 1 },
          navigator: { gpu: { requestAdapter: async () => observedAdapter, getPreferredCanvasFormat: () => navigator.gpu.getPreferredCanvasFormat() } },
        }); active();
        const config = renderer.config, tile = { x: 0, y: 0, width: 16, height: 16 }, pixels = 256;
        const get = (name) => { const value = buffers.get(`plasius.wavefront.${name}`); check(value, `Missing ${name}`); return value; };
        const queue = get("activeQueue"), counters = get("counters"), paths = get("pathVertices"), frame = get("frameConfig"), accumulation = get("accumulation");
        const rendererBufferBytes = [...buffers.values()].reduce((sum, value) => sum + value.size, 0);
        owner = createAdaptiveResourceOwner(device, GPUBufferUsage, { enabled: true, width: 16, height: 16, tilePixelCapacity: 256,
          primaryWorklist: true, primaryConfigSlots: 4, countResolve: true, resolveConfigSlots: slots });
        const resources = await owner.acquire(); active(); check(resources.status === "ready", resources.reason);
        const b = resources.buffers;
        const compact = await createAdaptivePrimaryPipelines(device, GPUShaderStage, { enabled: true }); active();
        const bootstrap = await createAdaptiveBootstrapPipelines(device, GPUShaderStage, { enabled: true }); active();
        const camera = await createAdaptiveCameraRayPipeline(device, GPUShaderStage, { enabled: true }); active();
        const producer = await createAdaptiveCompletionPipeline(device, GPUShaderStage, { enabled: true }); active();
        const resolve = await createAdaptiveResolvePipelines(device, GPUShaderStage, { enabled: true }); active();
        const group = (layout, entries) => device.createBindGroup({ layout, entries: entries.map(([binding, buffer, size]) => ({ binding, resource: { buffer, ...(size ? { size } : {}) } })) });
        const compactGroup = group(compact.layout, [[0, b.pixelState], [1, b.worklist], [2, b.primaryControl], [3, b.dispatch], [4, b.primaryConfig, 32]]);
        const producerGroup = group(producer.layout, [[0, frame, 320], [1, paths], [2, b.pixelState], [3, b.cameraSamples], [4, b.primaryControl], [5, counters], [6, b.resolveConfig, 48]]);
        const resolveGroup = group(resolve.layout, [[0, b.pixelState], [1, b.cameraSamples], [2, b.radianceSums], [3, b.resolvedRadiance], [4, b.resolveConfig, 48]]);
        const preparedBindings = {
          bootstrapFrame: group(bootstrap.frameLayout, [[0, queue], [3, accumulation], [5, frame, 320], [6, counters], [22, paths]]),
          bootstrapWorklist: group(bootstrap.worklistLayout, [[0, b.worklist], [1, b.primaryControl], [2, b.primaryConfig, 32]]),
          cameraFrame: group(camera.rayLayout, [[0, queue], [5, frame, 320]]),
          cameraWorklist: group(camera.worklistLayout, [[0, b.worklist], [1, b.primaryControl], [2, b.primaryConfig, 32]]),
        };
        const frameEncoder = createWavefrontFrameEncoder({ getConfig: config, getBindGroups: () => [groups.get("plasius.wavefront.bind.activeNext"), groups.get("plasius.wavefront.bind.nextActive")],
          pipelines, counterBuffer: counters, activeDispatchBuffer: get("activeDispatchArgs") });
        const prepared = createAdaptivePreparedSampleEncoder({ enabled: true, bootstrapPipelines: bootstrap, cameraPipeline: camera,
          frameEncoder, counterBuffer: counters, primaryDispatchBuffer: b.dispatch, getBindGroups: () => preparedBindings });
        const makeBuffer = (size, usage) => { const buffer = device.createBuffer({ size, usage }); fixtureBuffers.push(buffer); return buffer; };
        const copySize = Math.max(8192, slots * 16), copied = makeBuffer(copySize, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
        const staging = makeBuffer(copySize, GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ);
        const rayCounts = makeBuffer(slots * 16, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
        const copyModule = device.createShaderModule({ code: `@group(0) @binding(0) var<storage,read> input: array<u32>;
          @group(0) @binding(1) var<storage,read_write> output: array<u32>;
          @compute @workgroup_size(64) fn copy_words(@builtin(global_invocation_id) id: vec3<u32>) {
            if (id.x < arrayLength(&input)) { output[id.x] = input[id.x]; }
          }` });
        await assertShaderModuleCompiles(copyModule, "completion-probe-readback"); active();
        const copy = await device.createComputePipelineAsync({ layout: "auto", compute: { module: copyModule, entryPoint: "copy_words" } }); active();
        const read = async (source, size) => {
          const encoder = device.createCommandEncoder(), pass = encoder.beginComputePass(); pass.setPipeline(copy);
          pass.setBindGroup(0, group(copy.getBindGroupLayout(0), [[0, source, size], [1, copied]])); pass.dispatchWorkgroups(Math.ceil(size / 256)); pass.end();
          encoder.copyBufferToBuffer(copied, 0, staging, 0, size); device.queue.submit([encoder.finish()]);
          await staging.mapAsync(GPUMapMode.READ); active(); const words = new Uint32Array(staging.getMappedRange(0, size).slice(0)); staging.unmap(); return words;
        };
        const tileConfig = (tier) => ({ width: 16, height: 16, tileX: 0, tileY: 0, tileWidth: 16, tileHeight: 16, tier });
        const sampleConfig = (selectedTier, sampleOrdinal) => ({ ...tileConfig(selectedTier), selectedTier, sampleOrdinal, frameValid: true });
        const resolveFrame = (offset) => { const encoder = device.createCommandEncoder(), pass = encoder.beginComputePass(); pass.setPipeline(resolve.resolve);
          pass.setBindGroup(0, resolveGroup, [offset]); pass.dispatchWorkgroups(4); pass.end(); device.queue.submit([encoder.finish()]); };
        // An independent fixed-dispatch/output reference at each selected prefix.
        // Do not compare a noisy 2-sample pixel with a different 32-sample estimator
        // or mislabel equal-sequence agreement as convergence/image quality.
        let densePrefix = null;
        if (name === "diffuse") {
          densePrefix = new Float32Array(pixels * 3);
          for (let ordinal = 0; ordinal < maximum; ordinal += 1) {
            device.queue.writeBuffer(frame, ordinal * config.memory.configBufferStride, createConfigPayload(config, tile, 7, { sampleIndex: ordinal, sampleWeight: 1 }));
            const encoder = device.createCommandEncoder(), parallelism = createGpuParallelismCounters();
            frameEncoder.encodeTileSample(encoder, tile, ordinal * config.memory.configBufferStride, parallelism);
            frameEncoder.encodeTileOutput(encoder, tile, ordinal * config.memory.configBufferStride, parallelism);
            device.queue.submit([encoder.finish()]);
            if (!tiers.includes(ordinal + 1)) continue;
            const values = new Float32Array((await read(accumulation, pixels * 16)).buffer); active();
            for (let id = 0; id < pixels; id += 1) {
              check(values[id * 4 + 3] === ordinal + 1, "Dense prefix failed completion");
              if (tiers[id % 4] !== ordinal + 1) continue;
              for (let channel = 0; channel < 3; channel += 1) densePrefix[id * 3 + channel] = values[id * 4 + channel] / (ordinal + 1);
            }
          }
        }
        for (const order of [tiers, [...tiers].reverse()]) {
          status.textContent = `Running ${name}, tiers ${order.join("/")}`;
          const budgets = Uint32Array.from({ length: pixels }, (_, id) => packAdaptivePixelState({ requested: tiers[id % 4] }));
          device.queue.writeBuffer(b.pixelState, 0, budgets);
          for (let ordinal = 0; ordinal < maximum; ordinal += 1) device.queue.writeBuffer(frame, ordinal * config.memory.configBufferStride, createConfigPayload(config, tile, 7, { sampleIndex: ordinal, sampleWeight: 1 }));
          let slot = 0;
          for (const [tierSlot, tier] of order.entries()) {
            const tileOffset = tierSlot * 256; device.queue.writeBuffer(b.primaryConfig, tileOffset, packAdaptivePrimaryConfig(tileConfig(tier)));
            const compactEncoder = device.createCommandEncoder(); encodeAdaptivePrimaryWorklist(compactEncoder, compact, compactGroup, tileOffset, tileConfig(tier)); device.queue.submit([compactEncoder.finish()]);
            for (let ordinal = 0; ordinal < tier; ordinal += 1, slot += 1) {
              const frameOffset = ordinal * config.memory.configBufferStride, resolveOffset = slot * 256;
              device.queue.writeBuffer(b.resolveConfig, resolveOffset, packAdaptiveResolveConfig(sampleConfig(tier, ordinal)));
              const encoder = device.createCommandEncoder(); prepared.encode(encoder, { tile, frameOffset, tileOffset });
              encodeAdaptiveSampleCompletion(encoder, { producer, resolve, producerGroup, resolveGroup, frameOffset, resolveOffset, tilePixelCount: pixels });
              // Fixture-only actual counters, not invocation estimates or release readbacks.
              encoder.copyBufferToBuffer(counters, 8, rayCounts, slot * 16, 4);
              encoder.copyBufferToBuffer(counters, 44, rayCounts, slot * 16 + 4, 4);
              device.queue.submit([encoder.finish()]);
            }
          }
          device.queue.writeBuffer(b.resolveConfig, slot * 256, packAdaptiveResolveConfig(sampleConfig(0, 0))); resolveFrame(slot * 256);
          const state = await read(b.pixelState, pixels * 4), outputBits = await read(b.resolvedRadiance, pixels * 16), traces = await read(rayCounts, slot * 16); active();
          const values = new Float32Array(outputBits.buffer), histogram = {};
          let actualSamples = 0, maxError = 0, squareError = 0, luminance = 0, terminalPaths = 0;
          for (let id = 0; id < pixels; id += 1) {
            const requested = tiers[id % 4], completed = (state[id] >>> 9) & 511;
            check(!(state[id] & 0x80000000) && completed === requested && values[id * 4 + 3] === 1, `${name}: incomplete pixel ${id}`);
            actualSamples += completed; histogram[completed] = (histogram[completed] ?? 0) + 1;
            for (let channel = 0; channel < 3; channel += 1) {
              const value = values[id * 4 + channel], error = Math.abs(value - (densePrefix ? densePrefix[id * 3 + channel] : expected[channel]));
              check(Number.isFinite(value) && error <= PRIMARY_MIS_TOLERANCE, `${name}: linear HDR mismatch ${id}/${channel}: ${value}`);
              maxError = Math.max(maxError, error); squareError += error * error; luminance += value * [0.2126, 0.7152, 0.0722][channel] / pixels;
            }
          }
          for (let i = 0; i < slot; i += 1) { terminalPaths += traces[i * 4]; check(traces[i * 4 + 1] === 0, "Queue overflow"); }
          cases.push({ name, tierOrder: order, sequencePeriod: maximum, pixels, actualSamples, fixedPrimaryReference: pixels * maximum,
            ...(densePrefix ? { reference: "fixed-dispatch same-ordinal prefix, not a converged image", denseReferenceCameraSamples: pixels * maximum } : {}),
            actualAverageSpp: actualSamples / pixels, histogram, terminalPaths, maxAbsoluteError: maxError, rgbRmse: Math.sqrt(squareError / (pixels * 3)),
            meanLuminance: luminance, adaptiveAllocatedBytes: resources.allocatedBytes, rendererBufferBytes, fixtureReadbackBytes: fixtureBuffers.reduce((sum, value) => sum + value.size, 0) });
        }
        if (name === "environment") {
          const vetoes = ["worklist", "pending", "overflow", "root-failed", "root-stale", "missing-child", "reserved", "weight", "identity", "duplicate", "skipped"];
          for (const veto of vetoes) {
            status.textContent = `Checking ${veto}`;
            device.queue.writeBuffer(b.pixelState, 0, new Uint32Array(pixels).fill(packAdaptivePixelState({ requested: 32 })));
            const ordinal = veto === "skipped" ? 1 : 0, frameOffset = 0, resolveOffset = 0;
            device.queue.writeBuffer(frame, 0, createConfigPayload(config, tile, 7, { sampleIndex: ordinal, sampleWeight: 1 }));
            device.queue.writeBuffer(b.primaryConfig, 0, packAdaptivePrimaryConfig(tileConfig(32)));
            device.queue.writeBuffer(b.resolveConfig, 0, packAdaptiveResolveConfig(sampleConfig(32, ordinal)));
            const encoder = device.createCommandEncoder(); encodeAdaptivePrimaryWorklist(encoder, compact, compactGroup, 0, tileConfig(32));
            prepared.encode(encoder, { tile, frameOffset, tileOffset: 0 }); device.queue.submit([encoder.finish()]);
            if (veto === "worklist") device.queue.writeBuffer(b.primaryControl, 4, new Uint32Array([2]));
            if (veto === "pending") device.queue.writeBuffer(counters, 0, new Uint32Array([1]));
            if (veto === "overflow") device.queue.writeBuffer(counters, 44, new Uint32Array([1]));
            if (veto === "root-failed") device.queue.writeBuffer(paths, 12, new Uint32Array([3]));
            if (veto === "root-stale") device.queue.writeBuffer(paths, 52, new Uint32Array([17]));
            if (veto === "missing-child") device.queue.writeBuffer(paths, 36, new Uint32Array([0xfffffffe]));
            if (veto === "reserved") device.queue.writeBuffer(b.resolveConfig, 36, new Uint32Array([1]));
            if (veto === "weight") device.queue.writeBuffer(frame, 136, new Float32Array([0.5]));
            if (veto === "identity") device.queue.writeBuffer(paths, 48, new Uint32Array([17]));
            const completeEncoder = device.createCommandEncoder(); encodeAdaptiveSampleCompletion(completeEncoder, { producer, resolve, producerGroup, resolveGroup, frameOffset, resolveOffset, tilePixelCount: pixels });
            if (veto === "duplicate") encodeAdaptiveSampleCompletion(completeEncoder, { producer, resolve, producerGroup, resolveGroup, frameOffset, resolveOffset, tilePixelCount: pixels });
            device.queue.submit([completeEncoder.finish()]); resolveFrame(0);
            const state = await read(b.pixelState, pixels * 4), output = await read(b.resolvedRadiance, pixels * 16); active();
            const completed = (state[0] >>> 9) & 511;
            check((state[0] & 0x80000000) && completed === (veto === "duplicate" ? 1 : 0) && output[3] === 0, `${veto}: failed sample accepted`);
            failures.push({ name: veto, completedCount: completed, failureFlag: true, outputInvalid: true });
          }
        }
        const error = await device.popErrorScope(); active(); check(!error && !errors.length && !lost, error?.message ?? errors[0] ?? "GPU failure");
        cleanup(); check(owner.snapshot().allocatedBytes === 0, "Adaptive allocation leak"); owner = null; renderer = null; device = null;
      }
      receipt.status = "passed"; receipt.validationErrors = 0; receipt.unexpectedDeviceLoss = false;
    })(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("120-second deadline exceeded")), 120000); })]);
  } catch (error) { receipt.status = "failed"; receipt.reason = String(error.message).slice(0, 1500); }
  finally { cancelled = true; clearTimeout(timer); cleanup(); receipt.adaptiveBytesAfterCleanup = owner?.snapshot().allocatedBytes ?? 0;
    status.textContent = JSON.stringify(receipt, null, 2); button.disabled = false; }
});
