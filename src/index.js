const DEFAULT_CLEAR_COLOR = Object.freeze([0.07, 0.11, 0.18, 1.0]);
const DEFAULT_CANVAS_SELECTOR = "canvas[data-plasius-gpu-renderer]";
export const rendererDebugOwner = "renderer";
export const rendererWorkerQueueClass = "render";
export const defaultRendererWorkerProfile = "realtime";

function buildRendererWorkerBudgetLevels(jobType, queueClass, levels) {
  return Object.freeze(
    levels.map((level) =>
      Object.freeze({
        id: level.id,
        estimatedCostMs: level.estimatedCostMs,
        config: Object.freeze({
          maxDispatchesPerFrame: level.config.maxDispatchesPerFrame,
          maxJobsPerDispatch: level.config.maxJobsPerDispatch,
          cadenceDivisor: level.config.cadenceDivisor,
          workgroupScale: level.config.workgroupScale,
          maxQueueDepth: level.config.maxQueueDepth,
          metadata: Object.freeze({
            owner: rendererDebugOwner,
            queueClass,
            jobType,
            quality: level.id,
          }),
        }),
      })
    )
  );
}

const rendererWorkerProfileSpecs = {
  realtime: {
    description:
      "Frame-stage DAG for flat rendering with visibility, main encode, post-processing, and submit.",
    suggestedAllocationIds: [
      "renderer.surface.current",
      "renderer.visibility.worklist",
      "renderer.post-process.history",
    ],
    jobs: {
      acquire: {
        priority: 5,
        dependencies: [],
        domain: "resolution",
        importance: "critical",
        levels: [
          {
            id: "fixed",
            estimatedCostMs: 0.2,
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 1,
              cadenceDivisor: 1,
              workgroupScale: 1,
              maxQueueDepth: 1,
            },
          },
        ],
        suggestedAllocationIds: ["renderer.surface.current"],
      },
      visibility: {
        priority: 4,
        dependencies: [],
        domain: "geometry",
        importance: "high",
        levels: [
          {
            id: "low",
            estimatedCostMs: 0.4,
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 128,
              cadenceDivisor: 2,
              workgroupScale: 0.5,
              maxQueueDepth: 256,
            },
          },
          {
            id: "medium",
            estimatedCostMs: 0.8,
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 256,
              cadenceDivisor: 1,
              workgroupScale: 0.75,
              maxQueueDepth: 384,
            },
          },
          {
            id: "high",
            estimatedCostMs: 1.2,
            config: {
              maxDispatchesPerFrame: 2,
              maxJobsPerDispatch: 512,
              cadenceDivisor: 1,
              workgroupScale: 1,
              maxQueueDepth: 512,
            },
          },
        ],
        suggestedAllocationIds: ["renderer.visibility.worklist"],
      },
      mainEncode: {
        priority: 4,
        dependencies: ["acquire", "visibility"],
        domain: "geometry",
        importance: "critical",
        levels: [
          {
            id: "low",
            estimatedCostMs: 1.2,
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 128,
              cadenceDivisor: 1,
              workgroupScale: 0.6,
              maxQueueDepth: 192,
            },
          },
          {
            id: "medium",
            estimatedCostMs: 2.1,
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 256,
              cadenceDivisor: 1,
              workgroupScale: 0.8,
              maxQueueDepth: 256,
            },
          },
          {
            id: "high",
            estimatedCostMs: 3,
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 384,
              cadenceDivisor: 1,
              workgroupScale: 1,
              maxQueueDepth: 384,
            },
          },
        ],
        suggestedAllocationIds: ["renderer.surface.current"],
      },
      postProcess: {
        priority: 3,
        dependencies: ["mainEncode"],
        domain: "post-processing",
        importance: "high",
        levels: [
          {
            id: "low",
            estimatedCostMs: 0.5,
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 64,
              cadenceDivisor: 2,
              workgroupScale: 0.5,
              maxQueueDepth: 96,
            },
          },
          {
            id: "medium",
            estimatedCostMs: 0.9,
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 128,
              cadenceDivisor: 1,
              workgroupScale: 0.75,
              maxQueueDepth: 128,
            },
          },
          {
            id: "high",
            estimatedCostMs: 1.4,
            config: {
              maxDispatchesPerFrame: 2,
              maxJobsPerDispatch: 192,
              cadenceDivisor: 1,
              workgroupScale: 1,
              maxQueueDepth: 192,
            },
          },
        ],
        suggestedAllocationIds: ["renderer.post-process.history"],
      },
      submit: {
        priority: 2,
        dependencies: ["postProcess"],
        domain: "resolution",
        importance: "critical",
        levels: [
          {
            id: "fixed",
            estimatedCostMs: 0.2,
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 1,
              cadenceDivisor: 1,
              workgroupScale: 1,
              maxQueueDepth: 1,
            },
          },
        ],
        suggestedAllocationIds: ["renderer.surface.current"],
      },
    },
  },
  xr: {
    description:
      "Frame-stage DAG for XR rendering with late-latch coordination before main encode and submit.",
    suggestedAllocationIds: [
      "renderer.xr.surface.current",
      "renderer.xr.visibility.worklist",
    ],
    jobs: {
      acquire: {
        priority: 5,
        dependencies: [],
        domain: "xr",
        importance: "critical",
        levels: [
          {
            id: "fixed",
            estimatedCostMs: 0.2,
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 1,
              cadenceDivisor: 1,
              workgroupScale: 1,
              maxQueueDepth: 1,
            },
          },
        ],
        suggestedAllocationIds: ["renderer.xr.surface.current"],
      },
      visibility: {
        priority: 4,
        dependencies: [],
        domain: "geometry",
        importance: "high",
        levels: [
          {
            id: "low",
            estimatedCostMs: 0.5,
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 96,
              cadenceDivisor: 2,
              workgroupScale: 0.5,
              maxQueueDepth: 192,
            },
          },
          {
            id: "medium",
            estimatedCostMs: 0.9,
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 192,
              cadenceDivisor: 1,
              workgroupScale: 0.75,
              maxQueueDepth: 256,
            },
          },
          {
            id: "high",
            estimatedCostMs: 1.3,
            config: {
              maxDispatchesPerFrame: 2,
              maxJobsPerDispatch: 320,
              cadenceDivisor: 1,
              workgroupScale: 1,
              maxQueueDepth: 320,
            },
          },
        ],
        suggestedAllocationIds: ["renderer.xr.visibility.worklist"],
      },
      lateLatch: {
        priority: 5,
        dependencies: ["acquire"],
        domain: "xr",
        importance: "critical",
        levels: [
          {
            id: "fixed",
            estimatedCostMs: 0.15,
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 1,
              cadenceDivisor: 1,
              workgroupScale: 1,
              maxQueueDepth: 1,
            },
          },
        ],
        suggestedAllocationIds: ["renderer.xr.surface.current"],
      },
      mainEncode: {
        priority: 4,
        dependencies: ["visibility", "lateLatch"],
        domain: "xr",
        importance: "critical",
        levels: [
          {
            id: "low",
            estimatedCostMs: 1.1,
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 96,
              cadenceDivisor: 1,
              workgroupScale: 0.6,
              maxQueueDepth: 128,
            },
          },
          {
            id: "medium",
            estimatedCostMs: 1.8,
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 192,
              cadenceDivisor: 1,
              workgroupScale: 0.8,
              maxQueueDepth: 192,
            },
          },
          {
            id: "high",
            estimatedCostMs: 2.6,
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 256,
              cadenceDivisor: 1,
              workgroupScale: 1,
              maxQueueDepth: 256,
            },
          },
        ],
        suggestedAllocationIds: ["renderer.xr.surface.current"],
      },
      submit: {
        priority: 2,
        dependencies: ["mainEncode"],
        domain: "xr",
        importance: "critical",
        levels: [
          {
            id: "fixed",
            estimatedCostMs: 0.2,
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 1,
              cadenceDivisor: 1,
              workgroupScale: 1,
              maxQueueDepth: 1,
            },
          },
        ],
        suggestedAllocationIds: ["renderer.xr.surface.current"],
      },
    },
  },
};

function buildRendererWorkerProfile(name, spec) {
  return Object.freeze({
    name,
    description: spec.description,
    jobs: Object.freeze(Object.keys(spec.jobs)),
  });
}

function buildRendererWorkerManifestJob(profileName, jobName, spec) {
  const label = `renderer.${profileName}.${jobName}`;
  return Object.freeze({
    key: jobName,
    label,
    worker: Object.freeze({
      jobType: label,
      queueClass: rendererWorkerQueueClass,
      priority: spec.priority,
      dependencies: Object.freeze(
        spec.dependencies.map((dependency) => `renderer.${profileName}.${dependency}`)
      ),
      schedulerMode: "dag",
    }),
    performance: Object.freeze({
      id: label,
      jobType: label,
      queueClass: rendererWorkerQueueClass,
      domain: spec.domain,
      authority: "visual",
      importance: spec.importance,
      levels: buildRendererWorkerBudgetLevels(
        label,
        rendererWorkerQueueClass,
        spec.levels
      ),
    }),
    debug: Object.freeze({
      owner: rendererDebugOwner,
      queueClass: rendererWorkerQueueClass,
      jobType: label,
      tags: Object.freeze(["renderer", profileName, jobName, spec.domain]),
      suggestedAllocationIds: Object.freeze([...spec.suggestedAllocationIds]),
    }),
  });
}

function buildRendererWorkerManifest(name, spec) {
  return Object.freeze({
    schemaVersion: 1,
    owner: rendererDebugOwner,
    profile: name,
    description: spec.description,
    queueClass: rendererWorkerQueueClass,
    schedulerMode: "dag",
    suggestedAllocationIds: Object.freeze([...spec.suggestedAllocationIds]),
    jobs: Object.freeze(
      Object.entries(spec.jobs).map(([jobName, jobSpec]) =>
        buildRendererWorkerManifestJob(name, jobName, jobSpec)
      )
    ),
  });
}

export const rendererWorkerProfiles = Object.freeze(
  Object.fromEntries(
    Object.entries(rendererWorkerProfileSpecs).map(([name, spec]) => [
      name,
      buildRendererWorkerProfile(name, spec),
    ])
  )
);

export const rendererWorkerProfileNames = Object.freeze(
  Object.keys(rendererWorkerProfiles)
);

export const rendererWorkerManifests = Object.freeze(
  Object.fromEntries(
    Object.entries(rendererWorkerProfileSpecs).map(([name, spec]) => [
      name,
      buildRendererWorkerManifest(name, spec),
    ])
  )
);

export function getRendererWorkerProfile(name = defaultRendererWorkerProfile) {
  const profile = rendererWorkerProfiles[name];
  if (!profile) {
    const available = rendererWorkerProfileNames.join(", ");
    throw new Error(`Unknown renderer worker profile "${name}". Available: ${available}.`);
  }
  return profile;
}

export function getRendererWorkerManifest(name = defaultRendererWorkerProfile) {
  const manifest = rendererWorkerManifests[name];
  if (!manifest) {
    const available = rendererWorkerProfileNames.join(", ");
    throw new Error(`Unknown renderer worker profile "${name}". Available: ${available}.`);
  }
  return manifest;
}

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

function readPositiveNumber(name, value) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite number greater than zero.`);
  }
  return value;
}

function now() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function normalizeFrameId(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("frameIdFactory must return a non-empty string.");
  }
  return value.trim();
}

function resolveTargetFrameTimeMs(options, event) {
  const {
    targetFrameTimeMs: fixedTargetFrameTimeMs,
    targetFrameRate,
    getTargetFrameTimeMs,
  } = options;

  if (typeof getTargetFrameTimeMs === "function") {
    const resolved = getTargetFrameTimeMs(event);
    return readPositiveNumber("getTargetFrameTimeMs()", resolved);
  }

  if (fixedTargetFrameTimeMs !== undefined) {
    return fixedTargetFrameTimeMs;
  }

  if (targetFrameRate !== undefined) {
    return 1000 / targetFrameRate;
  }

  return undefined;
}

export function createRendererDebugHooks(options = {}) {
  const {
    debugSession,
    targetFrameTimeMs,
    targetFrameRate,
    getTargetFrameTimeMs,
    onFrameStart,
    onFrameComplete,
  } = options;

  if (!debugSession || typeof debugSession.recordFrame !== "function") {
    throw new Error(
      "debugSession must expose recordFrame(sample). Use @plasius/gpu-debug createGpuDebugSession()."
    );
  }

  const fixedTargetFrameTimeMs = readPositiveNumber(
    "targetFrameTimeMs",
    targetFrameTimeMs
  );
  const fixedTargetFrameRate = readPositiveNumber(
    "targetFrameRate",
    targetFrameRate
  );

  if (
    fixedTargetFrameTimeMs !== undefined &&
    fixedTargetFrameRate !== undefined
  ) {
    throw new Error(
      "Provide either targetFrameTimeMs or targetFrameRate, not both."
    );
  }

  if (
    getTargetFrameTimeMs !== undefined &&
    typeof getTargetFrameTimeMs !== "function"
  ) {
    throw new Error("getTargetFrameTimeMs must be a function when provided.");
  }

  const resolvedOptions = {
    targetFrameTimeMs: fixedTargetFrameTimeMs,
    targetFrameRate: fixedTargetFrameRate,
    getTargetFrameTimeMs,
  };

  return {
    onFrameStart(event) {
      if (typeof onFrameStart === "function") {
        onFrameStart({
          ...event,
          owner: rendererDebugOwner,
        });
      }
    },
    onFrameComplete(event) {
      const resolvedTargetFrameTimeMs = resolveTargetFrameTimeMs(
        resolvedOptions,
        event
      );

      if (
        typeof event.frameTimeMs === "number" &&
        Number.isFinite(event.frameTimeMs) &&
        event.frameTimeMs > 0
      ) {
        debugSession.recordFrame({
          frameId: event.frameId,
          frameTimeMs: event.frameTimeMs,
          targetFrameTimeMs: resolvedTargetFrameTimeMs,
        });
      }

      if (typeof onFrameComplete === "function") {
        onFrameComplete({
          ...event,
          owner: rendererDebugOwner,
          targetFrameTimeMs: resolvedTargetFrameTimeMs,
        });
      }
    },
  };
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
    throw new Error(`Unable to find canvas for selector "${selector}".`);
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
    frameIdFactory,
    onFrameStart,
    onBeforeEncode,
    onAfterSubmit,
    onFrameComplete,
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

    const frameNumber = frame + 1;
    const frameId = normalizeFrameId(
      typeof frameIdFactory === "function"
        ? frameIdFactory({
            frame: frameNumber,
            timestamp,
            canvas: targetCanvas,
            xrActive,
          })
        : `renderer.frame.${frameNumber}`
    );
    const frameTimeMs =
      lastTimestamp > 0 ? Math.max(0, timestamp - lastTimestamp) : undefined;

    if (typeof onFrameStart === "function") {
      onFrameStart({
        frame: frameNumber,
        frameId,
        frameTimeMs,
        timestamp,
        device,
        context,
        canvas: targetCanvas,
        xrActive,
      });
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
        frameNumber,
        frameId,
        frameTimeMs,
        timestamp,
        device,
        context,
        encoder,
        pass,
        canvas: targetCanvas,
        xrActive,
      });
    }

    if (typeof pass.end === "function") {
      pass.end();
    }

    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);

    frame = frameNumber;
    lastTimestamp = timestamp;

    if (typeof onAfterSubmit === "function") {
      onAfterSubmit({
        frame: frameNumber,
        frameNumber,
        frameId,
        frameTimeMs,
        timestamp,
        device,
        context,
        canvas: targetCanvas,
        xrActive,
      });
    }

    if (typeof onFrameComplete === "function") {
      onFrameComplete({
        frame: frameNumber,
        frameId,
        frameTimeMs,
        timestamp,
        device,
        context,
        canvas: targetCanvas,
        xrActive,
      });
    }

    return {
      frame: frameNumber,
      frameId,
      frameTimeMs,
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
