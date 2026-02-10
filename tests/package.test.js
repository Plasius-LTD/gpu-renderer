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
