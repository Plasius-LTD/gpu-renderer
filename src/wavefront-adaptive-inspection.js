import {
  createAdaptiveResourceOwner,
  DEFAULT_ADAPTIVE_ALLOCATION_CAP_BYTES,
} from "./wavefront-adaptive-metadata.js";
import {
  createSharedAdaptivePipelines,
  packSharedPhase,
  encodeSharedPhase,
  encodeSharedSample,
} from "./wavefront-adaptive-shared.js";
import { createAdaptiveTileOutputPipelines } from "./wavefront-adaptive-tile-output.js";
import { createConfigPayload } from "./wavefront-packers.js";
import { createGpuParallelismCounters } from "./wavefront-frame-runtime.js";
import {
  prepareAdaptiveFrame,
  inspectAdaptiveTileCounts,
} from "./wavefront-adaptive-inspection-contract.js";

// Canonical owned resources, never GPU interception or fixture imports.
export function createAdaptiveInspectionRuntime(c) {
  const {
    device,
    constants,
    getConfig,
    configBuffer,
    activeQueue,
    counterBuffer,
    pathVertexBuffer,
    frameEncoder,
    radianceView,
    outputView,
    buildAcceleration,
    waitForGpu,
  } = c;
  const { width, height } = getConfig(),
    readbackBytes = 16384 * 4;
  const owner = createAdaptiveResourceOwner(device, constants.buffer, {
    enabled: true,
    width,
    height,
    tilePixelCapacity: 16384,
    readback: true,
    primaryWorklist: true,
    primaryConfigSlots: 256,
    countResolve: true,
    resolveConfigSlots: 1,
    maximumAllocationBytes:
      DEFAULT_ADAPTIVE_ALLOCATION_CAP_BYTES - readbackBytes * 2 - 16,
  });
  let resources,
    shared,
    output,
    sharedGroup,
    phaseGroup,
    outputGroup,
    gatherGroup,
    gathered,
    staging,
    pending,
    disposed = false,
    busy = false;
  const active = (signal) => {
    if (disposed) throw new Error("Adaptive renderer disposed.");
    signal?.throwIfAborted();
  };
  const group = (layout, entries) =>
    device.createBindGroup({
      layout,
      entries: entries.map(([binding, buffer, size]) => ({
        binding,
        resource: { buffer, ...(size ? { size } : {}) },
      })),
    });
  async function deadline(promise) {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Adaptive GPU operation timed out.")),
            60000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  async function initialize() {
    try {
      resources = await owner.acquire();
      active();
      if (resources.status !== "ready") throw new Error(resources.reason);
      const b = resources.buffers;
      shared = await createSharedAdaptivePipelines(device, constants.shader, {
        enabled: true,
        progressiveSampling: "stable-pattern",
        roughBounceSplitting: getConfig().roughBounceSplitting,
      });
      active();
      output = await createAdaptiveTileOutputPipelines(
        device,
        constants.shader,
        { enabled: true },
      );
      active();
      const entries = [
        [0, configBuffer, 320],
        [1, b.primaryConfig, 32],
        [2, b.pixelState],
        [3, b.worklist],
        [4, b.primaryControl],
        [5, b.dispatch],
        [6, activeQueue],
        [7, pathVertexBuffer],
        [8, counterBuffer],
        [9, b.radianceSums],
        [10, b.resolvedRadiance],
      ];
      sharedGroup = group(
        shared.layout,
        entries.filter(([binding]) => binding !== 5),
      );
      phaseGroup = group(shared.phaseLayout, entries);
      gathered = device.createBuffer({
        label: "adaptive-inspection-counts",
        size: readbackBytes,
        usage: constants.buffer.STORAGE | constants.buffer.COPY_SRC,
      });
      staging = device.createBuffer({
        label: "adaptive-inspection-readback",
        size: readbackBytes + 16,
        usage: constants.buffer.MAP_READ | constants.buffer.COPY_DST,
      });
      outputGroup = device.createBindGroup({
        layout: output.outputLayout,
        entries: [
          { binding: 0, resource: { buffer: b.resolvedRadiance } },
          { binding: 1, resource: radianceView },
          { binding: 2, resource: outputView },
          { binding: 3, resource: { buffer: configBuffer, size: 320 } },
        ],
      });
      gatherGroup = group(output.gatherLayout, [
        [3, configBuffer, 320],
        [4, b.pixelState],
        [5, gathered],
      ]);
    } catch (error) {
      destroy();
      throw error;
    }
  }
  function destroy() {
    if (disposed) return;
    disposed = true;
    owner.destroy();
    gathered?.destroy();
    staging?.destroy();
  }
  async function render({ budgets, signal, onProgress = () => {} } = {}) {
    active(signal);
    if (busy) throw new Error("Adaptive render already in progress.");
    const config = getConfig(),
      plan = prepareAdaptiveFrame(config, { budgets });
    busy = true;
    let scoped = false;
    try {
      pending ??= initialize();
      await deadline(pending);
      active(signal);
      device.pushErrorScope("validation");
      scoped = true;
      const b = resources.buffers,
        parallelism = createGpuParallelismCounters();
      const frameIndex = 7; // Same stable absolute prefix as the linked diagnostic.
      buildAcceleration(frameIndex, parallelism);
      await waitForGpu();
      active(signal);
      device.queue.writeBuffer(b.pixelState, 0, Uint32Array.from(plan.budgets));
      let completedSamples = 0,
        minimum = 256,
        maximum = 0;
      for (const [index, item] of plan.tiles.entries()) {
        active(signal);
        const { tile, ranges } = item,
          samples = ranges.at(-1).sampleLimit;
        const batch = new Uint8Array(
          samples * config.memory.configBufferStride,
        );
        for (let ordinal = 0; ordinal < samples; ordinal++)
          batch.set(
            new Uint8Array(
              createConfigPayload(config, tile, frameIndex, {
                sampleIndex: ordinal,
                sampleWeight: 1,
              }),
            ),
            ordinal * config.memory.configBufferStride,
          );
        device.queue.writeBuffer(configBuffer, 0, batch);
        const phases = new Uint8Array(ranges.length * 256);
        for (const [i, range] of ranges.entries())
          phases.set(
            new Uint8Array(
              packSharedPhase({
                width,
                height,
                tileX: tile.x,
                tileY: tile.y,
                tileWidth: tile.width,
                tileHeight: tile.height,
                ...range,
              }),
            ),
            i * 256,
          );
        device.queue.writeBuffer(b.primaryConfig, 0, phases);
        const encoder = device.createCommandEncoder(),
          request = {
            pipelines: shared,
            bindGroup: sharedGroup,
            phaseBindGroup: phaseGroup,
            tile,
            dispatchBuffer: b.dispatch,
            counterBuffer,
            frameEncoder,
            parallelism,
          };
        for (const [i, range] of ranges.entries()) {
          encodeSharedPhase(encoder, {
            ...request,
            frameOffset: range.firstSample * config.memory.configBufferStride,
            phaseOffset: i * 256,
          });
          for (
            let ordinal = range.firstSample;
            ordinal < range.sampleLimit;
            ordinal++
          )
            encodeSharedSample(encoder, {
              ...request,
              frameOffset: ordinal * config.memory.configBufferStride,
              phaseOffset: i * 256,
            });
        }
        const lastOffset = (samples - 1) * config.memory.configBufferStride,
          groups = Math.ceil((tile.width * tile.height) / 64);
        const resolve = encoder.beginComputePass({
          label: "adaptive-inspection-resolve",
        });
        resolve.setPipeline(shared.resolve);
        resolve.setBindGroup(0, sharedGroup, [
          lastOffset,
          (ranges.length - 1) * 256,
        ]);
        resolve.dispatchWorkgroups(groups);
        resolve.end();
        const gather = encoder.beginComputePass({
          label: "adaptive-inspection-verify",
        });
        gather.setPipeline(output.gather);
        gather.setBindGroup(0, gatherGroup, [lastOffset]);
        gather.dispatchWorkgroups(groups);
        gather.end();
        const bytes = tile.width * tile.height * 4;
        encoder.copyBufferToBuffer(gathered, 0, staging, 0, bytes);
        encoder.copyBufferToBuffer(b.primaryControl, 0, staging, bytes, 16);
        device.queue.submit([encoder.finish()]);
        await waitForGpu();
        active(signal);
        await deadline(staging.mapAsync(constants.map.READ, 0, bytes + 16));
        let counts;
        try {
          active(signal);
          const words = new Uint32Array(staging.getMappedRange(0, bytes + 16));
          if (words[bytes / 4 + 1] !== 0)
            throw new Error("Adaptive control rejected the tile.");
          counts = inspectAdaptiveTileCounts(
            words.subarray(0, bytes / 4),
            tile,
            width,
            plan.budgets,
          );
        } finally {
          staging.unmap();
        }
        completedSamples += counts.samples;
        minimum = Math.min(minimum, counts.minimum);
        maximum = Math.max(maximum, counts.maximum);
        const publish = device.createCommandEncoder(),
          pass = publish.beginComputePass({
            label: "adaptive-inspection-output",
          });
        pass.setPipeline(output.output);
        pass.setBindGroup(0, outputGroup, [lastOffset]);
        pass.dispatchWorkgroups(groups);
        pass.end();
        frameEncoder.encodePresent(publish);
        device.queue.submit([publish.finish()]);
        await waitForGpu();
        active(signal);
        onProgress(
          Object.freeze({
            completedTiles: index + 1,
            totalTiles: plan.tiles.length,
            completedSamples,
            targetSamples: plan.totalSamples,
            meanSpp: plan.meanSpp,
            minimumSpp: minimum,
            maximumSpp: maximum,
          }),
        );
      }
      if (config.denoise) {
        const offset = 0;
        device.queue.writeBuffer(
          configBuffer,
          offset,
          createConfigPayload(
            config,
            { x: 0, y: 0, width, height },
            frameIndex,
          ),
        );
        const encoder = device.createCommandEncoder();
        frameEncoder.encodeDenoise(encoder, offset, parallelism, minimum);
        frameEncoder.encodePresent(encoder);
        device.queue.submit([encoder.finish()]);
        await waitForGpu();
        active(signal);
      }
      const validation = await device.popErrorScope();
      scoped = false;
      if (validation) throw new Error(validation.message);
      return Object.freeze({
        completedSamples,
        meanSpp: completedSamples / (width * height),
        minimumSpp: minimum,
        maximumSpp: maximum,
        completedTiles: plan.tiles.length,
        totalTiles: plan.tiles.length,
        width,
        height,
        adaptiveBufferBytes: resources.allocatedBytes + readbackBytes * 2 + 16,
      });
    } catch (error) {
      if (!signal?.aborted) destroy();
      throw error;
    } finally {
      try {
        if (scoped) await device.popErrorScope();
      } finally {
        busy = false;
      }
    }
  }
  return Object.freeze({
    render,
    destroy,
    get busy() {
      return busy;
    },
  });
}
