import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

const gpuConstants = Object.freeze({
  buffer: Object.freeze({
    MAP_READ: 1,
    COPY_DST: 2,
    COPY_SRC: 4,
    STORAGE: 8,
    UNIFORM: 16,
    INDIRECT: 32,
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
  return readFileSync(new URL("../src/wavefront-compute.js", import.meta.url), "utf8");
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
    this.readback = new Uint8Array(256);
    this.readback.set([32, 64, 128, 255]);
  }

  async mapAsync() {
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
    return new FakeWavefrontComputePass(this.device, descriptor);
  }

  beginRenderPass(descriptor) {
    this.device.renderPasses += 1;
    return new FakeWavefrontRenderPass(this.device, descriptor);
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
  constructor() {
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

  createBindGroupLayout(descriptor) {
    return { descriptor };
  }

  createPipelineLayout(descriptor) {
    return { descriptor };
  }

  createShaderModule(descriptor) {
    return {
      descriptor,
      async compilationInfo() {
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
          async requestDevice(descriptor) {
            adapterOptions.onRequestDevice?.(descriptor);
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
  assert.equal(config.memory.bvhLeafReferenceBytes, 0);
  assert.equal(config.memory.emissiveTriangleMetadataBytes, 0);
  assert.equal(config.memory.environmentPortalBytes, 32 * wavefrontPathTracingComputeLimits.environmentPortalRecordBytes);
  assert.ok(config.memory.queueBytes < 134_217_728);
  assert.ok(config.memory.hitBytes < 134_217_728);
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
  assert.match(types, /sceneObjectRecordBytes: 144;/);
  assert.match(types, /meshRangeRecordBytes: 240;/);
  assert.match(types, /triangleRecordBytes: 352;/);
  assert.match(types, /materialRecordBytes: 192;/);
  assert.throws(
    () => createWavefrontPathTracingComputeShaderSource({ workgroupSize: 32 }),
    /requires workgroupSize=64/
  );
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

test("wavefront reference mesh sampling preserves normalized numeric texture channels", () => {
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

  assert.deepEqual(round(acceleration.triangles[0].color), [0.72, 0, 0, 1]);
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
  assert.match(source, /function encodeDenoise\(encoder, configOffset, parallelism, renderedSamplesPerPixel = config\.samplesPerPixel\)/);
  assert.match(source, /const useTwoPassDenoise = renderedSamplesPerPixel < 4;/);
  assert.match(source, /const denoisePassCount = renderedSamplesPerPixel < 4 \? 2 : 1;/);
  assert.match(source, /tone_map_radiance/);
  assert.doesNotMatch(source, /getImageData|putImageData/);
});

test("wavefront compute guides active continuation rays toward emissive triangles", () => {
  const source = readRendererSource();

  assert.match(source, /emissiveTriangleIndices/);
  assert.match(source, /sample_emissive_triangle_direction/);
  assert.match(source, /config\.emissiveTriangleCount/);
  assert.match(source, /RAY_FLAG_GUIDED_EMISSIVE/);
  assert.match(source, /guidedLightWeight/);
  assert.match(source, /guidedEmissiveAvailable/);
  assert.match(source, /sample_emissive_triangle_direction\(hit, seed \+ 101u, normal\)/);
  assert.match(source, /RAY_FLAG_GUIDED_EMISSIVE/);
  assert.match(source, /\(pixelId \* 747796405u\) \^/);
  assert.match(source, /mix_seed\(sourcePixelId, sampleId, 0u, config\.frameIndex, 1u\)/);
  assert.match(source, /mix_seed\(ray\.sourcePixelId, ray\.sampleId, ray\.bounce, config\.frameIndex, 11u\)/);
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
  assert.match(source, /sample_environment_portal_direction\(hit, seed \+ 131u, normal\)/);
  assert.match(source, /gated_environment_radiance\(ray\.origin\.xyz, ray\.direction\.xyz\)/);
});

test("wavefront compute applies environment ambient on terminal surface collisions", () => {
  const source = readRendererSource();

  assert.match(source, /fn terminal_surface_environment_source/);
  assert.match(source, /fn terminal_surface_environment_contribution/);
  assert.match(source, /fn surface_path_response/);
  assert.match(source, /fn bounded_path_response_luminance/);
  assert.match(source, /fn stabilize_surface_path_response/);
  assert.match(source, /fn sunlit_baseline_radiance/);
  assert.match(source, /let baseline = max\(config\.pathResolveSettings\.y, 0\.0\);/);
  assert.match(source, /let daylightFloor = max\(config\.pathResolveSettings\.y, 0\.0\) \* 0\.08;/);
  assert.match(source, /let hdriFloor = max\(config\.environmentMapSettings\.w, 0\.0\) \* 0\.02;/);
  assert.match(source, /let response = stabilize_surface_path_response\(ray, hit, surface_path_response\(hit\)\);/);
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
  assert.match(source, /record_deferred_path_response\(ray, response\);/);
  assert.match(source, /record_deferred_terminal_source\(ray, terminal_surface_environment_source\(ray, hit\)\);/);
  assert.match(
    source,
    /let terminalEnvironment = terminal_surface_environment_contribution\(ray, hit\);/
  );
  assert.match(
    source,
    /accumulation\[ray\.rayId\] =\s+accumulation\[ray\.rayId\] \+\s+vec4<f32>\(terminalEnvironment \* sample_weight\(\), 1\.0\);/
  );
  assert.match(
    source,
    /let overflowEnvironment = terminal_surface_environment_contribution\(ray, hit\);/
  );
});

test("wavefront compute estimates direct environment light before random continuation", () => {
  const source = readRendererSource();

  assert.match(source, /fn direct_environment_radiance/);
  assert.match(source, /fn sample_environment_importance/);
  assert.match(source, /u32\(config\.environmentMapMeta\.x\)/);
  assert.match(source, /u32\(config\.environmentMapMeta\.y\)/);
  assert.match(source, /if \(count == 0u\) \{\s+return 0u;\s+\}/);
  assert.match(source, /fn power_heuristic/);
  assert.match(source, /fn evaluate_surface_bsdf/);
  assert.match(source, /fn evaluate_surface_bsdf_pdf/);
  assert.match(source, /fn visibility_test_ray/);
  assert.match(source, /fn scene_visibility_blocked/);
  assert.match(source, /fn surface_direct_environment_contribution/);
  assert.match(source, /let lightSample = sample_environment_importance\(vec2<f32>\(/);
  assert.match(source, /if \(scene_visibility_blocked\(origin, lightDirection, 1000000\.0\)\) \{/);
  assert.match(source, /let incidentRadiance = direct_environment_radiance\(origin, lightDirection\);/);
  assert.match(source, /let bsdf = evaluate_surface_bsdf\(hit, viewDirection, lightDirection\);/);
  assert.match(source, /let bsdfPdf = evaluate_surface_bsdf_pdf\(hit, viewDirection, lightDirection\);/);
  assert.match(source, /let misWeight = power_heuristic\(lightSample\.pdf, bsdfPdf\);/);
  assert.match(source, /nDotL \* misWeight \/ max\(lightSample\.pdf, 0\.000001\)/);
  assert.match(source, /let transmissionReflectChance = select\(/);
  assert.doesNotMatch(source, /mix\(reflectChance, max\(reflectChance, 1\.0 - transmission\), transmission > 0\.001\)/);
  assert.match(
    source,
    /let shouldEstimateDirectEnvironment =\s+\(hit\.materialKind == 0u \|\| hit\.materialKind == 1u\) &&\s+hit\.material\.z >= 0\.95 &&\s+ray\.bounce < 2u;/
  );
  assert.match(
    source,
    /let directEnvironment = surface_direct_environment_contribution\(ray, hit\);/
  );
  assert.match(
    source,
    /accumulation\[ray\.rayId\] =\s+accumulation\[ray\.rayId\] \+\s+vec4<f32>\(directEnvironment \* sample_weight\(\), 0\.0\);/
  );
  assert.ok(
    source.indexOf("let shouldEstimateDirectEnvironment =") <
      source.indexOf("let directEnvironment = surface_direct_environment_contribution(ray, hit);")
  );
  assert.ok(
    source.indexOf("let directEnvironment = surface_direct_environment_contribution(ray, hit);") <
      source.indexOf("if (ray.bounce + 1u >= config.maxDepth)")
  );
});

test("wavefront compute samples material textures on the GPU at the resolved hit UV", () => {
  const source = readRendererSource();

  assert.match(source, /const GPU_MATERIAL_RECORD_BYTES = 192/);
  assert.match(source, /const TRIANGLE_RECORD_BYTES = 352/);
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
  assert.match(source, /record_deferred_terminal_source\(ray, sourceRadiance\);/);
  assert.match(source, /sourceRadiance = sourceRadiance \* misWeight;/);
  assert.match(source, /fn resolve_deferred_path_radiance\(rayId: u32\) -> vec3<f32>/);
  assert.match(source, /let terminal = pathVertices\[path_vertex_index\(rayId, config\.maxDepth\)\];/);
  assert.match(source, /depth = depth - 1u;/);
  assert.match(source, /radiance = radiance \* response\.xyz;/);
  assert.match(source, /let resolved = resolve_deferred_path_radiance\(index\) \* sample_weight\(\);/);
  assert.match(
    source,
    /accumulation\[ray\.rayId\] =\s+accumulation\[ray\.rayId\] \+\s+vec4<f32>\(directEnvironment \* sample_weight\(\), 0\.0\);/
  );
  assert.match(source, /if \(config\.deferredPathResolve\) \{/);
  assert.match(source, /createGpuSubmissionBatcher\(\{/);
  assert.match(source, /encodeTileOutput\(batch\.reserve\(1\), tile, configOffset, parallelism\);/);
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

test("display-quality wavefront config schedules GPU mesh BVH build input", () => {
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
  assert.equal(config.emissiveTriangleCount, 0);
  assert.equal(config.memory.triangleBytes, wavefrontPathTracingComputeLimits.triangleRecordBytes);
  assert.equal(config.memory.bvhNodeBytes, wavefrontPathTracingComputeLimits.bvhNodeRecordBytes);
  assert.equal(config.memory.emissiveTriangleMetadataBytes, 0);
});

test("display-quality wavefront config rejects CPU-built acceleration mode", () => {
  assert.throws(
    () =>
      createWavefrontPathTracingComputeConfig({
        width: 640,
        height: 360,
        displayQuality: true,
        accelerationBuildMode: "cpu-debug",
        meshes: [
          {
            positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
          },
        ],
      }),
    /Display-quality path tracing requires GPU-built mesh acceleration/
  );
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
  });
  const acceleration = createWavefrontMeshAcceleration([mesh]);
  const triangle = acceleration.triangles[0];

  assert.equal(mesh.id, 12);
  assert.equal(acceleration.nodes.length, 1);
  assert.equal(triangle.meshId, 12);
  assert.deepEqual(triangle.v1, [2, 0, 0]);
  assert.deepEqual(triangle.n2, [0, 0, 1]);
  assert.deepEqual(triangle.uv2, [0, 1]);
  assert.equal(triangle.materialRefId, 98);
  assert.equal(triangle.mediumRefId, 7);
  assert.deepEqual(acceleration.nodes[0].bounds.min, [0, 0, 0]);
  assert.deepEqual(acceleration.nodes[0].bounds.max, [2, 2, 0]);
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
  assert.deepEqual(round(floats.slice(16, 20)), [0.15, 1, 0, 0]);
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
  assert.equal(config.memory.materialTableBytes, wavefrontPathTracingComputeLimits.materialRecordBytes);
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

test("wavefront scene objects pack into stable GPU record layout", () => {
  const packed = packWavefrontSceneObjects(
    [
      {
        id: 7,
        type: "sphere",
        center: [1, 2, 3],
        radius: 0.75,
        color: [0.1, 0.2, 0.3, 0.4],
        emission: [5, 4, 3, 1],
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
  assert.deepEqual(round(floats.slice(4, 8)), [1, 2, 3, 0]);
  assert.deepEqual(round(floats.slice(8, 12)), [0.75, 0.75, 0.75, 0]);
  assert.deepEqual(round(floats.slice(16, 20)), [5, 4, 3, 1]);
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

  assert.deepEqual(round(floats.slice(20, 24)), [0.91, 0, 0.35, 1.45]);
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
        },
      ],
    });

    const frame = renderer.renderOnce();
    const secondFrame = renderer.renderOnce();
    const probe = await renderer.readOutputProbe({ x: 2, y: 3 });
    const compatibilityFrame = await renderer.renderFrame({ probe: { x: 2, y: 3 } });
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
    assert.equal(frame.frame, 1);
    assert.equal(frame.displayQuality, true);
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
        (call) => call.sourceOffset === 16 && call.destinationOffset === 0 && call.size === 12
      ),
      true
    );
    assert.ok(device.computePasses >= 5);
    assert.ok(device.renderPasses >= 1);
    assert.equal(device.drawCalls.includes(3), true);
    assert.ok(device.queue.submissions.length >= 1);
    assert.equal(device.queue.textureWrites.length, 9);
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
    assert.equal(device.queue.submittedWorkDoneCalls, 1);
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

    renderer.destroy();
  });
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

serialWebGpuTest("wavefront renderFrame throttles 8 spp through the awaited batch path", async () => {
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
    assert.ok(frame.commandSubmissions > 1);
    assert.equal(device.queue.submittedWorkDone, true);
    assert.equal(device.queue.submittedWorkDoneCalls, 1);
    assert.equal(frame.gpuWorkerJobs.awaitedGpuCompletion, true);
    assert.ok(frame.gpuWorkerJobs.completedPerFrame > frame.commandSubmissions);

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
