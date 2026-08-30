import {
  GPU_MAX_SUBMITTED_WORK_DEADLINE_MS,
  GPU_MAX_SUBMITTED_WORK_TIMEOUT_MS,
  GPU_READBACK_COMPLETION_TIMEOUT_MS,
  GPU_SUBMITTED_WORK_TIMEOUT_MS,
  TRACE_SAMPLED_TEXTURE_BINDINGS,
  TRACE_STORAGE_BUFFER_BINDINGS,
  WORKGROUP_SIZE,
  readNonNegativeInteger,
  readPositiveInteger,
} from "./wavefront-core.js";

export function getGpuUsageConstants() {
  if (
    typeof GPUBufferUsage === "undefined" ||
    typeof GPUTextureUsage === "undefined" ||
    typeof GPUShaderStage === "undefined"
  ) {
    throw new Error("WebGPU runtime unavailable. Required GPU constants are missing.");
  }
  if (typeof GPUBufferUsage.INDIRECT !== "number") {
    throw new Error("WebGPU runtime unavailable. GPUBufferUsage.INDIRECT is missing.");
  }

  return {
    buffer: GPUBufferUsage,
    texture: GPUTextureUsage,
    shader: GPUShaderStage,
    map: typeof GPUMapMode === "undefined" ? null : GPUMapMode,
  };
}

export function resolveCanvas(canvasOrSelector, documentRef = globalThis.document) {
  if (typeof canvasOrSelector === "string") {
    const resolved = documentRef?.querySelector?.(canvasOrSelector);
    if (!resolved) {
      throw new Error(`Unable to find canvas for selector: ${canvasOrSelector}`);
    }
    return resolved;
  }

  if (canvasOrSelector?.getContext) {
    return canvasOrSelector;
  }

  const fallback = documentRef?.querySelector?.("canvas[data-plasius-wavefront-path-tracing]");
  if (!fallback) {
    throw new Error("A canvas is required for WebGPU wavefront path tracing.");
  }
  return fallback;
}

async function getPipelineDiagnostics(shaderModule) {
  if (typeof shaderModule?.getCompilationInfo !== "function") {
    return "";
  }
  try {
    const info = await shaderModule.getCompilationInfo();
    const messages = info.messages ?? [];
    if (messages.length === 0) {
      return "";
    }
    return messages
      .map((message) => {
        const line = message.lineNum ?? "?";
        const column = message.linePos ?? "?";
        return `line ${line}:${column} ${message.message}`;
      })
      .join("\n");
  } catch {
    return "";
  }
}

export async function createComputePipeline(device, shaderModule, layout, entryPoint, label) {
  const descriptor = {
    label,
    layout,
    compute: {
      module: shaderModule,
      entryPoint,
    },
  };

  try {
    if (typeof device.createComputePipelineAsync === "function") {
      return await device.createComputePipelineAsync(descriptor);
    }
    return device.createComputePipeline(descriptor);
  } catch (error) {
    const diagnostics = await getPipelineDiagnostics(shaderModule);
    const suffix = diagnostics ? `\n${diagnostics}` : "";
    throw new Error(`WGSL compilation failed for ${label}: ${error.message}${suffix}`, {
      cause: error,
    });
  }
}

export async function assertShaderModuleCompiles(shaderModule, label) {
  if (typeof shaderModule?.getCompilationInfo !== "function") {
    return;
  }
  const info = await shaderModule.getCompilationInfo();
  const messages = Array.isArray(info?.messages) ? info.messages : [];
  const errors = messages.filter((message) => message?.type === "error");
  if (errors.length <= 0) {
    return;
  }
  const diagnostics = errors
    .map((message) => {
      const line = Number.isFinite(message.lineNum) ? message.lineNum : "?";
      const column = Number.isFinite(message.linePos) ? message.linePos : "?";
      return `line ${line}:${column} ${message.message}`;
    })
    .join("\n");
  throw new Error(`WGSL compilation preflight failed for ${label}:\n${diagnostics}`);
}

export async function createRenderPipeline(device, descriptor) {
  if (typeof device.createRenderPipelineAsync === "function") {
    return device.createRenderPipelineAsync(descriptor);
  }
  return device.createRenderPipeline(descriptor);
}

export function createWavefrontDeviceDescriptor(adapter, options = {}) {
  const requiredLimits = { ...(options.requiredLimits ?? {}) };
  const exposedStorageBufferLimit = Number(adapter?.limits?.maxStorageBuffersPerShaderStage);
  if (Number.isFinite(exposedStorageBufferLimit)) {
    if (exposedStorageBufferLimit < TRACE_STORAGE_BUFFER_BINDINGS) {
      throw new Error(
        `Wavefront mesh tracing requires maxStorageBuffersPerShaderStage>=${TRACE_STORAGE_BUFFER_BINDINGS}, ` +
          `but this adapter exposes ${exposedStorageBufferLimit}.`
      );
    }
    requiredLimits.maxStorageBuffersPerShaderStage = Math.max(
      Number(requiredLimits.maxStorageBuffersPerShaderStage ?? 0),
      TRACE_STORAGE_BUFFER_BINDINGS
    );
  }

  const exposedSampledTextureLimit = Number(adapter?.limits?.maxSampledTexturesPerShaderStage);
  if (Number.isFinite(exposedSampledTextureLimit)) {
    if (exposedSampledTextureLimit < TRACE_SAMPLED_TEXTURE_BINDINGS) {
      throw new Error(
        `Wavefront material tracing requires maxSampledTexturesPerShaderStage>=${TRACE_SAMPLED_TEXTURE_BINDINGS}, ` +
          `but this adapter exposes ${exposedSampledTextureLimit}.`
      );
    }
    requiredLimits.maxSampledTexturesPerShaderStage = Math.max(
      Number(requiredLimits.maxSampledTexturesPerShaderStage ?? 0),
      TRACE_SAMPLED_TEXTURE_BINDINGS
    );
  }

  const descriptor = { ...(options.deviceDescriptor ?? {}) };
  const requiredFeatures = Array.from(descriptor.requiredFeatures ?? []);
  const adapterFeatures = adapter?.features;
  const timestampQuerySupported =
    typeof adapterFeatures?.has === "function"
      ? adapterFeatures.has("timestamp-query")
      : adapterFeatures && typeof adapterFeatures[Symbol.iterator] === "function"
        ? Array.from(adapterFeatures).includes("timestamp-query")
        : false;
  if (
    options.gpuTimestamps !== false &&
    timestampQuerySupported &&
    !requiredFeatures.includes("timestamp-query")
  ) {
    requiredFeatures.push("timestamp-query");
  }
  if (requiredFeatures.length > 0) {
    descriptor.requiredFeatures = requiredFeatures;
  }
  if (Object.keys(requiredLimits).length > 0) {
    descriptor.requiredLimits = {
      ...(descriptor.requiredLimits ?? {}),
      ...requiredLimits,
    };
  }
  return Object.keys(descriptor).length > 0 ? descriptor : undefined;
}

function readGpuLimit(adapter, device, name) {
  const adapterValue = Number(adapter?.limits?.[name]);
  if (Number.isFinite(adapterValue)) {
    return adapterValue;
  }
  const deviceValue = Number(device?.limits?.[name]);
  return Number.isFinite(deviceValue) ? deviceValue : null;
}

function createAdapterInfoSnapshot(adapter) {
  const info = adapter?.info;
  if (!info || typeof info !== "object") {
    return null;
  }
  return Object.freeze({
    vendor: typeof info.vendor === "string" ? info.vendor : "",
    architecture: typeof info.architecture === "string" ? info.architecture : "",
    device: typeof info.device === "string" ? info.device : "",
    description: typeof info.description === "string" ? info.description : "",
  });
}

export function createGpuAdapterParallelismDiagnostics(adapter, device) {
  return Object.freeze({
    physicalCoreCount: null,
    physicalCoreCountAvailable: false,
    physicalCoreCountUnavailableReason: "WebGPU does not expose physical GPU core counts.",
    adapterInfo: createAdapterInfoSnapshot(adapter),
    adapterLimits: Object.freeze({
      maxComputeInvocationsPerWorkgroup: readGpuLimit(adapter, device, "maxComputeInvocationsPerWorkgroup"),
      maxComputeWorkgroupSizeX: readGpuLimit(adapter, device, "maxComputeWorkgroupSizeX"),
      maxComputeWorkgroupSizeY: readGpuLimit(adapter, device, "maxComputeWorkgroupSizeY"),
      maxComputeWorkgroupSizeZ: readGpuLimit(adapter, device, "maxComputeWorkgroupSizeZ"),
      maxComputeWorkgroupsPerDimension: readGpuLimit(adapter, device, "maxComputeWorkgroupsPerDimension"),
      maxStorageBuffersPerShaderStage: readGpuLimit(adapter, device, "maxStorageBuffersPerShaderStage"),
      maxStorageBufferBindingSize: readGpuLimit(adapter, device, "maxStorageBufferBindingSize"),
    }),
    configuredWorkgroupSize: WORKGROUP_SIZE,
  });
}

export function createEnvironmentMapSnapshot(environmentMap) {
  return Object.freeze({
    enabled: environmentMap.enabled,
    width: environmentMap.width,
    height: environmentMap.height,
    mipLevelCount: environmentMap.mipLevelCount ?? 1,
    projection: environmentMap.projection,
    intensity: environmentMap.intensity,
    rotationRadians: environmentMap.rotationRadians,
    ambientStrength: environmentMap.ambientStrength,
    hasImportanceData: environmentMap.hasImportanceData === true,
  });
}

export function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function estimateAccelerationBuildWaitFactor(config) {
  if (config?.gpuAccelerationBuildRequired !== true) {
    return 1;
  }
  const bvhSortStageCount = Array.isArray(config?.bvhSortStages) ? config.bvhSortStages.length : 0;
  const bvhBuildLevelCount = Array.isArray(config?.bvhBuildLevels) ? config.bvhBuildLevels.length : 0;
  const accelerationStageCount = 2 + bvhSortStageCount + bvhBuildLevelCount;
  return Math.max(1, 1 + accelerationStageCount / 96);
}

export function estimateSubmittedGpuWorkTiming(
  config,
  tileCount,
  overrideTimeoutMs = null,
  options = {}
) {
  if (Number.isFinite(overrideTimeoutMs)) {
    const overrideMs = Math.max(1, Math.trunc(Number(overrideTimeoutMs)));
    return Object.freeze({
      timeoutMs: overrideMs,
      maxWaitMs: overrideMs,
    });
  }
  const samplesPerPixel = Math.max(
    1,
    Number(config?.renderedSamplesPerPixel ?? config?.samplesPerPixel ?? 1)
  );
  const maxDepth = Math.max(1, Number(config?.maxDepth ?? 1));
  const deferredResolvePasses = config?.deferredPathResolve ? 1 : 0;
  const denoisePasses = config?.denoise ? (samplesPerPixel < 4 ? 2 : 1) : 0;
  const tiles = Math.max(1, Number(tileCount ?? 1));
  const estimatedPasses =
    tiles * (samplesPerPixel * (maxDepth + 1 + deferredResolvePasses) + denoisePasses + 1);
  const triangleCount = Math.max(0, Number(config?.triangleCount ?? 0));
  const geometryFactor = Math.max(1, triangleCount / 131072);
  const includeAccelerationBuild = options.includeAccelerationBuild === true;
  const accelerationFactor = includeAccelerationBuild
    ? estimateAccelerationBuildWaitFactor(config)
    : 1;
  const estimatedWindowMs = Math.round(
    (GPU_SUBMITTED_WORK_TIMEOUT_MS + estimatedPasses * 5) * geometryFactor * accelerationFactor
  );
  const timeoutMs = Math.min(
    GPU_MAX_SUBMITTED_WORK_TIMEOUT_MS,
    Math.max(GPU_SUBMITTED_WORK_TIMEOUT_MS, estimatedWindowMs)
  );
  const maxWaitMultiplier = includeAccelerationBuild ? 3 : 2;
  const maxWaitMs = Math.min(
    GPU_MAX_SUBMITTED_WORK_DEADLINE_MS,
    Math.max(timeoutMs, estimatedWindowMs * maxWaitMultiplier)
  );
  return Object.freeze({
    timeoutMs,
    maxWaitMs,
  });
}
