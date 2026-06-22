export const DEFAULT_CLEAR_COLOR = Object.freeze([0.07, 0.11, 0.18, 1.0]);
export const DEFAULT_CANVAS_SELECTOR = "canvas[data-plasius-gpu-renderer]";
export const rendererDebugOwner = "renderer";
export const rendererWorkerQueueClass = "render";
export const defaultRendererWorkerProfile = "realtime";
export const rendererRepresentationBands = Object.freeze([
  "near",
  "mid",
  "far",
  "horizon",
]);
export const rendererAccelerationStructureUpdateClasses = Object.freeze([
  "static",
  "rigid-dynamic",
  "deforming",
  "proxy",
]);
export const rendererRayTracingStageOrder = Object.freeze([
  "primaryVisibility",
  "shadowAssist",
  "opaqueFoundation",
  "rtDirectLighting",
  "rtReflections",
  "rtGlobalIllumination",
  "denoiseTemporal",
  "transparents",
  "composition",
  "present",
]);
export const rendererWavefrontBufferSchemaVersion = 1;
export const rendererWavefrontQueuePairStrategy = "ping-pong-active-next";
export const rendererWavefrontHitTypes = Object.freeze([
  "surface",
  "emissive",
  "environment",
  "transparent",
  "miss",
]);
export const rendererWavefrontPassOrder = Object.freeze([
  "generatePrimaryRays",
  "intersectActiveQueue",
  "resolveSurfaceRecords",
  "accumulateTerminalRadiance",
  "scatterContinuations",
  "compactAndSwapQueues",
]);
