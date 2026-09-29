import { createWavefrontPathTracingComputeRenderer } from "/src/wavefront-compute.js";
import { createWavefrontFrameEncoder } from "/src/wavefront-frame-encoder.js";
import { createGpuParallelismCounters } from "/src/wavefront-frame-runtime.js";
import { createConfigPayload } from "/src/wavefront-packers.js";
import { createAdaptiveResourceOwner, packAdaptivePixelState } from "/src/wavefront-adaptive-metadata.js";
import { createAdaptivePrimaryPipelines, packAdaptivePrimaryConfig, encodeAdaptivePrimaryWorklist } from "/src/wavefront-adaptive-primary.js";
import { createAdaptiveBootstrapPipelines } from "/src/wavefront-adaptive-bootstrap.js";
import { createAdaptiveCameraRayPipeline } from "/src/wavefront-adaptive-camera.js";
import { createAdaptivePreparedSampleEncoder } from "/src/wavefront-adaptive-prepared-sample.js";
import { WAVEFRONT_COMPUTE_WGSL } from "/src/wavefront-shaders.js";
import { assertShaderModuleCompiles } from "/src/wavefront-runtime-support.js";

const check = (value, message) => { if (!value) throw new Error(message); };
const hash = async (value) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (byte) => byte.toString(16).padStart(2, "0")).join("");
const button = document.querySelector("#run"), status = document.querySelector("#result");
button.addEventListener("click", async () => {
  button.disabled = true;
  let device, renderer, owner, timer, cancelled = false, lost = false;
  const extraBuffers = [], errors = [], results = [], buffers = new Map(), bindings = new Map(), pipelines = {};
  const receipt = { status: "running", timestamp: new Date().toISOString(), scope: "primary-miss-continuation-equivalence-only",
    fixedShaderSha256: await hash(WAVEFRONT_COMPUTE_WGSL), fixtureSha256: await hash(await (await fetch(import.meta.url)).text()),
    coordinatorSha256: await hash(await (await fetch("/src/wavefront-adaptive-prepared-sample.js")).text()), results };
  const active = () => check(!cancelled, "Cancelled");
  try {
    await Promise.race([(async () => {
      const adapter = await navigator.gpu?.requestAdapter(); active();
      check(adapter?.info.isFallbackAdapter === false, "Physical adapter unavailable");
      receipt.adapter = { vendor: adapter.info.vendor, architecture: adapter.info.architecture, isFallbackAdapter: false };
      // Observe resources created by the actual production renderer, preserving
      // the native device identity and every descriptor/returned GPU object.
      const observedAdapter = { limits: adapter.limits, features: adapter.features, info: adapter.info,
        requestDevice: async (descriptor) => {
          device = await adapter.requestDevice(descriptor); if (cancelled) { device.destroy(); active(); }
          device.lost.then(({ reason }) => { if (reason !== "destroyed") lost = true; });
          device.addEventListener("uncapturederror", (event) => errors.push(event.error.message));
          device.pushErrorScope("validation");
          for (const [method, collection] of [["createBuffer", buffers], ["createBindGroup", bindings]]) {
            const original = device[method].bind(device);
            device[method] = (value) => { const object = original(value); collection.set(value.label, object); return object; };
          }
          const createPipeline = device.createComputePipelineAsync.bind(device);
          device.createComputePipelineAsync = async (value) => {
            const pipeline = await createPipeline(value); pipelines[value.compute.entryPoint] = pipeline; return pipeline;
          };
          return device;
        } };
      renderer = await createWavefrontPathTracingComputeRenderer({
        canvas: new OffscreenCanvas(257, 129), width: 257, height: 129, tileSize: 128, maxDepth: 8,
        samplesPerPixel: 128, denoise: false, deferredPathResolve: true, displayQuality: true,
        camera: { position: [0, 0, 2], target: [0, 0, 0] },
        meshes: [{ positions: [-1, -1, 10, 1, -1, 10, 0, 1, 10], indices: [0, 1, 2] }],
        navigator: { gpu: { requestAdapter: async () => observedAdapter, getPreferredCanvasFormat: () => navigator.gpu.getPreferredCanvasFormat() } },
      }); active();
      check(!renderer.config.gpuAccelerationBuildRequired && renderer.config.sceneObjectCount === 0, "Expected uploaded mesh BVH without analytic defaults");
      const get = (name) => { const value = buffers.get(`plasius.wavefront.${name}`); check(value, `Missing production ${name}`); return value; };
      const queue = get("activeQueue"), counters = get("counters"), paths = get("pathVertices"), frame = get("frameConfig"), sums = get("accumulation");
      const productionAllocatedBufferBytes = [...buffers.values()].reduce((sum, buffer) => sum + buffer.size, 0);
      owner = createAdaptiveResourceOwner(device, GPUBufferUsage, { enabled: true, width: 257, height: 129, primaryWorklist: true, primaryConfigSlots: 16 });
      const resources = await owner.acquire(); active(); check(resources.status === "ready", resources.reason);
      const b = resources.buffers;
      const compact = await createAdaptivePrimaryPipelines(device, GPUShaderStage, { enabled: true }); active();
      const bootstrap = await createAdaptiveBootstrapPipelines(device, GPUShaderStage, { enabled: true }); active();
      const camera = await createAdaptiveCameraRayPipeline(device, GPUShaderStage, { enabled: true }); active();
      const group = (layout, entries) => device.createBindGroup({ layout, entries: entries.map(([binding, buffer, size]) => ({ binding, resource: { buffer, ...(size ? { size } : {}) } })) });
      const preparedBindings = {
        bootstrapFrame: group(bootstrap.frameLayout, [[0, queue], [3, sums], [5, frame, 320], [6, counters], [22, paths]]),
        bootstrapWorklist: group(bootstrap.worklistLayout, [[0, b.worklist], [1, b.primaryControl], [2, b.primaryConfig, 32]]),
        cameraFrame: group(camera.rayLayout, [[0, queue], [5, frame, 320]]),
        cameraWorklist: group(camera.worklistLayout, [[0, b.worklist], [1, b.primaryControl], [2, b.primaryConfig, 32]]),
      };
      const compactGroup = group(compact.layout, [[0, b.pixelState], [1, b.worklist], [2, b.primaryControl], [3, b.dispatch], [4, b.primaryConfig, 32]]);
      let config = renderer.config;
      const frameEncoder = createWavefrontFrameEncoder({ getConfig: () => config,
        getBindGroups: () => [bindings.get("plasius.wavefront.bind.activeNext"), bindings.get("plasius.wavefront.bind.nextActive")],
        pipelines, counterBuffer: counters, activeDispatchBuffer: get("activeDispatchArgs") });
      const prepared = createAdaptivePreparedSampleEncoder({ enabled: true, bootstrapPipelines: bootstrap, cameraPipeline: camera,
        frameEncoder, counterBuffer: counters, primaryDispatchBuffer: b.dispatch, getBindGroups: () => preparedBindings });
      const createBuffer = (size, usage) => { const value = device.createBuffer({ size, usage }); extraBuffers.push(value); return value; };
      const copyBytes = (195 * 9 + 1) * 64;
      const copied = createBuffer(copyBytes, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
      const staging = createBuffer(copyBytes, GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ);
      const module = device.createShaderModule({ code: `@group(0) @binding(0) var<storage,read> copyInput: array<u32>;
        @group(0) @binding(1) var<storage,read_write> copyOutput: array<u32>;
        @compute @workgroup_size(64) fn read_words(@builtin(global_invocation_id) id: vec3<u32>) {
          if (id.x < arrayLength(&copyInput)) { copyOutput[id.x] = copyInput[id.x]; }
        }` });
      await assertShaderModuleCompiles(module, "prepared-probe-readback"); active();
      const readPipeline = await device.createComputePipelineAsync({ layout: "auto", compute: { module, entryPoint: "read_words" } }); active();
      const read = async (buffer, bytes) => {
        const encoder = device.createCommandEncoder(), pass = encoder.beginComputePass();
        pass.setPipeline(readPipeline); pass.setBindGroup(0, group(readPipeline.getBindGroupLayout(0), [[0, buffer, bytes], [1, copied]]));
        pass.dispatchWorkgroups(Math.ceil(bytes / 256)); pass.end();
        encoder.copyBufferToBuffer(copied, 0, staging, 0, bytes); device.queue.submit([encoder.finish()]);
        await staging.mapAsync(GPUMapMode.READ); active(); const words = new Uint32Array(staging.getMappedRange(0, bytes).slice(0)); staging.unmap(); return words;
      };
      const cases = [1, 4, 8].flatMap((depth) => [0, 31, 127].map((ordinal) => ({ name: `depth-${depth}-ordinal-${ordinal}`, depth, ordinal })));
      cases.push({ name: "empty", depth: 8, ordinal: 0, empty: true }, { name: "failed", depth: 8, ordinal: 0, failed: true });
      for (const [slot, item] of cases.entries()) {
        active(); status.textContent = `Running ${item.name}`;
        config = { ...renderer.config, maxDepth: item.depth };
        const tile = { x: 31, y: 17, width: 65, height: 3 }, pixels = 195, tier = 128;
        const frameOffset = slot * config.memory.configBufferStride, tileOffset = slot * 256;
        const tileConfig = { width: config.width, height: config.height, tileX: tile.x, tileY: tile.y, tileWidth: tile.width, tileHeight: tile.height, tier };
        device.queue.writeBuffer(frame, frameOffset, createConfigPayload(config, tile, 7, { sampleIndex: item.ordinal, sampleWeight: 1 }));
        const denseEncoder = device.createCommandEncoder();
        frameEncoder.encodeTileSample(denseEncoder, tile, frameOffset, createGpuParallelismCounters());
        device.queue.submit([denseEncoder.finish()]);
        const pathBytes = (pixels * (item.depth + 1) + 1) * 64;
        const densePaths = await read(paths, pathBytes), denseCounters = await read(counters, 128); active();
        check(denseCounters[0] === 0 && denseCounters[2] === pixels, `${item.name}: dense paths did not terminate`);
        const words = new Uint32Array(config.width * config.height).fill(packAdaptivePixelState({ requested: 2 })), selected = new Set();
        for (let local = 0; local < pixels; local += 3) if (!item.empty) {
          selected.add(local); words[(tile.y + Math.floor(local / tile.width)) * config.width + tile.x + local % tile.width] = packAdaptivePixelState({ requested: tier });
        }
        device.queue.writeBuffer(b.pixelState, 0, words);
        device.queue.writeBuffer(b.primaryConfig, tileOffset, packAdaptivePrimaryConfig(tileConfig));
        const compactEncoder = device.createCommandEncoder(); encodeAdaptivePrimaryWorklist(compactEncoder, compact, compactGroup, tileOffset, tileConfig);
        device.queue.submit([compactEncoder.finish()]);
        if (item.failed) device.queue.writeBuffer(b.primaryControl, 4, new Uint32Array([2]));
        const sentinel = 0x3f800000; device.queue.writeBuffer(paths, 0, new Uint32Array(pathBytes / 4).fill(sentinel));
        const encoder = device.createCommandEncoder(), parallelism = createGpuParallelismCounters();
        prepared.encode(encoder, { tile, frameOffset, tileOffset, parallelism }); device.queue.submit([encoder.finish()]);
        const actual = await read(paths, pathBytes), counts = await read(counters, 128); active();
        const accepted = item.failed ? 0 : selected.size;
        check(counts[0] === 0 && counts[1] === 0 && counts[2] === accepted, `${item.name}: incorrect actual termination counts`);
        const stride = 16;
        for (let index = 0; index < actual.length; index += 1) {
          const useDense = !item.failed && selected.has(Math.floor(index / stride));
          check(actual[index] === (useDense ? densePaths[index] : sentinel), `${item.name}: deferred path mismatch at ${index}`);
        }
        for (const local of selected) if (!item.failed) check(actual[local * stride + 7] !== 0, "Missing terminal source");
        results.push({ name: item.name, denseTerminatedPaths: pixels, compactedTerminatedPaths: accepted,
          selectedPathRecordsBitwiseEqual: true, unselectedAndPaddingUntouched: true, commandCounts: parallelism });
      }
      const error = await device.popErrorScope(); active(); check(!error && !errors.length && !lost, error?.message ?? errors[0] ?? "GPU failure");
      Object.assign(receipt, { status: "passed", validationErrors: 0, unexpectedDeviceLoss: false,
        adaptiveAllocatedBytes: resources.allocatedBytes, productionAllocatedBufferBytes,
        testReadbackBufferBytes: extraBuffers.reduce((sum, buffer) => sum + buffer.size, 0) });
    })(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("120-second deadline exceeded")), 120000); })]);
  } catch (error) { receipt.status = "failed"; receipt.reason = String(error.message).slice(0, 1500); }
  finally {
    cancelled = true; clearTimeout(timer); owner?.destroy(); renderer?.destroy(); extraBuffers.forEach((buffer) => buffer.destroy()); device?.destroy();
    receipt.adaptiveBytesAfterCleanup = owner?.snapshot().allocatedBytes ?? 0;
    status.textContent = JSON.stringify(receipt, null, 2); button.disabled = false;
  }
});
