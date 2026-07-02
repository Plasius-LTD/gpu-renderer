import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bindRendererToXrManager,
  createAnimatedSceneRenderer,
  createGpuRenderer,
  createRendererDebugHooks,
  createWavefrontAdaptiveSamplingLevels,
  defaultRendererWorkerProfile,
  defaultRendererClearColor,
  getRendererWorkerManifest,
  getRendererWorkerProfile,
  rendererDebugOwner,
  rendererWorkerManifests,
  rendererWorkerProfileNames,
  rendererWorkerProfiles,
  rendererWorkerQueueClass,
  supportsWebGpu,
} from "../src/index.js";
import {
  createGpuParallelismCounters,
  createGpuSubmissionBatcher,
  createGpuWorkerJobDiagnostics,
  createWavefrontTransportGuardrailSummary,
  recordDirectDispatch,
  recordIndirectDispatch,
} from "../src/wavefront-frame-runtime.js";

class FakeRenderPass {
  constructor() {
    this.ended = false;
  }

  end() {
    this.ended = true;
  }
}

class FakeCommandEncoder {
  constructor() {
    this.pass = new FakeRenderPass();
    this.lastDescriptor = null;
  }

  beginRenderPass(descriptor) {
    this.lastDescriptor = descriptor;
    return this.pass;
  }

  finish() {
    return { type: "command-buffer" };
  }
}

class FakeDevice {
  constructor() {
    this.encoderCount = 0;
    this.submissions = 0;
    this.queue = {
      submit: (buffers) => {
        this.submissions += buffers.length;
      },
    };
  }

  createCommandEncoder() {
    this.encoderCount += 1;
    return new FakeCommandEncoder();
  }
}

class FakeAdapter {
  constructor(device) {
    this.device = device;
  }

  async requestDevice() {
    return this.device;
  }
}

class FakeGpu {
  constructor(adapter) {
    this.adapter = adapter;
  }

  async requestAdapter() {
    return this.adapter;
  }

  getPreferredCanvasFormat() {
    return "bgra8unorm";
  }
}

function createFakeCanvas() {
  const context = {
    configured: null,
    configure(config) {
      this.configured = config;
    },
    getCurrentTexture() {
      return {
        createView() {
          return { type: "texture-view" };
        },
      };
    },
    unconfigure() {
      this.configured = null;
    },
  };

  return {
    width: 0,
    height: 0,
    style: {},
    getContext(type) {
      if (type !== "webgpu") {
        return null;
      }
      return context;
    },
    context,
  };
}

function createFakeCanvas2d() {
  const calls = [];
  const context = {
    calls,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    clearRect: (...args) => calls.push(["clearRect", ...args]),
    fillRect: (...args) => calls.push(["fillRect", ...args]),
    beginPath: () => calls.push(["beginPath"]),
    moveTo: (...args) => calls.push(["moveTo", ...args]),
    lineTo: (...args) => calls.push(["lineTo", ...args]),
    quadraticCurveTo: (...args) => calls.push(["quadraticCurveTo", ...args]),
    arc: (...args) => calls.push(["arc", ...args]),
    closePath: () => calls.push(["closePath"]),
    fill: () => calls.push(["fill"]),
    stroke: () => calls.push(["stroke"]),
    save: () => calls.push(["save"]),
    restore: () => calls.push(["restore"]),
    translate: (...args) => calls.push(["translate", ...args]),
    rotate: (...args) => calls.push(["rotate", ...args]),
  };

  return {
    width: 0,
    height: 0,
    style: {},
    getContext(type) {
      if (type !== "2d") {
        return null;
      }
      return context;
    },
    context,
  };
}

function align4(value) {
  return (value + 3) & ~3;
}

function asArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function makeChunk(byteLength, write) {
  const buffer = Buffer.alloc(align4(byteLength));
  write(buffer);
  return buffer;
}

function createGlb(json, binary) {
  const jsonText = JSON.stringify({
    asset: { version: "2.0", generator: "gpu-renderer-test" },
    buffers: [{ byteLength: binary.byteLength }],
    ...json,
  });
  const jsonBuffer = Buffer.from(jsonText, "utf8");
  const paddedJson = Buffer.concat([jsonBuffer, Buffer.alloc(align4(jsonBuffer.byteLength) - jsonBuffer.byteLength, 0x20)]);
  const totalLength = 12 + 8 + paddedJson.byteLength + 8 + binary.byteLength;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(paddedJson.byteLength, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binary.byteLength, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return asArrayBuffer(Buffer.concat([header, jsonHeader, paddedJson, binHeader, binary]));
}

function createSkinnedTriangleGlb() {
  const chunks = [];
  const push = (buffer) => {
    const byteOffset = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
    chunks.push(buffer);
    return { byteOffset, byteLength: buffer.byteLength };
  };

  const indicesView = push(makeChunk(6, (buffer) => {
    [0, 1, 2].forEach((value, index) => buffer.writeUInt16LE(value, index * 2));
  }));
  const positionsView = push(makeChunk(36, (buffer) => {
    [-0.4, 0, 0, 0.4, 0, 0, 0, 1.6, 0].forEach((value, index) => buffer.writeFloatLE(value, index * 4));
  }));
  const jointsView = push(makeChunk(24, (buffer) => {
    new Array(12).fill(0).forEach((value, index) => buffer.writeUInt16LE(value, index * 2));
  }));
  const weightsView = push(makeChunk(48, (buffer) => {
    [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0].forEach((value, index) => buffer.writeFloatLE(value, index * 4));
  }));
  const inverseBindView = push(makeChunk(64, (buffer) => {
    [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1].forEach((value, index) => buffer.writeFloatLE(value, index * 4));
  }));

  const binary = Buffer.concat(chunks);
  return createGlb({
    scenes: [{ nodes: [0] }],
    scene: 0,
    nodes: [
      { name: "RootNode", children: [1, 2] },
      { name: "mixamorig:Hips", translation: [0, 0, 0] },
      { name: "Peasant_girl", mesh: 0, skin: 0 },
    ],
    skins: [{ joints: [1], inverseBindMatrices: 4, skeleton: 1 }],
    meshes: [{
      name: "Peasant_girl",
      primitives: [{
        attributes: {
          POSITION: 1,
          JOINTS_0: 2,
          WEIGHTS_0: 3,
        },
        indices: 0,
        mode: 4,
      }],
    }],
    bufferViews: [indicesView, positionsView, jointsView, weightsView, inverseBindView],
    accessors: [
      { bufferView: 0, componentType: 5123, count: 3, type: "SCALAR" },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: 3, type: "VEC4" },
      { bufferView: 3, componentType: 5126, count: 3, type: "VEC4" },
      { bufferView: 4, componentType: 5126, count: 1, type: "MAT4" },
    ],
  }, binary);
}

function createDenseSkinnedFanGlb(triangleCount = 1800) {
  const chunks = [];
  const push = (buffer) => {
    const byteOffset = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
    chunks.push(buffer);
    return { byteOffset, byteLength: buffer.byteLength };
  };
  const vertexCount = triangleCount * 3;

  const indicesView = push(makeChunk(vertexCount * 2, (buffer) => {
    for (let index = 0; index < vertexCount; index += 1) {
      buffer.writeUInt16LE(index, index * 2);
    }
  }));
  const positionsView = push(makeChunk(vertexCount * 3 * 4, (buffer) => {
    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      const row = Math.floor(triangle / 60);
      const column = triangle % 60;
      const baseX = -0.45 + column * 0.015;
      const baseY = row * 0.018;
      const base = triangle * 9;
      [baseX, baseY, 0, baseX + 0.012, baseY, 0.01, baseX + 0.006, baseY + 0.016, -0.01]
        .forEach((value, index) => buffer.writeFloatLE(value, (base + index) * 4));
    }
  }));
  const jointsView = push(makeChunk(vertexCount * 4 * 2, (buffer) => {
    for (let index = 0; index < vertexCount * 4; index += 1) {
      buffer.writeUInt16LE(0, index * 2);
    }
  }));
  const weightsView = push(makeChunk(vertexCount * 4 * 4, (buffer) => {
    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      buffer.writeFloatLE(1, vertex * 16);
      buffer.writeFloatLE(0, vertex * 16 + 4);
      buffer.writeFloatLE(0, vertex * 16 + 8);
      buffer.writeFloatLE(0, vertex * 16 + 12);
    }
  }));
  const inverseBindView = push(makeChunk(64, (buffer) => {
    [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1].forEach((value, index) => buffer.writeFloatLE(value, index * 4));
  }));

  const binary = Buffer.concat(chunks);
  return createGlb({
    scenes: [{ nodes: [0] }],
    scene: 0,
    nodes: [
      { name: "RootNode", children: [1, 2] },
      { name: "mixamorig:Hips", translation: [0, 0, 0] },
      { name: "Peasant_girl", mesh: 0, skin: 0 },
    ],
    skins: [{ joints: [1], inverseBindMatrices: 4, skeleton: 1 }],
    meshes: [{
      name: "Peasant_girl",
      primitives: [{
        attributes: {
          POSITION: 1,
          JOINTS_0: 2,
          WEIGHTS_0: 3,
        },
        indices: 0,
        mode: 4,
      }],
    }],
    bufferViews: [indicesView, positionsView, jointsView, weightsView, inverseBindView],
    accessors: [
      { bufferView: 0, componentType: 5123, count: vertexCount, type: "SCALAR" },
      { bufferView: 1, componentType: 5126, count: vertexCount, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: vertexCount, type: "VEC4" },
      { bufferView: 3, componentType: 5126, count: vertexCount, type: "VEC4" },
      { bufferView: 4, componentType: 5126, count: 1, type: "MAT4" },
    ],
  }, binary);
}

function createTranslationClipGlb() {
  const chunks = [];
  const push = (buffer) => {
    const byteOffset = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
    chunks.push(buffer);
    return { byteOffset, byteLength: buffer.byteLength };
  };
  const timeView = push(makeChunk(8, (buffer) => {
    [0, 1].forEach((value, index) => buffer.writeFloatLE(value, index * 4));
  }));
  const translationView = push(makeChunk(24, (buffer) => {
    [0, 0, 0, 0.2, 0, 0].forEach((value, index) => buffer.writeFloatLE(value, index * 4));
  }));
  const binary = Buffer.concat(chunks);
  return createGlb({
    scenes: [{ nodes: [0] }],
    scene: 0,
    nodes: [{ name: "mixamorig:Hips" }],
    animations: [{
      name: "walk",
      samplers: [{ input: 0, output: 1, interpolation: "LINEAR" }],
      channels: [{ sampler: 0, target: { node: 0, path: "translation" } }],
    }],
    bufferViews: [timeView, translationView],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 2, type: "SCALAR" },
      { bufferView: 1, componentType: 5126, count: 2, type: "VEC3" },
    ],
  }, binary);
}

function createFakeDocument(canvasMap = {}) {
  return {
    querySelector(selector) {
      return canvasMap[selector] ?? null;
    },
  };
}

test("supportsWebGpu returns false when navigator.gpu is missing", () => {
  assert.equal(supportsWebGpu({ navigator: {} }), false);
});

test("supportsWebGpu returns true when navigator.gpu exists", () => {
  const gpu = new FakeGpu(new FakeAdapter(new FakeDevice()));
  assert.equal(supportsWebGpu({ navigator: { gpu } }), true);
});

test("createGpuRenderer renders and updates snapshot", async () => {
  const device = new FakeDevice();
  const gpu = new FakeGpu(new FakeAdapter(device));
  const canvas = createFakeCanvas();

  const renderer = await createGpuRenderer({
    canvas,
    navigator: { gpu },
    clearColor: "#123456",
  });

  renderer.resize(320, 180, 2);
  const frame = renderer.renderOnce(100);

  assert.equal(frame.frame, 1);
  assert.equal(device.encoderCount, 1);
  assert.equal(device.submissions, 1);

  const snapshot = renderer.getSnapshot();
  assert.equal(snapshot.frame, 1);
  assert.equal(snapshot.width, 640);
  assert.equal(snapshot.height, 360);
  assert.equal(snapshot.xrActive, false);

  renderer.destroy();
});

test("createAnimatedSceneRenderer advances route, blend, camera, and lifecycle", () => {
  const canvas = createFakeCanvas2d();
  let scheduled = null;
  let canceled = null;
  const renderer = createAnimatedSceneRenderer({
    canvas,
    requestAnimationFrame(callback) {
      scheduled = callback;
      return 44;
    },
    cancelAnimationFrame(handle) {
      canceled = handle;
    },
    route: [
      { id: "gate", position: [0, 0, 0], arriveMs: 0 },
      { id: "crop-row", position: [4, 0, 0], arriveMs: 4000 },
    ],
    beats: [
      {
        id: "idle-at-gate",
        order: 0,
        clipId: "female-basic-locomotion-idle",
        durationMs: 1000,
        blend: { inMs: 0, outMs: 200 },
      },
      {
        id: "walk-to-crops",
        order: 1,
        clipId: "female-basic-locomotion-walking",
        durationMs: 3000,
        blend: { inMs: 200, outMs: 240 },
      },
    ],
    camera: {
      mode: "lagged-follow",
      cubicBezier: [0.22, 0.61, 0.36, 1],
      lagMs: 240,
      lookAheadMs: 320,
      offset: [-1, 2.4, 5.5],
    },
    props: [
      { kind: "crop-row", position: [2, 0, 1] },
      { kind: "cart", position: [4, 0, 0] },
    ],
  });

  renderer.resize(320, 180, 2);
  renderer.start();
  assert.equal(typeof scheduled, "function");

  const first = renderer.renderOnce(0);
  const second = renderer.renderOnce(1600);

  assert.equal(first.activeClipId, "female-basic-locomotion-idle");
  assert.equal(second.activeClipId, "female-basic-locomotion-walking");
  assert.equal(second.characterPosition[0] > first.characterPosition[0], true);
  assert.equal(second.cameraPosition[0] < second.characterPosition[0], true);
  assert.equal(second.cameraViewMode, "spectator");
  assert.equal(Array.isArray(second.cameraTransform.position), true);
  assert.equal(second.headLook.status, "inactive");
  assert.equal(second.blendProgress > 0, true);
  assert.equal(second.characterVisible, true);
  assert.equal(second.characterGroundY > 0, true);
  assert.equal(second.propGroundAnchors.length, 2);
  assert.equal(second.propGroundAnchors.every((anchor) => anchor.visible), true);
  assert.equal(canvas.context.calls.some((call) => call[0] === "fillRect"), true);

  renderer.destroy();
  assert.equal(canceled, 44);
  assert.equal(renderer.getSnapshot().frameState, "destroyed");
});

test("createAnimatedSceneRenderer resolves third-person camera constraints and head look", () => {
  const canvas = createFakeCanvas2d();
  const renderer = createAnimatedSceneRenderer({
    canvas,
    route: [
      { id: "gate", position: [0, 0, 0], arriveMs: 0 },
      { id: "crop-row", position: [4, 0, 0], arriveMs: 4000 },
    ],
    beats: [
      {
        id: "walk",
        order: 0,
        clipId: "female-basic-locomotion-walking",
        durationMs: 1000,
      },
    ],
    camera: {
      viewMode: "third-person",
      offset: [0, 3, 30],
      constraints: {
        maxDistance: 10,
      },
    },
  });

  renderer.applyCameraControl({ type: "orbit", deltaAzimuth: 0.25 }, { activeControl: true });
  const frame = renderer.renderOnce(100);

  assert.equal(frame.cameraViewMode, "third-person");
  assert.equal(Math.round(frame.targetDistance), 10);
  assert.equal(frame.headLook.status, "active");
  assert.equal(frame.headLook.weight > 0, true);
});

test("createAnimatedSceneRenderer resolves first-person from the head anchor", () => {
  const canvas = createFakeCanvas2d();
  const renderer = createAnimatedSceneRenderer({
    canvas,
    route: [{ id: "gate", position: [2, 0, 3], arriveMs: 0 }],
    beats: [
      {
        id: "idle",
        order: 0,
        clipId: "female-basic-locomotion-idle",
        durationMs: 1000,
      },
    ],
    camera: {
      viewMode: "first-person",
      constraints: {
        firstPersonHeadOffset: 0.05,
      },
    },
  });

  const frame = renderer.renderOnce(100);

  assert.equal(frame.cameraViewMode, "first-person");
  assert.deepEqual(frame.cameraTransform.position.map((value) => Number(value.toFixed(2))), [2, 1.65, 2.95]);
});

test("createAnimatedSceneRenderer fails soft when a head bone is unavailable", () => {
  const canvas = createFakeCanvas2d();
  const renderer = createAnimatedSceneRenderer({
    canvas,
    route: [{ id: "gate", position: [0, 0, 0], arriveMs: 0 }],
    beats: [],
    camera: {
      viewMode: "third-person",
      headBoneAvailable: false,
    },
  });

  renderer.applyCameraControl({ type: "look", deltaYaw: 0.4 }, { activeControl: true });
  const frame = renderer.renderOnce(100);

  assert.equal(frame.headLook.status, "unavailable");
  assert.equal(frame.headLook.weight, 0);
});

test("createAnimatedSceneRenderer preserves camera defaults for undefined overrides", () => {
  const renderer = createAnimatedSceneRenderer({
    canvas: createFakeCanvas2d(),
    route: [
      { id: "gate", position: [0, 0, 0], arriveMs: 0 },
      { id: "crop-row", position: [4, 0, 0], arriveMs: 4000 },
    ],
    beats: [
      {
        id: "walk-to-crops",
        order: 0,
        clipId: "female-basic-locomotion-walking",
        durationMs: 4000,
        blend: { inMs: 0, outMs: 240 },
      },
    ],
    camera: {
      cubicBezier: undefined,
      lagMs: undefined,
      lookAheadMs: undefined,
      offset: [-1, 2.4, 5.5],
    },
  });

  const snapshot = renderer.renderOnce(1200);

  assert.equal(Number.isFinite(snapshot.cameraPosition[0]), true);
  assert.equal(snapshot.cameraPosition[1], 2.4);
  assert.equal(snapshot.cameraPosition[2], 5.5);
  renderer.destroy();
});

test("createAnimatedSceneRenderer grounds adventure props and visible character on the same scene plane", () => {
  const renderer = createAnimatedSceneRenderer({
    canvas: createFakeCanvas2d(),
    route: [
      { id: "gate", position: [0, 0, 0], arriveMs: 0 },
      { id: "crop-row", position: [4, 0, 1], arriveMs: 4000 },
    ],
    beats: [
      {
        id: "walk-to-crops",
        order: 0,
        clipId: "female-basic-locomotion-walking",
        durationMs: 4000,
        blend: { inMs: 0, outMs: 240 },
      },
    ],
    camera: {
      mode: "lagged-follow",
      cubicBezier: [0.22, 0.61, 0.36, 1],
      lagMs: 240,
      lookAheadMs: 320,
      offset: [-1, 2.4, 5.5],
    },
    props: [
      { id: "soil", kind: "crop-row", position: [2.5, 0, 0.8] },
      { id: "tree", kind: "small-tree", position: [1.5, 0, 2.2] },
      { id: "crate", kind: "crate", position: [4.4, 0, 0.4] },
    ],
  });

  renderer.resize(640, 360, 1);
  const snapshot = renderer.renderOnce(1800);
  const anchors = new Map(snapshot.propGroundAnchors.map((anchor) => [anchor.id, anchor]));

  assert.equal(snapshot.characterVisible, true);
  assert.equal(anchors.get("soil")?.visible, true);
  assert.equal(anchors.get("tree")?.visible, true);
  assert.equal(anchors.get("crate")?.visible, true);
  assert.equal(Math.abs((anchors.get("soil")?.groundY ?? 0) - snapshot.characterGroundY) < 120, true);
  assert.equal(Math.abs((anchors.get("crate")?.groundY ?? 0) - snapshot.characterGroundY) < 120, true);
  assert.equal((anchors.get("tree")?.groundY ?? 0) > snapshot.characterGroundY, true);
  renderer.destroy();
});

test("createAnimatedSceneRenderer renders a skinned GLB model when model and clip payloads are provided", () => {
  const canvas = createFakeCanvas2d();
  const renderer = createAnimatedSceneRenderer({
    canvas,
    route: [
      { id: "gate", position: [0, 0, 0], arriveMs: 0 },
      { id: "crop-row", position: [4, 0, 1], arriveMs: 4000 },
    ],
    beats: [
      {
        id: "walk-to-crops",
        order: 0,
        clipId: "female-basic-locomotion-walking",
        durationMs: 4000,
        blend: { inMs: 0, outMs: 240 },
      },
    ],
    camera: {
      mode: "lagged-follow",
      cubicBezier: [0.22, 0.61, 0.36, 1],
      lagMs: 240,
      lookAheadMs: 320,
      offset: [-1, 2.4, 5.5],
    },
    modelAsset: createSkinnedTriangleGlb(),
    clipAssets: [
      {
        id: "female-basic-locomotion-walking",
        asset: createTranslationClipGlb(),
      },
    ],
  });

  renderer.resize(640, 360, 1);
  const snapshot = renderer.renderOnce(1800);

  assert.equal(snapshot.modelLoaded, true);
  assert.equal(snapshot.modelRenderable, true);
  assert.equal(snapshot.fallbackProxyActive, false);
  assert.equal(snapshot.skinnedVertexCount, 3);
  assert.equal(snapshot.skinnedTriangleCount, 1);
  assert.equal(snapshot.skinnedJointCount, 1);
  assert.equal(snapshot.skinnedClipCount, 1);
  assert.equal(snapshot.skinnedAnimatedNodeCount, 1);
  assert.equal(snapshot.activeClipRenderable, true);
  assert.equal(snapshot.characterVisible, true);
  assert.equal(canvas.context.calls.some((call) => call[0] === "closePath"), true);
  renderer.destroy();
});

test("createAnimatedSceneRenderer fills dense skinned GLB triangles without wireframe decimation", () => {
  const canvas = createFakeCanvas2d();
  const triangleCount = 1800;
  const renderer = createAnimatedSceneRenderer({
    canvas,
    route: [
      { id: "gate", position: [0, 0, 0], arriveMs: 0 },
      { id: "crop-row", position: [4, 0, 1], arriveMs: 4000 },
    ],
    beats: [
      {
        id: "walk-to-crops",
        order: 0,
        clipId: "female-basic-locomotion-walking",
        durationMs: 4000,
        blend: { inMs: 0, outMs: 240 },
      },
    ],
    camera: {
      mode: "lagged-follow",
      cubicBezier: [0.22, 0.61, 0.36, 1],
      lagMs: 240,
      lookAheadMs: 320,
      offset: [-1, 2.4, 5.5],
    },
    modelAsset: createDenseSkinnedFanGlb(triangleCount),
    clipAssets: [
      {
        id: "female-basic-locomotion-walking",
        asset: createTranslationClipGlb(),
      },
    ],
  });

  renderer.resize(640, 360, 1);
  const snapshot = renderer.renderOnce(1800);
  const closePathCalls = canvas.context.calls.filter((call) => call[0] === "closePath").length;
  const strokeCalls = canvas.context.calls.filter((call) => call[0] === "stroke").length;

  assert.equal(snapshot.modelRenderable, true);
  assert.equal(snapshot.skinnedTriangleCount, triangleCount);
  assert.equal(closePathCalls >= triangleCount, true);
  assert.equal(strokeCalls <= 2, true);
  renderer.destroy();
});

test("createAnimatedSceneRenderer ignores stale animation ticks after destroy", () => {
  let scheduledTick = null;
  const renderer = createAnimatedSceneRenderer({
    canvas: createFakeCanvas2d(),
    route: [
      { id: "gate", position: [0, 0, 0], arriveMs: 0 },
      { id: "crop-row", position: [4, 0, 0], arriveMs: 4000 },
    ],
    beats: [
      {
        id: "walk-to-crops",
        order: 0,
        clipId: "female-basic-locomotion-walking",
        durationMs: 4000,
        blend: { inMs: 0, outMs: 240 },
      },
    ],
    requestAnimationFrame(callback) {
      scheduledTick = callback;
      return 91;
    },
  });

  renderer.start();
  assert.equal(typeof scheduledTick, "function");
  renderer.destroy();
  const destroyed = renderer.getSnapshot();

  assert.equal(destroyed.frameState, "destroyed");
  scheduledTick(1000);
  assert.equal(renderer.getSnapshot().frameState, "destroyed");
});

test("createGpuRenderer emits frame lifecycle hooks with frame ids", async () => {
  const device = new FakeDevice();
  const gpu = new FakeGpu(new FakeAdapter(device));
  const canvas = createFakeCanvas();
  const events = [];

  const renderer = await createGpuRenderer({
    canvas,
    navigator: { gpu },
    frameIdFactory: ({ frame, xrActive }) => `frame-${frame}-${xrActive}`,
    onFrameStart(event) {
      events.push(["start", event.frame, event.frameId, event.frameTimeMs]);
    },
    onFrameComplete(event) {
      events.push(["complete", event.frame, event.frameId, event.frameTimeMs]);
    },
  });

  const first = renderer.renderOnce(100);
  const second = renderer.renderOnce(116.5);

  assert.deepEqual(first, {
    frame: 1,
    frameId: "frame-1-false",
    frameTimeMs: undefined,
    timestamp: 100,
  });
  assert.deepEqual(second, {
    frame: 2,
    frameId: "frame-2-false",
    frameTimeMs: 16.5,
    timestamp: 116.5,
  });
  assert.deepEqual(events, [
    ["start", 1, "frame-1-false", undefined],
    ["complete", 1, "frame-1-false", undefined],
    ["start", 2, "frame-2-false", 16.5],
    ["complete", 2, "frame-2-false", 16.5],
  ]);

  renderer.destroy();
});

test("renderer start/stop uses injected animation frame handlers", async () => {
  const device = new FakeDevice();
  const gpu = new FakeGpu(new FakeAdapter(device));
  const canvas = createFakeCanvas();

  let scheduled = null;
  let canceled = null;
  const renderer = await createGpuRenderer({
    canvas,
    navigator: { gpu },
    requestAnimationFrame: (cb) => {
      scheduled = cb;
      return 42;
    },
    cancelAnimationFrame: (id) => {
      canceled = id;
    },
  });

  assert.equal(renderer.start(), true);
  assert.equal(typeof scheduled, "function");
  scheduled(123);
  assert.equal(device.submissions, 1);

  assert.equal(renderer.stop(), true);
  assert.equal(canceled, 42);

  renderer.destroy();
});

test("createRendererDebugHooks records frame samples against a debug session", () => {
  const frameSamples = [];
  const hooks = createRendererDebugHooks({
    debugSession: {
      recordFrame(sample) {
        frameSamples.push(sample);
        return true;
      },
    },
    targetFrameRate: 72,
  });

  hooks.onFrameComplete({
    frame: 12,
    frameId: "renderer.frame.12",
    frameTimeMs: 13.8,
    timestamp: 250,
    device: { label: "device" },
    context: { label: "context" },
    canvas: { width: 1280, height: 720 },
    xrActive: true,
  });

  assert.deepEqual(frameSamples, [
    {
      frameId: "renderer.frame.12",
      frameTimeMs: 13.8,
      targetFrameTimeMs: 1000 / 72,
    },
  ]);
});

test("wavefront frame runtime tracks dispatch diagnostics without renderer state", () => {
  const counters = createGpuParallelismCounters();

  recordDirectDispatch(counters, [8], 64);
  recordIndirectDispatch(counters, 5, 64);

  const diagnostics = createGpuWorkerJobDiagnostics(
    {
      directDispatches: counters.directDispatches,
      indirectDispatches: counters.indirectDispatches,
    },
    2,
    10,
    true
  );

  assert.equal(counters.directDispatches, 1);
  assert.equal(counters.directWorkgroups, 8);
  assert.equal(counters.directShaderInvocations, 512);
  assert.equal(counters.indirectDispatches, 1);
  assert.equal(counters.estimatedIndirectWorkgroupsUpperBound, 5);
  assert.equal(diagnostics.completedPerFrame, 2);
  assert.equal(diagnostics.completedPerSubmission, 1);
  assert.equal(diagnostics.completedPerSecond, 200);
});

test("wavefront transport guardrails summarize throughput memory and queue health", () => {
  const guardrails = createWavefrontTransportGuardrailSummary({
    commandSubmissions: 2,
    maxFramePassesPerSubmission: 8,
    queueOverflow: 0,
    deviceLossStatus: "not-detected",
    memory: {
      queueBytes: 1024,
      hitBytes: 2048,
      configBytes: 128,
    },
    gpuWorkerJobs: {
      completedPerFrame: 18,
      completedPerSecond: 360,
      completedPerSubmission: 9,
      directDispatchesCompleted: 12,
      indirectDispatchesCompleted: 6,
      frameTimeMs: 50,
      awaitedGpuCompletion: true,
    },
  });

  assert.equal(guardrails.status, "pass");
  assert.equal(guardrails.thresholds.maxPerJobRegressionRatio, 0.1);
  assert.equal(guardrails.current.jobsPerFrame, 18);
  assert.equal(guardrails.current.jobsPerSecond, 360);
  assert.equal(guardrails.current.jobsPerSubmission, 9);
  assert.equal(guardrails.current.commandSubmissions, 2);
  assert.equal(guardrails.current.memory.totalBytes, 3200);
  assert.equal(guardrails.current.deviceLossStatus, "not-detected");
  assert.deepEqual(guardrails.current.radianceDiagnostics, {
    invalidSamples: 0,
    legacyClampEquivalentSamples: 0,
  });
  assert.equal(guardrails.checks.length, 4);
  assert.ok(guardrails.checks.every((check) => check.status === "pass"));
  assert.match(
    guardrails.checks.find((check) => check.id === "submission-batching").details,
    /9\.00 jobs\/submission/
  );
});

test("wavefront transport guardrails warn when queue overflow or pending completion hide stability risk", () => {
  const guardrails = createWavefrontTransportGuardrailSummary({
    commandSubmissions: 0,
    maxFramePassesPerSubmission: 4,
    queueOverflow: 3,
    gpuWorkerJobs: {
      completedPerFrame: 0,
      completedPerSecond: null,
      completedPerSubmission: 0,
      directDispatchesCompleted: 0,
      indirectDispatchesCompleted: 0,
      frameTimeMs: 12,
      awaitedGpuCompletion: false,
    },
  });

  assert.equal(guardrails.status, "warn");
  assert.equal(guardrails.current.deviceLossStatus, "pending");
  assert.equal(guardrails.current.queueOverflow, 3);
  assert.ok(guardrails.checks.some((check) => check.id === "queue-overflow" && check.status === "warn"));
  assert.ok(
    guardrails.checks.some((check) => check.id === "submission-batching" && check.status === "warn")
  );
});

test("wavefront transport guardrails surface invalid and legacy-clamp-equivalent radiance samples", () => {
  const guardrails = createWavefrontTransportGuardrailSummary({
    commandSubmissions: 1,
    maxFramePassesPerSubmission: 4,
    queueOverflow: 0,
    radianceDiagnostics: {
      invalidSamples: 1,
      legacyClampEquivalentSamples: 3,
    },
    gpuWorkerJobs: {
      completedPerFrame: 4,
      completedPerSecond: 80,
      completedPerSubmission: 4,
      directDispatchesCompleted: 4,
      indirectDispatchesCompleted: 0,
      frameTimeMs: 50,
      awaitedGpuCompletion: true,
    },
  });

  assert.equal(guardrails.status, "fail");
  assert.deepEqual(guardrails.current.radianceDiagnostics, {
    invalidSamples: 1,
    legacyClampEquivalentSamples: 3,
  });
  assert.ok(
    guardrails.checks.some(
      (check) =>
        check.id === "radiance-diagnostics" &&
        check.status === "fail" &&
        /invalid radiance sample/.test(check.details)
    )
  );
});

test("wavefront transport guardrails warn when submissions collapse to one job each", () => {
  const guardrails = createWavefrontTransportGuardrailSummary({
    commandSubmissions: 2,
    maxFramePassesPerSubmission: 8,
    queueOverflow: 0,
    deviceLossStatus: "not-detected",
    memory: {
      queueBytes: 1024,
    },
    gpuWorkerJobs: {
      completedPerFrame: 2,
      completedPerSecond: 40,
      completedPerSubmission: 1,
      directDispatchesCompleted: 2,
      indirectDispatchesCompleted: 0,
      frameTimeMs: 50,
      awaitedGpuCompletion: true,
    },
  });

  assert.equal(guardrails.status, "warn");
  assert.ok(
    guardrails.checks.some(
      (check) =>
        check.id === "submission-batching" &&
        check.status === "warn" &&
        /despite a 8-pass ceiling/.test(check.details)
    )
  );
});

test("wavefront frame runtime batches submissions against a per-submit pass ceiling", () => {
  const labels = [];
  const submits = [];
  const device = {
    createCommandEncoder({ label }) {
      labels.push(label);
      return {
        finish() {
          return { label };
        },
      };
    },
    queue: {
      submit(commandBuffers) {
        submits.push(commandBuffers.map((buffer) => buffer.label));
      },
    },
  };

  const batch = createGpuSubmissionBatcher({
    device,
    frameIndex: 9,
    maxFramePassesPerSubmission: 3,
    startingSubmissionCount: 2,
  });

  const first = batch.reserve(2);
  const second = batch.reserve(2);
  batch.reserve(1);
  const flushed = batch.flush();

  assert.notEqual(first, second);
  assert.equal(flushed, 2);
  assert.deepEqual(submits, [
    ["plasius.wavefront.frame.9.batched.3"],
    ["plasius.wavefront.frame.9.batched.4"],
  ]);
  assert.deepEqual(labels, [
    "plasius.wavefront.frame.9.batched.3",
    "plasius.wavefront.frame.9.batched.4",
    "plasius.wavefront.frame.9.batched.5",
  ]);
});

test("createRendererDebugHooks forwards owner metadata and dynamic targets", () => {
  const callbacks = [];
  const hooks = createRendererDebugHooks({
    debugSession: {
      recordFrame() {
        return true;
      },
    },
    getTargetFrameTimeMs(event) {
      return event.xrActive ? 1000 / 90 : 1000 / 60;
    },
    onFrameStart(event) {
      callbacks.push(["start", event.owner, event.frameId]);
    },
    onFrameComplete(event) {
      callbacks.push([
        "complete",
        event.owner,
        event.frameId,
        event.targetFrameTimeMs,
      ]);
    },
  });

  hooks.onFrameStart({
    frame: 1,
    frameId: "renderer.frame.1",
    frameTimeMs: undefined,
    timestamp: 100,
    device: { label: "device" },
    context: { label: "context" },
    canvas: { width: 800, height: 600 },
    xrActive: false,
  });
  hooks.onFrameComplete({
    frame: 1,
    frameId: "renderer.frame.1",
    frameTimeMs: 16,
    timestamp: 100,
    device: { label: "device" },
    context: { label: "context" },
    canvas: { width: 800, height: 600 },
    xrActive: false,
  });

  assert.deepEqual(callbacks, [
    ["start", rendererDebugOwner, "renderer.frame.1"],
    ["complete", rendererDebugOwner, "renderer.frame.1", 1000 / 60],
  ]);
});

test("renderer worker profiles expose realtime and xr frame-stage DAGs", () => {
  assert.deepEqual(rendererWorkerProfileNames, ["realtime", "xr"]);
  assert.equal(defaultRendererWorkerProfile, "realtime");
  assert.deepEqual(rendererWorkerProfiles.realtime, {
    name: "realtime",
    description:
      "Frame-stage DAG for flat rendering with visibility, main encode, post-processing, and submit.",
    jobs: ["acquire", "visibility", "mainEncode", "postProcess", "submit"],
  });
  assert.deepEqual(getRendererWorkerProfile("xr"), {
    name: "xr",
    description:
      "Frame-stage DAG for XR rendering with late-latch coordination before main encode and submit.",
    jobs: ["acquire", "visibility", "lateLatch", "mainEncode", "submit"],
  });
});

test("wavefront adaptive sampling levels expose bounded power-of-two ladders", () => {
  const plan = createWavefrontAdaptiveSamplingLevels({
    samplesPerPixel: 32,
    frameTimeBudgetMs: 16,
    minimumSamplesPerPixel: 1,
  });

  assert.equal(plan.requestedSamplesPerPixel, 32);
  assert.equal(plan.minimumSamplesPerPixel, 1);
  assert.equal(plan.frameTimeBudgetMs, 16);
  assert.deepEqual(
    plan.levels.map((level) => level.config.samplesPerPixel),
    [1, 2, 4, 8, 16, 32]
  );
});

test("renderer worker manifests publish queue, priority, and dependency metadata", () => {
  const realtime = getRendererWorkerManifest();
  const xr = getRendererWorkerManifest("xr");

  assert.equal(realtime, rendererWorkerManifests.realtime);
  assert.equal(realtime.owner, rendererDebugOwner);
  assert.equal(realtime.queueClass, rendererWorkerQueueClass);
  assert.equal(realtime.schedulerMode, "dag");
  assert.deepEqual(realtime.suggestedAllocationIds, [
    "renderer.surface.current",
    "renderer.visibility.worklist",
    "renderer.post-process.history",
  ]);

  assert.deepEqual(
    realtime.jobs.map((job) => ({
      key: job.key,
      priority: job.worker.priority,
      dependencies: job.worker.dependencies,
    })),
    [
      { key: "acquire", priority: 5, dependencies: [] },
      { key: "visibility", priority: 4, dependencies: [] },
      {
        key: "mainEncode",
        priority: 4,
        dependencies: [
          "renderer.realtime.acquire",
          "renderer.realtime.visibility",
        ],
      },
      {
        key: "postProcess",
        priority: 3,
        dependencies: ["renderer.realtime.mainEncode"],
      },
      {
        key: "submit",
        priority: 2,
        dependencies: ["renderer.realtime.postProcess"],
      },
    ]
  );
  assert.deepEqual(
    realtime.jobs.find((job) => job.key === "postProcess").debug.tags,
    ["renderer", "realtime", "postProcess", "post-processing"]
  );

  assert.equal(xr.profile, "xr");
  assert.deepEqual(
    xr.jobs.map((job) => ({
      key: job.key,
      priority: job.worker.priority,
      dependencies: job.worker.dependencies,
    })),
    [
      { key: "acquire", priority: 5, dependencies: [] },
      { key: "visibility", priority: 4, dependencies: [] },
      {
        key: "lateLatch",
        priority: 5,
        dependencies: ["renderer.xr.acquire"],
      },
      {
        key: "mainEncode",
        priority: 4,
        dependencies: ["renderer.xr.visibility", "renderer.xr.lateLatch"],
      },
      {
        key: "submit",
        priority: 2,
        dependencies: ["renderer.xr.mainEncode"],
      },
    ]
  );
  assert.deepEqual(
    xr.jobs.find((job) => job.key === "mainEncode").performance.levels.map(
      (level) => level.id
    ),
    ["low", "medium", "high"]
  );
});

test("renderer worker helpers reject unknown profile names", () => {
  assert.throws(
    () => getRendererWorkerProfile("cinematic"),
    /Unknown renderer worker profile "cinematic"/
  );
  assert.throws(
    () => getRendererWorkerManifest("cinematic"),
    /Unknown renderer worker profile "cinematic"/
  );
});

test("createRendererDebugHooks validates options", () => {
  assert.throws(
    () => createRendererDebugHooks({ debugSession: {} }),
    /debugSession must expose recordFrame/
  );
  assert.throws(
    () =>
      createRendererDebugHooks({
        debugSession: { recordFrame() { return true; } },
        targetFrameRate: 60,
        targetFrameTimeMs: 16.6,
      }),
    /Provide either targetFrameTimeMs or targetFrameRate/
  );
});

test("bindRendererToXrManager toggles xr active state", () => {
  const received = [];
  const renderer = {
    setXrActive(active) {
      received.push(Boolean(active));
    },
  };

  let state = { activeSession: null };
  const listeners = new Set();
  const xrManager = {
    getState() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  const detach = bindRendererToXrManager(renderer, xrManager);

  state = { activeSession: { id: "session" } };
  for (const listener of listeners) listener(state);

  state = { activeSession: null };
  for (const listener of listeners) listener(state);

  detach();

  assert.deepEqual(received, [true, false]);
});

test("default clear color has four channels", () => {
  assert.deepEqual(defaultRendererClearColor, [0.07, 0.11, 0.18, 1]);
});

test("createGpuRenderer resolves canvas from selector and document", async () => {
  const device = new FakeDevice();
  const gpu = new FakeGpu(new FakeAdapter(device));
  const canvas = createFakeCanvas();
  const selector = "#gpu-canvas";

  const renderer = await createGpuRenderer({
    canvas: selector,
    document: createFakeDocument({ [selector]: canvas }),
    navigator: { gpu },
  });

  assert.equal(renderer.canvas, canvas);
  renderer.destroy();
});

test("createGpuRenderer throws when selector cannot resolve a canvas", async () => {
  const device = new FakeDevice();
  const gpu = new FakeGpu(new FakeAdapter(device));

  await assert.rejects(
    () =>
      createGpuRenderer({
        canvas: "#missing",
        document: createFakeDocument(),
        navigator: { gpu },
      }),
    /Unable to find canvas/
  );
});

test("createGpuRenderer throws when adapter is unavailable", async () => {
  const gpu = new FakeGpu(null);
  const canvas = createFakeCanvas();

  await assert.rejects(
    () => createGpuRenderer({ canvas, navigator: { gpu } }),
    /Unable to obtain GPU adapter/
  );
});

test("createGpuRenderer throws when context is missing configure()", async () => {
  const device = new FakeDevice();
  const gpu = new FakeGpu(new FakeAdapter(device));
  const canvas = {
    getContext(type) {
      if (type === "webgpu") {
        return {};
      }
      return null;
    },
  };

  await assert.rejects(
    () => createGpuRenderer({ canvas, navigator: { gpu } }),
    /does not support configure/
  );
});

test("createGpuRenderer throws when canvas has no WebGPU context", async () => {
  const device = new FakeDevice();
  const gpu = new FakeGpu(new FakeAdapter(device));
  const canvas = {
    getContext() {
      return null;
    },
  };

  await assert.rejects(
    () => createGpuRenderer({ canvas, navigator: { gpu } }),
    /Unable to obtain WebGPU canvas context/
  );
});

test("createGpuRenderer invokes encode callbacks and supports immediate start fallback", async () => {
  const device = new FakeDevice();
  const gpu = new FakeGpu(new FakeAdapter(device));
  const canvas = createFakeCanvas();
  const events = [];

  const renderer = await createGpuRenderer({
    canvas,
    navigator: { gpu },
    requestAnimationFrame: undefined,
    onBeforeEncode(payload) {
      events.push(`before:${payload.frame}`);
    },
    onAfterSubmit(payload) {
      events.push(`after:${payload.frame}`);
    },
  });

  assert.equal(renderer.start(), true);
  assert.equal(renderer.start(), false);
  assert.equal(renderer.stop(), true);
  assert.equal(renderer.stop(), false);
  assert.deepEqual(events, ["before:0", "after:1"]);

  renderer.destroy();
});

test("setClearColor normalizes array and hex values", async () => {
  const device = new FakeDevice();
  const gpu = new FakeGpu(new FakeAdapter(device));
  const canvas = createFakeCanvas();
  const renderer = await createGpuRenderer({ canvas, navigator: { gpu } });

  assert.deepEqual(renderer.setClearColor([2, -1, 0.5, 10]), [1, 0, 0.5, 1]);
  assert.deepEqual(renderer.setClearColor("#0f8"), [0, 1, 136 / 255, 1]);
  assert.deepEqual(renderer.setClearColor("#123456"), [18 / 255, 52 / 255, 86 / 255, 1]);
  assert.deepEqual(renderer.setClearColor("not-a-color"), [0.07, 0.11, 0.18, 1]);

  renderer.destroy();
});

test("renderOnce throws on invalid texture and after destroy", async () => {
  const device = new FakeDevice();
  const gpu = new FakeGpu(new FakeAdapter(device));
  const canvas = createFakeCanvas();

  const renderer = await createGpuRenderer({ canvas, navigator: { gpu } });
  renderer.destroy();
  assert.throws(() => renderer.renderOnce(), /Renderer was destroyed/);

  const badCanvas = {
    width: 0,
    height: 0,
    style: {},
    getContext() {
      return {
        configure() {},
        getCurrentTexture() {
          return {};
        },
        unconfigure() {},
      };
    },
  };

  const badRenderer = await createGpuRenderer({
    canvas: badCanvas,
    navigator: { gpu },
  });
  assert.throws(() => badRenderer.renderOnce(), /invalid current texture/);
  badRenderer.destroy();
});

test("bindRendererToXrManager supports store snapshots and lifecycle callbacks", () => {
  const started = [];
  const ended = [];
  const xrStates = [];
  let state = { activeSession: { id: "initial" } };
  const listeners = new Set();

  const renderer = {
    setXrActive(active) {
      xrStates.push(active);
    },
  };

  const xrManager = {
    store: {
      getSnapshot() {
        return state;
      },
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  const detach = bindRendererToXrManager(renderer, xrManager, {
    onSessionStart(session) {
      started.push(session.id);
    },
    onSessionEnd() {
      ended.push("end");
    },
  });

  state = { activeSession: null };
  for (const listener of listeners) listener(state);
  detach();

  assert.deepEqual(xrStates, [true, false]);
  assert.deepEqual(started, ["initial"]);
  assert.deepEqual(ended, ["end"]);
});

test("bindRendererToXrManager rejects invalid manager input", () => {
  assert.throws(
    () => bindRendererToXrManager({}, null),
    /must expose subscribe/
  );
});

test("renderer.bindXrManager detaches previous binding and destroy detaches active binding", async () => {
  const device = new FakeDevice();
  const gpu = new FakeGpu(new FakeAdapter(device));
  const canvas = createFakeCanvas();
  const renderer = await createGpuRenderer({ canvas, navigator: { gpu } });

  let detachedA = 0;
  let detachedB = 0;
  const xrManagerA = {
    subscribe() {
      return () => {
        detachedA += 1;
      };
    },
    getState() {
      return { activeSession: null };
    },
  };
  const xrManagerB = {
    subscribe() {
      return () => {
        detachedB += 1;
      };
    },
    getState() {
      return { activeSession: null };
    },
  };

  renderer.bindXrManager(xrManagerA);
  renderer.bindXrManager(xrManagerB);
  renderer.destroy();

  assert.equal(detachedA, 1);
  assert.equal(detachedB, 1);
});
