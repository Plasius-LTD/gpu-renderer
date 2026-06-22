import {
  COUNTER_BUFFER_BYTES,
  COUNTER_TERMINATION_AMBIENT_LUMINANCE_OFFSET,
  COUNTER_TERMINATION_AMBIENT_MAX_DEPTH_OFFSET,
  COUNTER_TERMINATION_EMISSIVE_OFFSET,
  COUNTER_TERMINATION_ENVIRONMENT_OFFSET,
  COUNTER_TERMINATION_QUEUE_OVERFLOW_OFFSET,
  COUNTER_TERMINATION_TOTAL_LUMINANCE_OFFSET,
  EMPTY_TERMINATION_METRICS,
  GPU_READBACK_COMPLETION_TIMEOUT_MS,
  TERMINATION_LUMINANCE_SCALE,
  clamp,
  readNonNegativeInteger,
} from "./wavefront-core.js";

export async function readWavefrontTerminationMetrics({
  device,
  constants,
  counterBuffer,
  waitForSubmittedGpuWork,
}) {
  const mapMode = constants.map;
  if (!mapMode) {
    return EMPTY_TERMINATION_METRICS;
  }
  const readback = device.createBuffer({
    label: "plasius.wavefront.terminationMetrics",
    size: COUNTER_BUFFER_BYTES,
    usage: constants.buffer.COPY_DST | constants.buffer.MAP_READ,
  });
  await waitForSubmittedGpuWork({
    timeoutMs: GPU_READBACK_COMPLETION_TIMEOUT_MS,
    allowTimeout: false,
  });
  const encoder = device.createCommandEncoder({
    label: "plasius.wavefront.terminationMetrics.copy",
  });
  encoder.copyBufferToBuffer(counterBuffer, 0, readback, 0, COUNTER_BUFFER_BYTES);
  device.queue.submit([encoder.finish()]);
  await waitForSubmittedGpuWork({
    timeoutMs: GPU_READBACK_COMPLETION_TIMEOUT_MS,
    allowTimeout: false,
  });
  await readback.mapAsync(mapMode.READ);
  const countersView = new Uint32Array(readback.getMappedRange().slice(0));
  readback.unmap();
  readback.destroy?.();
  const emissive = countersView[COUNTER_TERMINATION_EMISSIVE_OFFSET] ?? 0;
  const environment = countersView[COUNTER_TERMINATION_ENVIRONMENT_OFFSET] ?? 0;
  const maxDepth = countersView[COUNTER_TERMINATION_AMBIENT_MAX_DEPTH_OFFSET] ?? 0;
  const queueOverflow = countersView[COUNTER_TERMINATION_QUEUE_OVERFLOW_OFFSET] ?? 0;
  const ambientResidualLuminance =
    (countersView[COUNTER_TERMINATION_AMBIENT_LUMINANCE_OFFSET] ?? 0) /
    TERMINATION_LUMINANCE_SCALE;
  const totalLuminance =
    (countersView[COUNTER_TERMINATION_TOTAL_LUMINANCE_OFFSET] ?? 0) /
    TERMINATION_LUMINANCE_SCALE;
  const ambientResidualShare =
    totalLuminance > 0 ? ambientResidualLuminance / totalLuminance : 0;
  return Object.freeze({
    termination: Object.freeze({
      emissive,
      environment,
      ambientFallback: maxDepth + queueOverflow,
      maxDepth,
    }),
    queueOverflow,
    terminalRadiance: Object.freeze({
      totalLuminance,
      ambientResidualLuminance,
      ambientResidualShare,
    }),
  });
}

export async function readWavefrontOutputProbe({
  device,
  constants,
  config,
  outputTexture,
  waitForSubmittedGpuWork,
  optionsForProbe = {},
}) {
  const mapMode = constants.map;
  if (!mapMode) {
    throw new Error("GPUMapMode.READ is unavailable in this environment.");
  }
  const x = clamp(
    readNonNegativeInteger("x", optionsForProbe.x, Math.floor(config.width / 2)),
    0,
    config.width - 1
  );
  const y = clamp(
    readNonNegativeInteger("y", optionsForProbe.y, Math.floor(config.height / 2)),
    0,
    config.height - 1
  );
  const readback = device.createBuffer({
    label: "plasius.wavefront.outputProbe",
    size: 256,
    usage: constants.buffer.COPY_DST | constants.buffer.MAP_READ,
  });
  await waitForSubmittedGpuWork({
    timeoutMs: GPU_READBACK_COMPLETION_TIMEOUT_MS,
    allowTimeout: false,
  });
  const encoder = device.createCommandEncoder({
    label: "plasius.wavefront.outputProbe.copy",
  });
  encoder.copyTextureToBuffer(
    { texture: outputTexture, origin: { x, y } },
    { buffer: readback, bytesPerRow: 256, rowsPerImage: 1 },
    { width: 1, height: 1, depthOrArrayLayers: 1 }
  );
  device.queue.submit([encoder.finish()]);
  await waitForSubmittedGpuWork({
    timeoutMs: GPU_READBACK_COMPLETION_TIMEOUT_MS,
    allowTimeout: false,
  });
  await readback.mapAsync(mapMode.READ);
  const bytes = new Uint8Array(readback.getMappedRange()).slice(0, 4);
  readback.unmap();
  readback.destroy?.();
  return Object.freeze({
    x,
    y,
    rgba: Object.freeze(Array.from(bytes)),
    luminance: (0.2126 * bytes[0] + 0.7152 * bytes[1] + 0.0722 * bytes[2]) / 255,
  });
}
