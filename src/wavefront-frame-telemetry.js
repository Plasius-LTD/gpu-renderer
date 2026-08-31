import { GPU_READBACK_COMPLETION_TIMEOUT_MS } from "./wavefront-core.js";
import { createBuffer } from "./wavefront-gpu-resources.js";

const TIMESTAMP_QUERY_COUNT = 2;
const TIMESTAMP_BUFFER_BYTES = TIMESTAMP_QUERY_COUNT * BigUint64Array.BYTES_PER_ELEMENT;

function hasGpuFeature(features, name) {
  if (typeof features?.has === "function") {
    return features.has(name);
  }
  if (features && typeof features[Symbol.iterator] === "function") {
    return Array.from(features).includes(name);
  }
  return false;
}

function freezeRayCountTelemetry(values = {}) {
  return Object.freeze({
    status: values.status ?? "not-requested",
    source: values.source ?? null,
    expectedPrimaryRays: values.expectedPrimaryRays ?? null,
    observedPrimaryRays: values.observedPrimaryRays ?? null,
    secondaryRays: values.secondaryRays ?? null,
    totalPathSegments: values.totalPathSegments ?? null,
    bounceHistogram: Object.freeze([...(values.bounceHistogram ?? [])]),
    capturedRayCounts: values.capturedRayCounts ?? 0,
    expectedRayCounts: values.expectedRayCounts ?? 0,
    reason: values.reason ?? null,
  });
}

export function createWavefrontRayCountTelemetry(values = {}) {
  return freezeRayCountTelemetry(values);
}

export function createWavefrontFrameTimingTelemetry(values = {}) {
  return Object.freeze({
    status: values.status ?? "not-requested",
    source: values.source ?? null,
    timestampQueryStatus: values.timestampQueryStatus ?? "not-recorded",
    totalGpuTimeMs: values.totalGpuTimeMs ?? null,
    totalRenderJobTimeMs: Math.max(0, Number(values.totalRenderJobTimeMs ?? 0)),
    classificationTimeMs: values.classificationTimeMs ?? null,
    compactionTimeMs: values.compactionTimeMs ?? null,
    samplingTimeMs: values.samplingTimeMs ?? null,
    reason: values.reason ?? null,
  });
}

function safeErrorReason(error) {
  return error instanceof Error && error.message
    ? error.message
    : "unknown-telemetry-readback-failure";
}

function timestampDurationMs(values) {
  if (values.length < TIMESTAMP_QUERY_COUNT || values[1] < values[0]) {
    return null;
  }
  const durationNanoseconds = values[1] - values[0];
  const durationMs = Number(durationNanoseconds) / 1_000_000;
  return Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : null;
}

export function createWavefrontFrameTelemetryResources({
  device,
  constants,
  maxRayCountRecords,
}) {
  const rayRecordCapacity = Math.max(1, Math.trunc(Number(maxRayCountRecords) || 1));
  const rayBufferBytes = rayRecordCapacity * Uint32Array.BYTES_PER_ELEMENT;
  const mapMode = constants.map;
  if (!mapMode || typeof mapMode.READ !== "number") {
    return Object.freeze({
      available: false,
      reason: "gpu-map-read-unavailable",
      memoryBytes: 0,
      beginFrame() {},
      recordActiveRayCount() {},
      decorateFirstPass(descriptor) {
        return descriptor;
      },
      decorateFinalPass(descriptor) {
        return descriptor;
      },
      async readFrame({ expectedPrimaryRays = 0, expectedRayCounts = 0 } = {}) {
        return Object.freeze({
          rayCounts: freezeRayCountTelemetry({
            status: "unavailable",
            expectedPrimaryRays,
            expectedRayCounts,
            reason: "gpu-map-read-unavailable",
          }),
          timestampQueryStatus: "unsupported",
          totalGpuTimeMs: null,
          reason: "gpu-map-read-unavailable",
        });
      },
      destroy() {},
    });
  }

  const rayCountBuffer = createBuffer(
    device,
    constants.buffer.COPY_DST | constants.buffer.COPY_SRC,
    rayBufferBytes,
    "plasius.wavefront.rayCounts"
  );
  const rayCountReadbackBuffer = createBuffer(
    device,
    constants.buffer.COPY_DST | constants.buffer.MAP_READ,
    rayBufferBytes,
    "plasius.wavefront.rayCounts.readback"
  );

  const timestampFeatureAvailable = hasGpuFeature(device?.features, "timestamp-query");
  const timestampApiAvailable =
    timestampFeatureAvailable &&
    typeof device.createQuerySet === "function" &&
    typeof constants.buffer.QUERY_RESOLVE === "number";
  let timestampQuerySet = null;
  let timestampResolveBuffer = null;
  let timestampReadbackBuffer = null;
  let timestampSetupReason = timestampFeatureAvailable
    ? "timestamp-query-api-unavailable"
    : "timestamp-query-unsupported";
  if (timestampApiAvailable) {
    try {
      timestampQuerySet = device.createQuerySet({
        label: "plasius.wavefront.timestamps",
        type: "timestamp",
        count: TIMESTAMP_QUERY_COUNT,
      });
      timestampResolveBuffer = createBuffer(
        device,
        constants.buffer.QUERY_RESOLVE | constants.buffer.COPY_SRC,
        TIMESTAMP_BUFFER_BYTES,
        "plasius.wavefront.timestamps.resolve"
      );
      timestampReadbackBuffer = createBuffer(
        device,
        constants.buffer.COPY_DST | constants.buffer.MAP_READ,
        TIMESTAMP_BUFFER_BYTES,
        "plasius.wavefront.timestamps.readback"
      );
      timestampSetupReason = null;
    } catch (error) {
      timestampQuerySet?.destroy?.();
      timestampQuerySet = null;
      timestampResolveBuffer?.destroy?.();
      timestampResolveBuffer = null;
      timestampReadbackBuffer?.destroy?.();
      timestampReadbackBuffer = null;
      timestampSetupReason = `timestamp-query-setup-failed:${safeErrorReason(error)}`;
    }
  }
  const timestampUnavailableStatus = timestampSetupReason?.startsWith(
    "timestamp-query-setup-failed:"
  )
    ? "failed"
    : "unsupported";

  let active = false;
  let recordCount = 0;
  let recordOverflow = false;
  let bounceIndices = [];
  let timestampStarted = false;
  let timestampEnded = false;
  let rayReadbackMapped = false;
  let timestampReadbackMapped = false;

  const memoryBytes =
    rayBufferBytes * 2 +
    (timestampQuerySet ? TIMESTAMP_BUFFER_BYTES * 2 : 0);

  function beginFrame() {
    active = true;
    recordCount = 0;
    recordOverflow = false;
    bounceIndices = [];
    timestampStarted = false;
    timestampEnded = false;
  }

  function recordActiveRayCount(encoder, counterBuffer, bounceIndex) {
    if (!active) {
      return;
    }
    if (recordCount >= rayRecordCapacity) {
      recordOverflow = true;
      return;
    }
    encoder.copyBufferToBuffer(
      counterBuffer,
      0,
      rayCountBuffer,
      recordCount * Uint32Array.BYTES_PER_ELEMENT,
      Uint32Array.BYTES_PER_ELEMENT
    );
    bounceIndices.push(Math.max(0, Math.trunc(Number(bounceIndex) || 0)));
    recordCount += 1;
  }

  function decorateFirstPass(descriptor) {
    if (!active || !timestampQuerySet || timestampStarted) {
      return descriptor;
    }
    timestampStarted = true;
    return {
      ...descriptor,
      timestampWrites: {
        querySet: timestampQuerySet,
        beginningOfPassWriteIndex: 0,
      },
    };
  }

  function decorateFinalPass(descriptor) {
    if (!active || !timestampQuerySet || !timestampStarted || timestampEnded) {
      return descriptor;
    }
    timestampEnded = true;
    return {
      ...descriptor,
      timestampWrites: {
        querySet: timestampQuerySet,
        endOfPassWriteIndex: 1,
      },
    };
  }

  async function readFrame({
    expectedPrimaryRays = 0,
    expectedRayCounts = recordCount,
    waitForSubmittedGpuWork,
  } = {}) {
    active = false;
    if (recordOverflow || recordCount !== expectedRayCounts) {
      return Object.freeze({
        rayCounts: freezeRayCountTelemetry({
          status: "failed",
          expectedPrimaryRays,
          capturedRayCounts: recordCount,
          expectedRayCounts,
          reason: recordOverflow
            ? "ray-count-record-capacity-exceeded"
            : `ray-count-record-mismatch:${recordCount}/${expectedRayCounts}`,
        }),
        timestampQueryStatus: timestampQuerySet ? "failed" : timestampUnavailableStatus,
        totalGpuTimeMs: null,
        reason: "ray-count-recording-incomplete",
      });
    }

    const encoder = device.createCommandEncoder({
      label: "plasius.wavefront.telemetry.readback",
    });
    const rayCopyBytes = Math.max(
      Uint32Array.BYTES_PER_ELEMENT,
      recordCount * Uint32Array.BYTES_PER_ELEMENT
    );
    encoder.copyBufferToBuffer(rayCountBuffer, 0, rayCountReadbackBuffer, 0, rayCopyBytes);
    const canResolveTimestamps =
      timestampQuerySet &&
      timestampStarted &&
      timestampEnded &&
      typeof encoder.resolveQuerySet === "function";
    if (canResolveTimestamps) {
      encoder.resolveQuerySet(
        timestampQuerySet,
        0,
        TIMESTAMP_QUERY_COUNT,
        timestampResolveBuffer,
        0
      );
      encoder.copyBufferToBuffer(
        timestampResolveBuffer,
        0,
        timestampReadbackBuffer,
        0,
        TIMESTAMP_BUFFER_BYTES
      );
    }
    device.queue.submit([encoder.finish()]);

    try {
      await waitForSubmittedGpuWork({
        timeoutMs: GPU_READBACK_COMPLETION_TIMEOUT_MS,
        allowTimeout: false,
      });
      await rayCountReadbackBuffer.mapAsync(mapMode.READ);
      rayReadbackMapped = true;
      const rayCopy = rayCountReadbackBuffer
        .getMappedRange()
        .slice(0, rayCopyBytes);
      const rayCounts = new Uint32Array(rayCopy, 0, recordCount);
      rayCountReadbackBuffer.unmap();
      rayReadbackMapped = false;

      let maximumBounceIndex = 0;
      for (const bounceIndex of bounceIndices) {
        maximumBounceIndex = Math.max(maximumBounceIndex, bounceIndex);
      }
      const bounceHistogram = Array.from({ length: maximumBounceIndex + 1 }, () => 0);
      let observedPrimaryRays = 0;
      let secondaryRays = 0;
      let totalPathSegments = 0;
      for (let index = 0; index < rayCounts.length; index += 1) {
        const count = Number(rayCounts[index] ?? 0);
        const bounceIndex = bounceIndices[index] ?? 0;
        bounceHistogram[bounceIndex] = (bounceHistogram[bounceIndex] ?? 0) + count;
        totalPathSegments += count;
        if (bounceIndex === 0) {
          observedPrimaryRays += count;
        } else {
          secondaryRays += count;
        }
      }
      const primaryCountsMatch = observedPrimaryRays === expectedPrimaryRays;
      const rayTelemetry = freezeRayCountTelemetry({
        status: primaryCountsMatch ? "available" : "failed",
        source: "gpu-active-queue-readback",
        expectedPrimaryRays,
        observedPrimaryRays,
        secondaryRays: primaryCountsMatch ? secondaryRays : null,
        totalPathSegments: primaryCountsMatch ? totalPathSegments : null,
        bounceHistogram,
        capturedRayCounts: recordCount,
        expectedRayCounts,
        reason: primaryCountsMatch
          ? null
          : `primary-ray-count-mismatch:${observedPrimaryRays}/${expectedPrimaryRays}`,
      });

      let timestampQueryStatus = timestampQuerySet ? "failed" : timestampUnavailableStatus;
      let totalGpuTimeMs = null;
      let timestampReason = timestampSetupReason;
      if (canResolveTimestamps) {
        try {
          await timestampReadbackBuffer.mapAsync(mapMode.READ);
          timestampReadbackMapped = true;
          const timestampCopy = timestampReadbackBuffer
            .getMappedRange()
            .slice(0, TIMESTAMP_BUFFER_BYTES);
          const timestamps = new BigUint64Array(timestampCopy);
          timestampReadbackBuffer.unmap();
          timestampReadbackMapped = false;
          totalGpuTimeMs = timestampDurationMs(timestamps);
          timestampQueryStatus = totalGpuTimeMs === null ? "failed" : "available";
          timestampReason =
            totalGpuTimeMs === null ? "timestamp-query-returned-invalid-range" : null;
        } catch (error) {
          if (timestampReadbackMapped) {
            timestampReadbackBuffer.unmap();
            timestampReadbackMapped = false;
          }
          timestampQueryStatus = "failed";
          timestampReason = `timestamp-query-readback-failed:${safeErrorReason(error)}`;
        }
      } else if (timestampQuerySet) {
        timestampReason = "timestamp-query-span-incomplete";
      }

      return Object.freeze({
        rayCounts: rayTelemetry,
        timestampQueryStatus,
        totalGpuTimeMs,
        reason: timestampReason,
      });
    } catch (error) {
      if (rayReadbackMapped) {
        rayCountReadbackBuffer.unmap();
        rayReadbackMapped = false;
      }
      if (timestampReadbackMapped) {
        timestampReadbackBuffer?.unmap();
        timestampReadbackMapped = false;
      }
      const reason = safeErrorReason(error);
      return Object.freeze({
        rayCounts: freezeRayCountTelemetry({
          status: "failed",
          expectedPrimaryRays,
          capturedRayCounts: recordCount,
          expectedRayCounts,
          reason: `ray-count-readback-failed:${reason}`,
        }),
        timestampQueryStatus: timestampQuerySet ? "failed" : timestampUnavailableStatus,
        totalGpuTimeMs: null,
        reason: `telemetry-readback-failed:${reason}`,
      });
    }
  }

  function destroy() {
    active = false;
    rayCountBuffer.destroy?.();
    rayCountReadbackBuffer.destroy?.();
    timestampQuerySet?.destroy?.();
    timestampResolveBuffer?.destroy?.();
    timestampReadbackBuffer?.destroy?.();
  }

  return Object.freeze({
    available: true,
    reason: null,
    memoryBytes,
    beginFrame,
    recordActiveRayCount,
    decorateFirstPass,
    decorateFinalPass,
    readFrame,
    destroy,
  });
}
