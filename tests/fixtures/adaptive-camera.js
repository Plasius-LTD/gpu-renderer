import { createAdaptiveResourceOwner, packAdaptivePixelState } from "/src/wavefront-adaptive-metadata.js";
import { createAdaptivePrimaryPipelines, packAdaptivePrimaryConfig, encodeAdaptivePrimaryWorklist } from "/src/wavefront-adaptive-primary.js";
import { createAdaptiveCameraRayPipeline, encodeAdaptiveCameraRays } from "/src/wavefront-adaptive-camera.js";
import { ADAPTIVE_CAMERA_WGSL } from "/src/wavefront-adaptive-camera-shader.js";
import { WAVEFRONT_COMPUTE_WGSL } from "/src/wavefront-shaders.js";
import { createWavefrontPathTracingComputeConfig } from "/src/wavefront-config.js";
import { createConfigPayload } from "/src/wavefront-packers.js";

const check = (condition, message) => { if (!condition) throw new Error(message); };
const hash = async (value) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (byte) => byte.toString(16).padStart(2, "0")).join("");
const button = document.querySelector("#run"), status = document.querySelector("#result");

button.addEventListener("click", async () => {
  button.disabled = true;
  let device, owner, timer, cancelled = false, deviceLost = false;
  const allocated = [], results = [], errors = [];
  const active = () => check(!cancelled, "Cancelled");
  const receipt = { status: "running", timestamp: new Date().toISOString(), scope: "compacted-camera-ray-identity-only",
    shaderSha256: await hash(ADAPTIVE_CAMERA_WGSL), fixedShaderSha256: await hash(WAVEFRONT_COMPUTE_WGSL),
    fixtureSha256: await hash(await (await fetch(import.meta.url)).text()), userAgent: navigator.userAgent, results };
  const buffer = (size, usage) => { const value = device.createBuffer({ size, usage }); allocated.push(value); return value; };
  try {
    await Promise.race([(async () => {
      const adapter = await navigator.gpu?.requestAdapter(); active();
      check(adapter?.info.isFallbackAdapter === false, "Physical adapter unavailable");
      receipt.adapter = { vendor: adapter.info.vendor, architecture: adapter.info.architecture, isFallbackAdapter: adapter.info.isFallbackAdapter };
      device = await adapter.requestDevice(); if (cancelled) { device.destroy(); active(); }
      device.lost.then(({ reason }) => { if (reason !== "destroyed") deviceLost = true; });
      device.addEventListener("uncapturederror", (event) => errors.push(event.error.message));
      device.pushErrorScope("validation");
      owner = createAdaptiveResourceOwner(device, GPUBufferUsage, { enabled: true, width: 257, height: 129, primaryWorklist: true, primaryConfigSlots: 64 });
      const resources = await owner.acquire(); active(); check(resources.status === "ready", resources.reason);
      receipt.adaptiveAllocatedBytes = resources.allocatedBytes;
      const b = resources.buffers;
      const compaction = await createAdaptivePrimaryPipelines(device, GPUShaderStage, { enabled: true }); active();
      const camera = await createAdaptiveCameraRayPipeline(device, GPUShaderStage, { enabled: true }); active();
      const denseModule = device.createShaderModule({ code: WAVEFRONT_COMPUTE_WGSL + `
        @compute @workgroup_size(64) fn dense_camera_reference(@builtin(global_invocation_id) id: vec3<u32>) {
          if (id.x < config.tilePixelCount) { activeQueue[id.x] = make_ray(id.x); }
        }` });
      const dense = await device.createComputePipelineAsync({ layout: device.createPipelineLayout({ bindGroupLayouts: [camera.rayLayout] }),
        compute: { module: denseModule, entryPoint: "dense_camera_reference" } }); active();
      const frame = buffer(64 * 512, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
      const rays = buffer(16384 * 96, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST);
      const reference = buffer(rays.size, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
      const staging = buffer(rays.size * 2, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
      // Production owner does not request COPY_SRC; read its words through a
      // test-only bit-preserving copy, without changing production allocation.
      const wordCopy = buffer(65552, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
      const wordStaging = buffer(65552, GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ);
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
        encoder.copyBufferToBuffer(wordCopy, 0, wordStaging, 0, size); device.queue.submit([encoder.finish()]);
        await wordStaging.mapAsync(GPUMapMode.READ); active();
        const words = new Uint32Array(wordStaging.getMappedRange(0, size).slice(0)); wordStaging.unmap(); return words;
      };
      const config = createWavefrontPathTracingComputeConfig({ width: 257, height: 129, tileSize: 128, samplesPerPixel: 256, maxDepth: 2, denoise: false });
      const cases = [];
      for (const tier of [1, 2, 4, 8, 16, 32, 64, 128, 256]) for (const epoch of [0, 7]) for (const ordinal of [...new Set([0, tier - 1])]) {
        cases.push({ name: `tier-${tier}-epoch-${epoch}-ordinal-${ordinal}`, tier, epoch, ordinal });
      }
      cases.push({ name: "full-tile", tier: 256, ordinal: 255, full: true }, { name: "empty-tier", tier: 256, empty: true });
      for (const veto of ["failed-control", "reserved-control", "queue-capacity", "tile-mismatch", "zero-width", "outside-canvas", "bad-pixel-count", "ordinal-at-tier", "negative-ordinal", "NaN-ordinal", "fractional-ordinal", "period-below-tier", "period-above-256"]) {
        cases.push({ name: veto, tier: 32, veto });
      }
      check(cases.length <= 64, "Too many immutable slots");
      let comparedRays = 0;
      for (const [slot, item] of cases.entries()) {
        active(); status.textContent = `Running ${item.name}`;
        const tile = item.full ? { x: 31, y: 0, width: 128, height: 128 } : { x: 31, y: 17, width: 65, height: 3 };
        const tileConfig = { width: config.width, height: config.height, tileX: tile.x, tileY: tile.y, tileWidth: tile.width, tileHeight: tile.height, tier: item.tier };
        const words = new Uint32Array(config.width * config.height).fill(packAdaptivePixelState({ requested: 2 }));
        for (let local = 0; local < tile.width * tile.height; local += 1) {
          const source = (tile.y + Math.floor(local / tile.width)) * config.width + tile.x + local % tile.width;
          const selected = !item.empty && (item.full || local % 3 === 0);
          words[source] = packAdaptivePixelState({ requested: selected ? item.tier : item.tier === 2 ? 8 : 2 });
        }
        device.queue.writeBuffer(b.pixelState, 0, words);
        device.queue.writeBuffer(b.primaryConfig, slot * 256, packAdaptivePrimaryConfig(tileConfig));
        const encoder = device.createCommandEncoder();
        const group = device.createBindGroup({ layout: compaction.layout, entries: [
          { binding: 0, resource: { buffer: b.pixelState } }, { binding: 1, resource: { buffer: b.worklist } },
          { binding: 2, resource: { buffer: b.primaryControl } }, { binding: 3, resource: { buffer: b.dispatch } },
          { binding: 4, resource: { buffer: b.primaryConfig, size: 32 } },
        ] });
        encodeAdaptivePrimaryWorklist(encoder, compaction, group, slot * 256, tileConfig);
        device.queue.submit([encoder.finish()]);
        const control = await read(b.primaryControl, 16); active(); check(control[1] === 0, "Unexpected compaction failure");
        const count = control[0], ids = count ? await read(b.worklist, count * 4) : new Uint32Array(); active();
        check(count === (item.empty ? 0 : item.full ? 16384 : 65), `${item.name}: incorrect selected count`);
        check(new Set(ids).size === count && Array.from(ids).every((id) => id < tile.width * tile.height && (item.full || id % 3 === 0)), `${item.name}: incorrect selected pixels`);
        const payload = createConfigPayload(config, tile, item.epoch ?? 0, { sampleIndex: item.ordinal ?? 0, sampleWeight: 1 / 256 });
        const view = new DataView(payload);
        if (item.veto === "failed-control") control[1] = 2;
        if (item.veto === "reserved-control") control[2] = 1;
        if (item.veto === "queue-capacity") control[0] = 16385;
        if (item.veto === "tile-mismatch") view.setUint32(8, tile.x + 1, true);
        if (item.veto === "zero-width") view.setUint32(0, 0, true);
        if (item.veto === "outside-canvas") view.setUint32(8, 258, true);
        if (item.veto === "bad-pixel-count") view.setUint32(24, 0, true);
        if (item.veto === "ordinal-at-tier") view.setFloat32(140, item.tier, true);
        if (item.veto === "negative-ordinal") view.setFloat32(140, -1, true);
        if (item.veto === "NaN-ordinal") view.setFloat32(140, NaN, true);
        if (item.veto === "fractional-ordinal") view.setFloat32(140, 0.5, true);
        if (item.veto === "period-below-tier") view.setUint32(264, item.tier - 1, true);
        if (item.veto === "period-above-256") view.setUint32(264, 257, true);
        device.queue.writeBuffer(b.primaryControl, 0, control);
        device.queue.writeBuffer(frame, slot * 512, payload);
        const rayGroup = (output) => device.createBindGroup({ layout: camera.rayLayout, entries: [
          { binding: 0, resource: { buffer: output } }, { binding: 5, resource: { buffer: frame, size: 320 } },
        ] });
        const cameraGroup = device.createBindGroup({ layout: camera.worklistLayout, entries: [
          { binding: 0, resource: { buffer: b.worklist } }, { binding: 1, resource: { buffer: b.primaryControl } },
          { binding: 2, resource: { buffer: b.primaryConfig, size: 32 } },
        ] });
        const rayEncoder = device.createCommandEncoder(); rayEncoder.clearBuffer(rays);
        encodeAdaptiveCameraRays(rayEncoder, camera, rayGroup(rays), cameraGroup, b.dispatch, slot * 512, slot * 256);
        if (!item.veto) {
          const pass = rayEncoder.beginComputePass(); pass.setPipeline(dense); pass.setBindGroup(0, rayGroup(reference), [slot * 512]);
          pass.dispatchWorkgroups(Math.ceil(tile.width * tile.height / 64)); pass.end();
        }
        const bytes = Math.min(16384, Math.max(tile.width * tile.height, Math.ceil(count / 64) * 64 + 1)) * 96;
        rayEncoder.copyBufferToBuffer(rays, 0, staging, 0, bytes);
        if (!item.veto) rayEncoder.copyBufferToBuffer(reference, 0, staging, rays.size, bytes);
        device.queue.submit([rayEncoder.finish()]); await staging.mapAsync(GPUMapMode.READ); active();
        const actual = new Uint32Array(staging.getMappedRange(0, bytes));
        const expected = item.veto ? null : new Uint32Array(staging.getMappedRange(rays.size, bytes));
        const accepted = item.veto ? 0 : count;
        for (let index = 0; index < actual.length; index += 1) {
          const queueSlot = Math.floor(index / 24), word = index % 24;
          const wanted = queueSlot < accepted ? expected[ids[queueSlot] * 24 + word] : 0;
          check(actual[index] === wanted, `${item.name}: RayRecord differs at queue slot ${queueSlot}, word ${word}`);
        }
        for (let queueSlot = 0; queueSlot < accepted; queueSlot += 1) {
          const local = ids[queueSlot], source = (tile.y + Math.floor(local / tile.width)) * config.width + tile.x + local % tile.width;
          check(actual[queueSlot * 24] === local && actual[queueSlot * 24 + 2] === source && actual[queueSlot * 24 + 3] === (item.ordinal ?? 0), "Pixel/sample ownership differs");
        }
        staging.unmap(); comparedRays += accepted;
        results.push({ name: item.name, selectedPixelCount: count, comparedRays: accepted, bitwiseMismatchCount: 0, paddingUntouched: true, vetoed: Boolean(item.veto) });
      }
      const error = await device.popErrorScope(); active(); check(!error && errors.length === 0 && !deviceLost, error?.message ?? errors[0] ?? "GPU failure");
      Object.assign(receipt, { status: "passed", comparedRays, validationErrors: 0, unexpectedDeviceLoss: false,
        fixtureBufferBytes: allocated.reduce((sum, item) => sum + item.size, 0) });
    })(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("120-second deadline exceeded")), 120000); })]);
  } catch (error) { receipt.status = "failed"; receipt.reason = String(error.message).slice(0, 1500); }
  finally {
    cancelled = true; clearTimeout(timer); owner?.destroy(); allocated.forEach((item) => item.destroy()); device?.destroy();
    receipt.adaptiveBytesAfterCleanup = owner?.snapshot().allocatedBytes ?? 0;
    status.textContent = JSON.stringify(receipt, null, 2); button.disabled = false;
  }
});
