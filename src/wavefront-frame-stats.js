import { createGpuParallelismDiagnostics } from "./wavefront-frame-runtime.js";
import { createEnvironmentMapSnapshot } from "./wavefront-runtime-support.js";
import {
  clamp,
  readPositiveInteger,
} from "./wavefront-core.js";
import {
  createWavefrontFrameTimingTelemetry,
  createWavefrontRayCountTelemetry,
} from "./wavefront-frame-telemetry.js";

export function resolveWavefrontRenderedSamplesPerPixel({
  config,
  renderOptions = {},
  awaitGPUCompletion = true,
  lastCompletedFrameTimeMs = null,
  lastCompletedSamplesPerPixel = 1,
}) {
  const targetSamplesPerPixel = clamp(
    readPositiveInteger(
      "samplesPerPixel",
      renderOptions.samplesPerPixel,
      config.samplesPerPixel
    ),
    1,
    config.samplesPerPixel
  );
  const frameTimeBudgetMs = Number.isFinite(renderOptions.frameTimeBudgetMs)
    ? Math.max(0, Number(renderOptions.frameTimeBudgetMs))
    : null;
  const minimumSamplesPerPixel = clamp(
    readPositiveInteger(
      "minimumSamplesPerPixel",
      renderOptions.minimumSamplesPerPixel,
      frameTimeBudgetMs !== null && targetSamplesPerPixel > 1 ? 1 : targetSamplesPerPixel
    ),
    1,
    targetSamplesPerPixel
  );
  if (frameTimeBudgetMs === null || !awaitGPUCompletion || targetSamplesPerPixel <= minimumSamplesPerPixel) {
    return Object.freeze({
      renderedSamplesPerPixel: targetSamplesPerPixel,
      targetSamplesPerPixel,
      minimumSamplesPerPixel,
      frameTimeBudgetMs,
      budgetConstrained: false,
    });
  }
  const estimatedSampleTimeMs =
    Number.isFinite(lastCompletedFrameTimeMs) && lastCompletedFrameTimeMs > 0
      ? lastCompletedFrameTimeMs / Math.max(1, lastCompletedSamplesPerPixel)
      : null;
  if (!Number.isFinite(estimatedSampleTimeMs) || estimatedSampleTimeMs <= 0) {
    return Object.freeze({
      renderedSamplesPerPixel: minimumSamplesPerPixel,
      targetSamplesPerPixel,
      minimumSamplesPerPixel,
      frameTimeBudgetMs,
      budgetConstrained: minimumSamplesPerPixel < targetSamplesPerPixel,
    });
  }
  const budgetLimitedSamples = clamp(
    Math.floor(frameTimeBudgetMs / estimatedSampleTimeMs),
    minimumSamplesPerPixel,
    targetSamplesPerPixel
  );
  return Object.freeze({
    renderedSamplesPerPixel: budgetLimitedSamples,
    targetSamplesPerPixel,
    minimumSamplesPerPixel,
    frameTimeBudgetMs,
    budgetConstrained: budgetLimitedSamples < targetSamplesPerPixel,
  });
}

export function createWavefrontFrameStats({
  config,
  tiles,
  frame,
  frameIndex,
  accelerationBuilt,
  accelerationBuildCount,
  accelerationBuildSubmitted,
  frameSubmissionCount,
  frameConfigSlotCount,
  gpuAdapterParallelism,
  parallelismCounters,
  renderedSamplesPerPixel,
  targetSamplesPerPixel,
  frameTimeBudgetMs,
  budgetConstrained,
}) {
  const gpuParallelism = createGpuParallelismDiagnostics(
    gpuAdapterParallelism,
    parallelismCounters
  );
  const commandSubmissions = frameSubmissionCount + (accelerationBuildSubmitted ? 1 : 0);
  return Object.freeze({
    frameStats: Object.freeze({
      frame,
      frameIndex,
      width: config.width,
      height: config.height,
      maxDepth: config.maxDepth,
      tiles: tiles.length,
      tileSize: config.tileSize,
      samplesPerPixel: targetSamplesPerPixel,
      renderedSamplesPerPixel,
      frameTimeBudgetMs,
      budgetConstrained,
      maxFramePassesPerSubmission: config.maxFramePassesPerSubmission,
      screenRays: config.width * config.height,
      primaryRays: config.width * config.height * renderedSamplesPerPixel,
      secondaryRays: null,
      totalPathSegments: null,
      rayCounts: createWavefrontRayCountTelemetry(),
      timings: createWavefrontFrameTimingTelemetry(),
      telemetryMemoryBytes: 0,
      sceneObjectCount: config.sceneObjectCount,
      triangleCount: config.triangleCount,
      emissiveTriangleCount: config.emissiveTriangleCount,
      environmentPortalCount: config.environmentPortalCount,
      environmentPortalMode: config.environmentPortalMode,
      mediumCount: config.mediumCount,
      environmentMap: createEnvironmentMapSnapshot(config.environmentMap),
      deferredPathResolve: config.deferredPathResolve,
      strictPhysicalLowSppLighting: config.strictPhysicalLowSppLighting,
      transportExperiments: config.transportExperiments,
      transportExperimentFlags: config.transportExperimentFlags,
      bvhNodeCount: config.bvhNodeCount,
      displayQuality: config.displayQuality,
      accelerationBuildMode: config.accelerationBuildMode,
      gpuAccelerationBuildRequired: config.gpuAccelerationBuildRequired,
      accelerationBuildSubmitted,
      accelerationBuilt,
      accelerationBuildCount,
      commandSubmissions,
      frameConfigSlots: frameConfigSlotCount,
      gpuParallelism,
      memory: config.memory,
    }),
    gpuParallelism,
  });
}
