import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bindRendererToXrManager,
  createGpuRenderer,
  defaultRendererClearColor,
  supportsWebGpu,
} from "../src/index.js";

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
  }

  beginRenderPass() {
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
