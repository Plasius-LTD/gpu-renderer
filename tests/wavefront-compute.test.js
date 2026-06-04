import assert from "node:assert/strict";
import test from "node:test";

import {
  createWavefrontPathTracingComputeRenderer,
  createWavefrontPathTracingComputeConfig,
  createWavefrontPathTracingComputeShaderSource,
  rendererWavefrontComputeMode,
  rendererWavefrontComputeWorkgroupSize,
  supportsWavefrontPathTracingCompute,
} from "../src/index.js";

function createMockWavefrontDevice(overrides = {}) {
  const buffers = [];
  const textures = [];

  const baseLimits = {
    maxStorageBufferBindingSize: Number.MAX_SAFE_INTEGER,
    maxBufferSize: Number.MAX_SAFE_INTEGER,
  };
  const commandEncoders = [];

  const queue = {
    writes: [],
    onSubmittedWorkDone: async () => {},
    writeBuffer: (...args) => {
      queue.writes.push(args);
      const [buffer, offset, value] = args;
      if (buffer && value && buffer.data && value.buffer) {
        const source = Buffer.from(value.buffer, value.byteOffset ?? 0, value.byteLength);
        buffer.data.set(source, offset);
      }
    },
    submit: () => {},
  };

  const device = {
    limits: { ...baseLimits, ...(overrides.limits || {}) },
    createBindGroupLayout: () => ({}),
    createPipelineLayout: () => ({}),
    createShaderModule: (descriptor) => ({
      code: descriptor.code,
      getCompilationInfo: async () => ({ messages: [] }),
    }),
    createComputePipelineAsync: async (descriptor) => descriptor,
    createComputePipeline: (descriptor) => descriptor,
    createBuffer: ({ size }) => {
      const entry = { data: Buffer.alloc(Math.ceil(size)), destroy() {} };
      entry.size = size;
      entry.mapAsync = async () => {};
      entry.getMappedRange = () => entry.data;
      entry.unmap = () => {};
      buffers.push(entry);
      return entry;
    },
    createTexture: ({ size }) => {
      const texture = {
        size,
        createView: () => ({ textureSize: size }),
      };
      textures.push(texture);
      return texture;
    },
    queue,
    createBindGroup: ({ entries }) => ({ entries }),
        createCommandEncoder: () => {
      const encoder = {
        copyTextureToTexture: () => {},
        copyTextureToBuffer: () => {},
        copyBufferToBuffer: (sourceBuffer, sourceOffset, destinationBuffer, destinationOffset, copyLength) => {
          const source = sourceBuffer?.data ?? Buffer.alloc(0);
          const destination = destinationBuffer?.data ?? Buffer.alloc(0);
          if (!source.length || !destination.length) {
            return;
          }
          const length = Math.max(
            0,
            Math.min(copyLength ?? destination.length, source.length - sourceOffset, destination.length - destinationOffset),
          );
          if (length <= 0) {
            return;
          }
          source.copy(
            destination,
            destinationOffset,
            sourceOffset,
            sourceOffset + length,
          );
        },
        beginComputePass: () => {
          const pass = {
            commands: [],
            setPipeline: (pipeline) => pass.commands.push(["setPipeline", pipeline.label]),
            setBindGroup: (slot, group) => pass.commands.push(["setBindGroup", slot, group]),
            dispatchWorkgroups: (workgroups) => pass.commands.push(["dispatchWorkgroups", workgroups]),
            dispatchWorkgroupsIndirect: (buffer, offset) => pass.commands.push(["dispatchWorkgroupsIndirect", buffer, offset]),
            end: () => pass.commands.push(["end"]),
          };
          return pass;
        },
        finish: () => ({}),
      };
      commandEncoders.push(encoder);
      return encoder;
    },
    destroy: () => {},
    getLimits: () => ({ maxStorageBufferBindingSize: device.limits.maxStorageBufferBindingSize }),
    ...overrides.device,
  };

  const toBuffer = (buffer) => {
    if (!buffer || buffer.data == null) {
      return null;
    }
    const base = buffer.data;
    if (typeof base.map === "function") {
      return base.map((value) => value);
    }
    return base;
  };

  return { device, queue, buffers, textures };
}

test("wavefront compute config uses tiled queues for large frame targets", () => {
  const config = createWavefrontPathTracingComputeConfig({
    width: 3840,
    height: 2160,
    maxDepth: 6,
  });

  assert.equal(config.mode, rendererWavefrontComputeMode);
  assert.equal(config.primaryRayCount, 8294400);
  assert.equal(config.tileWidth, 256);
  assert.equal(config.tileHeight, 256);
  assert.equal(config.queueCapacity, 65536);
  assert.equal(config.tileCountX, 15);
  assert.equal(config.tileCountY, 9);
  assert.equal(config.tileCount, 135);
  assert.equal(config.indirectDispatch, true);
  assert.equal(config.cpuReference, false);
  assert.equal(config.sceneObjectCount, 0);
  assert.ok(config.maxTileWorkgroups <= Math.ceil(65536 / rendererWavefrontComputeWorkgroupSize));
});

test("wavefront compute config normalizes analytic scene objects", () => {
  const config = createWavefrontPathTracingComputeConfig({
    width: 640,
    height: 360,
    sceneObjects: [
      {
        kind: "box",
        bounds: { min: [-0.5, -0.5, -1.5], max: [0.5, 0.5, -0.5] },
        color: [0.7, 0.4, 0.2, 1],
      },
      {
        kind: "sphere",
        center: [0, 1.1, -1.2],
        radius: 0.25,
        materialKind: 5,
        emission: [8, 6, 3, 1],
      },
    ],
  });

  assert.equal(config.sceneObjectCount, 2);
  assert.equal(config.sceneObjectCapacity, 128);
  assert.deepEqual(config.sceneObjects[0].boundsMin, [-0.5, -0.5, -1.5, 1]);
  assert.deepEqual(config.sceneObjects[1].boundsMax, [0.25, 1.35, -0.95, 0.25]);
  assert.equal(config.sceneObjects[1].materialKind, 5);
});

test("wavefront compute config validates sample-count and scene-object constraints", () => {
  assert.throws(
    () =>
      createWavefrontPathTracingComputeConfig({
        width: 128,
        height: 128,
        samples: 2,
      }),
    /WebGPU wavefront compute currently supports exactly one sample per pixel./
  );

  assert.throws(
    () =>
      createWavefrontPathTracingComputeConfig({
        width: 128,
        height: 128,
        queueCapacity: 16,
        tileWidth: 64,
        tileHeight: 64,
      }),
    /queueCapacity must be at least tileWidth \* tileHeight \* samples/
  );

  assert.throws(
    () =>
      createWavefrontPathTracingComputeConfig({
        width: 128,
        height: 128,
        sceneObjects: [{}, {}],
        sceneObjectLimit: 1,
      }),
    /sceneObjects supports at most 1 analytic objects/
  );

  assert.throws(
    () =>
      createWavefrontPathTracingComputeConfig({
        width: 128,
        height: 128,
        sceneObjects: [{
          bounds: {
            min: [1, 1, 1],
            max: [0, 0, 0],
          },
        }],
        sceneObjectLimit: 1,
      }),
    /sceneObjects\[0\] bounds min values must be lower than max values./
  );
});

test("wavefront compute config rejects queues smaller than one tile", () => {
  assert.throws(
    () =>
      createWavefrontPathTracingComputeConfig({
        width: 1280,
        height: 720,
        tileWidth: 256,
        tileHeight: 256,
        queueCapacity: 4096,
      }),
    /queueCapacity must be at least tileWidth \* tileHeight \* samples/
  );
});

test("wavefront compute shader avoids reserved pass keyword and indirect dispatch assumptions", () => {
  const shaderSource = createWavefrontPathTracingComputeShaderSource();

  assert.match(shaderSource, /var<uniform> bounceConfig: PassConfig/);
  assert.doesNotMatch(shaderSource, /var<uniform> pass: PassConfig/);
  assert.doesNotMatch(shaderSource, /pass\./);
  assert.match(shaderSource, /texture_storage_2d<rgba8unorm, write>/);
  assert.match(shaderSource, /@group\(0\) @binding\(10\) var<storage, read> sceneObjects/);
  assert.match(shaderSource, /fn intersectSceneObject/);
});

test("wavefront compute shader uses configured output storage format", () => {
  const shaderSource = createWavefrontPathTracingComputeShaderSource({
    outputTextureFormat: "rgba16float",
    workgroupSize: rendererWavefrontComputeWorkgroupSize,
  });

  assert.match(shaderSource, /texture_storage_2d<rgba16float, write>/);
  assert.equal(shaderSource.includes("bgra8unorm"), false);
});

test("wavefront compute shader defaults output format to rgba8unorm", () => {
  const shaderSource = createWavefrontPathTracingComputeShaderSource({
    // Keep other options explicit so this test documents the implicit default path.
    workgroupSize: rendererWavefrontComputeWorkgroupSize,
  });

  assert.match(shaderSource, /texture_storage_2d<rgba8unorm, write>/);
});

test("wavefront compute support probe stays false without navigator gpu", () => {
  assert.equal(supportsWavefrontPathTracingCompute({ navigator: {} }), false);
});

test("wavefront compute renderer executes tiled dispatch flow with mocked WebGPU", async () => {
  globalThis.GPUBufferUsage = { STAGING: 0x08, STORAGE: 0x80, MAP_READ: 0x20, COPY_DST: 0x2000, UNIFORM: 0x40, COPY_SRC: 0x10 };
  globalThis.GPUTextureUsage = { STORAGE_BINDING: 0x1000, COPY_SRC: 0x80 };
  globalThis.GPUMapMode = { READ: 1 };
  globalThis.GPUShaderStage = { COMPUTE: 1 };

  const { device, queue, buffers } = createMockWavefrontDevice();
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      configure: () => {},
      getCurrentTexture: () => ({
        createView: () => ({}),
      }),
      unconfigure: () => {},
    }),
  };
  const readCalls = [];
  const adapter = { requestDevice: async () => device };
  const gpu = {
    requestAdapter: async () => adapter,
  };
  const originalGetMappedRange = () => {};
  const result = await createWavefrontPathTracingComputeRenderer({
    gpu,
    canvas,
    width: 2,
    height: 1,
    tileWidth: 1,
    tileHeight: 1,
    format: "bgra8unorm",
    denoise: true,
    sceneObjects: [],
    navigator: { gpu },
    readOutputProbe: false,
    readStats: true,
    adapter,
  });

  const frame = await result.renderFrame({
    readOutputProbe: false,
    readStats: true,
  });

  assert.equal(frame.plan.maxDepth, 5);
  assert.equal(frame.settings.mode, "webgpu-compute");
  assert.equal(frame.plan.dispatch.tileWidth, 1);
  assert.equal(frame.plan.dispatch.workgroupSize, rendererWavefrontComputeWorkgroupSize);
  assert.equal(typeof frame.renderMs, "number");
  assert.equal(queue.writes.length > 0, true);
  assert.equal(typeof frame.settings.tilesPer, "undefined");
  assert.equal(frame.plan.dispatch.indirectDispatch, true);
  result.destroy();
  assert.equal(buffers.every((buffer) => typeof buffer.destroy === "function"), true);
});
