const DEFAULT_CLEAR_COLOR = Object.freeze([0.07, 0.11, 0.18, 1.0]);
const DEFAULT_CANVAS_SELECTOR = "canvas[data-plasius-gpu-renderer]";

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function parseHexChannel(channel) {
  return parseInt(channel, 16) / 255;
}

function normalizeColor(value) {
  if (Array.isArray(value)) {
    const [r = 0, g = 0, b = 0, a = 1] = value;
    return [clamp01(Number(r) || 0), clamp01(Number(g) || 0), clamp01(Number(b) || 0), clamp01(Number(a) || 0)];
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
      const r = trimmed[1];
      const g = trimmed[2];
      const b = trimmed[3];
      return [
        parseHexChannel(r + r),
        parseHexChannel(g + g),
        parseHexChannel(b + b),
        1,
      ];
    }
    if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
      return [
        parseHexChannel(trimmed.slice(1, 3)),
        parseHexChannel(trimmed.slice(3, 5)),
        parseHexChannel(trimmed.slice(5, 7)),
        1,
      ];
    }
  }

  return [...DEFAULT_CLEAR_COLOR];
}

function now() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function readNavigator(navigatorOverride) {
  const currentNavigator = navigatorOverride ?? globalThis.navigator;
  if (!currentNavigator || typeof currentNavigator !== "object") {
    throw new Error("Navigator unavailable. Provide a browser-like navigator object.");
  }
  return currentNavigator;
}

function readDocument(documentOverride) {
  const doc = documentOverride ?? globalThis.document;
  if (!doc || typeof doc !== "object") {
    throw new Error("Document unavailable. Provide a browser-like document object.");
  }
  return doc;
}

function resolveCanvas(canvasOrSelector, documentOverride) {
  if (canvasOrSelector && typeof canvasOrSelector === "object") {
    return canvasOrSelector;
  }

  const doc = readDocument(documentOverride);
  const selector =
    typeof canvasOrSelector === "string" && canvasOrSelector.trim().length > 0
      ? canvasOrSelector
      : DEFAULT_CANVAS_SELECTOR;
  const resolved = doc.querySelector(selector);
  if (!resolved) {
    throw new Error(`Unable to find canvas for selector \"${selector}\".`);
  }
  return resolved;
}

function readGpu(navigatorOverride) {
  const currentNavigator = readNavigator(navigatorOverride);
  const gpu = currentNavigator.gpu;
  if (!gpu || typeof gpu.requestAdapter !== "function") {
    throw new Error("WebGPU runtime unavailable. navigator.gpu is missing.");
  }
  return gpu;
}

function configureContext(context, device, format, alphaMode) {
  if (typeof context.configure !== "function") {
    throw new Error("Canvas WebGPU context does not support configure().");
  }
  context.configure({
    device,
    format,
    alphaMode,
  });
}

function createRenderPassDescriptor(view, clearColor) {
  return {
    colorAttachments: [
      {
        view,
        loadOp: "clear",
        clearValue: {
          r: clearColor[0],
          g: clearColor[1],
          b: clearColor[2],
          a: clearColor[3],
        },
        storeOp: "store",
      },
    ],
  };
}

export function supportsWebGpu(options = {}) {
  try {
    const gpu = readGpu(options.navigator);
    return Boolean(gpu);
  } catch {
    return false;
  }
}

export async function createGpuRenderer(options = {}) {
  const {
    canvas,
    navigator: navigatorOverride,
    document: documentOverride,
    powerPreference = "high-performance",
    alpha = true,
    format,
    clearColor = DEFAULT_CLEAR_COLOR,
    requestAnimationFrame = globalThis.requestAnimationFrame?.bind(globalThis),
    cancelAnimationFrame = globalThis.cancelAnimationFrame?.bind(globalThis),
    onBeforeEncode,
    onAfterSubmit,
  } = options;

  const gpu = readGpu(navigatorOverride);
  const adapter = await gpu.requestAdapter({ powerPreference });
  if (!adapter) {
    throw new Error("Unable to obtain GPU adapter.");
  }

  const device = await adapter.requestDevice();
  const targetCanvas = resolveCanvas(canvas, documentOverride);
  const context = targetCanvas.getContext?.("webgpu");
  if (!context) {
    throw new Error("Unable to obtain WebGPU canvas context.");
  }

  const resolvedFormat =
    format ||
    (typeof gpu.getPreferredCanvasFormat === "function"
      ? gpu.getPreferredCanvasFormat()
      : "bgra8unorm");

  configureContext(context, device, resolvedFormat, alpha ? "premultiplied" : "opaque");

  let running = false;
  let destroyed = false;
  let frame = 0;
  let lastTimestamp = 0;
  let rafId = null;
  let clear = normalizeColor(clearColor);
  let xrActive = false;
  let detachXrBinding = null;

  const renderOnce = (timestamp = now()) => {
    if (destroyed) {
      throw new Error("Renderer was destroyed.");
    }

    const texture = context.getCurrentTexture?.();
    if (!texture || typeof texture.createView !== "function") {
      throw new Error("WebGPU context returned an invalid current texture.");
    }

    const encoder = device.createCommandEncoder({
      label: `plasius.gpu-renderer.frame.${frame}`,
    });
    const view = texture.createView();

    const pass = encoder.beginRenderPass(createRenderPassDescriptor(view, clear));

    if (typeof onBeforeEncode === "function") {
      onBeforeEncode({
        frame,
        timestamp,
        device,
        context,
        encoder,
        pass,
        canvas: targetCanvas,
      });
    }

    if (typeof pass.end === "function") {
      pass.end();
    }

    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);

    frame += 1;
    lastTimestamp = timestamp;

    if (typeof onAfterSubmit === "function") {
      onAfterSubmit({
        frame,
        timestamp,
        device,
        context,
        canvas: targetCanvas,
      });
    }

    return {
      frame,
      timestamp,
    };
  };

  const tick = (timestamp) => {
    if (!running || destroyed) {
      return;
    }
    renderOnce(timestamp);
    if (typeof requestAnimationFrame === "function") {
      rafId = requestAnimationFrame(tick);
    }
  };

  const start = () => {
    if (destroyed) {
      throw new Error("Renderer was destroyed.");
    }
    if (running) {
      return false;
    }
    running = true;
    if (typeof requestAnimationFrame === "function") {
      rafId = requestAnimationFrame(tick);
    } else {
      renderOnce();
    }
    return true;
  };

  const stop = () => {
    if (!running) {
      return false;
    }
    running = false;
    if (rafId !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(rafId);
    }
    rafId = null;
    return true;
  };

  const resize = (cssWidth, cssHeight, devicePixelRatio = globalThis.devicePixelRatio ?? 1) => {
    const width = Math.max(1, Math.floor(cssWidth * devicePixelRatio));
    const height = Math.max(1, Math.floor(cssHeight * devicePixelRatio));
    targetCanvas.width = width;
    targetCanvas.height = height;
    if (targetCanvas.style) {
      targetCanvas.style.width = `${Math.max(1, Math.floor(cssWidth))}px`;
      targetCanvas.style.height = `${Math.max(1, Math.floor(cssHeight))}px`;
    }
    return { width, height };
  };

  const setClearColor = (value) => {
    clear = normalizeColor(value);
    return [...clear];
  };

  const setXrActive = (active) => {
    xrActive = Boolean(active);
  };

  const getSnapshot = () => {
    const width = Number(targetCanvas.width) || 0;
    const height = Number(targetCanvas.height) || 0;
    return {
      running,
      frame,
      lastTimestamp,
      format: resolvedFormat,
      width,
      height,
      xrActive,
    };
  };

  const renderer = {
    canvas: targetCanvas,
    context,
    device,
    format: resolvedFormat,
    renderOnce,
    start,
    stop,
    resize,
    setClearColor,
    setXrActive,
    getSnapshot,
    bindXrManager(xrManager, bindOptions = {}) {
      if (detachXrBinding) {
        detachXrBinding();
      }
      detachXrBinding = bindRendererToXrManager(renderer, xrManager, bindOptions);
      return detachXrBinding;
    },
    destroy() {
      stop();
      destroyed = true;
      if (detachXrBinding) {
        detachXrBinding();
        detachXrBinding = null;
      }
      if (typeof context.unconfigure === "function") {
        context.unconfigure();
      }
    },
  };

  return renderer;
}

function snapshotFromXrManager(xrManager) {
  if (xrManager && typeof xrManager.getState === "function") {
    return xrManager.getState();
  }
  if (xrManager?.store && typeof xrManager.store.getSnapshot === "function") {
    return xrManager.store.getSnapshot();
  }
  return null;
}

export function bindRendererToXrManager(renderer, xrManager, options = {}) {
  if (!xrManager || typeof xrManager.subscribe !== "function") {
    throw new Error("XR manager must expose subscribe(listener). Use @plasius/gpu-xr createXrManager().");
  }

  const { onSessionStart, onSessionEnd } = options;
  let previousSession = null;

  const applyState = (state) => {
    const session = state?.activeSession ?? null;
    if (session === previousSession) {
      return;
    }

    previousSession = session;

    if (typeof renderer.setXrActive === "function") {
      renderer.setXrActive(Boolean(session));
    }

    if (session && typeof onSessionStart === "function") {
      onSessionStart(session, renderer);
    }

    if (!session && typeof onSessionEnd === "function") {
      onSessionEnd(renderer);
    }
  };

  applyState(snapshotFromXrManager(xrManager));
  return xrManager.subscribe(applyState);
}

export const defaultRendererClearColor = DEFAULT_CLEAR_COLOR;
