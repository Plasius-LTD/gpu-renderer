import { createAdaptiveResourceOwner, packAdaptivePixelState } from "/src/wavefront-adaptive-metadata.js";
import { createAdaptivePrimaryPipelines, packAdaptivePrimaryConfig, compactAdaptivePrimaryReference, encodeAdaptivePrimaryWorklist } from "/src/wavefront-adaptive-primary.js";
import { ADAPTIVE_PRIMARY_WGSL } from "/src/wavefront-adaptive-primary-shader.js";

const check = (condition, message) => { if (!condition) throw new Error(message); };
const status = document.querySelector("#result"), button = document.querySelector("#run");
const hash = async (value) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (byte) => byte.toString(16).padStart(2, "0")).join("");

async function readWords(device, source, size) {
  const copy = device.createBuffer({ size, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const staging = device.createBuffer({ size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  try {
    const module = device.createShaderModule({ code: `
      @group(0) @binding(0) var<storage, read> input: array<u32>;
      @group(0) @binding(1) var<storage, read_write> output: array<u32>;
      @compute @workgroup_size(64) fn copy_words(@builtin(global_invocation_id) id: vec3<u32>) {
        if (id.x < arrayLength(&output)) { output[id.x] = input[id.x]; }
      }` });
    const pipeline = await device.createComputePipelineAsync({ layout: "auto", compute: { module, entryPoint: "copy_words" } });
    const group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: source } }, { binding: 1, resource: { buffer: copy } },
    ] });
    const encoder = device.createCommandEncoder(); const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline); pass.setBindGroup(0, group); pass.dispatchWorkgroups(Math.ceil(size / 4 / 64)); pass.end();
    encoder.copyBufferToBuffer(copy, 0, staging, 0, size); device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ); return new Uint32Array(staging.getMappedRange().slice(0));
  } finally { staging.destroy(); copy.destroy(); }
}

button.addEventListener("click", async () => {
  button.disabled = true;
  let device, owner, visited, tinyWorklist, deadline, cancelled = false, unexpectedDeviceLoss = false;
  const active = () => check(!cancelled, "Cancelled");
  const results = [];
  const receipt = { status: "running", timestamp: new Date().toISOString(), userAgent: navigator.userAgent,
    shaderSha256: await hash(ADAPTIVE_PRIMARY_WGSL), fixtureSha256: await hash(await (await fetch(import.meta.url)).text()), results,
    scope: "worklist-compaction-and-indirect-identity-only" };
  try {
    await Promise.race([(async () => {
      const adapter = await navigator.gpu?.requestAdapter(); active();
      check(adapter?.info.isFallbackAdapter === false, "Physical adapter unavailable");
      receipt.adapter = { vendor: adapter.info.vendor, architecture: adapter.info.architecture, isFallbackAdapter: adapter.info.isFallbackAdapter };
      device = await adapter.requestDevice();
      if (cancelled) { device.destroy(); active(); }
      device.lost.then(({ reason }) => { if (reason !== "destroyed") unexpectedDeviceLoss = true; });
      owner = createAdaptiveResourceOwner(device, GPUBufferUsage, { enabled: true, width: 128, height: 128,
        primaryWorklist: true, primaryConfigSlots: 32 });
      const acquired = await owner.acquire(); active(); check(acquired.status === "ready", acquired.reason);
      receipt.adaptiveAllocatedBytes = acquired.allocatedBytes;
      const buffers = acquired.buffers;
      device.pushErrorScope("validation");
      const pipelines = await createAdaptivePrimaryPipelines(device, GPUShaderStage, { enabled: true }); active();
      const probeModule = device.createShaderModule({ code: `
        @group(0) @binding(0) var<storage, read> ids: array<u32>;
        @group(0) @binding(1) var<storage, read_write> seen: array<atomic<u32>>;
        @compute @workgroup_size(64) fn verify_indirect(@builtin(global_invocation_id) id: vec3<u32>) {
          if (id.x >= arrayLength(&ids)) { return; }
          let pixel = ids[id.x];
          if (pixel < arrayLength(&seen)) { atomicAdd(&seen[pixel], 1u); }
        }` });
      const probe = await device.createComputePipelineAsync({ layout: "auto", compute: { module: probeModule, entryPoint: "verify_indirect" } }); active();
      visited = device.createBuffer({ size: 16384 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      tinyWorklist = device.createBuffer({ size: 8, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      const base = { width: 128, height: 128, tileX: 0, tileY: 0, tileWidth: 128, tileHeight: 128, tier: 32 };
      const cases = [
        ...[1, 2, 4, 8, 16, 32, 64, 128, 256].map((tier) => ({ name: `full-${tier}`, config: { ...base, tier }, requested: tier })),
        { name: "empty", config: { ...base, tier: 128 }, requested: 32 },
        { name: "mixed-edge-tile", config: { ...base, tileX: 7, tileY: 11, tileWidth: 17, tileHeight: 9 }, mixed: true },
        { name: "zero-budget", config: base, corrupt: 0 },
        { name: "failed-pixel", config: base, corrupt: (32 | 0x80000000) >>> 0 },
        { name: "reused-tier", config: base, corrupt: packAdaptivePixelState({ requested: 32, completed: 1 }) },
        { name: "overflow", config: base, capacity: 2 },
        { name: "invalid-gpu-config", config: base, invalidConfig: true },
      ];
      for (const [slot, item] of cases.entries()) {
        active(); status.textContent = `Running ${item.name}`;
        const { config } = item;
        const words = new Uint32Array(16384).fill(packAdaptivePixelState({ requested: item.requested ?? 32 }));
        if (item.mixed) words.forEach((_, index) => { words[index] = packAdaptivePixelState({ requested: [2, 8, 32][index % 3] }); });
        if (item.corrupt !== undefined) words[0] = item.corrupt;
        const expected = compactAdaptivePrimaryReference(words, config, item.capacity ?? 16384);
        const bytes = packAdaptivePrimaryConfig(config);
        if (item.invalidConfig) new DataView(bytes).setUint32(28, 1, true);
        device.queue.writeBuffer(buffers.pixelState, 0, words);
        device.queue.writeBuffer(buffers.primaryConfig, slot * 256, bytes);
        const worklist = item.capacity === 2 ? tinyWorklist : buffers.worklist;
        const group = device.createBindGroup({ layout: pipelines.layout, entries: [
          { binding: 0, resource: { buffer: buffers.pixelState } }, { binding: 1, resource: { buffer: worklist } },
          { binding: 2, resource: { buffer: buffers.primaryControl } }, { binding: 3, resource: { buffer: buffers.dispatch } },
          { binding: 4, resource: { buffer: buffers.primaryConfig, size: 32 } },
        ] });
        const probeGroup = device.createBindGroup({ layout: probe.getBindGroupLayout(0), entries: [
          { binding: 0, resource: { buffer: worklist } }, { binding: 1, resource: { buffer: visited } },
        ] });
        const encoder = device.createCommandEncoder(); encoder.clearBuffer(visited);
        encodeAdaptivePrimaryWorklist(encoder, pipelines, group, slot * 256, config);
        const pass = encoder.beginComputePass(); pass.setPipeline(probe); pass.setBindGroup(0, probeGroup);
        pass.dispatchWorkgroupsIndirect(buffers.dispatch, 0); pass.end(); device.queue.submit([encoder.finish()]);
        const control = await readWords(device, buffers.primaryControl, 16); active();
        const dispatch = await readWords(device, buffers.dispatch, 12); active();
        const seen = await readWords(device, visited, 16384 * 4); active();
        const failed = expected.failed || item.invalidConfig === true;
        check((control[1] !== 0) === failed, `${item.name}: failure evidence differs`);
        check(dispatch[0] === (failed ? 0 : expected.dispatch[0]) && dispatch[1] === 1 && dispatch[2] === 1, `${item.name}: indirect arguments differ`);
        if (!failed) check(control[0] === expected.count, `${item.name}: count differs`);
        const selected = new Set(failed ? [] : expected.localPixelIds);
        seen.forEach((count, pixel) => check(count === (selected.has(pixel) ? 1 : 0), `${item.name}: duplicate/missing/wrong pixel ${pixel}`));
        const actualLocalPixelIds = failed || control[0] === 0 ? [] : Array.from(await readWords(device, worklist, control[0] * 4)); active();
        results.push({ name: item.name, count: control[0], failure: control[1], dispatch: Array.from(dispatch),
          uniqueVisitedPixels: selected.size, actualLocalPixelIds,
          expectedLocalAndSourceIds: failed ? [] : expected.localPixelIds.map((id, index) => [id, expected.sourcePixelIds[index]]) });
      }
      const error = await device.popErrorScope(); active(); check(!error, error?.message); check(!unexpectedDeviceLoss, "Unexpected device loss");
      receipt.validationErrors = 0; receipt.status = "passed";
    })(), new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error("120-second physical deadline exceeded")), 120000); })]);
  } catch (error) { receipt.status = "failed"; receipt.reason = String(error.message).slice(0, 1500); }
  finally {
    cancelled = true; clearTimeout(deadline); owner?.destroy(); visited?.destroy(); tinyWorklist?.destroy(); device?.destroy();
    receipt.allocatedBytesAfterCleanup = owner?.snapshot().allocatedBytes ?? 0;
    status.textContent = JSON.stringify({ ...receipt, results: results.map(({ actualLocalPixelIds: _ids, expectedLocalAndSourceIds: _expected, ...rest }) => rest) }, null, 2);
    const link = document.createElement("a"); link.textContent = "Download full worklist receipt";
    link.download = "task-169-primary-worklist.json";
    link.href = URL.createObjectURL(new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" }));
    document.body.append(link); button.disabled = false;
  }
});
