import assert from "node:assert/strict";
import test from "node:test";
import {
  createWavefrontPathTracingComputeConfig,
  createWavefrontPathTracingComputeRenderer,
  createWavefrontPathTracingComputeShaderSource,
  rendererWavefrontComputeMode,
  rendererWavefrontComputeStatsStride,
  rendererWavefrontComputeWorkgroupSize,
  supportsWavefrontPathTracingCompute,
} from "../src/index.js";

test("wavefront compute config targets high-resolution WebGPU dispatches", () => {
  const config = createWavefrontPathTracingComputeConfig({
    width: 1920,
    height: 1080,
    maxDepth: 6,
  });

  assert.equal(config.mode, rendererWavefrontComputeMode);
  assert.equal(config.cpuReference, false);
  assert.equal(config.indirectDispatch, true);
  assert.equal(config.samples, 1);
  assert.equal(config.primaryRayCount, 2_073_600);
  assert.equal(config.workgroupSize, rendererWavefrontComputeWorkgroupSize);
  assert.equal(config.primaryWorkgroups, 32_400);
  assert.equal(config.bouncePasses, 6);
  assert.equal(config.queueCapacity, 2_073_600);
  assert.equal(rendererWavefrontComputeStatsStride, 8);
});

test("wavefront compute config rejects undersized continuation queues", () => {
  assert.throws(
    () =>
      createWavefrontPathTracingComputeConfig({
        width: 1280,
        height: 720,
        queueCapacity: 128,
      }),
    /queueCapacity must be at least width \* height \* samples/
  );
});

test("wavefront compute shader is storage-buffer and storage-texture based", () => {
  const shader = createWavefrontPathTracingComputeShaderSource();

  assert.match(shader, /var<storage, read_write> activeQueue: array<RayRecord>/);
  assert.match(shader, /var<storage, read_write> nextQueue: array<RayRecord>/);
  assert.match(shader, /var<storage, read_write> accumulation: array<vec4<f32>>/);
  assert.match(shader, /texture_storage_2d<rgba8unorm, write>/);
  assert.match(shader, /@compute @workgroup_size\(64, 1, 1\)/);
  assert.match(shader, /fn generatePrimaryRays/);
  assert.match(shader, /fn traceBounce/);
  assert.match(shader, /fn compactAndSwapQueues/);
  assert.match(shader, /fn resolveOutput/);
  assert.match(shader, /atomicAdd\(&counters\.nextCount/);
});

test("wavefront compute renderer submits indirect bounce dispatches without per-pass readback", () => {
  const source = createWavefrontPathTracingComputeRenderer.toString();

  assert.match(source, /dispatchWorkgroupsIndirect/);
  assert.match(source, /copyBufferToBuffer\(/);
  assert.match(source, /readStatsBuffer/);
  assert.doesNotMatch(source, /mapAsync[\s\S]*for \(let bounce/);
});

test("wavefront compute support check requires navigator.gpu", () => {
  assert.equal(supportsWavefrontPathTracingCompute({ navigator: {} }), false);
  assert.equal(
    supportsWavefrontPathTracingCompute({
      navigator: {
        gpu: {
          requestAdapter() {
            return {};
          },
        },
      },
    }),
    true
  );
});
