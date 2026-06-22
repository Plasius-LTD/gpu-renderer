import { createGpuSubmissionBatcher } from "./wavefront-frame-runtime.js";
import {
  clamp,
  readNonNegativeInteger,
  readPositiveInteger,
} from "./wavefront-core.js";

export function dispatchWavefrontFrame({
  config,
  tiles,
  device,
  frameIndex,
  parallelism,
  renderedSamplesPerPixel = config.samplesPerPixel,
  frameEncoder,
  createFrameConfigWriter,
}) {
  const writeFrameConfig = createFrameConfigWriter(frameIndex);
  const batch = createGpuSubmissionBatcher({
    device,
    frameIndex,
    maxFramePassesPerSubmission: config.maxFramePassesPerSubmission,
  });

  for (const tile of tiles) {
    for (let sampleIndex = 0; sampleIndex < renderedSamplesPerPixel; sampleIndex += 1) {
      const configOffset = writeFrameConfig(tile, {
        sampleIndex,
        sampleWeight: 1 / renderedSamplesPerPixel,
      });
      frameEncoder.encodeTileSample(
        batch.reserve(config.maxDepth + 1),
        tile,
        configOffset,
        parallelism
      );
      if (config.deferredPathResolve) {
        frameEncoder.encodeTileOutput(batch.reserve(1), tile, configOffset, parallelism);
      }
    }
    if (!config.deferredPathResolve) {
      const outputConfigOffset = writeFrameConfig(tile, {
        sampleIndex: 0,
        sampleWeight: 1 / renderedSamplesPerPixel,
      });
      frameEncoder.encodeTileOutput(batch.reserve(1), tile, outputConfigOffset, parallelism);
    }
  }
  if (config.denoise) {
    const denoiseConfigOffset = writeFrameConfig(
      { x: 0, y: 0, width: config.width, height: config.height },
      { sampleIndex: 0, sampleWeight: 1 / renderedSamplesPerPixel }
    );
    const denoisePassCount = renderedSamplesPerPixel < 4 ? 2 : 1;
    frameEncoder.encodeDenoise(
      batch.reserve(denoisePassCount),
      denoiseConfigOffset,
      parallelism,
      renderedSamplesPerPixel
    );
  }
  frameEncoder.encodePresent(batch.reserve(1));
  return batch.flush();
}

export function dispatchWavefrontFrameAwaitingGpu({
  config,
  tiles,
  device,
  frameIndex,
  parallelism,
  renderedSamplesPerPixel = config.samplesPerPixel,
  frameEncoder,
  writeFrameConfigSlot,
  optionsForFrame = {},
}) {
  const samplePassesPerSample = config.maxDepth + 1 + (config.deferredPathResolve ? 1 : 0);
  const denoisePassCount = config.denoise ? (renderedSamplesPerPixel < 4 ? 2 : 1) : 0;
  const tailPassCount = denoisePassCount + 1;
  const sampleBatchSize = Math.max(
    1,
    Math.floor(
      Math.max(config.maxFramePassesPerSubmission - tailPassCount, 1) /
      Math.max(samplePassesPerSample, 1)
    )
  );
  const sampleRangeStart = clamp(
    readNonNegativeInteger("sampleRangeStart", optionsForFrame.sampleRangeStart, 0),
    0,
    renderedSamplesPerPixel
  );
  const sampleRangeEnd = clamp(
    readPositiveInteger("sampleRangeEnd", optionsForFrame.sampleRangeEnd, renderedSamplesPerPixel),
    sampleRangeStart,
    renderedSamplesPerPixel
  );
  const includeDenoise = optionsForFrame.includeDenoise === true;
  const includePresent = optionsForFrame.includePresent === true;
  const tileStartIndex = clamp(
    readNonNegativeInteger("tileStartIndex", optionsForFrame.tileStartIndex, 0),
    0,
    tiles.length
  );
  const tileEndIndex = clamp(
    readPositiveInteger("tileEndIndex", optionsForFrame.tileEndIndex, tiles.length),
    tileStartIndex,
    tiles.length
  );
  let submissionCount = Math.max(
    0,
    readNonNegativeInteger("startingSubmissionCount", optionsForFrame.startingSubmissionCount, 0)
  );
  let slot = Math.max(0, readNonNegativeInteger("startingSlot", optionsForFrame.startingSlot, 0));

  for (const tile of tiles.slice(tileStartIndex, tileEndIndex)) {
    for (
      let sampleStart = sampleRangeStart;
      sampleStart < sampleRangeEnd;
      sampleStart += sampleBatchSize
    ) {
      const sampleEnd = Math.min(sampleRangeEnd, sampleStart + sampleBatchSize);
      const batch = createGpuSubmissionBatcher({
        device,
        frameIndex,
        maxFramePassesPerSubmission: config.maxFramePassesPerSubmission,
        startingSubmissionCount: submissionCount,
      });
      for (let sampleIndex = sampleStart; sampleIndex < sampleEnd; sampleIndex += 1) {
        const configOffset = writeFrameConfigSlot(slot, tile, frameIndex, {
          sampleIndex,
          sampleWeight: 1 / renderedSamplesPerPixel,
        });
        slot += 1;
        frameEncoder.encodeTileSample(
          batch.reserve(config.maxDepth + 1),
          tile,
          configOffset,
          parallelism
        );
        if (config.deferredPathResolve) {
          frameEncoder.encodeTileOutput(batch.reserve(1), tile, configOffset, parallelism);
        }
      }
      if (!config.deferredPathResolve && sampleRangeEnd >= renderedSamplesPerPixel) {
        const outputConfigOffset = writeFrameConfigSlot(slot, tile, frameIndex, {
          sampleIndex: 0,
          sampleWeight: 1 / renderedSamplesPerPixel,
        });
        slot += 1;
        frameEncoder.encodeTileOutput(batch.reserve(1), tile, outputConfigOffset, parallelism);
      }
      batch.flush();
      submissionCount += batch.getSubmissionCount();
    }
  }

  if (includeDenoise || includePresent) {
    const tail = createGpuSubmissionBatcher({
      device,
      frameIndex,
      maxFramePassesPerSubmission: config.maxFramePassesPerSubmission,
      startingSubmissionCount: submissionCount,
    });
    if (includeDenoise && config.denoise) {
      const denoiseConfigOffset = writeFrameConfigSlot(
        slot,
        { x: 0, y: 0, width: config.width, height: config.height },
        frameIndex,
        { sampleIndex: 0, sampleWeight: 1 / renderedSamplesPerPixel }
      );
      slot += 1;
      frameEncoder.encodeDenoise(
        tail.reserve(denoisePassCount),
        denoiseConfigOffset,
        parallelism,
        renderedSamplesPerPixel
      );
    }
    if (includePresent) {
      frameEncoder.encodePresent(tail.reserve(1));
    }
    tail.flush();
    submissionCount += tail.getSubmissionCount();
  }
  return Object.freeze({
    submissionCount,
    slot,
  });
}
