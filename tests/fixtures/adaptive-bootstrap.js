import { createAdaptiveResourceOwner, packAdaptivePixelState } from "/src/wavefront-adaptive-metadata.js";
import { createAdaptivePrimaryPipelines, packAdaptivePrimaryConfig, encodeAdaptivePrimaryWorklist } from "/src/wavefront-adaptive-primary.js";
import { createAdaptiveBootstrapPipelines, encodeAdaptiveBootstrap } from "/src/wavefront-adaptive-bootstrap.js";
import { createAdaptiveCameraRayPipeline, encodeAdaptiveCameraRays } from "/src/wavefront-adaptive-camera.js";
import { ADAPTIVE_BOOTSTRAP_WGSL } from "/src/wavefront-adaptive-bootstrap-shader.js";
import { ADAPTIVE_CAMERA_WGSL } from "/src/wavefront-adaptive-camera-shader.js";
import { WAVEFRONT_COMPUTE_WGSL } from "/src/wavefront-shaders.js";
import { createWavefrontPathTracingComputeConfig } from "/src/wavefront-config.js";
import { createConfigPayload } from "/src/wavefront-packers.js";

const check = (condition, message) => { if (!condition) throw new Error(message); };
const hash = async (value) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (byte) => byte.toString(16).padStart(2, "0")).join("");
const button = document.querySelector("#run"), status = document.querySelector("#result");
button.addEventListener("click", async () => {
  button.disabled = true;
  let device, owner, timer, cancelled = false, lost = false;
  const allocated = [], errors = [], results = [];
  const receipt = { status: "running", timestamp: new Date().toISOString(), scope: "compaction-bootstrap-camera-only",
    bootstrapShaderSha256: await hash(ADAPTIVE_BOOTSTRAP_WGSL), cameraShaderSha256: await hash(ADAPTIVE_CAMERA_WGSL),
    fixedShaderSha256: await hash(WAVEFRONT_COMPUTE_WGSL), fixtureSha256: await hash(await (await fetch(import.meta.url)).text()),
    userAgent: navigator.userAgent, results };
  const active = () => check(!cancelled, "Cancelled");
  const buffer = (size, usage) => { const value = device.createBuffer({ size, usage }); allocated.push(value); return value; };
  try {
    await Promise.race([(async () => {
      const adapter = await navigator.gpu?.requestAdapter(); active();
      check(adapter?.info.isFallbackAdapter === false, "Physical adapter unavailable");
      receipt.adapter = { vendor: adapter.info.vendor, architecture: adapter.info.architecture, isFallbackAdapter: adapter.info.isFallbackAdapter };
      device = await adapter.requestDevice(); if (cancelled) { device.destroy(); active(); }
      device.lost.then(({ reason }) => { if (reason !== "destroyed") lost = true; });
      device.addEventListener("uncapturederror", (event) => errors.push(event.error.message));
      device.pushErrorScope("validation");
      owner = createAdaptiveResourceOwner(device, GPUBufferUsage, { enabled: true, width: 257, height: 129, primaryWorklist: true, primaryConfigSlots: 64 });
      const resources = await owner.acquire(); active(); check(resources.status === "ready", resources.reason);
      const b = resources.buffers;
      receipt.adaptiveAllocatedBytes = resources.allocatedBytes;
      const compaction = await createAdaptivePrimaryPipelines(device, GPUShaderStage, { enabled: true }); active();
      const bootstrap = await createAdaptiveBootstrapPipelines(device, GPUShaderStage, { enabled: true }); active();
      const camera = await createAdaptiveCameraRayPipeline(device, GPUShaderStage, { enabled: true }); active();
      const storage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
      const frame = buffer(64 * 512, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
      const rays = buffer((16384 + 1) * 96, storage);
      const counters = buffer(128, storage);
      const sums = buffer((16384 + 1) * 16, storage);
      const paths = buffer((16384 * 9 + 1) * 64, storage);
      const wordCopy = buffer(paths.size, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
      const staging = buffer(paths.size, GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ);
      const copyModule = device.createShaderModule({ code: `
        @group(0) @binding(0) var<storage, read> input: array<u32>;
        @group(0) @binding(1) var<storage, read_write> output: array<u32>;
        @compute @workgroup_size(64) fn copy_words(@builtin(global_invocation_id) id: vec3<u32>) {
          if (id.x < arrayLength(&input)) { output[id.x] = input[id.x]; }
        }` });
      const copy = await device.createComputePipelineAsync({ layout: "auto", compute: { module: copyModule, entryPoint: "copy_words" } }); active();
      const read = async (source, size) => {
        const encoder = device.createCommandEncoder(), pass = encoder.beginComputePass();
        pass.setPipeline(copy); pass.setBindGroup(0, device.createBindGroup({ layout: copy.getBindGroupLayout(0), entries: [
          { binding: 0, resource: { buffer: source, size } }, { binding: 1, resource: { buffer: wordCopy } },
        ] })); pass.dispatchWorkgroups(Math.ceil(size / 256)); pass.end();
        encoder.copyBufferToBuffer(wordCopy, 0, staging, 0, size); device.queue.submit([encoder.finish()]);
        await staging.mapAsync(GPUMapMode.READ); active();
        const words = new Uint32Array(staging.getMappedRange(0, size).slice(0)); staging.unmap(); return words;
      };
      const cases = [];
      for (const depth of [1, 4, 8, 32]) for (const ordinal of [0, 31]) cases.push({ name: `depth-${depth}-ordinal-${ordinal}`, depth, ordinal, tier: 32 });
      for (const tier of [1, 2, 4, 8, 16, 32, 64, 128, 256]) cases.push({ name: `tier-${tier}`, tier, ordinal: tier - 1 });
      cases.push({ name: "empty-tier", empty: true }, { name: "full-tile", full: true, depth: 8, tier: 256, ordinal: 255 });
      for (const veto of ["upstream-failure", "reserved-control", "reserved-tile", "bad-id", "bad-count", "short-queue", "short-worklist", "short-path", "short-sums", "undersized-dispatch", "tile-mismatch", "zero-width", "pixel-count", "zero-depth", "excess-depth", "weighted", "deferred-off", "ordinal-at-tier", "NaN-ordinal", "fractional-ordinal", "period-below-tier", "period-above-256"]) {
        cases.push({ name: veto, veto });
      }
      check(cases.length <= 64, "Too many immutable slots");
      let generatedRays = 0;
      for (const [slot, item] of cases.entries()) {
        active(); status.textContent = `Running ${item.name}`;
        const depth = item.depth ?? 4, tier = item.tier ?? 32, ordinal = item.ordinal ?? 0;
        const config = createWavefrontPathTracingComputeConfig({ width: 257, height: 129, tileSize: 128, samplesPerPixel: 256,
          maxDepth: depth, deferredPathResolve: true, denoise: false });
        const tile = item.full ? { x: 31, y: 0, width: 128, height: 128 } : { x: 31, y: 17, width: 65, height: 3 };
        const pixels = tile.width * tile.height;
        const tileConfig = { width: config.width, height: config.height, tileX: tile.x, tileY: tile.y,
          tileWidth: tile.width, tileHeight: tile.height, tier };
        const selected = new Set();
        const words = new Uint32Array(config.width * config.height).fill(packAdaptivePixelState({ requested: 2 }));
        for (let local = 0; local < pixels; local += 1) {
          const source = (tile.y + Math.floor(local / tile.width)) * config.width + tile.x + local % tile.width;
          if (!item.empty && (item.full || local % 3 === 0)) selected.add(local);
          words[source] = packAdaptivePixelState({ requested: selected.has(local) ? tier : tier === 2 ? 8 : 2 });
        }
        device.queue.writeBuffer(b.pixelState, 0, words);
        device.queue.writeBuffer(b.primaryConfig, slot * 256, packAdaptivePrimaryConfig(tileConfig));
        const group = device.createBindGroup({ layout: compaction.layout, entries: [
          { binding: 0, resource: { buffer: b.pixelState } }, { binding: 1, resource: { buffer: b.worklist } },
          { binding: 2, resource: { buffer: b.primaryControl } }, { binding: 3, resource: { buffer: b.dispatch } },
          { binding: 4, resource: { buffer: b.primaryConfig, size: 32 } },
        ] });
        const compactEncoder = device.createCommandEncoder();
        encodeAdaptivePrimaryWorklist(compactEncoder, compaction, group, slot * 256, tileConfig);
        device.queue.submit([compactEncoder.finish()]);
        const control = await read(b.primaryControl, 16); active();
        check(control[1] === 0 && control[0] === selected.size, "Incorrect compaction result");
        const ids = control[0] ? await read(b.worklist, control[0] * 4) : new Uint32Array(); active();
        check(new Set(ids).size === selected.size && [...ids].every((id) => selected.has(id)), "Incorrect worklist ownership");
        const payload = createConfigPayload(config, tile, 7, { sampleIndex: ordinal, sampleWeight: 1 });
        const view = new DataView(payload);
        if (item.veto === "upstream-failure") control[1] = 2;
        if (item.veto === "reserved-control") control[2] = 1;
        if (item.veto === "bad-count") control[0] = pixels + 1;
        if (item.veto === "bad-id") device.queue.writeBuffer(b.worklist, (selected.size - 1) * 4, new Uint32Array([pixels]));
        if (item.veto === "reserved-tile") device.queue.writeBuffer(b.primaryConfig, slot * 256 + 28, new Uint32Array([1]));
        const uintChanges = { "tile-mismatch": [8, tile.x + 1], "zero-width": [0, 0], "pixel-count": [24, 0],
          "zero-depth": [28, 0], "excess-depth": [28, 33], "period-below-tier": [264, tier - 1], "period-above-256": [264, 257] };
        const floatChanges = { weighted: [136, 1 / tier], "deferred-off": [288, 0], "ordinal-at-tier": [140, tier],
          "NaN-ordinal": [140, NaN], "fractional-ordinal": [140, 0.5] };
        if (uintChanges[item.veto]) view.setUint32(...uintChanges[item.veto], true);
        if (floatChanges[item.veto]) view.setFloat32(...floatChanges[item.veto], true);
        device.queue.writeBuffer(b.primaryControl, 0, control);
        device.queue.writeBuffer(frame, slot * 512, payload);
        const rayBytes = (pixels + 1) * 96, sumBytes = (pixels + 1) * 16, pathBytes = (pixels * (depth + 1) + 1) * 64;
        const sentinel = 0x3f800000;
        for (const [target, bytes] of [[rays, rayBytes], [sums, sumBytes], [paths, pathBytes], [counters, 128]]) {
          device.queue.writeBuffer(target, 0, new Uint32Array(bytes / 4).fill(sentinel));
        }
        const bootstrapGroup = device.createBindGroup({ layout: bootstrap.frameLayout, entries: [
          { binding: 0, resource: { buffer: rays, ...(item.veto === "short-queue" ? { size: 96 } : {}) } },
          { binding: 3, resource: { buffer: sums, ...(item.veto === "short-sums" ? { size: 16 } : {}) } },
          { binding: 5, resource: { buffer: frame, size: 320 } }, { binding: 6, resource: { buffer: counters } },
          { binding: 22, resource: { buffer: paths, ...(item.veto === "short-path" ? { size: 64 } : {}) } },
        ] });
        const bootstrapWorklist = device.createBindGroup({ layout: bootstrap.worklistLayout, entries: [
          { binding: 0, resource: { buffer: b.worklist, ...(item.veto === "short-worklist" ? { size: 4 } : {}) } },
          { binding: 1, resource: { buffer: b.primaryControl } }, { binding: 2, resource: { buffer: b.primaryConfig, size: 32 } },
        ] });
        const cameraFrame = device.createBindGroup({ layout: camera.rayLayout, entries: [
          { binding: 0, resource: { buffer: rays } }, { binding: 5, resource: { buffer: frame, size: 320 } },
        ] });
        const cameraWorklist = device.createBindGroup({ layout: camera.worklistLayout, entries: [
          { binding: 0, resource: { buffer: b.worklist } }, { binding: 1, resource: { buffer: b.primaryControl } },
          { binding: 2, resource: { buffer: b.primaryConfig, size: 32 } },
        ] });
        const encoder = device.createCommandEncoder();
        encodeAdaptiveBootstrap(encoder, bootstrap, bootstrapGroup, bootstrapWorklist, counters, slot * 512, slot * 256,
          item.veto === "undersized-dispatch" ? 1 : pixels);
        encodeAdaptiveCameraRays(encoder, camera, cameraFrame, cameraWorklist, b.dispatch, slot * 512, slot * 256);
        device.queue.submit([encoder.finish()]);
        const actualControl = await read(b.primaryControl, 16), actualCounters = await read(counters, 128); active();
        const accepted = item.veto ? 0 : selected.size;
        check(Boolean(actualControl[1]) === Boolean(item.veto), `${item.name}: incorrect failure state`);
        if (item.veto === "upstream-failure") check((actualControl[1] & 2) !== 0, "Upstream failure lost");
        for (let index = 0; index < 32; index += 1) {
          const expected = index === 0 ? accepted : index === 4 ? Math.max(1, Math.ceil(accepted / 64)) : index === 5 || index === 6 ? 1 : 0;
          check(actualCounters[index] === expected, `${item.name}: stale counter ${index}`);
        }
        for (const [target, bytes, stride] of [[sums, sumBytes, 4], [paths, pathBytes, 16]]) {
          const actual = await read(target, bytes); active();
          for (let index = 0; index < actual.length; index += 1) {
            const cleared = !item.veto && selected.has(Math.floor(index / stride));
            check(actual[index] === (cleared ? 0 : sentinel), `${item.name}: incorrect reset at word ${index}`);
          }
        }
        const actualRays = await read(rays, rayBytes); active();
        for (let slotIndex = 0; slotIndex < accepted; slotIndex += 1) {
          const local = ids[slotIndex], source = (tile.y + Math.floor(local / tile.width)) * config.width + tile.x + local % tile.width;
          check(actualRays[slotIndex * 24] === local && actualRays[slotIndex * 24 + 2] === source
            && actualRays[slotIndex * 24 + 3] === ordinal, `${item.name}: ray ownership changed`);
        }
        check(actualRays.slice(accepted * 24).every((word) => word === sentinel), `${item.name}: padded or vetoed rays modified`);
        generatedRays += accepted;
        results.push({ name: item.name, selectedPixels: selected.size, generatedRays: accepted, counterReset: true,
          selectedOnlyPathReset: true, unselectedAndPaddingUntouched: true, failure: actualControl[1] });
      }
      const error = await device.popErrorScope(); active(); check(!error && !errors.length && !lost, error?.message ?? errors[0] ?? "GPU failure");
      Object.assign(receipt, { status: "passed", generatedRays, validationErrors: 0, unexpectedDeviceLoss: false,
        bootstrapAdditionalBufferBytes: 0, fixtureBufferBytes: allocated.reduce((sum, item) => sum + item.size, 0) });
    })(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("120-second deadline exceeded")), 120000); })]);
  } catch (error) { receipt.status = "failed"; receipt.reason = String(error.message).slice(0, 1500); }
  finally {
    cancelled = true; clearTimeout(timer); owner?.destroy(); allocated.forEach((item) => item.destroy()); device?.destroy();
    receipt.adaptiveBytesAfterCleanup = owner?.snapshot().allocatedBytes ?? 0;
    status.textContent = JSON.stringify(receipt, null, 2); button.disabled = false;
  }
});
