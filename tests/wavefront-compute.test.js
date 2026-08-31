import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import {
  createWavefrontPathTracingComputeRenderer,
  createDefaultWavefrontSceneObjects,
  createWavefrontBvhBuildLevels,
  createWavefrontBvhSortStages,
  createWavefrontEmissiveTriangleIndexSource,
  createWavefrontGpuMaterialSource,
  createWavefrontGpuMeshSource,
  createWavefrontMeshAcceleration,
  createWavefrontPathTracingComputeConfig,
  createWavefrontPathTracingComputeShaderSource,
  createWavefrontReferenceRay,
  estimateWavefrontPathTracingMemory,
  intersectWavefrontReferenceTriangle,
  normalizeWavefrontMesh,
  normalizeWavefrontSceneObject,
  packWavefrontBvhNodes,
  packWavefrontSceneObjects,
  packWavefrontTriangles,
  renderWavefrontPathTracingComputeFrame,
  rendererWavefrontComputeMode,
  rendererWavefrontComputeStatsStride,
  rendererWavefrontComputeWorkgroupSize,
  supportsWavefrontPathTracingCompute,
  traceWavefrontReferenceTriangles,
  wavefrontMaterialKinds,
  wavefrontPathTracingComputeLimits,
  wavefrontSceneObjectKinds,
} from "../src/index.js";
import {
  computeWavefrontTerminalEnvironmentContributionReference,
  estimateWavefrontDirectionalHemisphericalReflectance,
  validateWavefrontBsdfSample,
} from "../src/wavefront-compute.js";
import {
  defaultHighSppDenoiseAcceptanceThresholds,
  evaluateHighSppDenoiseAcceptance,
} from "../src/wavefront-denoise-validation.js";
import { dispatchWavefrontGpuAccelerationBuild } from "../src/wavefront-acceleration-builder.js";
import { createGpuParallelismCounters } from "../src/wavefront-frame-runtime.js";
import { createWavefrontFrameTelemetryResources } from "../src/wavefront-frame-telemetry.js";
import { createConfigPayload } from "../src/wavefront-packers.js";
import { createWavefrontBindGroupLayouts } from "../src/wavefront-pipelines.js";
import { assertShaderModuleCompiles } from "../src/wavefront-runtime-support.js";
import {
  listWavefrontSampleDimensions,
  sampleWavefrontDimension2D,
  WAVEFRONT_SAMPLE_DIMENSIONS,
} from "../src/wavefront-sampling-dimensions.js";

const gpuConstants = Object.freeze({
  buffer: Object.freeze({
    MAP_READ: 1,
    COPY_DST: 2,
    COPY_SRC: 4,
    STORAGE: 8,
    UNIFORM: 16,
    INDIRECT: 32,
    QUERY_RESOLVE: 64,
  }),
  texture: Object.freeze({
    COPY_SRC: 1,
    COPY_DST: 2,
    STORAGE_BINDING: 4,
    TEXTURE_BINDING: 8,
  }),
  shader: Object.freeze({
    COMPUTE: 1,
    FRAGMENT: 2,
  }),
  map: Object.freeze({
    READ: 1,
  }),
});

function round(values) {
  return Array.from(values, (value) => Number(value.toFixed(4)));
}

function readRendererSource() {
  const sourceDir = new URL("../src/", import.meta.url);
  return readdirSync(sourceDir)
    .filter((fileName) => fileName.endsWith(".js"))
    .sort()
    .map((fileName) => readFileSync(new URL(fileName, sourceDir), "utf8"))
    .join("\n");
}

function readRendererTypes() {
  return readFileSync(new URL("../src/index.d.ts", import.meta.url), "utf8");
}

async function withWebGpuConstants(callback) {
  const previous = {
    GPUBufferUsage: globalThis.GPUBufferUsage,
    GPUTextureUsage: globalThis.GPUTextureUsage,
    GPUShaderStage: globalThis.GPUShaderStage,
    GPUMapMode: globalThis.GPUMapMode,
  };

  globalThis.GPUBufferUsage = gpuConstants.buffer;
  globalThis.GPUTextureUsage = gpuConstants.texture;
  globalThis.GPUShaderStage = gpuConstants.shader;
  globalThis.GPUMapMode = gpuConstants.map;
  try {
    return await callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete globalThis[key];
      } else {
        globalThis[key] = value;
      }
    }
  }
}

function serialWebGpuTest(name, fn) {
  return test(name, { concurrency: false }, fn);
}

class FakeWavefrontBuffer {
  constructor(device, descriptor) {
    this.device = device;
    this.descriptor = descriptor;
    this.destroyed = false;
    this.readback = new Uint8Array(Math.max(256, descriptor.size ?? 0));
    if (descriptor.label === "plasius.wavefront.rayCounts.readback") {
      new Uint32Array(this.readback.buffer).set(
        device.rayCountReadbackValues ?? [64, 16]
      );
    } else if (descriptor.label === "plasius.wavefront.timestamps.readback") {
      new BigUint64Array(this.readback.buffer).set(
        device.timestampReadbackValues ?? [1_000_000n, 5_000_000n]
      );
    } else {
      this.readback.set([32, 64, 128, 255]);
    }
  }

  async mapAsync() {
    if (
      this.descriptor.label === "plasius.wavefront.rayCounts.readback" &&
      this.device.failRayCountMap === true
    ) {
      throw new Error("simulated ray-count map failure");
    }
    if (
      this.descriptor.label === "plasius.wavefront.timestamps.readback" &&
      this.device.failTimestampMap === true
    ) {
      throw new Error("simulated timestamp map failure");
    }
    if (
      this.device.requireSubmittedWorkDoneBeforeMapAsync === true &&
      this.device.queue.submittedWorkDone !== true
    ) {
      throw new Error("mapAsync called before queue work completion.");
    }
  }

  getMappedRange() {
    return this.readback.buffer;
  }

  unmap() {
    this.unmapped = true;
  }

  destroy() {
    this.destroyed = true;
  }
}

class FakeWavefrontTexture {
  constructor(descriptor) {
    this.descriptor = descriptor;
    this.destroyed = false;
  }

  createView() {
    return { textureLabel: this.descriptor.label };
  }

  destroy() {
    this.destroyed = true;
  }
}

class FakeWavefrontComputePass {
  constructor(device, descriptor) {
    this.device = device;
    this.descriptor = descriptor;
  }

  setBindGroup() {
    this.device.bindGroupSets += 1;
  }

  setPipeline() {
    this.device.pipelineSets += 1;
  }

  dispatchWorkgroups(...groups) {
    this.device.dispatches.push(groups);
  }

  dispatchWorkgroupsIndirect(buffer, offset) {
    this.device.indirectDispatches.push({ buffer, offset });
  }

  end() {
    this.device.computePassesEnded += 1;
  }
}

class FakeWavefrontRenderPass {
  constructor(device, descriptor) {
    this.device = device;
    this.descriptor = descriptor;
  }

  setPipeline() {
    this.device.pipelineSets += 1;
  }

  setBindGroup() {
    this.device.bindGroupSets += 1;
  }

  draw(vertexCount) {
    this.device.drawCalls.push(vertexCount);
  }

  end() {
    this.device.renderPassesEnded += 1;
  }
}

class FakeWavefrontCommandEncoder {
  constructor(device, descriptor) {
    this.device = device;
    this.descriptor = descriptor;
  }

  beginComputePass(descriptor) {
    this.device.computePasses += 1;
    this.device.computePassDescriptors.push(descriptor);
    return new FakeWavefrontComputePass(this.device, descriptor);
  }

  beginRenderPass(descriptor) {
    this.device.renderPasses += 1;
    this.device.renderPassDescriptors.push(descriptor);
    return new FakeWavefrontRenderPass(this.device, descriptor);
  }

  resolveQuerySet(querySet, firstQuery, queryCount, destination, destinationOffset) {
    this.device.queryResolves.push({
      querySet,
      firstQuery,
      queryCount,
      destination,
      destinationOffset,
    });
  }

  copyTextureToBuffer(source, destination, size) {
    this.device.copyTextureToBufferCalls.push({ source, destination, size });
  }

  copyBufferToBuffer(source, sourceOffset, destination, destinationOffset, size) {
    this.device.copyBufferToBufferCalls.push({
      source,
      sourceOffset,
      destination,
      destinationOffset,
      size,
    });
  }

  finish() {
    return { encoderLabel: this.descriptor.label };
  }
}

class FakeWavefrontDevice {
  constructor(options = {}) {
    this.limits = {
      maxStorageBufferBindingSize: 134_217_728,
      minUniformBufferOffsetAlignment: 256,
    };
    this.buffers = [];
    this.textures = [];
    this.dispatches = [];
    this.indirectDispatches = [];
    this.copyBufferToBufferCalls = [];
    this.copyTextureToBufferCalls = [];
    this.drawCalls = [];
    this.features = new Set(options.features ?? []);
    this.querySets = [];
    this.queryResolves = [];
    this.computePassDescriptors = [];
    this.renderPassDescriptors = [];
    this.pipelineLabels = [];
    this.bindGroupSets = 0;
    this.pipelineSets = 0;
    this.computePasses = 0;
    this.computePassesEnded = 0;
    this.renderPasses = 0;
    this.renderPassesEnded = 0;
    this.queue = {
      submissions: [],
      writes: [],
      textureWrites: [],
      submittedWorkDone: false,
      submittedWorkDoneCalls: 0,
      submit: (buffers) => {
        this.queue.submissions.push(buffers);
        this.queue.submittedWorkDone = false;
      },
      onSubmittedWorkDone: async () => {
        this.queue.submittedWorkDoneCalls += 1;
        this.queue.submittedWorkDone = true;
      },
      writeBuffer: (buffer, offset, data) => {
        this.queue.writes.push({ buffer, offset, byteLength: data.byteLength ?? data.length ?? 0 });
      },
      writeTexture: (destination, data, layout, size) => {
        const byteLength = data.byteLength ?? data.length ?? 0;
        const byteOffset = data.byteOffset ?? 0;
        const sourceBuffer = data.buffer ?? data;
        this.queue.textureWrites.push({
          destination,
          byteLength,
          data: new Uint8Array(sourceBuffer.slice(byteOffset, byteOffset + byteLength)),
          layout,
          size,
        });
      },
    };
  }

  createBuffer(descriptor) {
    const buffer = new FakeWavefrontBuffer(this, descriptor);
    this.buffers.push(buffer);
    return buffer;
  }

  createTexture(descriptor) {
    const texture = new FakeWavefrontTexture(descriptor);
    this.textures.push(texture);
    return texture;
  }

  createSampler(descriptor) {
    return { descriptor };
  }

  createQuerySet(descriptor) {
    const querySet = {
      descriptor,
      destroyed: false,
      destroy() {
        this.destroyed = true;
      },
    };
    this.querySets.push(querySet);
    return querySet;
  }

  createBindGroupLayout(descriptor) {
    return { descriptor };
  }

  createPipelineLayout(descriptor) {
    return { descriptor };
  }

  createShaderModule(descriptor) {
    return {
      descriptor,
      async getCompilationInfo() {
        return { messages: [] };
      },
    };
  }

  createBindGroup(descriptor) {
    return { descriptor };
  }

  createComputePipeline(descriptor) {
    this.pipelineLabels.push(descriptor.label);
    return { descriptor };
  }

  createRenderPipeline(descriptor) {
    return { descriptor };
  }

  createCommandEncoder(descriptor) {
    return new FakeWavefrontCommandEncoder(this, descriptor);
  }
}

function createFakeWavefrontNavigator(device = new FakeWavefrontDevice(), adapterOptions = {}) {
  return {
    gpu: {
      async requestAdapter() {
        return {
          limits: adapterOptions.limits,
          info: adapterOptions.info,
          features: new Set(adapterOptions.features ?? device.features ?? []),
          async requestDevice(descriptor) {
            adapterOptions.onRequestDevice?.(descriptor);
            device.features = new Set(descriptor?.requiredFeatures ?? []);
            return device;
          },
        };
      },
      getPreferredCanvasFormat() {
        return "bgra8unorm";
      },
    },
  };
}

async function captureRequestedWavefrontDeviceDescriptor(options = {}, adapterLimits = {}) {
  const stopAfterDescriptor = new Error("stop after device descriptor capture");
  let requestedDeviceDescriptor = null;
  await assert.rejects(
    createWavefrontPathTracingComputeRenderer({
      canvas: createFakeWavefrontCanvas(),
      navigator: createFakeWavefrontNavigator(new FakeWavefrontDevice(), {
        limits: {
          maxStorageBuffersPerShaderStage: 10,
          maxSampledTexturesPerShaderStage: 21,
          maxStorageBufferBindingSize: 4_294_967_292,
          maxBufferSize: 4_294_967_292,
          ...adapterLimits,
        },
        onRequestDevice(descriptor) {
          requestedDeviceDescriptor = descriptor;
          throw stopAfterDescriptor;
        },
      }),
      width: 8,
      height: 8,
      tileSize: 8,
      ...options,
    }),
    (error) => error === stopAfterDescriptor
  );
  return requestedDeviceDescriptor;
}

function createFakeWavefrontCanvas() {
  const context = {
    configured: null,
    configure(config) {
      this.configured = config;
    },
    getCurrentTexture() {
      return new FakeWavefrontTexture({ label: "plasius.wavefront.currentTexture" });
    },
    unconfigure() {
      this.configured = null;
    },
  };

  return {
    width: 0,
    height: 0,
    getContext(type) {
      return type === "webgpu" ? context : null;
    },
    context,
  };
}

test("wavefront compute config keeps 4K queues tile-bounded", () => {
  const config = createWavefrontPathTracingComputeConfig({
    width: 3840,
    height: 2160,
    tileSize: 128,
    maxDepth: 8,
  });

  assert.equal(config.width, 3840);
  assert.equal(config.mode, rendererWavefrontComputeMode);
  assert.equal(config.height, 2160);
  assert.equal(config.maxDepth, 8);
  assert.equal(config.samplesPerPixel, 1);
  assert.equal(config.maxFramePassesPerSubmission, 256);
  assert.equal(config.displayQuality, false);
  assert.equal(config.requiresMeshBvhForDisplayQuality, true);
  assert.equal(config.tilePixelCapacity, 128 * 128);
  assert.equal(wavefrontPathTracingComputeLimits.hitRecordBytes, 256);
  assert.equal(wavefrontPathTracingComputeLimits.workgroupSize, rendererWavefrontComputeWorkgroupSize);
  assert.equal(rendererWavefrontComputeStatsStride, 8);
  assert.equal(config.memory.queueBytes, 128 * 128 * wavefrontPathTracingComputeLimits.rayRecordBytes);
  assert.equal(config.memory.hitBytes, 128 * 128 * wavefrontPathTracingComputeLimits.hitRecordBytes);
  assert.equal(config.memory.pathVertexBytes, 128 * 128 * 9 * wavefrontPathTracingComputeLimits.pathVertexRecordBytes);
  assert.equal(config.memory.configBytes, 320);
  assert.equal(config.memory.counterBytes, wavefrontPathTracingComputeLimits.counterRecordBytes);
  assert.equal(
    config.memory.indirectDispatchBytes,
    wavefrontPathTracingComputeLimits.indirectDispatchRecordBytes
  );
  assert.equal(
    config.memory.bvhLeafReferenceBytes,
    wavefrontPathTracingComputeLimits.bvhLeafReferenceRecordBytes
  );
  assert.equal(config.memory.emissiveTriangleMetadataBytes, 0);
  assert.equal(config.memory.environmentPortalBytes, 32 * wavefrontPathTracingComputeLimits.environmentPortalRecordBytes);
  assert.ok(config.memory.queueBytes < 134_217_728);
  assert.ok(config.memory.hitBytes < 134_217_728);
});

test("wavefront compute config supports high quality reference depths", () => {
  const config = createWavefrontPathTracingComputeConfig({
    width: 3840,
    height: 2160,
    tileSize: 128,
    maxDepth: 20,
  });
  const clamped = createWavefrontPathTracingComputeConfig({
    width: 640,
    height: 360,
    maxDepth: 64,
  });

  assert.equal(config.maxDepth, 20);
  assert.equal(
    config.memory.pathVertexBytes,
    128 * 128 * 21 * wavefrontPathTracingComputeLimits.pathVertexRecordBytes
  );
  assert.equal(clamped.maxDepth, 32);
});

test("wavefront compute compatibility exports expose the canonical mesh shader", () => {
  const shaderSource = createWavefrontPathTracingComputeShaderSource();
  const types = readRendererTypes();

  assert.match(shaderSource, /fn prepareMeshTrianglesAndLeaves/);
  assert.match(shaderSource, /fn intersect_bvh/);
  assert.match(shaderSource, /fn intersect_triangle/);
  assert.match(shaderSource, /fn write_active_dispatch_args/);
  assert.doesNotMatch(shaderSource, /intersectSphere/);
  assert.match(types, /hitRecordBytes: 256;/);
  assert.match(types, /sceneObjectRecordBytes: 160;/);
  assert.match(types, /meshRangeRecordBytes: 240;/);
  assert.match(types, /triangleRecordBytes: 576;/);
  assert.match(types, /materialRecordBytes: 192;/);
  assert.match(types, /readonly secondaryRays: number \| null;/);
  assert.match(types, /readonly totalPathSegments: number \| null;/);
  assert.match(types, /readonly rayCounts: WavefrontRayCountTelemetry;/);
  assert.match(types, /readonly timings: WavefrontFrameTimingTelemetry;/);
  assert.match(types, /readonly telemetryMemoryBytes: number;/);
  assert.throws(
    () => createWavefrontPathTracingComputeShaderSource({ workgroupSize: 32 }),
    /requires workgroupSize=64/
  );
});

test("assembled wavefront WGSL avoids field-count-sensitive triangle constructors", () => {
  const shaderSource = createWavefrontPathTracingComputeShaderSource();
  const constructors = shaderSource.match(/TriangleRecord\(/g) ?? [];
  const zeroInitializers = shaderSource.match(/TriangleRecord\(\)/g) ?? [];

  assert.equal(constructors.length, 2);
  assert.equal(zeroInitializers.length, constructors.length);
  assert.match(shaderSource, /preparedTriangle\.materialExtension2 = vec4<f32>\(0\.0, 0\.0, 1\.3, 0\.0\)/);
  assert.match(shaderSource, /preparedTriangle\.materialExtension3 = vec4<f32>\(100\.0, 400\.0, 0\.0, 0\.0\)/);
  assert.match(shaderSource, /preparedTriangle\.anisotropyAtlas = vec4<f32>\(0\.0, 0\.0, 1\.0, 1\.0\)/);
});

test("shader preflight uses the standard WebGPU compilation diagnostics API", async () => {
  let calls = 0;
  const shaderModule = {
    async getCompilationInfo() {
      calls += 1;
      return {
        messages: [
          {
            type: "error",
            lineNum: 1947,
            linePos: 30,
            message: "structure constructor has too few inputs",
          },
        ],
      };
    },
  };

  await assert.rejects(
    () => assertShaderModuleCompiles(shaderModule, "plasius.wavefront.computeShader"),
    /WGSL compilation preflight failed.*line 1947:30 structure constructor has too few inputs/s
  );
  assert.equal(calls, 1);
  const source = readRendererSource();
  assert.match(source, /getCompilationInfo/);
  assert.doesNotMatch(source, /\.compilationInfo\(/);
});

test("trace bind-group layout covers every declared material extension texture", () => {
  const layouts = createWavefrontBindGroupLayouts(new FakeWavefrontDevice(), gpuConstants);
  const bindings = layouts.trace.descriptor.entries.map(({ binding }) => binding);

  assert.deepEqual(bindings.slice(-12), Array.from({ length: 12 }, (_, index) => 33 + index));
  assert.equal(new Set(bindings).size, bindings.length);
});

test("wavefront compute config exposes bounded samples per pixel", () => {
  const config = createWavefrontPathTracingComputeConfig({
    width: 640,
    height: 360,
    samplesPerPixel: 8,
    maxFramePassesPerSubmission: 32,
  });
  const clamped = createWavefrontPathTracingComputeConfig({
    width: 640,
    height: 360,
    samplesPerPixel: 512,
  });

  assert.equal(config.samplesPerPixel, 8);
  assert.equal(config.maxFramePassesPerSubmission, 32);
  assert.equal(clamped.samplesPerPixel, 256);
  assert.throws(
    () =>
      createWavefrontPathTracingComputeConfig({
        width: 640,
        height: 360,
        samplesPerPixel: 0,
      }),
    /samplesPerPixel must be a positive integer/
  );
  assert.throws(
    () =>
      createWavefrontPathTracingComputeConfig({
        width: 640,
        height: 360,
        maxFramePassesPerSubmission: 0,
      }),
    /maxFramePassesPerSubmission must be a positive integer/
  );
});

test("wavefront frame config exposes samples per pixel to WGSL", () => {
  const shaderSource = createWavefrontPathTracingComputeShaderSource();
  const config = createWavefrontPathTracingComputeConfig({
    width: 640,
    height: 360,
    samplesPerPixel: 8,
  });
  const payload = createConfigPayload(
    config,
    { x: 0, y: 0, width: 64, height: 64 },
    17
  );
  const payloadView = new DataView(payload);

  assert.match(shaderSource, /samplesPerPixel: u32/);
  assert.match(shaderSource, /config\.samplesPerPixel/);
  assert.equal(payloadView.getUint32(264, true), 8);
});

test("wavefront config packs the strict physical low-spp lighting flag", () => {
  const directConfig = createWavefrontPathTracingComputeConfig({
    width: 640,
    height: 360,
    strictPhysicalLowSppLighting: true,
  });
  const dottedConfig = createWavefrontPathTracingComputeConfig({
    width: 640,
    height: 360,
    featureFlags: {
      "renderer.transport.strictPhysicalLowSppLighting": true,
    },
  });
  const nestedConfig = createWavefrontPathTracingComputeConfig({
    width: 640,
    height: 360,
    featureFlags: {
      renderer: {
        transport: {
          strictPhysicalLowSppLighting: true,
        },
      },
    },
  });
  const payload = createConfigPayload(
    directConfig,
    { x: 0, y: 0, width: 64, height: 64 },
    17
  );
  const payloadView = new DataView(payload);

  assert.equal(createWavefrontPathTracingComputeConfig({ width: 640, height: 360 }).strictPhysicalLowSppLighting, false);
  assert.equal(directConfig.strictPhysicalLowSppLighting, true);
  assert.equal(dottedConfig.strictPhysicalLowSppLighting, true);
  assert.equal(nestedConfig.strictPhysicalLowSppLighting, true);
  assert.equal(payloadView.getFloat32(296, true), 1);
});

test("wavefront config packs composable transport experiment flags", () => {
  const baseline = createWavefrontPathTracingComputeConfig({
    width: 640,
    height: 360,
  });
  const config = createWavefrontPathTracingComputeConfig({
    width: 640,
    height: 360,
    strictPhysicalLowSppLighting: true,
    featureFlags: {
      enabled: {
        "renderer.transport.stableSampleRouting.enabled": true,
        "renderer.transport.strictZeroOverflow.enabled": true,
        "renderer.transport.deferLowSppRussianRoulette.enabled": true,
        "renderer.transport.deterministicDirectLighting.enabled": true,
        "renderer.transport.sourceStableDirectLighting.enabled": true,
        "renderer.transport.deterministicLowSppIndirect.enabled": true,
        "renderer.environment.productStudioImportance.enabled": true,
        "renderer.diagnostics.productTransportTelemetry.enabled": true,
      },
    },
  });
  const strictOffConfig = createWavefrontPathTracingComputeConfig({
    width: 640,
    height: 360,
    featureFlags: {
      enabled: {
        "renderer.transport.strictZeroOverflow.enabled": true,
        "renderer.transport.deferLowSppRussianRoulette.enabled": true,
        "renderer.transport.deterministicDirectLighting.enabled": true,
        "renderer.transport.sourceStableDirectLighting.enabled": true,
        "renderer.transport.deterministicLowSppIndirect.enabled": true,
      },
    },
  });
  const deterministicIndirectConfig = createWavefrontPathTracingComputeConfig({
    width: 640,
    height: 360,
    strictPhysicalLowSppLighting: true,
    featureFlags: {
      enabled: {
        "renderer.transport.deterministicLowSppIndirect.enabled": true,
      },
    },
  });
  const payload = createConfigPayload(config, { x: 0, y: 0, width: 64, height: 64 }, 17);
  const payloadView = new DataView(payload);

  assert.equal(baseline.transportExperimentFlags, 0);
  assert.equal(config.transportExperiments.requested.strictZeroOverflow, true);
  assert.equal(config.transportExperiments.effective.strictZeroOverflow, true);
  assert.equal(config.transportExperiments.requested.sourceStableDirectLighting, true);
  assert.equal(config.transportExperiments.effective.sourceStableDirectLighting, true);
  assert.equal(config.transportExperiments.requested.deterministicLowSppIndirect, true);
  assert.equal(config.transportExperiments.effective.deterministicLowSppIndirect, true);
  assert.equal(config.transportExperiments.effective.productTransportTelemetry, true);
  assert.equal(config.presentationOutput, "tone-mapped");
  assert.equal(config.transportExperimentFlags, 255);
  assert.equal(payloadView.getUint32(268, true), 255);
  assert.equal(new Float32Array(payload, 288, 4)[3], 0);
  assert.equal(strictOffConfig.transportExperiments.requested.strictZeroOverflow, true);
  assert.equal(strictOffConfig.transportExperiments.requested.sourceStableDirectLighting, true);
  assert.equal(strictOffConfig.transportExperiments.effective.strictZeroOverflow, false);
  assert.equal(strictOffConfig.transportExperiments.effective.deterministicDirectLighting, false);
  assert.equal(strictOffConfig.transportExperiments.effective.sourceStableDirectLighting, false);
  assert.equal(strictOffConfig.transportExperiments.effective.deterministicLowSppIndirect, false);
  assert.equal(deterministicIndirectConfig.transportExperiments.requested.deterministicDirectLighting, false);
  assert.equal(deterministicIndirectConfig.transportExperiments.effective.deterministicDirectLighting, true);
  assert.equal(deterministicIndirectConfig.transportExperiments.effective.deterministicLowSppIndirect, true);
});

test("wavefront config packs linear presentation output without changing the default", () => {
  const config = createWavefrontPathTracingComputeConfig({
    width: 640,
    height: 360,
    presentationOutput: "linear",
  });
  const payload = createConfigPayload(config, { x: 0, y: 0, width: 64, height: 64 }, 0);

  assert.equal(config.presentationOutput, "linear");
  assert.equal(new Float32Array(payload, 288, 4)[3], 1);
  assert.throws(
    () => createWavefrontPathTracingComputeConfig({ presentationOutput: "raw" }),
    /presentationOutput must be 'tone-mapped' or 'linear'/
  );
});

test("wavefront reference helper generates deterministic primary rays from the camera contract", () => {
  const config = createWavefrontPathTracingComputeConfig({
    width: 1,
    height: 1,
    camera: {
      position: [0, 0, 1],
      target: [0, 0, 0],
      up: [0, 1, 0],
      fovYDegrees: 60,
    },
  });

  const ray = createWavefrontReferenceRay(config, {
    pixelIndex: 0,
    sampleIndex: 3,
    frameIndex: 7,
    jitterScale: 0,
  });

  assert.equal(ray.rayId, 0);
  assert.equal(ray.sourcePixelId, 0);
  assert.equal(ray.sampleId, 3);
  assert.equal(ray.pixelX, 0);
  assert.equal(ray.pixelY, 0);
  assert.deepEqual(round(ray.origin), [0, 0, 1]);
  assert.deepEqual(round(ray.direction), [0, 0, -1]);
});

test("wavefront reference triangle intersection resolves a one-triangle hit", () => {
  const config = createWavefrontPathTracingComputeConfig({
    width: 1,
    height: 1,
    camera: {
      position: [0, 0, 1],
      target: [0, 0, 0],
      up: [0, 1, 0],
      fovYDegrees: 60,
    },
  });
  const ray = createWavefrontReferenceRay(config, { jitterScale: 0 });
  const acceleration = createWavefrontMeshAcceleration([
    {
      id: 7,
      positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
      indices: [0, 1, 2],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
      uvs: [0, 0, 1, 0, 0.5, 1],
      materialRefId: 33,
      mediumRefId: 4,
    },
  ]);

  const hit = traceWavefrontReferenceTriangles(config, ray, acceleration.triangles);

  assert.equal(hit.hitType, "surface");
  assert.equal(hit.entityId, 7);
  assert.equal(hit.primitiveId, 0);
  assert.equal(hit.materialRefId, 33);
  assert.equal(hit.mediumRefId, 4);
  assert.equal(hit.frontFace, true);
  assert.equal(Number(hit.distance.toFixed(4)), 1);
  assert.deepEqual(round(hit.barycentrics), [0.25, 0.25, 0.5]);
  assert.deepEqual(round(hit.uv), [0.5, 0.5]);
  assert.deepEqual(round(hit.geometricNormal), [0, 0, 1]);
  assert.deepEqual(round(hit.materialResponse), [0, 0, 0, 0]);
});

test("wavefront reference tracing returns an environment hit on miss", () => {
  const config = createWavefrontPathTracingComputeConfig({
    width: 1,
    height: 1,
    camera: {
      position: [0, 0, 1],
      target: [0, 0, 0],
      up: [0, 1, 0],
      fovYDegrees: 60,
    },
  });
  const ray = createWavefrontReferenceRay(config, { jitterScale: 0 });
  const acceleration = createWavefrontMeshAcceleration([
    {
      id: 9,
      positions: [2, -1, 0, 4, -1, 0, 3, 1, 0],
    },
  ]);

  const hit = traceWavefrontReferenceTriangles(config, ray, acceleration.triangles);

  assert.equal(hit.hitType, "environment");
  assert.equal(hit.distance, -1);
  assert.equal(hit.triangleIndex, -1);
  assert.deepEqual(round(hit.geometricNormal), [0, 0, 1]);
  assert.deepEqual(round(hit.materialResponse), [0, 0, 0, 0]);
});

test("wavefront CPU-upload acceleration preserves raw base color and atlas rects for GPU hit sampling", () => {
  const acceleration = createWavefrontMeshAcceleration([
    {
      positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
      indices: [0, 1, 2],
      uvs: [0, 0, 1, 0, 0.5, 1],
      baseColorTexture: {
        width: 1,
        height: 1,
        data: [1, 0, 0, 1],
      },
    },
  ]);

  assert.deepEqual(round(acceleration.triangles[0].color), [0.72, 0.72, 0.68, 1]);
  assert.notDeepEqual(round(acceleration.triangles[0].baseColorAtlas), [0, 0, 1, 1]);
});

test("wavefront reference tracing selects the nearest triangle hit", () => {
  const config = createWavefrontPathTracingComputeConfig({
    width: 1,
    height: 1,
    camera: {
      position: [0, 0, 1],
      target: [0, 0, 0],
      up: [0, 1, 0],
      fovYDegrees: 60,
    },
  });
  const ray = createWavefrontReferenceRay(config, { jitterScale: 0 });
  const nearTriangle = normalizeWavefrontMesh({
    id: 11,
    positions: [-1, -1, 0.5, 1, -1, 0.5, 0, 1, 0.5],
  });
  const farTriangle = normalizeWavefrontMesh({
    id: 12,
    positions: [-1, -1, 0.1, 1, -1, 0.1, 0, 1, 0.1],
  });
  const acceleration = createWavefrontMeshAcceleration([nearTriangle, farTriangle]);

  const hit = traceWavefrontReferenceTriangles(config, ray, acceleration.triangles);

  assert.equal(hit.hitType, "surface");
  assert.equal(hit.entityId, 11);
  assert.equal(hit.triangleIndex, 0);
  assert.equal(Number(hit.distance.toFixed(4)), 0.5);
});

test("wavefront reference tracing repairs flipped shading normals into the geometric hemisphere", () => {
  const config = createWavefrontPathTracingComputeConfig({
    width: 1,
    height: 1,
    camera: {
      position: [0, 0, 1],
      target: [0, 0, 0],
      up: [0, 1, 0],
      fovYDegrees: 60,
    },
  });
  const ray = createWavefrontReferenceRay(config, { jitterScale: 0 });
  const acceleration = createWavefrontMeshAcceleration([
    {
      id: 14,
      positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0],
      indices: [0, 1, 2],
      normals: [0, 0, -1, 0, 0, -1, 0, 0, -1],
    },
  ]);

  const hit = traceWavefrontReferenceTriangles(config, ray, acceleration.triangles);

  assert.equal(hit.hitType, "surface");
  assert.deepEqual(round(hit.geometricNormal), [0, 0, 1]);
  assert.deepEqual(round(hit.shadingNormal), [0, 0, 1]);
});

test("wavefront reference triangle intersection rejects hits past max distance", () => {
  const config = createWavefrontPathTracingComputeConfig({
    width: 1,
    height: 1,
    camera: {
      position: [0, 0, 1],
      target: [0, 0, 0],
      up: [0, 1, 0],
      fovYDegrees: 60,
    },
  });
  const ray = createWavefrontReferenceRay(config, { jitterScale: 0 });
  const acceleration = createWavefrontMeshAcceleration([
    {
      id: 13,
      positions: [-1, -1, 0.5, 1, -1, 0.5, 0, 1, 0.5],
    },
  ]);

  const directHit = intersectWavefrontReferenceTriangle(ray, acceleration.triangles[0], {
    maxDistance: 0.25,
  });
  const tracedHit = traceWavefrontReferenceTriangles(config, ray, acceleration.triangles, {
    maxDistance: 0.25,
  });

  assert.equal(directHit, null);
  assert.equal(tracedHit.hitType, "environment");
  assert.equal(tracedHit.distance, -1);
});

test("wavefront compute offsets continuation and visibility rays with geometric-normal-aware origins", () => {
  const source = readRendererSource();

  assert.match(
    source,
    /fn surface_shading_normal\(hit: HitRecord\) -> vec3<f32> \{\s+let geometric = safe_normalize\(hit\.geometricNormal\.xyz, vec3<f32>\(0\.0, 1\.0, 0\.0\)\);\s+return repair_shading_normal\(geometric, hit\.shadingNormal\.xyz\);\s+\}/
  );
  assert.match(
    source,
    /fn offset_origin\(\s*position: vec3<f32>,\s*geometricNormal: vec3<f32>,\s*shadingNormal: vec3<f32>,\s*rayDirection: vec3<f32>\s*\) -> vec3<f32>/
  );
  assert.match(source, /let raySide = select\(-1\.0, 1\.0, dot\(rayDirection, geometric\) >= 0\.0\);/);
  assert.match(source, /let positionScale = max\(max\(abs\(position\.x\), abs\(position\.y\)\), abs\(position\.z\)\);/);
  assert.match(source, /let positionAwareEpsilon = positionScale \* 0\.00000047683716;/);
  assert.match(
    source,
    /let offsetDistance = clamp\(max\(0\.00025, positionAwareEpsilon\), 0\.00025, 0\.01\);/
  );
  assert.match(
    source,
    /radiance = direct_environment_radiance\(\s*offset_origin\(hit\.position\.xyz, hit\.geometricNormal\.xyz, hit\.shadingNormal\.xyz, lightDirection\),\s*lightDirection\s*\);/
  );
  assert.match(
    source,
    /let origin = offset_origin\(\s*hit\.position\.xyz,\s*hit\.geometricNormal\.xyz,\s*hit\.shadingNormal\.xyz,\s*lightDirection\s*\);/
  );
  assert.match(
    source,
    /offset_origin\(\s*hit\.position\.xyz,\s*hit\.geometricNormal\.xyz,\s*hit\.shadingNormal\.xyz,\s*scatter\.direction\.xyz\s*\)/
  );
});

test("wavefront compute denoise adapts filter cost and strength to spp", () => {
  const source = readRendererSource();

  assert.match(source, /rgba16float/);
  assert.match(source, /radianceTexture/);
  assert.match(source, /denoiseScratchTexture/);
  assert.match(source, /radianceToScratch/);
  assert.match(source, /scratchToOutput/);
  assert.match(source, /radianceToOutput/);
  assert.match(source, /denoiseLinearRadiance/);
  assert.match(source, /resolveDenoisedOutputImage/);
  assert.match(source, /fn denoise_sample_count\(\) -> f32/);
  assert.match(source, /fn denoise_strength\(\) -> f32/);
  assert.match(source, /fn denoise_kernel_radius\(\) -> i32/);
  assert.match(source, /encodeDenoise\(encoder, configOffset, parallelism, renderedSamplesPerPixel\)/);
  assert.match(source, /const useTwoPassDenoise = renderedSamplesPerPixel < 4;/);
  assert.match(source, /const denoisePassCount = renderedSamplesPerPixel < 4 \? 2 : 1;/);
  assert.match(source, /tone_map_radiance/);
  assert.match(source, /fn present_radiance/);
  assert.match(source, /config\.pathResolveSettings\.w > 0\.5/);
  assert.match(source, /present_radiance\(linearOutput\)/);
  assert.match(source, /present_radiance\(radiance\)/);
  assert.doesNotMatch(source, /getImageData|putImageData/);
});

test("wavefront sample dimensions stay unique and expose low-discrepancy helpers", () => {
  const dimensions = listWavefrontSampleDimensions();
  const uniqueDimensions = new Set(dimensions.map(({ dimension }) => dimension));
  const source = readRendererSource();
  const shaderSource = createWavefrontPathTracingComputeShaderSource();
  const jitterA = sampleWavefrontDimension2D(
    17,
    0,
    0,
    777,
    WAVEFRONT_SAMPLE_DIMENSIONS.cameraJitter,
    32
  );
  const jitterB = sampleWavefrontDimension2D(
    17,
    1,
    0,
    777,
    WAVEFRONT_SAMPLE_DIMENSIONS.cameraJitter,
    32
  );

  assert.equal(uniqueDimensions.size, dimensions.length);
  assert.ok(
    dimensions.every(({ wgslName }) => shaderSource.includes(`const ${wgslName}: u32 =`))
  );
  assert.match(source, /fn radical_inverse_vdc\(bits: u32\) -> f32/);
  assert.match(source, /fn sample_frame_index\(frameIndex: u32\) -> u32/);
  assert.match(source, /TRANSPORT_EXPERIMENT_STABLE_SAMPLE_ROUTING/);
  assert.match(source, /fn sample_dimension_1d\(/);
  assert.match(source, /fn sample_dimension_2d\(/);
  assert.notDeepEqual(jitterA, jitterB);
  assert.ok(jitterA.every((value) => value >= 0 && value < 1));
  assert.ok(jitterB.every((value) => value >= 0 && value < 1));
});

test("wavefront shader source keeps shared low-discrepancy helpers single-defined", () => {
  const shaderSource = createWavefrontPathTracingComputeShaderSource();
  const radicalInverseMatches = shaderSource.match(/fn radical_inverse_vdc\(/g) ?? [];

  assert.equal(radicalInverseMatches.length, 1);
});

test("wavefront compute guides active continuation rays toward emissive triangles", () => {
  const source = readRendererSource();

  assert.match(source, /emissiveTriangleIndices/);
  assert.match(source, /sample_emissive_triangle_direction/);
  assert.match(source, /config\.emissiveTriangleCount/);
  assert.match(source, /RAY_FLAG_GUIDED_EMISSIVE/);
  assert.match(source, /guidedLightWeight/);
  assert.match(source, /guidedEmissiveAvailable/);
  assert.match(source, /SAMPLE_DIM_GUIDED_EMISSIVE_SELECTION/);
  assert.match(source, /SAMPLE_DIM_GUIDED_EMISSIVE_SURFACE/);
  assert.match(source, /sample_emissive_triangle_direction\(\s+hit,\s+ray\.sourcePixelId,/);
  assert.match(source, /RAY_FLAG_GUIDED_EMISSIVE/);
  assert.match(source, /\(pixelId \* 747796405u\) \^/);
  assert.match(
    source,
    /sample_dimension_2d\(\s*sourcePixelId,\s*sampleId,\s*0u,\s*config\.frameIndex,\s*SAMPLE_DIM_CAMERA_JITTER,\s*config\.samplesPerPixel\s*\)/
  );
  assert.match(
    source,
    /sample_dimension_1d\(\s*ray\.sourcePixelId,\s*ray\.sampleId,\s*ray\.bounce,\s*config\.frameIndex,\s*SAMPLE_DIM_TRANSMISSION_SELECTOR/
  );
  assert.match(source, /bvhNodes\[config\.bvhNodeCapacity \+ lightSlot\]/);
  assert.match(source, /nextIndex >= config\.tilePixelCount/);
  assert.doesNotMatch(source, /direct_key_lighting/);
});

test("wavefront compute guides and gates environment lighting through portals", () => {
  const source = readRendererSource();

  assert.match(source, /ENVIRONMENT_PORTAL_RECORD_BYTES = 96/);
  assert.match(source, /environmentPortalRecordBytes/);
  assert.match(source, /@group\(0\) @binding\(19\) var<storage, read> environmentPortals/);
  assert.match(source, /@group\(0\) @binding\(20\) var environmentMapTexture: texture_2d<f32>/);
  assert.match(source, /@group\(0\) @binding\(21\) var environmentMapSampler: sampler/);
  assert.match(source, /@group\(0\) @binding\(22\) var<storage, read_write> pathVertices/);
  assert.match(source, /fn environment_map_radiance/);
  assert.match(source, /textureSampleLevel\(environmentMapTexture, environmentMapSampler, uv, 0\.0\)/);
  assert.match(source, /fn environment_portal_radiance_scale/);
  assert.match(source, /fn gated_environment_radiance/);
  assert.match(source, /fn sample_environment_portal_direction/);
  assert.match(source, /guidedPortalAvailable/);
  assert.match(source, /SAMPLE_DIM_GUIDED_PORTAL_SELECTION/);
  assert.match(source, /SAMPLE_DIM_GUIDED_PORTAL_SURFACE/);
  assert.match(source, /sample_environment_portal_direction\(\s*hit,\s*ray\.sourcePixelId,/);
  assert.match(source, /gated_environment_radiance\(ray\.origin\.xyz, ray\.direction\.xyz\)/);
});

test("high-spp denoise acceptance keeps denoise-off structural and detail gates explicit", () => {
  const passing = evaluateHighSppDenoiseAcceptance({
    baselineDenoiseOff: { luminanceStdDev: 0.12 },
    denoiseOff: {
      structuralArtifactShare: 0,
      invalidSampleShare: 0,
      luminanceStdDev: 0.11,
      detailContrast: { sheen: 0.96, chrome: 0.93, wood: 0.91 },
    },
    denoiseOn: {
      structuralArtifactShare: 0,
      detailContrast: { sheen: 0.9, chrome: 0.88, wood: 0.85 },
    },
  });
  const masked = evaluateHighSppDenoiseAcceptance({
    baselineDenoiseOff: { luminanceStdDev: 0.12 },
    denoiseOff: {
      structuralArtifactShare: 0.01,
      invalidSampleShare: 0,
      luminanceStdDev: 0.11,
      detailContrast: { sheen: 0.96, chrome: 0.93, wood: 0.91 },
    },
    denoiseOn: {
      structuralArtifactShare: 0,
      detailContrast: { sheen: 0.9, chrome: 0.88, wood: 0.85 },
    },
  });
  const blurred = evaluateHighSppDenoiseAcceptance({
    baselineDenoiseOff: { luminanceStdDev: 0.12 },
    denoiseOff: {
      structuralArtifactShare: 0,
      invalidSampleShare: 0,
      luminanceStdDev: 0.11,
      detailContrast: { sheen: 1, chrome: 1, wood: 1 },
    },
    denoiseOn: {
      structuralArtifactShare: 0,
      detailContrast: { sheen: 0.7, chrome: 0.68, wood: 0.66 },
    },
  });

  assert.equal(defaultHighSppDenoiseAcceptanceThresholds.minDetailRetentionRatio, 0.92);
  assert.equal(passing.pass, true);
  assert.equal(masked.pass, false);
  assert.ok(masked.failures.some((failure) => failure.includes("cannot mask")));
  assert.equal(blurred.pass, false);
  assert.ok(blurred.failures.some((failure) => failure.includes("detail retention")));
});

test("wavefront compute uses physical continuation throughput with strict physical termination", () => {
  const source = readRendererSource();

  assert.match(source, /struct TerminationMetrics {/);
  assert.match(source, /ambientResidualLuminanceScaled: atomic<u32>/);
  assert.match(source, /totalTerminalLuminanceScaled: atomic<u32>/);
  assert.match(source, /const TERMINAL_SOURCE_KIND_EMISSIVE = 1u;/);
  assert.match(source, /const TERMINAL_SOURCE_KIND_ENVIRONMENT = 2u;/);
  assert.match(source, /const TERMINAL_SOURCE_KIND_AMBIENT_MAX_DEPTH = 3u;/);
  assert.match(source, /const TERMINAL_SOURCE_KIND_AMBIENT_QUEUE_OVERFLOW = 4u;/);
  assert.match(source, /const TERMINAL_SOURCE_KIND_ABSORPTION_NULL = 5u;/);
  assert.match(source, /const TERMINAL_SOURCE_KIND_RUSSIAN_ROULETTE = 6u;/);
  assert.match(source, /const TERMINAL_SOURCE_KIND_MAX_DEPTH_STRICT = 7u;/);
  assert.match(source, /const SCATTER_LOBE_DIFFUSE: u32 = 1u;/);
  assert.match(source, /const SCATTER_LOBE_SPECULAR: u32 = 2u;/);
  assert.match(source, /const SCATTER_LOBE_CLEARCOAT: u32 = 3u;/);
  assert.match(source, /const SCATTER_LOBE_DELTA_REFLECTION: u32 = 4u;/);
  assert.match(source, /const SCATTER_LOBE_DELTA_TRANSMISSION: u32 = 5u;/);
  assert.match(source, /fn terminal_surface_environment_source/);
  assert.match(source, /fn terminal_surface_environment_contribution/);
  assert.match(source, /fn strict_physical_low_spp_lighting_enabled\(\) -> bool/);
  assert.match(source, /return config\.pathResolveSettings\.z > 0\.5;/);
  assert.match(source, /fn sanitize_path_throughput_component/);
  assert.match(source, /fn sanitize_path_throughput/);
  assert.match(source, /fn record_deferred_path_throughput/);
  assert.match(source, /fn surface_delta_reflection_throughput/);
  assert.match(source, /fn surface_delta_transmission_throughput/);
  assert.match(source, /fn surface_continuation_throughput/);
  assert.match(source, /fn sunlit_baseline_radiance/);
  assert.match(source, /let baseline = max\(config\.pathResolveSettings\.y, 0\.0\);/);
  assert.match(source, /if \(value != value \|\| value <= 0\.0\) \{\s+return 0\.0;\s+\}/);
  assert.match(source, /return min\(value, 65504\.0\);/);
  assert.match(source, /return sanitize_path_throughput\(fresnel\);/);
  assert.match(source, /return sanitize_path_throughput\(max\(vec3<f32>\(1\.0\) - fresnel, vec3<f32>\(0\.0\)\) \* transmissionTint\);/);
  assert.match(source, /if \(\(scatter\.flags & RAY_FLAG_DELTA_SAMPLE\) != 0u\) \{/);
  assert.match(source, /if \(scatter\.lobeKind == SCATTER_LOBE_DELTA_TRANSMISSION\) \{/);
  assert.match(source, /let bsdf = evaluate_surface_bsdf\(hit, viewDirection, lightDirection\);/);
  assert.match(source, /let nDotL = saturate\(dot\(normal, lightDirection\)\);/);
  assert.match(source, /return sanitize_path_throughput\(bsdf \* \(nDotL \/ scatter\.pdf\)\);/);
  assert.match(source, /let surfaceColor = max\(hit\.color\.xyz, config\.ambientColor\.xyz\);/);
  assert.match(source, /let sunlitFloor = sunlit_baseline_radiance\(normal\);/);
  assert.match(source, /let glossiness = surface_glossiness\(hit\);/);
  assert.match(source, /max\(config\.ambientColor\.xyz, sunlitFloor \* 0\.82\)/);
  assert.match(source, /max\(config\.ambientColor\.xyz \* 0\.35, sunlitFloor \* 0\.58\)/);
  assert.match(source, /max\(0\.12, config\.pathResolveSettings\.y \* 0\.42\)/);
  assert.match(source, /let reflectionEnvironment = prefiltered_environment_radiance\(reflectionDirection, roughness\);/);
  assert.match(source, /let brdfTerm = sample_brdf_lut\(saturate\(dot\(normal, viewDirection\)\), roughness\);/);
  assert.match(source, /let specularEnvironment = reflectionEnvironment \* \(f0 \* brdfTerm\.x \+ vec3<f32>\(brdfTerm\.y\)\);/);
  assert.match(source, /let glossyEnvironment = max\(/);
  assert.match(source, /let environmentFloor = max\(ambientFloor, max\(sunlitFloor, glossyEnvironment \* environmentInfluence\)\);/);
  assert.match(source, /var continuationThroughput = surface_continuation_throughput\(\s+hit,\s+continuationViewDirection,\s+continuationLightDirection,\s+scatter\s+\) \* segmentTransmittance;/);
  assert.match(source, /if \(max_component\(continuationThroughput\) <= 0\.000001\) \{/);
  assert.match(source, /record_deferred_path_throughput\(ray, continuationThroughput\);/);
  assert.match(source, /TRANSPORT_EXPERIMENT_DEFER_LOW_SPP_RUSSIAN_ROULETTE/);
  assert.match(source, /let rouletteStartBounce = select\(/);
  assert.match(source, /strict_physical_low_spp_lighting_enabled\(\) && ray\.bounce >= rouletteStartBounce/);
  assert.match(source, /let survivalProbability = clamp\(max_component\(continuationThroughput\), 0\.05, 0\.95\);/);
  assert.match(source, /SAMPLE_DIM_RUSSIAN_ROULETTE/);
  assert.match(source, /continuationThroughput = continuationThroughput \/ survivalProbability;/);
  assert.match(
    source,
    /record_deferred_terminal_source\(\s*ray,\s*vec3<f32>\(0\.0\),\s*TERMINAL_SOURCE_KIND_MAX_DEPTH_STRICT\s*\);/
  );
  assert.match(
    source,
    /record_deferred_terminal_source\(\s*ray,\s*vec3<f32>\(0\.0\),\s*TERMINAL_SOURCE_KIND_ABSORPTION_NULL\s*\);/
  );
  assert.match(
    source,
    /record_deferred_terminal_source\(\s*ray,\s*vec3<f32>\(0\.0\),\s*TERMINAL_SOURCE_KIND_RUSSIAN_ROULETTE\s*\);/
  );
  assert.match(
    source,
    /record_deferred_terminal_source\(\s*ray,\s*terminal_surface_environment_source\(ray, hit\),\s*TERMINAL_SOURCE_KIND_AMBIENT_MAX_DEPTH\s*\);/
  );
  assert.match(
    source,
    /let terminalEnvironment = terminal_surface_environment_contribution\(\s+ray,\s+arrivingThroughput,\s+hit\s+\);/
  );
  assert.match(source, /record_termination_metrics\(/);
  assert.match(
    source,
    /accumulation\[ray\.rayId\] =\s+accumulation\[ray\.rayId\] \+\s+vec4<f32>\(weightedContribution, 1\.0\);/
  );
  assert.match(source, /TRANSPORT_EXPERIMENT_STRICT_ZERO_OVERFLOW/);
  assert.match(source, /var rawWeightedContribution = vec3<f32>\(0\.0\);/);
  assert.match(
    source,
    /record_deferred_terminal_source\(\s*ray,\s*vec3<f32>\(0\.0\),\s*TERMINAL_SOURCE_KIND_AMBIENT_QUEUE_OVERFLOW\s*\);/
  );
});

test("wavefront compute samples all-material direct light with MIS before random continuation", () => {
  const source = readRendererSource();

  assert.match(source, /fn direct_environment_radiance/);
  assert.match(source, /fn procedural_sky_radiance/);
  assert.match(source, /fn uniform_hemisphere_pdf\(\) -> f32/);
  assert.match(source, /fn cosine_hemisphere_pdf\(normal: vec3<f32>, direction: vec3<f32>\) -> f32/);
  assert.match(source, /fn sample_uniform_hemisphere_direction\(sample: vec2<f32>, normal: vec3<f32>\) -> vec3<f32>/);
  assert.match(source, /fn sample_environment_importance/);
  assert.match(source, /struct DirectLightSample/);
  assert.match(source, /fn sample_emissive_triangle_light/);
  assert.match(source, /fn sample_environment_direct_light/);
  assert.match(source, /fn sample_emissive_direct_light/);
  assert.match(source, /fn sample_direct_light/);
  assert.match(source, /fn direct_light_sample_contribution/);
  assert.match(source, /fn surface_procedural_sun_contribution/);
  assert.match(source, /TRANSPORT_EXPERIMENT_SOURCE_STABLE_DIRECT_LIGHTING/);
  assert.match(source, /fn direct_light_sample_pixel_id\(ray: RayRecord\) -> u32/);
  assert.match(source, /select\(\s+ray\.sourcePixelId,\s+0u,\s+transport_experiment_enabled\(TRANSPORT_EXPERIMENT_SOURCE_STABLE_DIRECT_LIGHTING\)\s+\)/);
  assert.match(source, /direct_light_sample_pixel_id\(ray\)/);
  assert.match(source, /strict_physical_low_spp_lighting_enabled\(\) && !environment_importance_sampling_enabled\(\)/);
  assert.match(source, /radiance = procedural_sky_radiance\(lightDirection\);/);
  assert.match(source, /TRANSPORT_EXPERIMENT_PRODUCT_STUDIO_IMPORTANCE/);
  assert.match(source, /pdf = cosine_hemisphere_pdf\(normal, lightDirection\);/);
  assert.match(source, /pdf = uniform_hemisphere_pdf\(\);/);
  assert.match(source, /fn surface_supports_direct_lighting/);
  assert.match(source, /u32\(config\.environmentMapMeta\.x\)/);
  assert.match(source, /u32\(config\.environmentMapMeta\.y\)/);
  assert.match(source, /if \(count == 0u\) \{\s+return 0u;\s+\}/);
  assert.match(source, /fn power_heuristic/);
  assert.match(source, /fn evaluate_surface_bsdf/);
  assert.match(source, /fn evaluate_surface_bsdf_pdf/);
  assert.match(source, /fn visibility_test_ray/);
  assert.match(source, /fn scene_visibility_blocked/);
  assert.match(source, /fn surface_direct_light_contribution/);
  assert.match(source, /TRANSPORT_EXPERIMENT_DETERMINISTIC_DIRECT_LIGHTING/);
  assert.match(source, /let environmentLight = sample_environment_direct_light\(hit, ray, normal, 0\.5, 1\.0\);/);
  assert.match(source, /let emissiveLight = sample_emissive_direct_light\(hit, ray, 0\.0\);/);
  assert.match(source, /return direct_light_sample_contribution\(ray, hit, sample_direct_light\(hit, ray, normal\)\);/);
  assert.match(source, /if \(scene_visibility_blocked\(origin, lightDirection, lightSample\.maxDistance\)\) \{/);
  assert.match(source, /let incidentRadiance = lightSample\.radiance\.xyz;/);
  assert.match(source, /let bsdf = evaluate_surface_bsdf\(hit, viewDirection, lightDirection\);/);
  assert.match(source, /let bsdfPdf = evaluate_surface_bsdf_pdf\(hit, viewDirection, lightDirection\);/);
  assert.match(source, /let misWeight = power_heuristic\(lightSample\.pdf, bsdfPdf\);/);
  assert.match(source, /nDotL \* misWeight \/ max\(lightSample\.pdf, 0\.000001\)/);
  assert.match(source, /let transmissionReflectChance = select\(/);
  assert.doesNotMatch(source, /mix\(reflectChance, max\(reflectChance, 1\.0 - transmission\), transmission > 0\.001\)/);
  assert.match(source, /let segmentTransmittance = medium_transmittance\(medium_stack_current_id\(ray\), hit\.distance\);/);
  assert.match(source, /let arrivingThroughput = ray\.throughput\.xyz \* segmentTransmittance;/);
  assert.match(source, /let shouldEstimateDirectLight = surface_supports_direct_lighting\(hit\);/);
  assert.doesNotMatch(
    source,
    /\(hit\.materialKind == 0u \|\| hit\.materialKind == 1u\) &&\s+hit\.material\.z >= 0\.95 &&\s+ray\.bounce < 2u/
  );
  assert.match(
    source,
    /let directLight = surface_direct_light_contribution\(\s+RayRecord\(/
  );
  assert.match(
    source,
    /let sunLight = surface_procedural_sun_contribution\(\s+RayRecord\(/
  );
  assert.match(
    source,
    /let rawDirectLight = \(directLight \+ sunLight\) \* sample_weight\(\);/
  );
  assert.match(
    source,
    /accumulation\[ray\.rayId\] =\s+accumulation\[ray\.rayId\] \+\s+vec4<f32>\(weightedDirectLight, 0\.0\);/
  );
  assert.ok(
    source.indexOf("let shouldEstimateDirectLight =") <
      source.indexOf("let directLight = surface_direct_light_contribution(")
  );
  assert.ok(
    source.indexOf("let directLight = surface_direct_light_contribution(") <
      source.indexOf("if (ray.bounce + 1u >= config.maxDepth)")
  );
});

test("wavefront compute converts emissive area PDFs to solid-angle MIS measures", () => {
  const source = readRendererSource();

  assert.match(source, /function emissiveTriangleWeight\(triangle\)/);
  assert.match(source, /triangleAreaForLightSampling\(triangle\) \* Math\.max\(emissionPower\(triangle\.emission\), 0\.000001\)/);
  assert.match(source, /function resolveOrderedEmissiveTriangleIndices\(config\)/);
  assert.match(source, /const triangleIndexById = new Map/);
  assert.match(source, /const orderedEmissiveTriangleIndices = resolveOrderedEmissiveTriangleIndices\(config\);/);
  assert.match(source, /const emissiveWeights = orderedEmissiveTriangleIndices\.map/);
  assert.match(source, /packedBvhNodeFloats\[nodeOffset\] = cumulativeEmissiveWeight;/);
  assert.match(source, /packedBvhNodeFloats\[nodeOffset \+ 1\] = emissiveWeights\[index\] \?\? 0;/);
  assert.match(source, /packedBvhNodeFloats\[nodeOffset \+ 2\] = totalEmissiveWeight;/);
  assert.match(source, /fn triangle_surface_area\(triangle: TriangleRecord\) -> f32/);
  assert.match(source, /fn solid_angle_pdf_from_area_pdf\(/);
  assert.match(source, /let geometry = max\(dot\(lightNormal, -lightDirection\), 0\.0\);/);
  assert.match(source, /return areaPdf \* distanceSquared \/ max\(geometry, 0\.000001\);/);
  assert.match(source, /let targetWeight = selector \* totalWeight;/);
  assert.match(source, /targetWeight <= candidateMetadata\.boundsMin\.x/);
  assert.match(source, /selectionProbability = triangleWeight \/ totalWeight;/);
  assert.match(source, /let areaPdf = selectionProbability \/ max\(triangleArea, 0\.000001\);/);
  assert.match(
    source,
    /let lightPdf = solid_angle_pdf_from_area_pdf\(areaPdf, hit\.position\.xyz, lightPoint, lightNormal\);/
  );
  assert.match(source, /fn emissive_direct_class_probability\(\) -> f32/);
  assert.match(source, /return select\(1\.0, 0\.5, config\.emissiveTriangleCount > 0u\);/);
  assert.match(source, /let environmentSelectionProbability =\s+1\.0 - emissive_direct_class_probability\(\);/);
  assert.match(source, /return DirectLightSample\(vec4<f32>\(lightDirection, 0\.0\), vec4<f32>\(radiance, 0\.0\), lightPdf, traceDistance, 0u, 1u\);/);
});

test("wavefront compute MIS-weights terminal emissive continuation hits", () => {
  const source = readRendererSource();

  assert.match(source, /fn terminal_emissive_light_pdf\(ray: RayRecord, hit: HitRecord\) -> f32/);
  assert.match(source, /candidateTriangle\.triangleId == hit\.primitiveId/);
  assert.match(source, /selectionProbability = emissive_direct_class_probability\(\) \* triangleWeight \/ totalWeight;/);
  assert.match(source, /ray\.origin\.xyz,\s+hit\.position\.xyz,\s+lightNormal/);
  assert.match(
    source,
    /let lightPdf = terminal_emissive_light_pdf\(ray, hit\);\s+if \(lightPdf > 0\.000001\) \{\s+sourceRadiance = sourceRadiance \* power_heuristic\(bsdfPdf, lightPdf\);/s
  );
});

test("wavefront compute keeps deterministic low-SPP indirect diagnostic only", () => {
  const source = readRendererSource();

  assert.match(source, /TRANSPORT_EXPERIMENT_DETERMINISTIC_LOW_SPP_INDIRECT = 128u/);
  assert.doesNotMatch(source, /fn deterministic_low_spp_indirect_enabled\(\) -> bool/);
  assert.doesNotMatch(source, /deterministic_low_spp_cached_indirect/);
  assert.doesNotMatch(source, /deterministic_low_spp_probe_/);
  assert.doesNotMatch(source, /resolve_indirect_probe_hit/);
  assert.doesNotMatch(source, /weightedCachedIndirect/);
  assert.doesNotMatch(source, /record_transport_contribution\(TRANSPORT_BUCKET_CACHED_INDIRECT/);
  assert.doesNotMatch(
    source,
    /record_deferred_terminal_source\(\s*ray,\s*vec3<f32>\(0\.0\),\s*TERMINAL_SOURCE_KIND_DETERMINISTIC_RESIDUAL_ZERO/
  );
  assert.doesNotMatch(
    source,
    /record_termination_metrics\(\s*TERMINAL_SOURCE_KIND_DETERMINISTIC_RESIDUAL_ZERO/
  );
  assert.match(source, /deterministicResidualZeroCount: atomic<u32>/);
  assert.match(source, /atomicAdd\(&counters\.termination\.deterministicResidualZeroCount, 1u\);/);
  assert.match(source, /let scatter = scatter_direction\(ray, hit\);/);
  assert.match(source, /surface_continuation_throughput\(/);
  assert.match(source, /record_transport_contribution\(TRANSPORT_BUCKET_STOCHASTIC_RESIDUAL, safeResolved\);/);
  assert.match(source, /record_transport_checksum\(index, linearOutput\);/);
});

test("wavefront BSDF numeric helpers flag PDF mismatches and invalid MIS measures", () => {
  const hit = {
    color: [0.78, 0.66, 0.52],
    shadingNormal: [0, 1, 0],
    roughness: 0.34,
    metallic: 0.18,
    clearcoat: 0.12,
    clearcoatRoughness: 0.08,
    specularWeight: 1,
    occlusion: 0.94,
  };
  const viewDirection = [0, 1, 0];
  const lightDirection = [0.24, 0.94, 0.23];

  const matched = validateWavefrontBsdfSample({
    hit,
    viewDirection,
    lightDirection,
    lightPdf: 0.17,
  });
  assert.equal(matched.pdfMismatch, false);
  assert.ok(matched.expectedPdf > 0);
  assert.ok(matched.misWeight > 0 && matched.misWeight < 1);
  matched.continuationThroughput.forEach((value) => {
    assert.ok(Number.isFinite(value));
    assert.ok(value >= 0);
  });

  const mismatched = validateWavefrontBsdfSample({
    hit,
    viewDirection,
    lightDirection,
    sampledPdf: matched.expectedPdf * 0.25,
    lightPdf: 0.17,
  });
  assert.equal(mismatched.pdfMismatch, true);

  const invalid = validateWavefrontBsdfSample({
    hit,
    viewDirection,
    lightDirection,
    sampledPdf: Number.NaN,
    lightPdf: Number.POSITIVE_INFINITY,
  });
  assert.equal(invalid.misWeight, 0);
  assert.deepEqual(invalid.continuationThroughput, [0, 0, 0]);
});

test("wavefront BSDF numeric helpers keep furnace-style reflectance bounded", () => {
  const viewDirection = [0, 1, 0];
  const materials = [
    {
      color: [0.82, 0.74, 0.68],
      shadingNormal: [0, 1, 0],
      roughness: 0.65,
      metallic: 0,
      clearcoat: 0,
      specularWeight: 1,
      occlusion: 1,
    },
    {
      color: [0.92, 0.87, 0.81],
      shadingNormal: [0, 1, 0],
      roughness: 0.22,
      metallic: 1,
      clearcoat: 0,
      specularWeight: 1,
      occlusion: 1,
    },
    {
      color: [0.68, 0.74, 0.82],
      shadingNormal: [0, 1, 0],
      roughness: 0.28,
      metallic: 0.08,
      clearcoat: 0.65,
      clearcoatRoughness: 0.05,
      specularWeight: 1,
      occlusion: 0.96,
    },
  ];

  materials.forEach((material) => {
    const reflectance = estimateWavefrontDirectionalHemisphericalReflectance(material, viewDirection, {
      sampleCount: 1024,
    });
    reflectance.forEach((value) => {
      assert.ok(Number.isFinite(value));
      assert.ok(value >= 0);
      assert.ok(value <= 1.05);
    });
  });
});

test("wavefront terminal environment helpers preserve HDR residuals and keep invalid inputs finite", () => {
  const config = createWavefrontPathTracingComputeConfig({
    width: 16,
    height: 16,
    ambientColor: [0.24, 0.26, 0.3, 1],
    environmentLighting: {
      sunlitBaseline: 8,
      intensity: 3.5,
      sunColor: [12, 10, 8, 1],
    },
  });
  const hit = {
    color: [1.6, 1.4, 1.2],
    shadingNormal: [0, 1, 0],
    position: [0, 0.5, 0],
    roughness: 0.05,
    metallic: 0.92,
    clearcoat: 0.4,
    clearcoatRoughness: 0.04,
    specularWeight: 1,
    occlusion: 0.1,
    materialKind: 1,
  };
  const ray = {
    direction: [0.18, -0.96, 0.21],
  };

  const bounded = computeWavefrontTerminalEnvironmentContributionReference(
    config,
    ray,
    [48, 36, 24],
    hit
  );
  bounded.source.forEach((value) => {
    assert.ok(Number.isFinite(value));
    assert.ok(value >= 0);
  });
  bounded.contribution.forEach((value) => {
    assert.ok(Number.isFinite(value));
    assert.ok(value >= 0);
  });
  assert.ok(Math.max(...bounded.source, ...bounded.contribution) > 4);

  const invalid = computeWavefrontTerminalEnvironmentContributionReference(
    config,
    ray,
    [Number.NaN, Number.POSITIVE_INFINITY, -1],
    {
      ...hit,
      color: [Number.NaN, Number.POSITIVE_INFINITY, -1],
      occlusion: Number.NaN,
    }
  );
  assert.deepEqual(invalid.contribution, [0, 0, 0]);
});

test("wavefront compute samples material textures on the GPU at the resolved hit UV", () => {
  const source = readRendererSource();

  assert.match(source, /const GPU_MATERIAL_RECORD_BYTES = 192/);
  assert.match(source, /const TRIANGLE_RECORD_BYTES = 576/);
  assert.match(source, /@group\(0\) @binding\(23\) var baseColorAtlasTexture: texture_2d<f32>/);
  assert.match(source, /@group\(0\) @binding\(28\) var materialAtlasSampler: sampler/);
  assert.match(source, /fn sample_surface_material\(/);
  assert.match(source, /let meshSurface = sample_surface_material\(/);
  assert.match(source, /let hitOcclusion = select\(1\.0, meshSurface\.occlusion/);
  assert.match(source, /mix\(1\.0, occlusionTexel\.x, clamp\(triangle\.textureSettings\.y, 0\.0, 1\.0\)\)/);
  assert.match(source, /\(normalTexel\.x \* 2\.0 - 1\.0\) \* normalScale/);
  assert.match(source, /\(normalTexel\.y \* 2\.0 - 1\.0\) \* normalScale/);
  assert.match(source, /triangle\.baseColorAtlas/);
  assert.match(source, /triangle\.textureSettings/);
  assert.match(source, /triangle\.clearcoatAtlas/);
  assert.match(source, /triangle\.transmissionAtlas/);
  assert.match(source, /@group\(0\) @binding\(44\) var anisotropyAtlasTexture: texture_2d<f32>/);
  assert.match(source, /mesh\.baseColorAtlas/);
  assert.match(source, /hitTriangle\.materialSlot/);
  assert.doesNotMatch(source, /getImageData\(.*render/);
});

test("wavefront compute defers visible colour until terminal path resolve", () => {
  const source = readRendererSource();
  const config = createWavefrontPathTracingComputeConfig({
    width: 64,
    height: 64,
    deferredPathResolve: false,
  });

  assert.equal(createWavefrontPathTracingComputeConfig({ width: 64, height: 64 }).deferredPathResolve, true);
  assert.equal(config.deferredPathResolve, false);
  assert.match(source, /fn deferred_path_resolve_enabled\(\) -> bool/);
  assert.match(source, /fn clear_deferred_path\(rayId: u32\)/);
  assert.match(
    source,
    /record_deferred_terminal_source\(\s*ray,\s*sourceRadiance \* segmentTransmittance,\s*TERMINAL_SOURCE_KIND_(EMISSIVE|ENVIRONMENT)\s*\);/
  );
  assert.match(source, /sourceRadiance = sourceRadiance \* misWeight;/);
  assert.match(source, /fn resolve_deferred_path_radiance\(rayId: u32\) -> vec3<f32>/);
  assert.match(source, /let terminal = pathVertices\[path_vertex_index\(rayId, config\.maxDepth\)\];/);
  assert.match(source, /depth = depth - 1u;/);
  assert.match(source, /let throughput = pathVertices\[path_vertex_index\(rayId, depth\)\];/);
  assert.match(source, /radiance = radiance \* throughput\.xyz;/);
  assert.match(source, /let terminal = pathVertices\[path_vertex_index\(index, config\.maxDepth\)\];/);
  assert.match(source, /let resolved = resolve_deferred_path_radiance\(index\) \* sample_weight\(\);/);
  assert.match(
    source,
    /let rawDirectLight = \(directLight \+ sunLight\) \* sample_weight\(\);/
  );
  assert.match(source, /if \(config\.deferredPathResolve\) \{/);
  assert.match(source, /createGpuSubmissionBatcher\(\{/);
  assert.match(source, /encodeTileOutput\(batch\.reserve\(1\), tile, configOffset, parallelism\);/);
});

test("wavefront compute records radiance diagnostics instead of silently applying the legacy sample clamp", () => {
  const source = readRendererSource();
  const types = readRendererTypes();

  assert.match(source, /fn record_radiance_diagnostics\(sample: vec3<f32>\)/);
  assert.match(source, /invalidSampleCount: atomic<u32>/);
  assert.match(source, /legacyClampEquivalentCount: atomic<u32>/);
  assert.match(source, /record_radiance_diagnostics\(rawWeightedContribution\);/);
  assert.match(source, /record_radiance_diagnostics\(resolved\);/);
  assert.doesNotMatch(source, /contribution = clamp_sample_radiance\(/);
  assert.doesNotMatch(source, /radiance = clamp_sample_radiance\(radiance \+ resolved\);/);
  assert.match(types, /readonly radianceDiagnostics\?: Readonly<\{/);
  assert.match(types, /invalidSamples: number;/);
  assert.match(types, /legacyClampEquivalentSamples: number;/);
  assert.match(types, /readonly transportContributions\?: Readonly<\{/);
  assert.match(types, /cachedIndirectLuminance: number;/);
  assert.match(types, /deterministicChecksum: number;/);
});

test("wavefront compute exposes medium-table contracts and Beer-Lambert transport hooks", () => {
  const source = readRendererSource();
  const types = readRendererTypes();
  const mediumDesign = readFileSync(
    new URL("../docs/design/wavefront-volume-medium-transport.md", import.meta.url),
    "utf8"
  );
  const config = createWavefrontPathTracingComputeConfig({
    width: 32,
    height: 32,
    meshes: [
      {
        materialRefId: 3,
        positions: [-1, 0, 0, 1, 0, 0, 0, 1, 0],
        indices: [0, 1, 2],
        materialKind: "transparent",
        material: {
          transmission: 1,
          volume: {
            thickness: 0.35,
            attenuationColor: [0.72, 0.84, 0.96, 1],
            attenuationDistance: 0.4,
          },
        },
      },
    ],
  });

  assert.match(types, /export interface WavefrontMediumInput/);
  assert.match(types, /export interface WavefrontVolumeInput/);
  assert.match(types, /readonly volume\?: WavefrontVolumeInput \| null;/);
  assert.match(types, /readonly thickness: number;/);
  assert.match(types, /readonly mediums\?: readonly WavefrontMediumInput\[\]/);
  assert.match(types, /readonly mediumCount: number;/);
  assert.match(source, /const MEDIUM_TABLE_ROWS = 2;/);
  assert.match(source, /function deriveWavefrontTransportMedium/);
  assert.match(source, /function createMediumTextureResource/);
  assert.match(source, /@group\(0\) @binding\(32\) var mediumTableTexture: texture_2d<f32>/);
  assert.match(source, /fn medium_transmittance\(mediumRefId: u32, distance: f32\) -> vec3<f32>/);
  assert.match(source, /exp\(-extinction\.x \* distance\)/);
  assert.match(source, /fn transmitted_medium_ref_id\(ray: RayRecord, hit: HitRecord\) -> u32/);
  assert.match(source, /if \(!medium_valid\(hit\.mediumRefId\)\) \{\s+return medium_stack_current_id\(ray\);\s+\}/);
  assert.match(source, /fn medium_stack_current_id\(ray: RayRecord\) -> u32/);
  assert.match(source, /fn transitioned_medium_stack\(ray: RayRecord, hit: HitRecord\) -> vec4<u32>/);
  assert.match(source, /fn transitioned_medium_stack_depth\(ray: RayRecord, hit: HitRecord\) -> u32/);
  assert.match(source, /mediumStackDepth: u32/);
  assert.match(source, /mediumStack: vec4<u32>/);
  assert.match(mediumDesign, /bounded nested medium stack/i);
  assert.match(mediumDesign, /Beer-Lambert/i);
  assert.equal(config.mediumCount, 2);
  assert.deepEqual(config.mediums.map((medium) => medium.id), [0, 3]);
  assert.equal(config.gpuMeshSource.meshes.records[0].thickness, 0.35);
  assert.ok(config.mediums[1].absorption[0] > 0);
  assert.ok(config.mediums[1].absorption[1] > 0);
  assert.ok(config.mediums[1].absorption[2] > 0);
});

test("wavefront compute caches the generated BRDF LUT upload", () => {
  const source = readRendererSource();

  assert.match(source, /const cached = BRDF_LUT_UPLOAD_CACHE\.get\(cacheKey\);/);
  assert.match(source, /BRDF_LUT_UPLOAD_CACHE\.set\(cacheKey, upload\);/);
});

test("wavefront compute falls back to uniform environment sampling when only external HDRI textures are bound", () => {
  const source = readRendererSource();

  assert.match(source, /function environmentMapHasSamplingData\(environmentMap\)/);
  assert.match(source, /hasImportanceData: false/);
  assert.match(source, /config\.environmentMapMeta\.w > 0\.5/);
  assert.match(source, /fn uniform_sphere_pdf\(\) -> f32/);
  assert.match(source, /fn sample_uniform_sphere_direction\(sample: vec2<f32>\) -> vec3<f32>/);
  assert.match(source, /if \(!environment_importance_sampling_enabled\(\)\) \{\s+return uniform_sphere_pdf\(\);/);
});

test("analytic wavefront renderer rejects display-quality requests", () => {
  assert.throws(
    () =>
      createWavefrontPathTracingComputeConfig({
        width: 640,
        height: 360,
        displayQuality: true,
      }),
    /Display-quality path tracing requires mesh BVH triangle intersections/
  );
});

test("display-quality wavefront config defaults to CPU-upload mesh acceleration", () => {
  const config = createWavefrontPathTracingComputeConfig({
    width: 640,
    height: 360,
    displayQuality: true,
    meshes: [
      {
        id: 9,
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        indices: [0, 1, 2],
        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
        color: [0.8, 0.7, 0.6, 1],
      },
    ],
  });

  assert.equal(config.displayQuality, true);
  assert.equal(config.accelerationBuildMode, "cpu-upload");
  assert.equal(config.gpuAccelerationBuildRequired, false);
  assert.equal(config.sceneObjectCount, 0);
  assert.equal(config.triangleCount, 1);
  assert.equal(config.bvhNodeCount, 1);
  assert.equal(config.bvhNodeCapacity, 1);
  assert.equal(config.bvhLeafSortCapacity, 0);
  assert.deepEqual(config.bvhSortStages, []);
  assert.deepEqual(config.bvhBuildLevels, []);
  assert.equal(config.meshAcceleration.triangles.length, 1);
  assert.equal(config.meshAcceleration.nodes.length, 1);
  assert.equal(config.gpuMeshSource.vertices.count, 3);
  assert.equal(config.gpuMeshSource.indices.count, 3);
  assert.equal(config.gpuMeshSource.meshes.count, 1);
  assert.equal(config.emissiveTriangleCount, 0);
  assert.equal(config.memory.triangleBytes, wavefrontPathTracingComputeLimits.triangleRecordBytes);
  assert.equal(config.memory.bvhNodeBytes, wavefrontPathTracingComputeLimits.bvhNodeRecordBytes);
  assert.equal(config.memory.emissiveTriangleMetadataBytes, 0);
});

test("display-quality wavefront config accepts the legacy CPU-debug acceleration alias", () => {
  const config = createWavefrontPathTracingComputeConfig({
    width: 640,
    height: 360,
    displayQuality: true,
    accelerationBuildMode: "cpu-debug",
    meshes: [
      {
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      },
    ],
  });

  assert.equal(config.accelerationBuildMode, "cpu-upload");
  assert.equal(config.gpuAccelerationBuildRequired, false);
});

test("display-quality wavefront config schedules GPU mesh BVH build input when requested", () => {
  const config = createWavefrontPathTracingComputeConfig({
    width: 640,
    height: 360,
    displayQuality: true,
    accelerationBuildMode: "gpu",
    meshes: [
      {
        id: 9,
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        indices: [0, 1, 2],
        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
        color: [0.8, 0.7, 0.6, 1],
      },
    ],
  });

  assert.equal(config.displayQuality, true);
  assert.equal(config.accelerationBuildMode, "gpu");
  assert.equal(config.gpuAccelerationBuildRequired, true);
  assert.equal(config.sceneObjectCount, 0);
  assert.equal(config.triangleCount, 1);
  assert.equal(config.bvhNodeCount, 1);
  assert.equal(config.bvhNodeCapacity, 1);
  assert.equal(config.bvhLeafSortCapacity, 1);
  assert.deepEqual(config.bvhSortStages, []);
  assert.deepEqual(config.bvhBuildLevels, []);
  assert.equal(config.meshAcceleration.triangles.length, 0);
  assert.equal(config.gpuMeshSource.vertices.count, 3);
  assert.equal(config.gpuMeshSource.indices.count, 3);
  assert.equal(config.gpuMeshSource.meshes.count, 1);
});

test("wavefront BVH build levels schedule parent nodes concurrently bottom-up", () => {
  const mesh = {
    positions: [
      -3, 0, 0,
      -2.5, 0, 0,
      -3, 0.5, 0,
      -2, 0, 0,
      -1.5, 0, 0,
      -2, 0.5, 0,
      -1, 0, 0,
      -0.5, 0, 0,
      -1, 0.5, 0,
      0, 0, 0,
      0.5, 0, 0,
      0, 0.5, 0,
      1, 0, 0,
      1.5, 0, 0,
      1, 0.5, 0,
      2, 0, 0,
      2.5, 0, 0,
      2, 0.5, 0,
      3, 0, 0,
      3.5, 0, 0,
      3, 0.5, 0,
    ],
  };
  const expected = [
    { start: 3, count: 3 },
    { start: 1, count: 2 },
    { start: 0, count: 1 },
  ];
  const expectedSortStages = [
    { compareDistance: 1, sequenceSize: 2 },
    { compareDistance: 2, sequenceSize: 4 },
    { compareDistance: 1, sequenceSize: 4 },
    { compareDistance: 4, sequenceSize: 8 },
    { compareDistance: 2, sequenceSize: 8 },
    { compareDistance: 1, sequenceSize: 8 },
  ];
  const config = createWavefrontPathTracingComputeConfig({
    width: 640,
    height: 360,
    displayQuality: true,
    accelerationBuildMode: "gpu",
    meshes: [mesh],
  });

  assert.deepEqual(createWavefrontBvhBuildLevels(1), []);
  assert.deepEqual(createWavefrontBvhBuildLevels(7), expected);
  assert.deepEqual(createWavefrontBvhSortStages(1), []);
  assert.deepEqual(createWavefrontBvhSortStages(7), expectedSortStages);
  assert.equal(config.bvhLeafSortCapacity, 8);
  assert.deepEqual(config.bvhSortStages, expectedSortStages);
  assert.deepEqual(config.bvhBuildLevels, expected);
  assert.equal(config.triangleCount, 7);
  assert.equal(config.bvhNodeCount, 13);
  assert.equal(
    config.memory.bvhLeafReferenceBytes,
    8 * wavefrontPathTracingComputeLimits.bvhLeafReferenceRecordBytes
  );
});

test("wavefront acceleration builder skips inactive or already-built configurations", () => {
  assert.equal(
    dispatchWavefrontGpuAccelerationBuild({
      config: { gpuAccelerationBuildRequired: false },
      accelerationBuilt: false,
    }),
    false
  );
  assert.equal(
    dispatchWavefrontGpuAccelerationBuild({
      config: { gpuAccelerationBuildRequired: true },
      accelerationBuilt: true,
    }),
    false
  );
});

test("wavefront acceleration builder schedules sort and internal-level GPU passes", () => {
  const device = new FakeWavefrontDevice();
  const baseConfig = createWavefrontPathTracingComputeConfig({
    width: 32,
    height: 32,
    tileSize: 32,
    displayQuality: true,
    accelerationBuildMode: "gpu",
    meshes: [
      {
        positions: [
          0, 0, 0,
          1, 0, 0,
          0, 1, 0,
          1, 1, 0,
          2, 1, 0,
          1, 2, 0,
          2, 2, 0,
          3, 2, 0,
          2, 3, 0,
        ],
      },
    ],
  });
  const config = Object.freeze({
    ...baseConfig,
    bvhLeafSortCapacity: 128,
    bvhSortStages: Object.freeze([
      { compareDistance: 1, sequenceSize: 2 },
      { compareDistance: 2, sequenceSize: 4 },
    ]),
    bvhBuildLevels: Object.freeze([
      { start: 1, count: 2 },
      { start: 0, count: 1 },
    ]),
  });
  const parallelism = createGpuParallelismCounters();
  const pipelines = {
    prepareMeshTrianglesAndLeaves: { label: "prepare" },
    sortBvhLeafRefs: { label: "sort" },
    writeSortedBvhLeaves: { label: "leaves" },
    buildBvhInternalLevel: { label: "internal" },
  };

  const submitted = dispatchWavefrontGpuAccelerationBuild({
    config,
    accelerationBuilt: false,
    tiles: [{ x: 0, y: 0, width: 32, height: 32 }],
    device,
    bvhBuildConfigBuffer: { label: "config" },
    configBufferStride: 320,
    bvhBuildBindGroup: { label: "bvh" },
    pipelines,
    parallelism,
    frameIndex: 7,
  });

  assert.equal(submitted, true);
  assert.equal(device.queue.submissions.length, 1);
  assert.equal(device.queue.writes.length, 5);
  assert.equal(device.computePasses, 1);
  assert.equal(device.computePassesEnded, 1);
  assert.equal(device.dispatches.length, 6);
  assert.equal(parallelism.directDispatches, 6);
  assert.equal(parallelism.multiWorkgroupDispatches > 0, true);
});

test("wavefront mesh acceleration preserves triangle vertices and normals", () => {
  const mesh = normalizeWavefrontMesh({
    id: 12,
    positions: [0, 0, 0, 2, 0, 0, 0, 2, 0],
    indices: [0, 1, 2],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [0, 0, 1, 0, 0, 1],
    materialKind: "metal",
    materialRefId: 98,
    mediumRefId: 7,
    color: [0.2, 0.4, 0.6, 0.8],
    roughness: 0.35,
    metallic: 0.9,
    material: {
      baseColorTexture: {
        width: 1,
        height: 1,
        data: new Uint8Array([255, 128, 64, 255]),
      },
      metallicRoughnessTexture: {
        width: 1,
        height: 1,
        data: new Uint8Array([255, 200, 150, 255]),
      },
      normalTexture: {
        width: 1,
        height: 1,
        scale: 0.75,
        data: new Uint8Array([128, 128, 255, 255]),
      },
      occlusionTexture: {
        width: 1,
        height: 1,
        strength: 0.6,
        data: new Uint8Array([220, 220, 220, 255]),
      },
      emissiveTexture: {
        width: 1,
        height: 1,
        strength: 0.4,
        data: new Uint8Array([255, 255, 255, 255]),
      },
    },
  });
  const materialSource = createWavefrontGpuMaterialSource([mesh]);
  const acceleration = createWavefrontMeshAcceleration([mesh]);
  const triangle = acceleration.triangles[0];

  assert.equal(mesh.id, 12);
  assert.equal(acceleration.nodes.length, 1);
  assert.equal(triangle.meshId, 12);
  assert.deepEqual(triangle.v1, [2, 0, 0]);
  assert.deepEqual(triangle.n2, [0, 0, 1]);
  assert.deepEqual(triangle.uv2, [0, 1]);
  assert.deepEqual(round(triangle.color), [0.2, 0.4, 0.6, 0.8]);
  assert.deepEqual(round(triangle.material), [0.35, 0.9, 0.8, 1.45]);
  assert.deepEqual(
    round(triangle.baseColorAtlas),
    round(materialSource.baseColorAtlas.resolveRect(mesh.baseColorTexture))
  );
  assert.deepEqual(
    round(triangle.metallicRoughnessAtlas),
    round(materialSource.metallicRoughnessAtlas.resolveRect(mesh.metallicRoughnessTexture))
  );
  assert.deepEqual(
    round(triangle.normalAtlas),
    round(materialSource.normalAtlas.resolveRect(mesh.normalTexture))
  );
  assert.deepEqual(
    round(triangle.occlusionAtlas),
    round(materialSource.occlusionAtlas.resolveRect(mesh.occlusionTexture))
  );
  assert.deepEqual(
    round(triangle.emissiveAtlas),
    round(materialSource.emissiveAtlas.resolveRect(mesh.emissiveTexture))
  );
  assert.deepEqual(round(triangle.textureSettings), [0.75, 0.6, 0.4, 0]);
  assert.equal(triangle.materialRefId, 98);
  assert.equal(triangle.mediumRefId, 7);
  assert.deepEqual(acceleration.nodes[0].bounds.min, [0, 0, 0]);
  assert.deepEqual(acceleration.nodes[0].bounds.max, [2, 2, 0]);
});

test("wavefront mesh normalization derives transport medium from volume inputs", () => {
  const mesh = normalizeWavefrontMesh({
    id: 21,
    positions: [0, 0, 0, 2, 0, 0, 0, 2, 0],
    indices: [0, 1, 2],
    materialRefId: 14,
    material: {
      transmission: 1,
      volume: {
        thickness: 0.18,
        attenuationColor: [0.7, 0.82, 0.94, 1],
        attenuationDistance: 0.5,
      },
    },
  });

  assert.equal(mesh.mediumRefId, 14);
  assert.equal(mesh.thickness, 0.18);
  assert.equal(mesh.medium?.id, 14);
  assert.ok((mesh.medium?.absorption[0] ?? 0) > 0);
  assert.ok((mesh.medium?.absorption[1] ?? 0) > 0);
  assert.ok((mesh.medium?.absorption[2] ?? 0) > 0);
});

test("wavefront mesh normalization honors explicit mediumRefId for inline media", () => {
  const mesh = normalizeWavefrontMesh({
    id: 22,
    positions: [0, 0, 0, 2, 0, 0, 0, 2, 0],
    indices: [0, 1, 2],
    mediumRefId: 19,
    medium: {
      attenuationColor: [0.68, 0.76, 0.9, 1],
      attenuationDistance: 0.35,
    },
  });

  assert.equal(mesh.medium?.id, 19);
  assert.equal(mesh.mediumRefId, 19);
  assert.ok((mesh.medium?.absorption[0] ?? 0) > 0);
});

test("wavefront GPU mesh source packs raw mesh buffers without CPU BVH output", () => {
  const meshes = [
    {
      id: 31,
      positions: [0, 0, 0, 2, 0, 0, 0, 2, 0],
      indices: [0, 1, 2],
      normals: [0, 0, 1, 0, 0.6, 0.8, 0.6, 0, 0.8],
      uvs: [0, 0, 1, 0, 0, 1],
      materialKind: "dielectric",
      materialRefId: 22,
      mediumRefId: 3,
      color: [0.25, 0.5, 0.75, 0.9],
    },
  ];
  const materialSource = createWavefrontGpuMaterialSource(meshes);
  const source = createWavefrontGpuMeshSource(meshes, materialSource);
  const vertexFloats = new Float32Array(source.vertices.buffer);
  const indexUints = new Uint32Array(source.indices.buffer);
  const meshUints = new Uint32Array(source.meshes.buffer);
  const meshFloats = new Float32Array(source.meshes.buffer);

  assert.equal(source.vertices.buffer.byteLength, 3 * wavefrontPathTracingComputeLimits.meshVertexRecordBytes);
  assert.equal(source.indices.buffer.byteLength, 3 * 4);
  assert.equal(source.meshes.buffer.byteLength, wavefrontPathTracingComputeLimits.meshRangeRecordBytes);
  assert.equal(source.triangleCount, 1);
  assert.equal(source.bvhNodeCapacity, 1);
  assert.deepEqual(round(vertexFloats.slice(0, 12)), [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);
  assert.deepEqual(Array.from(indexUints.slice(0, 3)), [0, 1, 2]);
  assert.deepEqual(
    Array.from(meshUints.slice(0, 11)),
    [31, wavefrontMaterialKinds.dielectric, 0, 22, 3, 0, 3, 0, 1, 0, 3]
  );
  assert.deepEqual(round(meshFloats.slice(12, 16)), [0.25, 0.5, 0.75, 0.9]);
  assert.deepEqual(round(meshFloats.slice(36, 40)), round(materialSource.baseColorAtlas.defaultRect));
  assert.deepEqual(round(meshFloats.slice(56, 60)), [1, 1, 1, 0]);
});

test("wavefront GPU material source packs per-mesh factors and atlases", () => {
  const source = createWavefrontGpuMaterialSource([
    {
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      uvs: [0, 0, 1, 0, 0, 1],
      color: [0.2, 0.4, 0.6, 0.8],
      emission: [1.5, 1, 0.5, 1],
      roughness: 0.35,
      metallic: 0.9,
      sheen: 0.2,
      clearcoat: 0.6,
      clearcoatRoughness: 0.15,
      thickness: 0.42,
      material: {
        baseColorTexture: {
          width: 2,
          height: 2,
          data: new Uint8Array([
            255, 0, 0, 255,
            0, 255, 0, 255,
            0, 0, 255, 255,
            255, 255, 255, 255,
          ]),
        },
        metallicRoughnessTexture: {
          width: 1,
          height: 1,
          data: new Uint8Array([255, 192, 128, 255]),
        },
        normalTexture: {
          width: 1,
          height: 1,
          scale: 0.75,
          data: new Uint8Array([128, 128, 255, 255]),
        },
        occlusionTexture: {
          width: 1,
          height: 1,
          data: new Uint8Array([220, 220, 220, 255]),
        },
      },
    },
  ]);
  const floats = new Float32Array(source.buffer);

  assert.equal(source.buffer.byteLength, wavefrontPathTracingComputeLimits.materialRecordBytes);
  assert.equal(source.count, 1);
  assert.deepEqual(round(floats.slice(0, 4)), [0.2, 0.4, 0.6, 0.8]);
  assert.deepEqual(round(floats.slice(4, 8)), [1.5, 1, 0.5, 1]);
  assert.deepEqual(round(floats.slice(8, 12)), [0.35, 0.9, 0.8, 1.45]);
  assert.deepEqual(round(floats.slice(12, 16)), [0.2, 0.2, 0.2, 0.6]);
  assert.deepEqual(round(floats.slice(16, 20)), [0.15, 1, 0, 0.42]);
  assert.deepEqual(round(floats.slice(20, 24)), [1, 1, 1, 1]);
  assert.equal(Number(floats[44].toFixed(2)), 0.75);
  assert.ok(source.baseColorAtlas.width >= 4);
  assert.ok(source.baseColorAtlas.height >= 4);
  assert.ok(source.baseColorAtlas.data.length >= source.baseColorAtlas.width * source.baseColorAtlas.height * 4);
});

test("wavefront emissive triangle index source tracks light mesh triangle order", () => {
  const source = createWavefrontEmissiveTriangleIndexSource([
    {
      positions: [0, 0, 0, 2, 0, 0, 0, 2, 0],
      indices: [0, 1, 2],
      materialKind: "diffuse",
    },
    {
      positions: [
        0, 1, 0,
        1, 1, 0,
        1, 2, 0,
        0, 2, 0,
      ],
      indices: [0, 1, 2, 0, 2, 3],
      materialKind: "emissive",
      emission: [4, 3, 2, 1],
    },
  ]);
  const uints = new Uint32Array(source.buffer);

  assert.deepEqual(source.indices, [1, 2]);
  assert.equal(source.count, 2);
  assert.equal(source.capacity, 2);
  assert.equal(source.recordBytes, wavefrontPathTracingComputeLimits.emissiveTriangleIndexBytes);
  assert.deepEqual(Array.from(uints), [1, 2]);
});

test("wavefront config stores emissive guidance metadata in the BVH buffer tail", () => {
  const config = createWavefrontPathTracingComputeConfig({
    width: 640,
    height: 360,
    displayQuality: true,
    meshes: [
      {
        positions: [
          0, 1, 0,
          1, 1, 0,
          1, 2, 0,
          0, 2, 0,
        ],
        indices: [0, 1, 2, 0, 2, 3],
        materialKind: "emissive",
        emission: [4, 3, 2, 1],
      },
    ],
  });

  assert.equal(config.emissiveTriangleCount, 2);
  assert.equal(config.emissiveTriangleCapacity, 2);
  assert.equal(
    config.memory.emissiveTriangleMetadataBytes,
    2 * wavefrontPathTracingComputeLimits.emissiveTriangleMetadataRecordBytes
  );
  assert.equal(config.memory.materialTableBytes, 0);
  assert.equal(
    config.memory.bvhCombinedBytes,
    config.memory.bvhNodeBytes + config.memory.emissiveTriangleMetadataBytes
  );
});

test("wavefront mesh acceleration derives flat normals when vertex normals are absent", () => {
  const acceleration = createWavefrontMeshAcceleration([
    {
      id: 15,
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      indices: [0, 1, 2],
    },
  ]);
  const triangle = acceleration.triangles[0];

  assert.deepEqual(round(triangle.n0), [0, 0, 1]);
  assert.deepEqual(round(triangle.n1), [0, 0, 1]);
  assert.deepEqual(round(triangle.n2), [0, 0, 1]);
});

test("wavefront mesh acceleration keeps smooth normals for shader interpolation", () => {
  const acceleration = createWavefrontMeshAcceleration([
    {
      id: 16,
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      indices: [0, 1, 2],
      normals: [0, 0, 1, 0, 0.6, 0.8, 0.6, 0, 0.8],
    },
  ]);
  const triangle = acceleration.triangles[0];

  assert.deepEqual(round(triangle.n0), [0, 0, 1]);
  assert.deepEqual(round(triangle.n1), [0, 0.6, 0.8]);
  assert.deepEqual(round(triangle.n2), [0.6, 0, 0.8]);
});

test("wavefront mesh acceleration builds BVH leaves with stable global triangle ids", () => {
  const acceleration = createWavefrontMeshAcceleration([
    {
      id: 20,
      positions: [
        -3, 0, 0,
        -2.5, 0, 0,
        -3, 0.5, 0,
        -2, 0, 0,
        -1.5, 0, 0,
        -2, 0.5, 0,
        -1, 0, 0,
        -0.5, 0, 0,
        -1, 0.5, 0,
        0, 0, 0,
        0.5, 0, 0,
        0, 0.5, 0,
        1, 0, 0,
        1.5, 0, 0,
        1, 0.5, 0,
        2, 0, 0,
        2.5, 0, 0,
        2, 0.5, 0,
      ],
    },
    {
      id: 21,
      positions: [3, 0, 0, 3.5, 0, 0, 3, 0.5, 0],
    },
  ]);
  const triangleIds = acceleration.triangles.map((triangle) => triangle.triangleId).sort((a, b) => a - b);
  const leafNodes = acceleration.nodes.filter((node) => node.triangleCount > 0);
  const root = acceleration.nodes[0];

  assert.equal(acceleration.triangles.length, 7);
  assert.ok(acceleration.nodes.length > 1);
  assert.equal(root.triangleCount, 0);
  assert.deepEqual(triangleIds, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(leafNodes.every((node) => node.triangleCount <= 4), true);
  assert.deepEqual(root.bounds.min, [-3, 0, 0]);
  assert.deepEqual(root.bounds.max, [3.5, 0.5, 0]);
});

test("wavefront triangle and BVH packers use stable GPU record layouts", () => {
  const acceleration = createWavefrontMeshAcceleration([
    {
      id: 4,
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      indices: [0, 1, 2],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
      emission: [2, 1, 0.5, 1],
    },
  ]);
  const packedTriangles = packWavefrontTriangles(acceleration.triangles, 2);
  const packedNodes = packWavefrontBvhNodes(acceleration.nodes, 2);
  const triangleUints = new Uint32Array(packedTriangles.buffer);
  const triangleFloats = new Float32Array(packedTriangles.buffer);
  const nodeUints = new Uint32Array(packedNodes.buffer);

  assert.equal(packedTriangles.buffer.byteLength, 2 * wavefrontPathTracingComputeLimits.triangleRecordBytes);
  assert.equal(packedNodes.buffer.byteLength, 2 * wavefrontPathTracingComputeLimits.bvhNodeRecordBytes);
  assert.equal(triangleUints[1], 4);
  assert.equal(triangleUints[2], wavefrontMaterialKinds.emissive);
  assert.equal(triangleUints[4], 0);
  assert.equal(triangleUints[5], 0);
  assert.deepEqual(round(triangleFloats.slice(8, 12)), [0, 0, 0, 0]);
  assert.deepEqual(round(triangleFloats.slice(40, 44)), [0.72, 0.72, 0.68, 1]);
  assert.deepEqual(round(triangleFloats.slice(44, 48)), [2, 1, 0.5, 1]);
  assert.equal(nodeUints[9], 1);
});

test("wavefront compute config accepts lighting-owned environment payloads", () => {
  const config = createWavefrontPathTracingComputeConfig({
    width: 640,
    height: 360,
    environmentLighting: {
      horizonColor: [0.5, 0.6, 0.7, 1],
      zenithColor: [0.05, 0.08, 0.14, 1],
      sunDirection: [0, 2, 0],
      sunColor: [3, 2.8, 2.4, 1],
      intensity: 1.25,
      mode: 2,
      exposure: 0.9,
      sunlitBaseline: 0.37,
    },
  });

  assert.deepEqual(config.environmentLighting.horizonColor, [0.5, 0.6, 0.7, 1]);
  assert.deepEqual(config.environmentLighting.zenithColor, [0.05, 0.08, 0.14, 1]);
  assert.deepEqual(config.environmentLighting.sunDirection, [0, 1, 0]);
  assert.deepEqual(config.environmentLighting.sunColor, [3, 2.8, 2.4, 1]);
  assert.equal(config.environmentLighting.intensity, 1.25);
  assert.equal(config.environmentLighting.mode, 2);
  assert.equal(config.environmentLighting.exposure, 0.9);
  assert.equal(config.environmentLighting.sunlitBaseline, 0.37);
});

test("wavefront compute config normalizes environment portal apertures", () => {
  const config = createWavefrontPathTracingComputeConfig({
    width: 640,
    height: 360,
    environmentPortalMode: "guide-and-gate",
    environmentPortals: [
      {
        position: [0, 1.2, -2.4],
        normal: [0, 0, 1],
        tangent: [1, 0, 0],
        width: 1.8,
        height: 1.1,
        intensity: 1.35,
        color: [0.8, 0.92, 1, 0.7],
      },
    ],
  });

  assert.equal(config.environmentPortalMode, 2);
  assert.equal(config.environmentPortalCount, 1);
  assert.equal(config.environmentPortalCapacity, 32);
  assert.deepEqual(config.environmentPortals[0].position.slice(0, 3), [0, 1.2, -2.4]);
  assert.equal(Math.abs(config.environmentPortals[0].position[3] - 1.98) < 0.000001, true);
  assert.deepEqual(config.environmentPortals[0].normal, [0, 0, 1, 1.35]);
  assert.deepEqual(config.environmentPortals[0].tangent, [1, 0, 0, 0.9]);
  assert.deepEqual(config.environmentPortals[0].bitangent, [0, 1, 0, 0.55]);
  assert.deepEqual(config.environmentPortals[0].color, [0.8, 0.92, 1, 0.7]);
  assert.equal(config.memory.environmentPortalBytes, 32 * wavefrontPathTracingComputeLimits.environmentPortalRecordBytes);
});

test("wavefront compute config accepts lighting-owned portal payloads", () => {
  const config = createWavefrontPathTracingComputeConfig({
    width: 640,
    height: 360,
    environmentLighting: {
      environmentPortalMode: "guide",
      environmentPortals: [
        {
          center: [1, 1.4, -3],
          normal: [0, 0, 1],
          halfWidth: 0.5,
          halfHeight: 0.25,
        },
      ],
    },
  });

  assert.equal(config.environmentPortalMode, 1);
  assert.equal(config.environmentPortalCount, 1);
  assert.equal(config.environmentPortals[0].tangent[3], 0.5);
  assert.equal(config.environmentPortals[0].bitangent[3], 0.25);
});

test("wavefront compute config validates environment portal inputs", () => {
  assert.throws(
    () =>
      createWavefrontPathTracingComputeConfig({
        width: 640,
        height: 360,
        environmentPortalMode: "bad-mode",
      }),
    /environmentPortalMode must be disabled, guide, guide-and-gate/
  );
  assert.throws(
    () =>
      createWavefrontPathTracingComputeConfig({
        width: 640,
        height: 360,
        environmentPortals: [{ shape: "circle" }],
      }),
    /environmentPortals\[0\]\.shape must be "rectangle"/
  );
});

test("wavefront scene object normalization derives boxes from bounds", () => {
  const object = normalizeWavefrontSceneObject({
    id: 42,
    type: "bounds",
    bounds: {
      min: [-2, -1, 3],
      max: [4, 5, 9],
    },
    material: {
      kind: "metal",
      baseColor: [0.7, 0.5, 0.25, 1],
      roughness: 0.2,
      metallic: 0.9,
    },
  });

  assert.equal(object.id, 42);
  assert.equal(object.kind, wavefrontSceneObjectKinds.box);
  assert.equal(object.materialKind, wavefrontMaterialKinds.metal);
  assert.deepEqual(object.center, [1, 2, 6]);
  assert.deepEqual(object.halfExtent, [3, 3, 3]);
  assert.equal(object.roughness, 0.2);
  assert.equal(object.metallic, 0.9);
});

test("wavefront scene object normalization derives medium ids from inline media", () => {
  const object = normalizeWavefrontSceneObject({
    id: 43,
    type: "sphere",
    radius: 1,
    medium: {
      attenuationColor: [0.72, 0.84, 0.96, 1],
      attenuationDistance: 0.45,
    },
  });

  assert.ok((object.medium?.id ?? 0) > 0);
  assert.equal(object.mediumRefId, object.medium?.id);
  assert.ok((object.medium?.absorption[0] ?? 0) > 0);
});

test("wavefront scene object normalization derives media from volume inputs", () => {
  const object = normalizeWavefrontSceneObject({
    id: 44,
    type: "sphere",
    radius: 1,
    material: {
      transmission: 1,
      volume: {
        thickness: 0.2,
        attenuationColor: [0.7, 0.82, 0.94, 1],
        attenuationDistance: 0.5,
      },
    },
  });

  assert.equal(object.mediumRefId, 44);
  assert.equal(object.medium?.id, 44);
  assert.ok((object.medium?.absorption[0] ?? 0) > 0);
});

test("wavefront scene objects pack into stable GPU record layout", () => {
  const packed = packWavefrontSceneObjects(
    [
      {
        id: 7,
        type: "sphere",
        mediumRefId: 9,
        center: [1, 2, 3],
        radius: 0.75,
        color: [0.1, 0.2, 0.3, 0.4],
        emission: [5, 4, 3, 1],
        thickness: 0.28,
      },
    ],
    2
  );

  assert.equal(packed.count, 1);
  assert.equal(packed.capacity, 2);
  assert.equal(packed.buffer.byteLength, 2 * wavefrontPathTracingComputeLimits.sceneObjectRecordBytes);

  const uints = new Uint32Array(packed.buffer);
  const floats = new Float32Array(packed.buffer);
  assert.equal(uints[0], wavefrontSceneObjectKinds.sphere);
  assert.equal(uints[1], 7);
  assert.equal(uints[2], wavefrontMaterialKinds.emissive);
  assert.equal(uints[4], 9);
  assert.deepEqual(round(floats.slice(8, 12)), [1, 2, 3, 0]);
  assert.deepEqual(round(floats.slice(12, 16)), [0.75, 0.75, 0.75, 0]);
  assert.deepEqual(round(floats.slice(20, 24)), [5, 4, 3, 1]);
  assert.deepEqual(round(floats.slice(32, 36)), [0.08, 1, 0, 0.28]);
});

test("wavefront scene objects pack opacity in material channel z", () => {
  const packed = packWavefrontSceneObjects([
    {
      id: 8,
      type: "sphere",
      radius: 0.5,
      color: [0.5, 0.6, 0.7, 0.35],
      roughness: 0.91,
      opacity: 0.35,
      materialKind: "transparent",
    },
  ]);
  const floats = new Float32Array(packed.buffer);

  assert.deepEqual(round(floats.slice(24, 28)), [0.91, 0, 0.35, 1.45]);
});

test("wavefront compute helper reports unavailable WebGPU when navigator.gpu is missing", () => {
  assert.equal(supportsWavefrontPathTracingCompute({ navigator: {} }), false);
  assert.equal(
    supportsWavefrontPathTracingCompute({
      navigator: {
        gpu: {
          async requestAdapter() {
            return null;
          },
        },
      },
    }),
    true
  );
});

serialWebGpuTest("wavefront compute renderer rejects unavailable WebGPU setup paths", async () => {
  await withWebGpuConstants(async () => {
    await assert.rejects(
      createWavefrontPathTracingComputeRenderer({
        canvas: createFakeWavefrontCanvas(),
        navigator: {},
        width: 8,
        height: 8,
      }),
      /requires navigator\.gpu/
    );

    await assert.rejects(
      createWavefrontPathTracingComputeRenderer({
        canvas: createFakeWavefrontCanvas(),
        navigator: {
          gpu: {
            async requestAdapter() {
              return null;
            },
          },
        },
        width: 8,
        height: 8,
      }),
      /Unable to acquire a WebGPU adapter/
    );

    await assert.rejects(
      createWavefrontPathTracingComputeRenderer({
        canvas: {
          width: 0,
          height: 0,
          getContext() {
            return null;
          },
        },
        navigator: createFakeWavefrontNavigator(),
        width: 8,
        height: 8,
      }),
      /context does not support configure/
    );

    await assert.rejects(
      createWavefrontPathTracingComputeRenderer({
        canvas: createFakeWavefrontCanvas(),
        navigator: createFakeWavefrontNavigator(new FakeWavefrontDevice(), {
          limits: { maxStorageBuffersPerShaderStage: 8 },
        }),
        width: 8,
        height: 8,
      }),
      /requires maxStorageBuffersPerShaderStage>=10/
    );

    await assert.rejects(
      createWavefrontPathTracingComputeRenderer({
        canvas: createFakeWavefrontCanvas(),
        navigator: createFakeWavefrontNavigator(new FakeWavefrontDevice(), {
          limits: {
            maxStorageBuffersPerShaderStage: 10,
            maxSampledTexturesPerShaderStage: 16,
          },
        }),
        width: 8,
        height: 8,
      }),
      /requires maxSampledTexturesPerShaderStage>=21/
    );
  });
});

serialWebGpuTest("wavefront renderer negotiates the exact large-scene storage binding limit", async () => {
  await withWebGpuConstants(async () => {
    const descriptor = await captureRequestedWavefrontDeviceDescriptor({
      triangleCapacity: 265_468,
    });

    assert.equal(
      descriptor.requiredLimits.maxStorageBufferBindingSize,
      152_909_568
    );
    assert.equal(descriptor.requiredLimits.maxBufferSize, undefined);
  });
});

serialWebGpuTest("wavefront renderer also negotiates maxBufferSize above the WebGPU default", async () => {
  await withWebGpuConstants(async () => {
    const descriptor = await captureRequestedWavefrontDeviceDescriptor({
      triangleCapacity: 500_000,
    });

    assert.equal(descriptor.requiredLimits.maxStorageBufferBindingSize, 288_000_000);
    assert.equal(descriptor.requiredLimits.maxBufferSize, 288_000_000);
  });
});

serialWebGpuTest("wavefront renderer rejects unsupported large-scene limits before requesting a device", async () => {
  await withWebGpuConstants(async () => {
    let deviceRequested = false;
    await assert.rejects(
      createWavefrontPathTracingComputeRenderer({
        canvas: createFakeWavefrontCanvas(),
        navigator: createFakeWavefrontNavigator(new FakeWavefrontDevice(), {
          limits: {
            maxStorageBuffersPerShaderStage: 10,
            maxSampledTexturesPerShaderStage: 21,
            maxStorageBufferBindingSize: 150_000_000,
            maxBufferSize: 268_435_456,
          },
          onRequestDevice() {
            deviceRequested = true;
            throw new Error("device request must not be reached");
          },
        }),
        width: 8,
        height: 8,
        triangleCapacity: 265_468,
      }),
      /require maxStorageBufferBindingSize>=152909568 bytes, but this adapter exposes 150000000 bytes/
    );
    assert.equal(deviceRequested, false);
  });
});

serialWebGpuTest("wavefront renderer preserves stricter caller device limits", async () => {
  await withWebGpuConstants(async () => {
    const descriptor = await captureRequestedWavefrontDeviceDescriptor({
      triangleCapacity: 265_468,
      requiredLimits: {
        maxStorageBufferBindingSize: 180_000_000,
      },
      deviceDescriptor: {
        requiredLimits: {
          maxStorageBufferBindingSize: 200_000_000,
          maxBufferSize: 300_000_000,
        },
      },
    });

    assert.equal(descriptor.requiredLimits.maxStorageBufferBindingSize, 200_000_000);
    assert.equal(descriptor.requiredLimits.maxBufferSize, 300_000_000);
  });
});

serialWebGpuTest("wavefront renderer does not elevate storage size limits for default scenes", async () => {
  await withWebGpuConstants(async () => {
    const descriptor = await captureRequestedWavefrontDeviceDescriptor();

    assert.equal(descriptor.requiredLimits.maxStorageBufferBindingSize, undefined);
    assert.equal(descriptor.requiredLimits.maxBufferSize, undefined);
  });
});

serialWebGpuTest("wavefront compute renderer drives GPU-only mesh BVH passes", async () => {
  await withWebGpuConstants(async () => {
    const device = new FakeWavefrontDevice();
    let requestedDeviceDescriptor = null;
    const canvas = createFakeWavefrontCanvas();
    const renderer = await createWavefrontPathTracingComputeRenderer({
      canvas,
      navigator: createFakeWavefrontNavigator(device, {
        limits: {
          maxComputeInvocationsPerWorkgroup: 256,
          maxComputeWorkgroupSizeX: 256,
          maxComputeWorkgroupSizeY: 256,
          maxComputeWorkgroupSizeZ: 64,
          maxComputeWorkgroupsPerDimension: 65_535,
          maxStorageBuffersPerShaderStage: 10,
          maxSampledTexturesPerShaderStage: 48,
        },
        info: {
          vendor: "plasius-test-vendor",
          architecture: "test-architecture",
          device: "test-device",
          description: "fake WebGPU adapter",
        },
        onRequestDevice(descriptor) {
          requestedDeviceDescriptor = descriptor;
        },
      }),
      width: 8,
      height: 8,
      tileSize: 128,
      maxDepth: 2,
      samplesPerPixel: 2,
      denoise: true,
      displayQuality: true,
      accelerationBuildMode: "gpu",
      environmentMap: {
        width: 2,
        height: 1,
        data: new Uint8Array([
          255, 128, 0, 255,
          64, 32, 16, 255,
        ]),
        intensity: 1.7,
        rotationRadians: 0.25,
        ambientStrength: 0.44,
      },
      meshes: [
        {
          id: 77,
          positions: [
            -1, 0, 0,
            1, 0, 0,
            0, 1, 0,
          ],
          indices: [0, 1, 2],
          normals: [0, 0, 1, 0, 0.4, 0.9, 0.4, 0, 0.9],
          materialKind: "emissive",
          emission: [4, 3, 2, 1],
          medium: {
            id: 5,
            attenuationColor: [0.82, 0.88, 0.94, 1],
            attenuationDistance: 0.6,
          },
        },
      ],
    });

    const frame = renderer.renderOnce();
    const secondFrame = renderer.renderOnce();
    const probe = await renderer.readOutputProbe({ x: 2, y: 3 });
    const compatibilityFrame = await renderer.renderFrame({
      probe: { x: 2, y: 3 },
      readStats: true,
    });
    const movedConfig = renderer.updateCamera({
      position: [0.8, 1.3, 5.2],
      target: [0, 0.55, 0],
      fovYDegrees: 42,
    });
    const nextConfig = renderer.updateSceneObjects([]);
    const snapshot = renderer.getSnapshot();

    assert.equal(canvas.width, 8);
    assert.equal(canvas.height, 8);
    assert.equal(canvas.context.configured.format, "bgra8unorm");
    assert.equal(
      requestedDeviceDescriptor.requiredLimits.maxStorageBuffersPerShaderStage,
      10
    );
    assert.equal(
      requestedDeviceDescriptor.requiredLimits.maxSampledTexturesPerShaderStage,
      21
    );
    assert.equal(frame.frame, 1);
    assert.equal(frame.displayQuality, true);
    assert.equal(frame.accelerationBuildMode, "gpu");
    assert.equal(frame.gpuAccelerationBuildRequired, true);
    assert.equal(frame.accelerationBuildSubmitted, true);
    assert.equal(frame.accelerationBuilt, true);
    assert.equal(frame.accelerationBuildCount, 1);
    assert.equal(frame.environmentMap.enabled, true);
    assert.equal(frame.environmentMap.width, 2);
    assert.equal(frame.environmentMap.height, 1);
    assert.equal(frame.environmentMap.mipLevelCount, 2);
    assert.equal(frame.environmentMap.projection, "equirectangular");
    assert.equal(frame.environmentMap.intensity, 1.7);
    assert.equal(frame.environmentMap.rotationRadians, 0.25);
    assert.equal(frame.environmentMap.ambientStrength, 0.44);
    assert.equal(frame.environmentMap.hasImportanceData, true);
    assert.equal(frame.mediumCount, 2);
    assert.equal(frame.commandSubmissions, 2);
    assert.equal(frame.gpuParallelism.physicalCoreCount, null);
    assert.equal(frame.gpuParallelism.physicalCoreCountAvailable, false);
    assert.equal(frame.gpuParallelism.coreUtilizationStatus, "not-exposed-by-webgpu");
    assert.equal(frame.gpuParallelism.adapterInfo.vendor, "plasius-test-vendor");
    assert.equal(frame.gpuParallelism.adapterLimits.maxComputeInvocationsPerWorkgroup, 256);
    assert.equal(frame.gpuParallelism.adapterLimits.maxComputeWorkgroupsPerDimension, 65_535);
    assert.equal(frame.gpuParallelism.adapterLimits.maxStorageBuffersPerShaderStage, 10);
    assert.equal(frame.gpuParallelism.configuredWorkgroupSize, 64);
    assert.ok(frame.gpuParallelism.directDispatches > 0);
    assert.ok(frame.gpuParallelism.directWorkgroups > 0);
    assert.ok(frame.gpuParallelism.directShaderInvocations > 0);
    assert.ok(frame.gpuParallelism.indirectDispatches > 0);
    assert.ok(frame.gpuParallelism.totalEstimatedWorkgroupsUpperBound >= frame.gpuParallelism.directWorkgroups);
    assert.equal(frame.gpuParallelism.exposesMultiWorkgroupParallelism, false);
    assert.equal(secondFrame.frame, 2);
    assert.equal(secondFrame.accelerationBuildSubmitted, false);
    assert.equal(secondFrame.accelerationBuilt, true);
    assert.equal(secondFrame.accelerationBuildCount, 1);
    assert.equal(secondFrame.commandSubmissions, 1);
    assert.equal(compatibilityFrame.frame, 3);
    assert.equal(compatibilityFrame.outputProbe.sampledPixels, 1);
    assert.equal(compatibilityFrame.outputProbe.nonZeroSamples, 1);
    assert.equal(compatibilityFrame.outputProbe.maxChannel, 128);
    assert.deepEqual(compatibilityFrame.termination, {
      emissive: 0,
      environment: 0,
      ambientFallback: 0,
      maxDepth: 0,
      absorptionNull: 0,
      russianRoulette: 0,
      strictMaxDepth: 0,
      deterministicResidualZero: 0,
    });
    assert.deepEqual(compatibilityFrame.terminalRadiance, {
      totalLuminance: 0,
      ambientResidualLuminance: 0,
      ambientResidualShare: 0,
    });
    assert.equal(frame.primaryRays, 128);
    assert.equal(frame.tiles, 1);
    assert.equal(frame.deferredPathResolve, true);
    assert.equal(frame.frameConfigSlots, 3);
    assert.equal(probe.x, 2);
    assert.equal(probe.y, 3);
    assert.deepEqual(probe.rgba, [32, 64, 128, 255]);
    assert.deepEqual(round(movedConfig.camera.position), [0.8, 1.3, 5.2]);
    assert.deepEqual(round(nextConfig.camera.position), [0.8, 1.3, 5.2]);
    assert.equal(nextConfig.camera.fovYDegrees, 42);
    assert.equal(nextConfig.displayQuality, true);
    assert.equal(movedConfig.environmentMap.mipLevelCount, 2);
    assert.equal(nextConfig.environmentMap.mipLevelCount, 2);
    assert.equal(nextConfig.environmentMap.hasImportanceData, true);
    assert.equal(snapshot.frame, 3);
    assert.equal(snapshot.triangleCount, 1);
    assert.equal(snapshot.environmentMap.enabled, true);
    assert.equal(snapshot.environmentMap.width, 2);
    assert.equal(snapshot.environmentMap.mipLevelCount, 2);
    assert.equal(snapshot.environmentMap.hasImportanceData, true);
    assert.equal(snapshot.mediumCount, 2);
    assert.equal(snapshot.accelerationBuilt, true);
    assert.equal(snapshot.accelerationBuildCount, 1);
    assert.equal(snapshot.deferredPathResolve, true);
    assert.equal(snapshot.frameConfigSlots, 3);
    assert.equal(snapshot.gpuParallelism.physicalCoreCountAvailable, false);
    assert.equal(snapshot.gpuParallelism.indirectDispatches, compatibilityFrame.gpuParallelism.indirectDispatches);
    assert.ok(device.pipelineLabels.includes("plasius.wavefront.prepareMeshTrianglesAndLeaves"));
    assert.ok(device.pipelineLabels.includes("plasius.wavefront.generatePrimaryRays"));
    assert.ok(device.pipelineLabels.includes("plasius.wavefront.denoiseLinearRadiance"));
    assert.equal(
      device.dispatches.some(([workgroupX]) => workgroupX === 256),
      false
    );
    assert.ok(device.indirectDispatches.length >= 24);
    assert.ok(device.copyBufferToBufferCalls.length >= 12);
    assert.equal(
      device.copyBufferToBufferCalls.every(
        (call) =>
          (call.sourceOffset === 16 && call.destinationOffset === 0 && call.size === 12) ||
          (call.sourceOffset === 0 &&
            call.destinationOffset === 0 &&
            call.size === wavefrontPathTracingComputeLimits.counterRecordBytes) ||
          (call.source?.descriptor?.label === "plasius.wavefront.counters" &&
            call.destination?.descriptor?.label === "plasius.wavefront.rayCounts" &&
            call.sourceOffset === 0 &&
            call.size === 4) ||
          (call.source?.descriptor?.label === "plasius.wavefront.rayCounts" &&
            call.destination?.descriptor?.label === "plasius.wavefront.rayCounts.readback" &&
            call.sourceOffset === 0 &&
            call.destinationOffset === 0)
      ),
      true
    );
    assert.ok(device.computePasses >= 5);
    assert.ok(device.renderPasses >= 1);
    assert.equal(device.drawCalls.includes(3), true);
    assert.ok(device.queue.submissions.length >= 1);
    assert.equal(device.queue.textureWrites.length, 22);
    assert.equal(device.queue.textureWrites[0].size.width, 2);
    assert.equal(device.queue.textureWrites[0].size.height, 1);
    assert.equal(device.queue.textureWrites[0].layout.bytesPerRow, 256);
    const environmentMapUpload = new DataView(device.queue.textureWrites[0].data.buffer);
    assert.equal(environmentMapUpload.getUint16(0, true), 0x3c00);
    assert.equal(environmentMapUpload.getUint16(4, true), 0);
    assert.equal(environmentMapUpload.getUint16(6, true), 0x3c00);
    assert.ok(environmentMapUpload.getUint16(8, true) > 0);
    assert.ok(environmentMapUpload.getUint16(8, true) < 0x3c00);
    const submittedLabels = device.queue.submissions.flat().map((submission) => submission.encoderLabel);
    assert.equal(submittedLabels.filter((label) => label.includes("buildAcceleration")).length, 1);
    assert.equal(submittedLabels.filter((label) => label.includes(".batched")).length, 3);
    assert.equal(device.copyTextureToBufferCalls.length, 2);

    renderer.destroy();
    assert.equal(canvas.context.configured, null);
    assert.equal(device.buffers.every((buffer) => buffer.destroyed), true);
    assert.equal(device.textures.every((texture) => texture.destroyed), true);
  });
});

serialWebGpuTest("wavefront renderer rebuilds medium GPU resources when scene media changes", async () => {
  await withWebGpuConstants(async () => {
    const device = new FakeWavefrontDevice();
    const renderer = await createWavefrontPathTracingComputeRenderer({
      width: 8,
      height: 8,
      canvas: createFakeWavefrontCanvas(),
      navigator: createFakeWavefrontNavigator(device),
      sceneObjects: [],
    });

    const baselineTextureWrites = device.queue.textureWrites.length;
    const baselineMediumTextures = device.textures.filter(
      (texture) => texture.descriptor.label === "plasius.wavefront.mediumTable"
    );
    const nextConfig = renderer.updateSceneObjects([
      {
        id: 91,
        type: "sphere",
        radius: 0.75,
        material: {
          transmission: 1,
          volume: {
            thickness: 0.14,
            attenuationColor: [0.74, 0.84, 0.96, 1],
            attenuationDistance: 0.4,
          },
        },
      },
    ]);

    assert.equal(nextConfig.mediumCount, 2);
    assert.equal(device.queue.textureWrites.length, baselineTextureWrites + 1);
    assert.equal(device.queue.textureWrites.at(-1)?.size.height, 2);
    const updatedMediumTextures = device.textures.filter(
      (texture) => texture.descriptor.label === "plasius.wavefront.mediumTable"
    );
    assert.equal(updatedMediumTextures.length, baselineMediumTextures.length + 1);
    assert.equal(baselineMediumTextures[0].destroyed, true);
    assert.equal(updatedMediumTextures.at(-1)?.destroyed, false);

    renderer.destroy();
  });
});

serialWebGpuTest("wavefront compute renderer splits large frames into bounded command submissions", async () => {
  await withWebGpuConstants(async () => {
    const device = new FakeWavefrontDevice();
    const renderer = await createWavefrontPathTracingComputeRenderer({
      canvas: createFakeWavefrontCanvas(),
      navigator: createFakeWavefrontNavigator(device),
      width: 512,
      height: 512,
      tileSize: 128,
      maxDepth: 1,
      samplesPerPixel: 2,
      maxFramePassesPerSubmission: 5,
      denoise: true,
    });

    const frame = renderer.renderOnce();
    const submittedLabels = device.queue.submissions
      .flat()
      .map((submission) => submission.encoderLabel);

    assert.equal(frame.tiles, 16);
    assert.equal(frame.maxFramePassesPerSubmission, 5);
    assert.equal(frame.commandSubmissions, 22);
    assert.equal(frame.frameConfigSlots, 33);
    assert.equal(frame.gpuParallelism.physicalCoreCountAvailable, false);
    assert.equal(frame.gpuParallelism.exposesMultiWorkgroupParallelism, true);
    assert.equal(frame.gpuParallelism.largestDirectWorkgroupsPerDispatch, 4096);
    assert.equal(frame.gpuParallelism.largestEstimatedIndirectWorkgroupsPerDispatch, 256);
    assert.equal(frame.gpuParallelism.indirectDispatchesWithMultiWorkgroupCapacity, frame.gpuParallelism.indirectDispatches);
    assert.ok(frame.gpuParallelism.multiWorkgroupDispatches > 0);
    assert.ok(frame.gpuParallelism.directWorkgroups > 1);
    assert.ok(frame.gpuParallelism.totalEstimatedShaderInvocationsUpperBound > frame.gpuParallelism.directShaderInvocations);
    assert.equal(device.queue.submissions.length, 22);
    assert.equal(submittedLabels.every((label) => label.includes(".batched.")), true);

    renderer.destroy();
  });
});

serialWebGpuTest("wavefront output-probe readback waits for submitted GPU work before mapAsync", async () => {
  await withWebGpuConstants(async () => {
    const device = new FakeWavefrontDevice();
    device.requireSubmittedWorkDoneBeforeMapAsync = true;
    const renderer = await createWavefrontPathTracingComputeRenderer({
      canvas: createFakeWavefrontCanvas(),
      navigator: createFakeWavefrontNavigator(device),
      width: 8,
      height: 8,
      tileSize: 8,
      maxDepth: 2,
      samplesPerPixel: 4,
      denoise: true,
      deferredPathResolve: true,
    });

    const frame = await renderer.renderFrame({ readOutputProbe: true, probe: { x: 1, y: 1 } });

    assert.equal(frame.outputProbe.x, 1);
    assert.equal(frame.outputProbe.y, 1);
    assert.deepEqual(frame.outputProbe.rgba, [32, 64, 128, 255]);
    assert.equal(device.queue.submittedWorkDoneCalls, 3);
    assert.equal(device.queue.submittedWorkDone, true);

    renderer.destroy();
  });
});

serialWebGpuTest("wavefront renderFrame waits for submitted GPU work before reporting completion", async () => {
  await withWebGpuConstants(async () => {
    const device = new FakeWavefrontDevice();
    const renderer = await createWavefrontPathTracingComputeRenderer({
      canvas: createFakeWavefrontCanvas(),
      navigator: createFakeWavefrontNavigator(device),
      width: 8,
      height: 8,
      tileSize: 8,
      maxDepth: 2,
      samplesPerPixel: 32,
      denoise: false,
      deferredPathResolve: true,
    });

    const frame = await renderer.renderFrame({ readOutputProbe: false });

    assert.equal(frame.samplesPerPixel, 32);
    assert.equal(frame.renderedSamplesPerPixel, 32);
    assert.equal(device.queue.submittedWorkDone, true);
    assert.ok(device.queue.submittedWorkDoneCalls >= 1);
    assert.equal(frame.gpuWorkerJobs.awaitedGpuCompletion, true);
    assert.ok(frame.gpuWorkerJobs.completedPerFrame > 0);
    assert.ok(frame.gpuWorkerJobs.completedPerSecond > 0);
    assert.equal(
      frame.gpuWorkerJobs.completedPerFrame,
      frame.gpuWorkerJobs.directDispatchesCompleted + frame.gpuWorkerJobs.indirectDispatchesCompleted
    );
    assert.equal(
      frame.gpuWorkerJobs.completedPerSubmission,
      frame.gpuWorkerJobs.completedPerFrame / frame.commandSubmissions
    );
    assert.equal(frame.deviceLossStatus, "not-detected");
    assert.equal(frame.transportGuardrails.status, "pass");
    assert.equal(
      frame.transportGuardrails.current.jobsPerSubmission,
      frame.gpuWorkerJobs.completedPerSubmission
    );
    assert.equal(
      frame.transportGuardrails.current.commandSubmissions,
      frame.commandSubmissions
    );
    assert.ok(frame.transportGuardrails.current.memory.totalBytes > 0);

    renderer.destroy();
  });
});

serialWebGpuTest("fixed-SPP telemetry-off path keeps the exact pass sequence and allocates no telemetry resources", async () => {
  await withWebGpuConstants(async () => {
    const device = new FakeWavefrontDevice();
    const renderer = await createWavefrontPathTracingComputeRenderer({
      canvas: createFakeWavefrontCanvas(),
      navigator: createFakeWavefrontNavigator(device),
      width: 8,
      height: 8,
      tileSize: 8,
      maxDepth: 2,
      samplesPerPixel: 2,
      denoise: false,
      deferredPathResolve: true,
    });

    const frame = renderer.renderOnce();
    const computeLabels = device.computePassDescriptors.map(({ label }) => label);

    assert.deepEqual(computeLabels, [
      "plasius.wavefront.generatePrimaryRaysPass",
      "plasius.wavefront.bounce.0",
      "plasius.wavefront.bounce.1",
      "plasius.wavefront.outputPass",
      "plasius.wavefront.generatePrimaryRaysPass",
      "plasius.wavefront.bounce.0",
      "plasius.wavefront.bounce.1",
      "plasius.wavefront.outputPass",
    ]);
    assert.equal(device.renderPassDescriptors.at(-1)?.label, "plasius.wavefront.presentPass");
    assert.equal(
      device.computePassDescriptors.some(({ timestampWrites }) => timestampWrites),
      false
    );
    assert.equal(
      device.renderPassDescriptors.some(({ timestampWrites }) => timestampWrites),
      false
    );
    assert.equal(
      device.buffers.some(({ descriptor }) => descriptor.label?.includes("rayCounts")),
      false
    );
    assert.equal(
      device.buffers.some(({ descriptor }) => descriptor.label?.includes("timestamps")),
      false
    );
    assert.equal(device.querySets.length, 0);
    assert.equal(frame.primaryRays, 128);
    assert.equal(frame.secondaryRays, null);
    assert.equal(frame.totalPathSegments, null);
    assert.equal(frame.rayCounts.status, "not-requested");
    assert.equal(frame.timings.status, "not-requested");
    assert.equal(frame.telemetryMemoryBytes, 0);

    renderer.destroy();
  });
});

serialWebGpuTest("wavefront readStats reports exact ray segments and timestamp-query GPU time", async () => {
  await withWebGpuConstants(async () => {
    const device = new FakeWavefrontDevice({ features: ["timestamp-query"] });
    device.rayCountReadbackValues = [64, 16];
    device.timestampReadbackValues = [1_000_000n, 5_000_000n];
    let requestedDeviceDescriptor;
    const renderer = await createWavefrontPathTracingComputeRenderer({
      canvas: createFakeWavefrontCanvas(),
      navigator: createFakeWavefrontNavigator(device, {
        features: ["timestamp-query"],
        onRequestDevice(descriptor) {
          requestedDeviceDescriptor = descriptor;
        },
      }),
      width: 8,
      height: 8,
      tileSize: 8,
      maxDepth: 2,
      samplesPerPixel: 1,
      denoise: false,
      deferredPathResolve: true,
    });

    const frame = await renderer.renderFrame({ readStats: true, readOutputProbe: false });

    assert.deepEqual(requestedDeviceDescriptor.requiredFeatures, ["timestamp-query"]);
    assert.equal(device.querySets.length, 1);
    assert.equal(device.querySets[0].descriptor.count, 2);
    assert.equal(device.computePassDescriptors[0].timestampWrites.beginningOfPassWriteIndex, 0);
    assert.equal(
      device.renderPassDescriptors.at(-1).timestampWrites.endOfPassWriteIndex,
      1
    );
    assert.equal(device.queryResolves.length, 1);
    assert.equal(frame.primaryRays, 64);
    assert.equal(frame.secondaryRays, 16);
    assert.equal(frame.totalPathSegments, 80);
    assert.deepEqual(frame.rayCounts.bounceHistogram, [64, 16]);
    assert.equal(frame.rayCounts.status, "available");
    assert.equal(frame.rayCounts.source, "gpu-active-queue-readback");
    assert.equal(frame.rayCounts.expectedPrimaryRays, 64);
    assert.equal(frame.rayCounts.observedPrimaryRays, 64);
    assert.equal(frame.timings.status, "available");
    assert.equal(frame.timings.source, "timestamp-query");
    assert.equal(frame.timings.timestampQueryStatus, "available");
    assert.equal(frame.timings.totalGpuTimeMs, 4);
    assert.ok(frame.timings.totalRenderJobTimeMs >= 0);
    assert.equal(frame.timings.classificationTimeMs, null);
    assert.equal(frame.timings.compactionTimeMs, null);
    assert.equal(frame.timings.samplingTimeMs, null);
    assert.ok(frame.telemetryMemoryBytes > 0);

    renderer.destroy();
    assert.equal(device.querySets[0].destroyed, true);
  });
});

serialWebGpuTest("wavefront readStats isolates timestamp readback failure from valid ray counts", async () => {
  await withWebGpuConstants(async () => {
    const device = new FakeWavefrontDevice({ features: ["timestamp-query"] });
    device.rayCountReadbackValues = [64, 16];
    device.failTimestampMap = true;
    const renderer = await createWavefrontPathTracingComputeRenderer({
      canvas: createFakeWavefrontCanvas(),
      navigator: createFakeWavefrontNavigator(device, { features: ["timestamp-query"] }),
      width: 8,
      height: 8,
      tileSize: 8,
      maxDepth: 2,
      samplesPerPixel: 1,
      denoise: false,
      deferredPathResolve: true,
    });

    const frame = await renderer.renderFrame({ readStats: true, readOutputProbe: false });

    assert.equal(frame.rayCounts.status, "available");
    assert.equal(frame.secondaryRays, 16);
    assert.equal(frame.totalPathSegments, 80);
    assert.equal(frame.timings.status, "fallback");
    assert.equal(frame.timings.source, "queue-completion");
    assert.equal(frame.timings.timestampQueryStatus, "failed");
    assert.match(frame.timings.reason, /simulated timestamp map failure/);

    renderer.destroy();
  });
});

serialWebGpuTest("wavefront readStats distinguishes timestamp setup failure from unsupported adapters", async () => {
  await withWebGpuConstants(async () => {
    const device = new FakeWavefrontDevice({ features: ["timestamp-query"] });
    device.rayCountReadbackValues = [64, 8];
    device.createQuerySet = () => {
      throw new Error("simulated timestamp setup failure");
    };
    const renderer = await createWavefrontPathTracingComputeRenderer({
      canvas: createFakeWavefrontCanvas(),
      navigator: createFakeWavefrontNavigator(device, { features: ["timestamp-query"] }),
      width: 8,
      height: 8,
      tileSize: 8,
      maxDepth: 2,
      samplesPerPixel: 1,
      denoise: false,
      deferredPathResolve: true,
    });

    const frame = await renderer.renderFrame({ readStats: true, readOutputProbe: false });

    assert.equal(frame.rayCounts.status, "available");
    assert.equal(frame.secondaryRays, 8);
    assert.equal(frame.timings.status, "fallback");
    assert.equal(frame.timings.source, "queue-completion");
    assert.equal(frame.timings.timestampQueryStatus, "failed");
    assert.match(frame.timings.reason, /timestamp-query-setup-failed:simulated timestamp setup failure/);

    renderer.destroy();
  });
});

serialWebGpuTest("wavefront readStats distinguishes timestamp fallback from exact ray counters", async () => {
  await withWebGpuConstants(async () => {
    const device = new FakeWavefrontDevice();
    device.rayCountReadbackValues = [64, 8];
    const renderer = await createWavefrontPathTracingComputeRenderer({
      canvas: createFakeWavefrontCanvas(),
      navigator: createFakeWavefrontNavigator(device),
      width: 8,
      height: 8,
      tileSize: 8,
      maxDepth: 2,
      samplesPerPixel: 1,
      denoise: false,
      deferredPathResolve: true,
    });

    const frame = await renderer.renderFrame({ readStats: true, readOutputProbe: false });

    assert.equal(frame.rayCounts.status, "available");
    assert.equal(frame.secondaryRays, 8);
    assert.equal(frame.totalPathSegments, 72);
    assert.equal(frame.timings.status, "fallback");
    assert.equal(frame.timings.source, "queue-completion");
    assert.equal(frame.timings.timestampQueryStatus, "unsupported");
    assert.equal(frame.timings.totalGpuTimeMs, null);
    assert.ok(frame.timings.totalRenderJobTimeMs >= 0);
    assert.equal(device.querySets.length, 0);

    renderer.destroy();
  });
});

serialWebGpuTest("wavefront gpuTimestamps false suppresses the optional device feature request", async () => {
  await withWebGpuConstants(async () => {
    const device = new FakeWavefrontDevice({ features: ["timestamp-query"] });
    device.rayCountReadbackValues = [64, 8];
    let requestedDeviceDescriptor = "not-called";
    const renderer = await createWavefrontPathTracingComputeRenderer({
      canvas: createFakeWavefrontCanvas(),
      navigator: createFakeWavefrontNavigator(device, {
        features: ["timestamp-query"],
        onRequestDevice(descriptor) {
          requestedDeviceDescriptor = descriptor;
        },
      }),
      gpuTimestamps: false,
      width: 8,
      height: 8,
      tileSize: 8,
      maxDepth: 2,
      samplesPerPixel: 1,
      denoise: false,
      deferredPathResolve: true,
    });

    const frame = await renderer.renderFrame({ readStats: true, readOutputProbe: false });

    assert.equal(requestedDeviceDescriptor, undefined);
    assert.equal(device.features.has("timestamp-query"), false);
    assert.equal(device.querySets.length, 0);
    assert.equal(frame.rayCounts.status, "available");
    assert.equal(frame.timings.timestampQueryStatus, "unsupported");
    assert.equal(frame.timings.source, "queue-completion");

    renderer.destroy();
  });
});

serialWebGpuTest("wavefront readStats reports unavailable telemetry when GPU completion is not awaited", async () => {
  await withWebGpuConstants(async () => {
    const device = new FakeWavefrontDevice({ features: ["timestamp-query"] });
    const renderer = await createWavefrontPathTracingComputeRenderer({
      canvas: createFakeWavefrontCanvas(),
      navigator: createFakeWavefrontNavigator(device, { features: ["timestamp-query"] }),
      width: 8,
      height: 8,
      tileSize: 8,
      maxDepth: 2,
      samplesPerPixel: 1,
      denoise: false,
      deferredPathResolve: true,
    });

    const frame = await renderer.renderFrame({
      readStats: true,
      readOutputProbe: false,
      awaitGPUCompletion: false,
    });

    assert.equal(frame.rayCounts.status, "unavailable");
    assert.equal(frame.rayCounts.reason, "gpu-work-not-awaited");
    assert.equal(frame.secondaryRays, null);
    assert.equal(frame.totalPathSegments, null);
    assert.equal(frame.timings.status, "unavailable");
    assert.equal(frame.timings.source, "cpu-submit");
    assert.equal(frame.timings.timestampQueryStatus, "not-recorded");
    assert.equal(frame.telemetryMemoryBytes, 0);
    assert.equal(device.querySets.length, 0);
    assert.equal(
      device.buffers.some(({ descriptor }) => descriptor.label?.includes("rayCounts")),
      false
    );

    renderer.destroy();
  });
});

serialWebGpuTest("wavefront readStats fails closed when observed primary-ray counts drift", async () => {
  await withWebGpuConstants(async () => {
    const device = new FakeWavefrontDevice();
    device.rayCountReadbackValues = [63, 16];
    const renderer = await createWavefrontPathTracingComputeRenderer({
      canvas: createFakeWavefrontCanvas(),
      navigator: createFakeWavefrontNavigator(device),
      width: 8,
      height: 8,
      tileSize: 8,
      maxDepth: 2,
      samplesPerPixel: 1,
      denoise: false,
      deferredPathResolve: true,
    });

    const frame = await renderer.renderFrame({ readStats: true, readOutputProbe: false });

    assert.equal(frame.rayCounts.status, "failed");
    assert.equal(frame.rayCounts.expectedPrimaryRays, 64);
    assert.equal(frame.rayCounts.observedPrimaryRays, 63);
    assert.match(frame.rayCounts.reason, /primary-ray-count-mismatch/);
    assert.equal(frame.secondaryRays, null);
    assert.equal(frame.totalPathSegments, null);

    renderer.destroy();
  });
});

test("wavefront telemetry resources fail closed when readback is unavailable or capacity is exceeded", async () => {
  const unavailable = createWavefrontFrameTelemetryResources({
    device: new FakeWavefrontDevice(),
    constants: { ...gpuConstants, map: null },
    maxRayCountRecords: 1,
  });
  assert.equal(unavailable.available, false);
  assert.equal(unavailable.memoryBytes, 0);
  unavailable.beginFrame();
  unavailable.recordActiveRayCount();
  assert.deepEqual(unavailable.decorateFirstPass({ label: "first" }), { label: "first" });
  assert.deepEqual(unavailable.decorateFinalPass({ label: "last" }), { label: "last" });
  const unavailableResult = await unavailable.readFrame({
    expectedPrimaryRays: 64,
    expectedRayCounts: 1,
  });
  assert.equal(unavailableResult.rayCounts.status, "unavailable");
  assert.equal(unavailableResult.rayCounts.reason, "gpu-map-read-unavailable");
  unavailable.destroy();

  const device = new FakeWavefrontDevice();
  const overflow = createWavefrontFrameTelemetryResources({
    device,
    constants: gpuConstants,
    maxRayCountRecords: 1,
  });
  const encoder = device.createCommandEncoder({ label: "telemetry-overflow" });
  const counterBuffer = device.createBuffer({
    label: "counter",
    size: 4,
    usage: gpuConstants.buffer.COPY_SRC,
  });
  overflow.beginFrame();
  overflow.recordActiveRayCount(encoder, counterBuffer, 0);
  overflow.recordActiveRayCount(encoder, counterBuffer, 1);
  const overflowResult = await overflow.readFrame({
    expectedPrimaryRays: 64,
    expectedRayCounts: 2,
    waitForSubmittedGpuWork: async () => true,
  });
  assert.equal(overflowResult.rayCounts.status, "failed");
  assert.equal(overflowResult.rayCounts.reason, "ray-count-record-capacity-exceeded");
  overflow.destroy();
});

test("wavefront telemetry reduces stress-scale ray records without call-stack growth", async () => {
  const recordsPerBounce = 17_280;
  const bounceCount = 8;
  const recordCount = recordsPerBounce * bounceCount;
  const device = new FakeWavefrontDevice();
  device.rayCountReadbackValues = Array.from({ length: recordCount }, () => 1);
  const telemetry = createWavefrontFrameTelemetryResources({
    device,
    constants: gpuConstants,
    maxRayCountRecords: recordCount,
  });
  const encoder = device.createCommandEncoder({ label: "telemetry-stress" });
  const counterBuffer = device.createBuffer({
    label: "counter",
    size: 4,
    usage: gpuConstants.buffer.COPY_SRC,
  });
  telemetry.beginFrame();
  for (let index = 0; index < recordCount; index += 1) {
    telemetry.recordActiveRayCount(
      encoder,
      counterBuffer,
      Math.floor(index / recordsPerBounce)
    );
  }

  const result = await telemetry.readFrame({
    expectedPrimaryRays: recordsPerBounce,
    expectedRayCounts: recordCount,
    waitForSubmittedGpuWork: async () => true,
  });

  assert.equal(result.rayCounts.status, "available");
  assert.equal(result.rayCounts.observedPrimaryRays, recordsPerBounce);
  assert.equal(result.rayCounts.secondaryRays, recordCount - recordsPerBounce);
  assert.equal(result.rayCounts.totalPathSegments, recordCount);
  assert.equal(result.rayCounts.capturedRayCounts, recordCount);
  assert.equal(result.rayCounts.expectedRayCounts, recordCount);
  assert.deepEqual(
    result.rayCounts.bounceHistogram,
    Array.from({ length: bounceCount }, () => recordsPerBounce)
  );
  telemetry.destroy();
});

serialWebGpuTest("wavefront renderFrame rejects when awaited submitted GPU work times out", async () => {
  await withWebGpuConstants(async () => {
    const device = new FakeWavefrontDevice();
    device.queue.onSubmittedWorkDone = async () => {
      device.queue.submittedWorkDoneCalls += 1;
      return new Promise((resolve) => {
        setTimeout(resolve, 25);
      });
    };
    const renderer = await createWavefrontPathTracingComputeRenderer({
      canvas: createFakeWavefrontCanvas(),
      navigator: createFakeWavefrontNavigator(device),
      width: 8,
      height: 8,
      tileSize: 8,
      maxDepth: 2,
      samplesPerPixel: 32,
      denoise: false,
      deferredPathResolve: true,
    });

    await assert.rejects(
      renderer.renderFrame({ readOutputProbe: false, submittedWorkTimeoutMs: 5 }),
      /Timed out after 5 ms waiting for submitted GPU work\./
    );
    assert.equal(device.queue.submittedWorkDoneCalls, 1);
    assert.equal(device.queue.submittedWorkDone, false);

    renderer.destroy();
  });
});

serialWebGpuTest("wavefront renderFrame awaits completed 8 spp work without timing out", async () => {
  await withWebGpuConstants(async () => {
    const device = new FakeWavefrontDevice();
    const renderer = await createWavefrontPathTracingComputeRenderer({
      canvas: createFakeWavefrontCanvas(),
      navigator: createFakeWavefrontNavigator(device),
      width: 8,
      height: 8,
      tileSize: 8,
      maxDepth: 2,
      samplesPerPixel: 8,
      denoise: false,
      deferredPathResolve: true,
    });

    const frame = await renderer.renderFrame({ readOutputProbe: false });

    assert.equal(frame.samplesPerPixel, 8);
    assert.equal(frame.renderedSamplesPerPixel, 8);
    assert.equal(frame.commandSubmissions, 2);
    assert.equal(device.queue.submittedWorkDone, true);
    assert.equal(device.queue.submittedWorkDoneCalls, 1);
    assert.equal(frame.gpuWorkerJobs.awaitedGpuCompletion, true);
    assert.ok(frame.gpuWorkerJobs.completedPerFrame > frame.commandSubmissions);
    assert.equal(frame.transportGuardrails.status, "pass");
    assert.ok(frame.transportGuardrails.current.jobsPerSubmission > 1);

    renderer.destroy();
  });
});

serialWebGpuTest("wavefront awaited high-spp path keeps tile-local accumulation tile-major", async () => {
  await withWebGpuConstants(async () => {
    const device = new FakeWavefrontDevice();
    const renderer = await createWavefrontPathTracingComputeRenderer({
      canvas: createFakeWavefrontCanvas(),
      navigator: createFakeWavefrontNavigator(device),
      width: 32,
      height: 16,
      tileSize: 16,
      maxDepth: 2,
      samplesPerPixel: 8,
      denoise: false,
      deferredPathResolve: true,
    });

    const frame = await renderer.renderFrame({ readOutputProbe: false });

    assert.equal(frame.tiles, 2);
    assert.equal(frame.samplesPerPixel, 8);
    assert.equal(frame.renderedSamplesPerPixel, 8);
    assert.equal(frame.commandSubmissions, 3);
    assert.equal(device.queue.submissions.length, 3);
    assert.ok(device.queue.submittedWorkDoneCalls >= 2);

    renderer.destroy();
  });
});

serialWebGpuTest("wavefront awaited high-spp path does not reuse frame-config slots across submissions", async () => {
  await withWebGpuConstants(async () => {
    const device = new FakeWavefrontDevice();
    const renderer = await createWavefrontPathTracingComputeRenderer({
      canvas: createFakeWavefrontCanvas(),
      navigator: createFakeWavefrontNavigator(device),
      width: 8,
      height: 8,
      tileSize: 8,
      maxDepth: 2,
      samplesPerPixel: 8,
      maxFramePassesPerSubmission: 2,
      denoise: true,
      deferredPathResolve: true,
    });

    await renderer.renderFrame({ readOutputProbe: false });

    const frameConfigOffsets = device.queue.writes
      .filter((write) => write.buffer?.descriptor?.label === "plasius.wavefront.frameConfig")
      .map((write) => write.offset);
    const uniqueOffsets = new Set(frameConfigOffsets);
    const offsetStride = frameConfigOffsets[1] - frameConfigOffsets[0];

    assert.equal(frameConfigOffsets.length, 9);
    assert.equal(offsetStride, 512);
    assert.deepEqual(
      frameConfigOffsets,
      Array.from({ length: frameConfigOffsets.length }, (_, index) => index * offsetStride)
    );
    assert.equal(uniqueOffsets.size, frameConfigOffsets.length);

    renderer.destroy();
  });
});

serialWebGpuTest("wavefront renderFrame can adapt high spp down to a single in-budget sample", async () => {
  await withWebGpuConstants(async () => {
    const device = new FakeWavefrontDevice();
    const renderer = await createWavefrontPathTracingComputeRenderer({
      canvas: createFakeWavefrontCanvas(),
      navigator: createFakeWavefrontNavigator(device),
      width: 8,
      height: 8,
      tileSize: 8,
      maxDepth: 2,
      samplesPerPixel: 32,
      denoise: false,
      deferredPathResolve: true,
    });

    const frame = await renderer.renderFrame({
      readOutputProbe: false,
      frameTimeBudgetMs: 16,
      minimumSamplesPerPixel: 1,
    });

    assert.equal(frame.samplesPerPixel, 32);
    assert.equal(frame.renderedSamplesPerPixel, 1);
    assert.equal(frame.frameTimeBudgetMs, 16);
    assert.equal(frame.budgetConstrained, true);
    assert.equal(frame.primaryRays, 64);
    assert.equal(device.queue.submittedWorkDoneCalls, 1);

    renderer.destroy();
  });
});

serialWebGpuTest("wavefront compute one-shot compatibility helper renders and always destroys", async () => {
  await withWebGpuConstants(async () => {
    const device = new FakeWavefrontDevice();
    const frame = await renderWavefrontPathTracingComputeFrame({
      canvas: createFakeWavefrontCanvas(),
      navigator: createFakeWavefrontNavigator(device, {
        limits: { maxStorageBuffersPerShaderStage: 10 },
      }),
      width: 8,
      height: 8,
      tileSize: 8,
      maxDepth: 1,
      readOutputProbe: true,
      destroy: false,
    });

    assert.equal(frame.frame, 1);
    assert.equal(frame.outputProbe.sampledPixels, 1);
    assert.equal(frame.outputProbe.maxChannel, 128);
    assert.equal(device.buffers.every((buffer) => buffer.destroyed), true);
    assert.equal(device.textures.every((texture) => texture.destroyed), true);
  });
});

test("default wavefront scene includes emissive termination geometry", () => {
  const objects = createDefaultWavefrontSceneObjects();
  assert.equal(objects.some((object) => object.materialKind === wavefrontMaterialKinds.emissive), true);

  const estimate = estimateWavefrontPathTracingMemory({
    tilePixelCapacity: 256 * 256,
    sceneObjectCapacity: 128,
  });
  assert.ok(estimate.queueBytes < 134_217_728);
  assert.ok(estimate.totalHotBufferBytes < 40_000_000);
});

serialWebGpuTest("wavefront memory evidence matches every persistent GPU buffer allocation", async () => {
  await withWebGpuConstants(async () => {
    const device = new FakeWavefrontDevice();
    const renderer = await createWavefrontPathTracingComputeRenderer({
      canvas: createFakeWavefrontCanvas(),
      navigator: createFakeWavefrontNavigator(device, {
        limits: {
          maxStorageBuffersPerShaderStage: 10,
          maxSampledTexturesPerShaderStage: 21,
          maxStorageBufferBindingSize: 134_217_728,
          maxBufferSize: 268_435_456,
          minUniformBufferOffsetAlignment: 256,
        },
      }),
      width: 8,
      height: 8,
      tileSize: 8,
      maxDepth: 2,
      samplesPerPixel: 2,
      denoise: true,
      accelerationBuildMode: "gpu",
      meshes: [
        {
          id: 901,
          positions: [-1, 0, 0, 1, 0, 0, 0, 1, 0],
          indices: [0, 1, 2],
          normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
          materialKind: "emissive",
          emission: [4, 3, 2, 1],
          color: [0.7, 0.6, 0.5, 1],
        },
      ],
    });
    const memory = renderer.getSnapshot().memory;
    const buffersByLabel = new Map(
      device.buffers.map((buffer) => [buffer.descriptor.label, buffer.descriptor.size])
    );

    assert.equal(memory.meshVertexBytes, 3 * wavefrontPathTracingComputeLimits.meshVertexRecordBytes);
    assert.equal(memory.meshIndexBytes, 3 * 4);
    assert.equal(memory.meshRangeBytes, wavefrontPathTracingComputeLimits.meshRangeRecordBytes);
    assert.equal(
      memory.bvhCombinedBytes,
      memory.bvhNodeBytes + memory.emissiveTriangleMetadataBytes
    );
    assert.equal(memory.materialTableBytes, 0);
    assert.equal(buffersByLabel.get("plasius.wavefront.activeQueue"), memory.queueBytes);
    assert.equal(buffersByLabel.get("plasius.wavefront.nextQueue"), memory.queueBytes);
    assert.equal(buffersByLabel.get("plasius.wavefront.hitBuffer"), memory.hitBytes);
    assert.equal(buffersByLabel.get("plasius.wavefront.accumulation"), memory.accumulationBytes);
    assert.equal(buffersByLabel.get("plasius.wavefront.pathVertices"), memory.pathVertexBytes);
    assert.equal(buffersByLabel.get("plasius.wavefront.sceneObjects"), memory.sceneObjectBytes);
    assert.equal(buffersByLabel.get("plasius.wavefront.triangles"), memory.triangleBytes);
    assert.equal(buffersByLabel.get("plasius.wavefront.bvhNodes"), memory.bvhCombinedBytes);
    assert.equal(buffersByLabel.get("plasius.wavefront.meshVertices"), memory.meshVertexBytes);
    assert.equal(buffersByLabel.get("plasius.wavefront.meshIndices"), memory.meshIndexBytes);
    assert.equal(buffersByLabel.get("plasius.wavefront.meshRanges"), memory.meshRangeBytes);
    assert.equal(
      buffersByLabel.get("plasius.wavefront.environmentPortals"),
      memory.environmentPortalBytes
    );
    assert.equal(buffersByLabel.get("plasius.wavefront.bvhLeafRefs"), memory.bvhLeafReferenceBytes);
    assert.equal(buffersByLabel.get("plasius.wavefront.frameConfig"), memory.frameConfigBytes);
    assert.equal(buffersByLabel.get("plasius.wavefront.bvhBuildConfig"), memory.bvhBuildConfigBytes);
    assert.equal(buffersByLabel.get("plasius.wavefront.counters"), memory.counterBytes);
    assert.equal(
      buffersByLabel.get("plasius.wavefront.activeDispatchArgs"),
      memory.indirectDispatchBytes
    );
    assert.equal(
      memory.totalHotBufferBytes,
      [...buffersByLabel.values()].reduce((total, size) => total + size, 0)
    );

    renderer.destroy();
  });
});
