import {
  createGpuRenderer,
  createRayTracingRenderPlan,
  createRendererDebugHooks,
  defaultRendererWorkerProfile,
  getRendererWorkerManifest,
  getRendererWorkerProfile,
  supportsWebGpu,
} from "../dist/index.js";
import { mountGpuShowcase } from "../node_modules/@plasius/gpu-shared/dist/index.js";

const root = globalThis.document?.getElementById("app");
if (!root) {
  throw new Error("Renderer demo root element was not found.");
}

function createFrameRecorder() {
  const samples = [];
  let totalFrameTimeMs = 0;
  let droppedCount = 0;

  return {
    recordFrame(sample) {
      const frameTimeMs = Number(sample?.frameTimeMs);
      if (!Number.isFinite(frameTimeMs) || frameTimeMs <= 0) {
        return false;
      }

      const targetFrameTimeMs =
        typeof sample?.targetFrameTimeMs === "number" && Number.isFinite(sample.targetFrameTimeMs)
          ? sample.targetFrameTimeMs
          : null;
      const dropped = targetFrameTimeMs != null ? frameTimeMs > targetFrameTimeMs * 1.08 : false;
      const entry = {
        frameId: typeof sample?.frameId === "string" ? sample.frameId : null,
        frameTimeMs,
        targetFrameTimeMs,
        dropped,
      };

      samples.push(entry);
      totalFrameTimeMs += frameTimeMs;
      if (dropped) {
        droppedCount += 1;
      }
      if (samples.length > 120) {
        const removed = samples.shift();
        totalFrameTimeMs -= removed.frameTimeMs;
        if (removed.dropped) {
          droppedCount -= 1;
        }
      }

      return dropped;
    },
    getSnapshot() {
      const lastSample = samples[samples.length - 1] ?? null;
      const peakFrameTimeMs = samples.reduce(
        (peak, sample) => Math.max(peak, sample.frameTimeMs),
        0
      );
      return {
        sampleCount: samples.length,
        averageFrameTimeMs: samples.length > 0 ? totalFrameTimeMs / samples.length : 0,
        peakFrameTimeMs,
        droppedCount,
        lastFrameId: lastSample?.frameId ?? null,
        lastFrameTimeMs: lastSample?.frameTimeMs ?? null,
        targetFrameTimeMs: lastSample?.targetFrameTimeMs ?? null,
      };
    },
  };
}

function createState() {
  return {
    profile: defaultRendererWorkerProfile,
    secureContext: window.isSecureContext,
    webGpuAvailable: supportsWebGpu(),
    initStarted: false,
    initStatus: "Staging offscreen renderer",
    initError: null,
    hiddenCanvas: document.createElement("canvas"),
    frameRecorder: createFrameRecorder(),
    renderer: null,
    snapshot: null,
    lastRender: null,
    accumulator: 0,
    lastTargetFrameTimeMs: 1000 / 30,
  };
}

async function initializeRendererState(state) {
  const hooks = createRendererDebugHooks({
    debugSession: state.frameRecorder,
    targetFrameTimeMs: 1000 / 30,
    onFrameComplete(event) {
      state.lastTargetFrameTimeMs = event.targetFrameTimeMs ?? state.lastTargetFrameTimeMs;
    },
  });

  const renderer = await createGpuRenderer({
    canvas: state.hiddenCanvas,
    clearColor: "#071523",
    frameIdFactory: ({ frame, xrActive }) =>
      `renderer-demo-${state.profile}-${frame}${xrActive ? "-xr" : ""}`,
    ...hooks,
  });

  renderer.resize(640, 360, 1);
  state.renderer = renderer;
  state.snapshot = renderer.getSnapshot();
  state.lastRender = renderer.renderOnce(performance.now());
  state.snapshot = renderer.getSnapshot();
  state.initStatus = "Offscreen renderer live";
}

function ensureRenderer(state) {
  if (state.initStarted || !state.webGpuAvailable) {
    return;
  }

  state.initStarted = true;
  void initializeRendererState(state).catch((error) => {
    state.initError = error instanceof Error ? error.message : String(error);
    state.initStatus = "Renderer initialization failed";
  });
}

function updateState(state, scene, dt) {
  state.profile = scene.stress ? "xr" : defaultRendererWorkerProfile;
  ensureRenderer(state);

  if (!state.renderer) {
    return state;
  }

  state.accumulator += dt;
  const renderIntervalSeconds = scene.stress ? 0.18 : 0.32;
  if (state.accumulator < renderIntervalSeconds) {
    return state;
  }

  state.accumulator = 0;
  state.renderer.setClearColor(scene.stress ? "#08111c" : "#071523");
  state.lastRender = state.renderer.renderOnce(performance.now());
  state.snapshot = state.renderer.getSnapshot();
  return state;
}

function describeState(state, scene) {
  ensureRenderer(state);

  const profile = getRendererWorkerProfile(state.profile);
  const manifest = getRendererWorkerManifest(state.profile);
  const plan = createRayTracingRenderPlan({
    snapshotId: `renderer-demo-${scene.frame}`,
    profile: state.profile,
  });
  const frameStats = state.frameRecorder.getSnapshot();
  const offscreenSnapshot = state.snapshot;
  const premiumBands = plan.representationBands.filter(
    (band) => "rtParticipation" in band && band.rtParticipation === "premium"
  ).length;
  const selectiveBands = plan.representationBands.filter(
    (band) => "rtParticipation" in band && band.rtParticipation === "selective"
  ).length;

  const status = state.initError
    ? `Renderer init failed · ${state.initError}`
    : !state.webGpuAvailable
      ? "Renderer planning preview · WebGPU unavailable"
      : state.renderer
        ? `Renderer live · ${state.profile} profile · ${offscreenSnapshot?.frame ?? 0} offscreen frames`
        : state.initStatus;

  const details = state.initError
    ? "The shared harbor is still rendering, but the renderer package could not bootstrap its offscreen WebGPU runtime."
    : !state.webGpuAvailable
      ? state.secureContext
        ? "The harbor remains visible, but this browser or GPU stack cannot expose WebGPU for the offscreen renderer."
        : "The harbor remains visible, but the renderer package needs localhost or HTTPS before it can mount its offscreen WebGPU surface."
      : state.renderer
        ? `A real offscreen WebGPU renderer is producing live frames under the shared harbor while the demo exposes the ${state.profile} worker profile, render-stage order, and band policy used to present the moonlit scene.`
        : "Preparing an offscreen WebGPU renderer so the shared harbor can surface real renderer snapshots instead of placeholder metrics.";

  return {
    status,
    details,
    sceneMetrics: [
      `profile: ${state.profile}`,
      `offscreen surface: ${offscreenSnapshot ? `${offscreenSnapshot.width}x${offscreenSnapshot.height}` : "booting"}`,
      `snapshot id: ${plan.inputBoundary.snapshotId}`,
      `render stages: ${plan.renderStages.length}`,
      `representation bands: ${plan.representationBands.length}`,
    ],
    qualityMetrics: [
      `worker jobs: ${manifest.jobs.length}`,
      `profile jobs: ${profile.jobs.length}`,
      `premium RT bands: ${premiumBands}`,
      `selective RT bands: ${selectiveBands}`,
      `suggested allocations: ${manifest.suggestedAllocationIds.length}`,
    ],
    debugMetrics: [
      `recorded frames: ${frameStats.sampleCount}`,
      `avg frame: ${frameStats.averageFrameTimeMs.toFixed(2)} ms`,
      `peak frame: ${frameStats.peakFrameTimeMs.toFixed(2)} ms`,
      `dropped frames: ${frameStats.droppedCount}`,
      `last frame id: ${frameStats.lastFrameId ?? "pending"}`,
    ],
    notes: [
      "gpu-renderer now uses the same moonlit harbor as the rest of the family instead of a standalone control-panel canvas.",
      "The demo still exercises gpu-renderer public APIs directly: supportsWebGpu, createGpuRenderer, createRendererDebugHooks, getRendererWorkerManifest, getRendererWorkerProfile, and createRayTracingRenderPlan.",
      "Stress mode promotes the planning view to the xr profile so the render-stage and representation policies widen without breaking the painterly harbor presentation.",
    ],
    textState: {
      profile: state.profile,
      renderPlanStageOrder: plan.renderStages.map((stage) => stage.key),
      offscreenSnapshot,
      frameStats,
      workerJobs: manifest.jobs.map((job) => job.key),
    },
    visuals: {
      reflectionStrength: state.renderer ? 0.28 : 0.18,
      shadowAccent: scene.stress ? 0.14 : 0.09,
      lanternReflectionStrength: scene.stress ? 0.62 : 0.5,
      waveAmplitude: scene.stress ? 0.98 : 0.88,
      ambientMist: scene.stress ? "rgba(56, 73, 111, 0.24)" : "rgba(39, 59, 92, 0.18)",
      moonHalo: scene.stress ? "rgba(192, 210, 255, 0.34)" : "rgba(164, 186, 240, 0.24)",
      waterNear: scene.stress ? { r: 0.11, g: 0.27, b: 0.38 } : { r: 0.08, g: 0.23, b: 0.33 },
      waterFar: { r: 0.17, g: 0.35, b: 0.48 },
    },
  };
}

function destroyState(state) {
  if (state?.renderer && typeof state.renderer.destroy === "function") {
    state.renderer.destroy();
  }
}

const showcase = await mountGpuShowcase({
  root,
  focus: "lighting",
  packageName: "@plasius/gpu-renderer",
  title: "Moonlit Renderer Harbor",
  subtitle:
    "Painterly harbor composition backed by live gpu-renderer snapshots, render-plan staging, and offscreen WebGPU frame telemetry.",
  createState,
  updateState,
  describeState,
  destroyState,
});

window.addEventListener("pagehide", () => showcase.destroy(), { once: true });
