import assert from "node:assert/strict";
import test from "node:test";

import {
  createWavefrontPathTracingComputeConfig,
  createWavefrontPathTracingComputeShaderSource,
  rendererWavefrontComputeMode,
  rendererWavefrontComputeWorkgroupSize,
  supportsWavefrontPathTracingCompute,
} from "../src/index.js";

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
  assert.equal(config.indirectDispatch, false);
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

test("wavefront compute support probe stays false without navigator gpu", () => {
  assert.equal(supportsWavefrontPathTracingCompute({ navigator: {} }), false);
});
