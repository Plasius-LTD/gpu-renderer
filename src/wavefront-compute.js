import {
  createGpuParallelismCounters,
  createGpuParallelismDiagnostics,
  createWavefrontTransportGuardrailSummary,
  createGpuWorkerJobDiagnostics,
} from "./wavefront-frame-runtime.js"
import { dispatchWavefrontGpuAccelerationBuild } from "./wavefront-acceleration-builder.js";
import {
  createDefaultWavefrontSceneObjects,
  createWavefrontBvhBuildLevels,
  createWavefrontBvhSortStages,
  createWavefrontEmissiveTriangleIndexSource,
  createWavefrontGpuMaterialSource,
  createWavefrontGpuMeshSource,
  createWavefrontMeshAcceleration,
} from "./wavefront-scene-data.js";
import {
  createWavefrontPathTracingComputeConfig,
  packEnvironmentPortals,
  supportsWavefrontPathTracingCompute,
} from "./wavefront-config.js";
import {
  alignTo,
  clampTileSizeForDevice,
  createAtlasTextureResource,
  createBrdfLutResource,
  createBuffer,
  createEnvironmentMapResource,
  createEnvironmentSamplingTextureResource,
  createMediumTextureResource,
  mediumTablesEqual,
} from "./wavefront-gpu-resources.js";
import {
  createConfigPayload,
  createTiles,
  packWavefrontBvhNodes,
  packWavefrontSceneObjects,
  packWavefrontTriangles,
} from "./wavefront-packers.js";
import {
  createWavefrontBvhBuildBindGroup,
  createWavefrontDenoiseBindGroups,
  createWavefrontPresentBindGroup,
  createWavefrontTraceBindGroups,
} from "./wavefront-bind-groups.js";
import {
  waitForSubmittedGpuWork as waitForSubmittedGpuWorkForDevice,
} from "./wavefront-gpu-synchronization.js";
import {
  createWavefrontFrameStats,
  resolveWavefrontRenderedSamplesPerPixel,
} from "./wavefront-frame-stats.js";
import { createWavefrontFrameEncoder } from "./wavefront-frame-encoder.js";
import {
  dispatchWavefrontFrame,
  dispatchWavefrontFrameAwaitingGpu,
} from "./wavefront-frame-dispatcher.js";
import { createWavefrontPipelineResources } from "./wavefront-pipelines.js";
import {
  readWavefrontOutputProbe,
  readWavefrontTerminationMetrics,
} from "./wavefront-readbacks.js";
import {
  createEnvironmentMapSnapshot,
  createGpuAdapterParallelismDiagnostics,
  createWavefrontDeviceDescriptor,
  estimateSubmittedGpuWorkTiming,
  getGpuUsageConstants,
  nowMs,
  resolveCanvas,
} from "./wavefront-runtime-support.js";

import {
  ACCUMULATION_RECORD_BYTES,
  BVH_LEAF_REF_RECORD_BYTES,
  BVH_NODE_RECORD_BYTES,
  CONFIG_BUFFER_BYTES,
  COUNTER_BUFFER_BYTES,
  DEFAULT_AMBIENT_COLOR,
  DEFAULT_BRDF_LUT_SAMPLE_COUNT,
  DEFAULT_BRDF_LUT_SIZE,
  DEFAULT_CAMERA,
  DEFAULT_ENVIRONMENT_COLOR,
  DEFAULT_ENVIRONMENT_LIGHTING,
  DEFAULT_ENVIRONMENT_PORTAL_CAPACITY,
  DEFAULT_HEIGHT,
  DEFAULT_MAX_DEPTH,
  DEFAULT_MAX_FRAME_PASSES_PER_SUBMISSION,
  DEFAULT_MEDIUM_PHASE_MODEL,
  DEFAULT_SAMPLES_PER_PIXEL,
  DEFAULT_SCENE_OBJECT_CAPACITY,
  DEFAULT_TILE_SIZE,
  DEFAULT_WIDTH,
  EMISSIVE_TRIANGLE_INDEX_BYTES,
  EMPTY_TERMINATION_METRICS,
  ENVIRONMENT_PORTAL_RECORD_BYTES,
  GPU_MATERIAL_RECORD_BYTES,
  GPU_MAX_SUBMITTED_WORK_DEADLINE_MS,
  GPU_MAX_SUBMITTED_WORK_TIMEOUT_MS,
  HIT_RECORD_BYTES,
  HIT_TYPE_EMISSIVE,
  HIT_TYPE_SURFACE,
  INDIRECT_DISPATCH_ARGS_BYTES,
  MATERIAL_DIELECTRIC,
  MATERIAL_DIFFUSE,
  MATERIAL_EMISSIVE,
  MATERIAL_METAL,
  MATERIAL_TRANSPARENT,
  MAX_PATH_TRACING_DEPTH,
  MAX_SAMPLES_PER_PIXEL,
  MEDIUM_TABLE_ROWS,
  MESH_RANGE_RECORD_BYTES,
  MESH_VERTEX_RECORD_BYTES,
  OBJECT_KIND_BOX,
  OBJECT_KIND_SPHERE,
  PATH_VERTEX_RECORD_BYTES,
  RAY_RECORD_BYTES,
  SCENE_OBJECT_RECORD_BYTES,
  TERMINAL_SOURCE_KIND_AMBIENT_MAX_DEPTH,
  TERMINAL_SOURCE_KIND_AMBIENT_QUEUE_OVERFLOW,
  TERMINAL_SOURCE_KIND_EMISSIVE,
  TERMINAL_SOURCE_KIND_ENVIRONMENT,
  TRACE_STORAGE_BUFFER_BINDINGS,
  TRIANGLE_RECORD_BYTES,
  add,
  asColor,
  asUnitVec3,
  asVec3,
  assertAnalyticDisplayQualityPolicy,
  boundsCentroid,
  cross,
  dot,
  emissionPower,
  getArrayLikeLength,
  maxComponent,
  mergeBounds,
  mixSeed,
  normalize,
  random01FromSeed,
  readFiniteNumber,
  readVector,
  readVector2,
  resolveDeferredPathResolve,
  resolveEnvironmentMap,
  resolveSheenColor,
  scale,
  subtract,
  triangleBounds,
  wavefrontMaterialKinds,
  wavefrontPathTracingComputeLimits,
  wavefrontSceneObjectKinds,
} from "./wavefront-core.js";
export async function createWavefrontPathTracingComputeRenderer(options = {}) {
  assertAnalyticDisplayQualityPolicy(options);
  const constants = getGpuUsageConstants();
  const navigatorRef = options.navigator ?? globalThis.navigator;
  if (!supportsWavefrontPathTracingCompute({ navigator: navigatorRef })) {
    throw new Error("WebGPU wavefront path tracing requires navigator.gpu.");
  }

  const canvas = resolveCanvas(options.canvas, options.document);
  const initialConfig = createWavefrontPathTracingComputeConfig({
    ...options,
    canvas,
  });
  const adapter = await navigatorRef.gpu.requestAdapter({
    powerPreference: options.powerPreference ?? "high-performance",
  });
  if (!adapter) {
    throw new Error("Unable to acquire a WebGPU adapter for wavefront path tracing.");
  }

  const device = await adapter.requestDevice(createWavefrontDeviceDescriptor(adapter, options));
  const gpuAdapterParallelism = createGpuAdapterParallelismDiagnostics(adapter, device);
  const context = canvas.getContext("webgpu");
  if (!context || typeof context.configure !== "function") {
    throw new Error("Canvas WebGPU context does not support configure().");
  }

  const format =
    options.format ??
    (typeof navigatorRef.gpu.getPreferredCanvasFormat === "function"
      ? navigatorRef.gpu.getPreferredCanvasFormat()
      : "bgra8unorm");
  let config = initialConfig;
  const safeTileSize = clampTileSizeForDevice(config, device);
  if (safeTileSize !== config.tileSize) {
    config = createWavefrontPathTracingComputeConfig({
      ...options,
      canvas,
      width: config.width,
      height: config.height,
      tileSize: safeTileSize,
    });
  }
  canvas.width = config.width;
  canvas.height = config.height;
  context.configure({
    device,
    format,
    alphaMode: options.alpha === true ? "premultiplied" : "opaque",
  });

  const bufferUsage = constants.buffer.STORAGE | constants.buffer.COPY_DST;
  const rayQueueBytes = config.tilePixelCapacity * RAY_RECORD_BYTES;
  const hitBytes = config.tilePixelCapacity * HIT_RECORD_BYTES;
  const accumulationBytes = config.tilePixelCapacity * ACCUMULATION_RECORD_BYTES;
  const pathVertexBytes = config.tilePixelCapacity * (config.maxDepth + 1) * PATH_VERTEX_RECORD_BYTES;
  const activeQueue = createBuffer(device, bufferUsage, rayQueueBytes, "plasius.wavefront.activeQueue");
  const nextQueue = createBuffer(device, bufferUsage, rayQueueBytes, "plasius.wavefront.nextQueue");
  const hitBuffer = createBuffer(device, bufferUsage, hitBytes, "plasius.wavefront.hitBuffer");
  const accumulationBuffer = createBuffer(
    device,
    bufferUsage,
    accumulationBytes,
    "plasius.wavefront.accumulation"
  );
  const pathVertexBuffer = createBuffer(
    device,
    bufferUsage,
    pathVertexBytes,
    "plasius.wavefront.pathVertices"
  );
  const sceneObjectBuffer = createBuffer(
    device,
    constants.buffer.STORAGE | constants.buffer.COPY_DST,
    config.sceneObjectCapacity * SCENE_OBJECT_RECORD_BYTES,
    "plasius.wavefront.sceneObjects"
  );
  const triangleBuffer = createBuffer(
    device,
    constants.buffer.STORAGE | constants.buffer.COPY_DST,
    Math.max(1, config.triangleCapacity) * TRIANGLE_RECORD_BYTES,
    "plasius.wavefront.triangles"
  );
  const bvhNodeBuffer = createBuffer(
    device,
    constants.buffer.STORAGE | constants.buffer.COPY_DST,
    Math.max(1, config.bvhNodeCapacity + config.emissiveTriangleCapacity) *
      BVH_NODE_RECORD_BYTES,
    "plasius.wavefront.bvhNodes"
  );
  const meshVertexBuffer = createBuffer(
    device,
    constants.buffer.STORAGE | constants.buffer.COPY_DST,
    Math.max(1, config.gpuMeshSource.vertices.count) * MESH_VERTEX_RECORD_BYTES,
    "plasius.wavefront.meshVertices"
  );
  const meshIndexBuffer = createBuffer(
    device,
    constants.buffer.STORAGE | constants.buffer.COPY_DST,
    Math.max(1, config.gpuMeshSource.indices.count) * 4,
    "plasius.wavefront.meshIndices"
  );
  const meshRangeBuffer = createBuffer(
    device,
    constants.buffer.STORAGE | constants.buffer.COPY_DST,
    Math.max(1, config.gpuMeshSource.meshes.count) * MESH_RANGE_RECORD_BYTES,
    "plasius.wavefront.meshRanges"
  );
  const environmentPortalBuffer = createBuffer(
    device,
    constants.buffer.STORAGE | constants.buffer.COPY_DST,
    Math.max(1, config.environmentPortalCapacity) * ENVIRONMENT_PORTAL_RECORD_BYTES,
    "plasius.wavefront.environmentPortals"
  );
  const bvhLeafRefBuffer = createBuffer(
    device,
    constants.buffer.STORAGE | constants.buffer.COPY_DST,
    Math.max(1, config.bvhLeafSortCapacity) * BVH_LEAF_REF_RECORD_BYTES,
    "plasius.wavefront.bvhLeafRefs"
  );
  const tiles = createTiles(config.width, config.height, config.tileSize);
  const uniformOffsetAlignment = Number(device?.limits?.minUniformBufferOffsetAlignment);
  const configBufferStride = alignTo(
    CONFIG_BUFFER_BYTES,
    Number.isFinite(uniformOffsetAlignment) && uniformOffsetAlignment > 0
      ? uniformOffsetAlignment
      : CONFIG_BUFFER_BYTES
  );
  const outputConfigSlotCount = config.deferredPathResolve ? 0 : tiles.length;
  const frameConfigSlotCount = Math.max(
    1,
    tiles.length * config.samplesPerPixel + outputConfigSlotCount + (config.denoise ? 1 : 0)
  );
  const configBuffer = createBuffer(
    device,
    constants.buffer.UNIFORM | constants.buffer.COPY_DST,
    frameConfigSlotCount * configBufferStride,
    "plasius.wavefront.frameConfig"
  );
  const bvhBuildConfigSlots =
    1 + config.bvhSortStages.length + config.bvhBuildLevels.length;
  const bvhBuildConfigBuffer = createBuffer(
    device,
    constants.buffer.UNIFORM | constants.buffer.COPY_DST,
    Math.max(1, bvhBuildConfigSlots) * configBufferStride,
    "plasius.wavefront.bvhBuildConfig"
  );
  const counterBuffer = createBuffer(
    device,
    constants.buffer.STORAGE | constants.buffer.COPY_DST | constants.buffer.COPY_SRC,
    COUNTER_BUFFER_BYTES,
    "plasius.wavefront.counters"
  );
  const activeDispatchBuffer = createBuffer(
    device,
    constants.buffer.INDIRECT | constants.buffer.COPY_DST,
    INDIRECT_DISPATCH_ARGS_BYTES,
    "plasius.wavefront.activeDispatchArgs"
  );

  let packedScene = packWavefrontSceneObjects(config.sceneObjects, config.sceneObjectCapacity);
  device.queue.writeBuffer(sceneObjectBuffer, 0, packedScene.buffer);
  const packedTriangles = packWavefrontTriangles(
    config.meshAcceleration.triangles,
    Math.max(1, config.triangleCapacity)
  );
  const packedBvhNodes = packWavefrontBvhNodes(
    config.meshAcceleration.nodes,
    Math.max(1, config.bvhNodeCapacity + config.emissiveTriangleCapacity)
  );
  const packedBvhNodeUints = new Uint32Array(packedBvhNodes.buffer);
  config.emissiveTriangleIndices.indices.forEach((triangleIndex, index) => {
    const nodeOffset = (config.bvhNodeCapacity + index) * (BVH_NODE_RECORD_BYTES / 4);
    packedBvhNodeUints[nodeOffset + 8] = triangleIndex;
  });
  device.queue.writeBuffer(triangleBuffer, 0, packedTriangles.buffer);
  device.queue.writeBuffer(bvhNodeBuffer, 0, packedBvhNodes.buffer);
  device.queue.writeBuffer(meshVertexBuffer, 0, config.gpuMeshSource.vertices.buffer);
  device.queue.writeBuffer(meshIndexBuffer, 0, config.gpuMeshSource.indices.buffer);
  device.queue.writeBuffer(meshRangeBuffer, 0, config.gpuMeshSource.meshes.buffer);
  const packedEnvironmentPortals = packEnvironmentPortals(
    config.environmentPortals,
    Math.max(1, config.environmentPortalCapacity)
  );
  device.queue.writeBuffer(environmentPortalBuffer, 0, packedEnvironmentPortals.buffer);

  const radianceTexture = device.createTexture({
    label: "plasius.wavefront.radiance",
    size: { width: config.width, height: config.height },
    format: "rgba16float",
    usage:
      constants.texture.STORAGE_BINDING |
      constants.texture.TEXTURE_BINDING,
  });
  const radianceView = radianceTexture.createView();
  const denoiseScratchTexture = device.createTexture({
    label: "plasius.wavefront.denoiseScratch",
    size: { width: config.width, height: config.height },
    format: "rgba16float",
    usage:
      constants.texture.STORAGE_BINDING |
      constants.texture.TEXTURE_BINDING,
  });
  const denoiseScratchView = denoiseScratchTexture.createView();
  const outputTexture = device.createTexture({
    label: "plasius.wavefront.output",
    size: { width: config.width, height: config.height },
    format: "rgba8unorm",
    usage:
      constants.texture.STORAGE_BINDING |
      constants.texture.TEXTURE_BINDING |
      constants.texture.COPY_SRC,
  });
  const outputView = outputTexture.createView();
  const sampler = device.createSampler({
    label: "plasius.wavefront.presentSampler",
    magFilter: "nearest",
    minFilter: "nearest",
  });
  const environmentMapResource = createEnvironmentMapResource(
    device,
    constants,
    config.environmentMap,
    config.environmentColor
  );
  const environmentSamplingResource = createEnvironmentSamplingTextureResource(
    device,
    constants,
    config.environmentMap,
    config.environmentColor
  );
  let mediumTextureResource = createMediumTextureResource(
    device,
    constants,
    config.mediums
  );
  config = Object.freeze({
    ...config,
    environmentMap: Object.freeze({
      ...config.environmentMap,
      width: environmentMapResource.width,
      height: environmentMapResource.height,
      mipLevelCount: environmentMapResource.mipLevelCount,
      hasImportanceData: environmentSamplingResource.hasImportanceData,
    }),
  });
  const brdfLutResource = createBrdfLutResource(device, constants);
  const baseColorAtlasResource = createAtlasTextureResource(
    device,
    constants,
    config.gpuMaterialSource.baseColorAtlas,
    "plasius.wavefront.materialAtlas.baseColor"
  );
  const metallicRoughnessAtlasResource = createAtlasTextureResource(
    device,
    constants,
    config.gpuMaterialSource.metallicRoughnessAtlas,
    "plasius.wavefront.materialAtlas.metallicRoughness"
  );
  const normalAtlasResource = createAtlasTextureResource(
    device,
    constants,
    config.gpuMaterialSource.normalAtlas,
    "plasius.wavefront.materialAtlas.normal"
  );
  const occlusionAtlasResource = createAtlasTextureResource(
    device,
    constants,
    config.gpuMaterialSource.occlusionAtlas,
    "plasius.wavefront.materialAtlas.occlusion"
  );
  const emissiveAtlasResource = createAtlasTextureResource(
    device,
    constants,
    config.gpuMaterialSource.emissiveAtlas,
    "plasius.wavefront.materialAtlas.emissive"
  );
  const materialAtlasSampler = device.createSampler({
    label: "plasius.wavefront.materialAtlasSampler",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
    magFilter: "linear",
    minFilter: "linear",
  });

  const {
    bindGroupLayouts: {
      trace: traceBindGroupLayout,
      acceleration: accelerationBindGroupLayout,
      denoiseRadiance: denoiseRadianceBindGroupLayout,
      denoiseResolve: denoiseResolveBindGroupLayout,
      present: presentBindGroupLayout,
    },
    computePipelines: pipelines,
    presentPipeline,
  } = await createWavefrontPipelineResources({ device, constants, format });

  function createTraceBindGroups() {
    return createWavefrontTraceBindGroups({
      device,
      traceBindGroupLayout,
      activeQueue,
      nextQueue,
      frameConfigBuffer: configBuffer,
      hitBuffer,
      accumulationBuffer,
      sceneObjectBuffer,
      counterBuffer,
      outputView,
      triangleBuffer,
      bvhNodeBuffer,
      radianceView,
      environmentPortalBuffer,
      environmentMapResource,
      pathVertexBuffer,
      baseColorAtlasResource,
      metallicRoughnessAtlasResource,
      normalAtlasResource,
      occlusionAtlasResource,
      emissiveAtlasResource,
      materialAtlasSampler,
      brdfLutResource,
      environmentSamplingResource,
      mediumTextureResource,
    });
  }

  let bindGroups = createTraceBindGroups();
  const bvhBuildBindGroup = createWavefrontBvhBuildBindGroup({
    device,
    accelerationBindGroupLayout,
    bvhBuildConfigBuffer,
    triangleBuffer,
    bvhNodeBuffer,
    meshVertexBuffer,
    meshIndexBuffer,
    meshRangeBuffer,
    bvhLeafRefBuffer,
  });
  const {
    radiance: denoiseRadianceBindGroup,
    resolve: denoiseResolveBindGroup,
    directResolve: denoiseDirectResolveBindGroup,
  } = createWavefrontDenoiseBindGroups({
    device,
    denoiseRadianceBindGroupLayout,
    denoiseResolveBindGroupLayout,
    configBuffer,
    radianceView,
    denoiseScratchView,
    outputView,
  });
  const presentBindGroup = createWavefrontPresentBindGroup({
    device,
    presentBindGroupLayout,
    outputView,
    sampler,
  });
  const frameEncoder = createWavefrontFrameEncoder({
    getConfig: () => config,
    getBindGroups: () => bindGroups,
    pipelines,
    counterBuffer,
    activeDispatchBuffer,
    denoiseRadianceBindGroup,
    denoiseResolveBindGroup,
    denoiseDirectResolveBindGroup,
    presentPipeline,
    presentBindGroup,
    context,
  });

  let frame = 0;
  let accelerationBuilt = !config.gpuAccelerationBuildRequired;
  let accelerationBuildCount = 0;
  let activeCameraOptions = options.camera ?? DEFAULT_CAMERA;
  let lastCompletedFrameTimeMs = null;
  let lastCompletedSamplesPerPixel = Math.max(1, config.samplesPerPixel);
  let lastGpuParallelism = createGpuParallelismDiagnostics(
    gpuAdapterParallelism,
    createGpuParallelismCounters()
  );
  const waitForSubmittedGpuWork = (waitOptions = {}) =>
    waitForSubmittedGpuWorkForDevice(device, waitOptions);

  function resolveRenderedSamplesPerPixel(renderOptions = {}, awaitGPUCompletion = true) {
    return resolveWavefrontRenderedSamplesPerPixel({
      config,
      renderOptions,
      awaitGPUCompletion,
      lastCompletedFrameTimeMs,
      lastCompletedSamplesPerPixel,
    });
  }

  function createFrameStats({
    frameIndex,
    accelerationBuildSubmitted,
    frameSubmissionCount,
    parallelismCounters,
    renderedSamplesPerPixel,
    targetSamplesPerPixel,
    frameTimeBudgetMs,
    budgetConstrained,
  }) {
    const stats = createWavefrontFrameStats({
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
    });
    lastGpuParallelism = stats.gpuParallelism;
    return stats.frameStats;
  }

  async function readTerminationMetrics() {
    return readWavefrontTerminationMetrics({
      device,
      constants,
      counterBuffer,
      waitForSubmittedGpuWork,
    });
  }

  function writeFrameConfigSlot(slot, tile, frameIndex, buildRange = {}) {
    if (slot >= frameConfigSlotCount) {
      throw new Error("Wavefront frame config slot capacity exceeded.");
    }
    const offset = slot * configBufferStride;
    device.queue.writeBuffer(
      configBuffer,
      offset,
      createConfigPayload(config, tile, frameIndex, buildRange)
    );
    return offset;
  }

  function createFrameConfigWriter(frameIndex) {
    let slot = 0;
    return (tile, buildRange = {}) => {
      const offset = writeFrameConfigSlot(slot, tile, frameIndex, buildRange);
      slot += 1;
      return offset;
    };
  }

  function dispatchGpuAccelerationBuild(frameIndex, parallelism) {
    const submitted = dispatchWavefrontGpuAccelerationBuild({
      config,
      accelerationBuilt,
      tiles,
      device,
      bvhBuildConfigBuffer,
      configBufferStride,
      bvhBuildBindGroup,
      pipelines,
      parallelism,
      frameIndex,
    });
    if (submitted) {
      accelerationBuilt = true;
      accelerationBuildCount += 1;
    }
    return submitted;
  }

  function dispatchFrame(frameIndex, parallelism, renderedSamplesPerPixel = config.samplesPerPixel) {
    return dispatchWavefrontFrame({
      config,
      tiles,
      device,
      frameIndex,
      parallelism,
      renderedSamplesPerPixel,
      frameEncoder,
      createFrameConfigWriter,
    });
  }

  function renderOnce(renderOptions = {}, resolvedSamplingPlan = null) {
    const frameStartTimeMs = nowMs();
    frame += 1;
    const frameIndex = frame + config.frameIndex;
    const samplingPlan = resolvedSamplingPlan ?? resolveRenderedSamplesPerPixel(renderOptions, false);
    const parallelismCounters = createGpuParallelismCounters();
    const accelerationBuildSubmitted = dispatchGpuAccelerationBuild(frameIndex, parallelismCounters);
    const frameSubmissionCount = dispatchFrame(
      frameIndex,
      parallelismCounters,
      samplingPlan.renderedSamplesPerPixel
    );
    const frameTimeMs = Math.max(0, nowMs() - frameStartTimeMs);
    return Object.freeze({
      ...createFrameStats({
        frameIndex,
        accelerationBuildSubmitted,
        frameSubmissionCount,
        parallelismCounters,
        renderedSamplesPerPixel: samplingPlan.renderedSamplesPerPixel,
        targetSamplesPerPixel: samplingPlan.targetSamplesPerPixel,
        frameTimeBudgetMs: samplingPlan.frameTimeBudgetMs,
        budgetConstrained: samplingPlan.budgetConstrained,
      }),
      gpuWorkerJobs: createGpuWorkerJobDiagnostics(
        lastGpuParallelism,
        frameSubmissionCount + (accelerationBuildSubmitted ? 1 : 0),
        frameTimeMs,
        false
      ),
    });
  }

  function dispatchFrameAwaitingGpu(
    frameIndex,
    parallelism,
    renderedSamplesPerPixel = config.samplesPerPixel,
    optionsForFrame = {}
  ) {
    return dispatchWavefrontFrameAwaitingGpu({
      config,
      tiles,
      device,
      frameIndex,
      parallelism,
      renderedSamplesPerPixel,
      frameEncoder,
      writeFrameConfigSlot,
      optionsForFrame,
    });
  }

  async function readOutputProbe(optionsForProbe = {}) {
    return readWavefrontOutputProbe({
      device,
      constants,
      config,
      outputTexture,
      waitForSubmittedGpuWork,
      optionsForProbe,
    });
  }

  async function renderFrame(renderOptions = {}) {
    const awaitGPUCompletion = renderOptions.awaitGPUCompletion !== false;
    const samplingPlan = resolveRenderedSamplesPerPixel(renderOptions, awaitGPUCompletion);
    const useThrottledHighSamplePath =
      awaitGPUCompletion && samplingPlan.renderedSamplesPerPixel >= 8;
    const frameStartTimeMs = nowMs();
    let frameStats;
    if (useThrottledHighSamplePath) {
      frame += 1;
      const frameIndex = frame + config.frameIndex;
      const parallelismCounters = createGpuParallelismCounters();
      const accelerationBuildSubmitted = dispatchGpuAccelerationBuild(frameIndex, parallelismCounters);
      let frameSubmissionCount = 0;
      let frameConfigSlot = 0;
      if (accelerationBuildSubmitted) {
        const accelerationWaitOptions = {
          ...estimateSubmittedGpuWorkTiming(
            { ...config, renderedSamplesPerPixel: 1 },
            1,
            renderOptions.submittedWorkTimeoutMs,
            { includeAccelerationBuild: true }
          ),
          allowTimeout: false,
        };
        await waitForSubmittedGpuWork(accelerationWaitOptions);
      }
      for (let tileIndex = 0; tileIndex < tiles.length; tileIndex += 1) {
        const tileRangeDispatch = dispatchFrameAwaitingGpu(
          frameIndex,
          parallelismCounters,
          samplingPlan.renderedSamplesPerPixel,
          {
            sampleRangeStart: 0,
            sampleRangeEnd: samplingPlan.renderedSamplesPerPixel,
            tileStartIndex: tileIndex,
            tileEndIndex: tileIndex + 1,
            startingSubmissionCount: frameSubmissionCount,
            startingSlot: frameConfigSlot,
            includeDenoise: tileIndex + 1 >= tiles.length,
            includePresent: tileIndex + 1 >= tiles.length,
          }
        );
        frameSubmissionCount = tileRangeDispatch.submissionCount;
        frameConfigSlot = tileRangeDispatch.slot;
        const tileWaitOptions = {
          ...estimateSubmittedGpuWorkTiming(
            { ...config, renderedSamplesPerPixel: samplingPlan.renderedSamplesPerPixel },
            1,
            renderOptions.submittedWorkTimeoutMs,
            {
              includeDenoise: tileIndex + 1 >= tiles.length && config.denoise,
              includePresent: tileIndex + 1 >= tiles.length,
            }
          ),
          allowTimeout: false,
        };
        await waitForSubmittedGpuWork(tileWaitOptions);
      }
      frameStats = createFrameStats({
        frameIndex,
        accelerationBuildSubmitted,
        frameSubmissionCount,
        parallelismCounters,
        renderedSamplesPerPixel: samplingPlan.renderedSamplesPerPixel,
        targetSamplesPerPixel: samplingPlan.targetSamplesPerPixel,
        frameTimeBudgetMs: samplingPlan.frameTimeBudgetMs,
        budgetConstrained: samplingPlan.budgetConstrained,
      });
    } else {
      const submittedWorkTiming = estimateSubmittedGpuWorkTiming(
        { ...config, renderedSamplesPerPixel: samplingPlan.renderedSamplesPerPixel },
        tiles.length,
        renderOptions.submittedWorkTimeoutMs,
        { includeAccelerationBuild: config.gpuAccelerationBuildRequired && !accelerationBuilt }
      );
      const submissionWaitOptions = awaitGPUCompletion
        ? {
            timeoutMs: submittedWorkTiming.timeoutMs,
            maxWaitMs: submittedWorkTiming.maxWaitMs,
            allowTimeout: false,
          }
        : {
            timeoutMs: submittedWorkTiming.timeoutMs,
            maxWaitMs: submittedWorkTiming.maxWaitMs,
          };
      frameStats = renderOnce(renderOptions, samplingPlan);
      if (awaitGPUCompletion) {
        await waitForSubmittedGpuWork(submissionWaitOptions);
      }
    }
    const frameTimeMs = Math.max(0, nowMs() - frameStartTimeMs);
    if (awaitGPUCompletion) {
      lastCompletedFrameTimeMs = frameTimeMs;
      lastCompletedSamplesPerPixel = frameStats.renderedSamplesPerPixel ?? frameStats.samplesPerPixel;
    }
    const deviceLossStatus =
      awaitGPUCompletion
        ? "not-detected"
        : typeof device.lost?.then === "function"
          ? "pending"
          : "not-exposed";
    frameStats = Object.freeze({
      ...frameStats,
      deviceLossStatus,
      gpuWorkerJobs: createGpuWorkerJobDiagnostics(
        frameStats.gpuParallelism,
        frameStats.commandSubmissions,
        frameTimeMs,
        awaitGPUCompletion
      ),
    });
    const terminationMetrics = awaitGPUCompletion && renderOptions.readStats === true
      ? await readTerminationMetrics()
      : EMPTY_TERMINATION_METRICS;
    const probe =
      renderOptions.readOutputProbe === false ? null : await readOutputProbe(renderOptions.probe);
    const maxChannel = probe ? Math.max(...probe.rgba.slice(0, 3)) : 0;
    const completedFrame = Object.freeze({
      ...frameStats,
      outputProbe: probe
        ? Object.freeze({
            ...probe,
            sampledPixels: 1,
            nonZeroSamples: maxChannel > 0 ? 1 : 0,
            maxChannel,
          })
        : null,
      bounces: [],
      termination: terminationMetrics.termination,
      terminalRadiance: terminationMetrics.terminalRadiance,
      queueOverflow: terminationMetrics.queueOverflow,
    });
    return Object.freeze({
      ...completedFrame,
      transportGuardrails: createWavefrontTransportGuardrailSummary(completedFrame),
    });
  }

  function rebuildLiveConfig(overrides = {}) {
    return createWavefrontPathTracingComputeConfig({
      ...options,
      canvas,
      width: config.width,
      height: config.height,
      maxDepth: config.maxDepth,
      tileSize: config.tileSize,
      samplesPerPixel: config.samplesPerPixel,
      sceneObjectCapacity: config.sceneObjectCapacity,
      sceneObjects: packedScene.objects,
      camera: activeCameraOptions,
      environmentMap: {
        ...config.environmentMap,
      },
      frameIndex: config.frameIndex,
      ...overrides,
    });
  }

  function rebuildMediumResources(nextConfig) {
    const previousMediumTextureResource = mediumTextureResource;
    mediumTextureResource = createMediumTextureResource(device, constants, nextConfig.mediums);
    bindGroups = createTraceBindGroups();
    if (previousMediumTextureResource?.ownsTexture) {
      previousMediumTextureResource.texture?.destroy?.();
    }
  }

  function updateSceneObjects(sceneObjects) {
    const nextPackedScene = packWavefrontSceneObjects(sceneObjects, config.sceneObjectCapacity);
    packedScene = nextPackedScene;
    const nextConfig = rebuildLiveConfig();
    if (!mediumTablesEqual(config.mediums, nextConfig.mediums)) {
      rebuildMediumResources(nextConfig);
    }
    config = nextConfig;
    device.queue.writeBuffer(sceneObjectBuffer, 0, packedScene.buffer);
    return config;
  }

  function updateCamera(cameraOptions = {}) {
    activeCameraOptions = cameraOptions;
    config = rebuildLiveConfig();
    return config;
  }

  function getSnapshot() {
    return Object.freeze({
      frame,
      width: config.width,
      height: config.height,
      maxDepth: config.maxDepth,
      tiles: tiles.length,
      tileSize: config.tileSize,
      samplesPerPixel: config.samplesPerPixel,
      maxFramePassesPerSubmission: config.maxFramePassesPerSubmission,
      sceneObjectCount: config.sceneObjectCount,
      triangleCount: config.triangleCount,
      emissiveTriangleCount: config.emissiveTriangleCount,
      environmentPortalCount: config.environmentPortalCount,
      environmentPortalMode: config.environmentPortalMode,
      mediumCount: config.mediumCount,
      environmentMap: createEnvironmentMapSnapshot(config.environmentMap),
      deferredPathResolve: config.deferredPathResolve,
      bvhNodeCount: config.bvhNodeCount,
      displayQuality: config.displayQuality,
      accelerationBuildMode: config.accelerationBuildMode,
      gpuAccelerationBuildRequired: config.gpuAccelerationBuildRequired,
      accelerationBuilt,
      accelerationBuildCount,
      frameConfigSlots: frameConfigSlotCount,
      gpuParallelism: lastGpuParallelism,
      memory: config.memory,
    });
  }

  function destroy() {
    activeQueue.destroy?.();
    nextQueue.destroy?.();
    hitBuffer.destroy?.();
    accumulationBuffer.destroy?.();
    pathVertexBuffer.destroy?.();
    sceneObjectBuffer.destroy?.();
    triangleBuffer.destroy?.();
    bvhNodeBuffer.destroy?.();
    meshVertexBuffer.destroy?.();
    meshIndexBuffer.destroy?.();
    meshRangeBuffer.destroy?.();
    environmentPortalBuffer.destroy?.();
    bvhLeafRefBuffer.destroy?.();
    configBuffer.destroy?.();
    bvhBuildConfigBuffer.destroy?.();
    counterBuffer.destroy?.();
    activeDispatchBuffer.destroy?.();
    radianceTexture.destroy?.();
    denoiseScratchTexture.destroy?.();
    outputTexture.destroy?.();
    if (environmentMapResource.ownsTexture) {
      environmentMapResource.texture?.destroy?.();
    }
    if (environmentSamplingResource.ownsTexture) {
      environmentSamplingResource.texture?.destroy?.();
    }
    if (mediumTextureResource.ownsTexture) {
      mediumTextureResource.texture?.destroy?.();
    }
    brdfLutResource.texture?.destroy?.();
    if (baseColorAtlasResource.ownsTexture) {
      baseColorAtlasResource.texture?.destroy?.();
    }
    if (metallicRoughnessAtlasResource.ownsTexture) {
      metallicRoughnessAtlasResource.texture?.destroy?.();
    }
    if (normalAtlasResource.ownsTexture) {
      normalAtlasResource.texture?.destroy?.();
    }
    if (occlusionAtlasResource.ownsTexture) {
      occlusionAtlasResource.texture?.destroy?.();
    }
    if (emissiveAtlasResource.ownsTexture) {
      emissiveAtlasResource.texture?.destroy?.();
    }
    context.unconfigure?.();
  }

  return Object.freeze({
    canvas,
    context,
    device,
    format,
    config,
    renderOnce,
    renderFrame,
    readOutputProbe,
    updateSceneObjects,
    updateCamera,
    getSnapshot,
    destroy,
  });
}

export async function renderWavefrontPathTracingComputeFrame(options = {}) {
  const renderer = await createWavefrontPathTracingComputeRenderer(options);
  try {
    return await renderer.renderFrame(options);
  } finally {
    renderer.destroy();
  }
}

export { createWavefrontPathTracingComputeShaderSource } from "./wavefront-shaders.js";
export {
  computeWavefrontTerminalEnvironmentContributionReference,
  createWavefrontReferenceRay,
  estimateWavefrontDirectionalHemisphericalReflectance,
  intersectWavefrontReferenceTriangle,
  traceWavefrontReferenceTriangles,
  validateWavefrontBsdfSample,
} from "./wavefront-reference.js";
export {
  createDefaultWavefrontSceneObjects,
  createWavefrontBvhBuildLevels,
  createWavefrontBvhSortStages,
  createWavefrontEmissiveTriangleIndexSource,
  createWavefrontGpuMaterialSource,
  createWavefrontGpuMeshSource,
  createWavefrontMeshAcceleration,
  normalizeWavefrontMesh,
  normalizeWavefrontSceneObject,
} from "./wavefront-scene-data.js";
export {
  createWavefrontPathTracingComputeConfig,
  estimateWavefrontPathTracingMemory,
  supportsWavefrontPathTracingCompute,
} from "./wavefront-config.js";
export {
  packWavefrontBvhNodes,
  packWavefrontSceneObjects,
  packWavefrontTriangles,
} from "./wavefront-packers.js";
export {
  rendererWavefrontComputeMode,
  rendererWavefrontComputeStatsStride,
  rendererWavefrontComputeWorkgroupSize,
  wavefrontMaterialKinds,
  wavefrontPathTracingComputeLimits,
  wavefrontSceneObjectKinds,
} from "./wavefront-core.js";
