export type RendererColor = string | [number, number, number, number?];

export interface RendererFrameEvent {
  frame: number;
  frameId: string;
  frameTimeMs?: number;
  timestamp: number;
  device: GPUDevice;
  context: GPUCanvasContext;
  canvas: HTMLCanvasElement;
  xrActive: boolean;
}

export interface RendererEncodeFrameEvent extends RendererFrameEvent {
  frameNumber: number;
  encoder: GPUCommandEncoder;
  texture: GPUTexture;
  view: GPUTextureView;
  clearColor: [number, number, number, number];
}

export interface RendererSnapshot {
  running: boolean;
  frame: number;
  lastTimestamp: number;
  format: string;
  width: number;
  height: number;
  xrActive: boolean;
}

export interface RendererHooks {
  onFrameStart?: (event: RendererFrameEvent) => void;
  /**
   * Owns frame encoding before the renderer opens a default swapchain pass.
   * Return false to fall back to the default pass and onBeforeEncode hook.
   */
  onEncodeFrame?: (event: RendererEncodeFrameEvent) => false | void;
  onBeforeEncode?: (event: {
    frame: number;
    frameNumber: number;
    frameId: string;
    frameTimeMs?: number;
    timestamp: number;
    device: GPUDevice;
    context: GPUCanvasContext;
    encoder: GPUCommandEncoder;
    pass: GPURenderPassEncoder;
    canvas: HTMLCanvasElement;
    xrActive: boolean;
  }) => void;
  onAfterSubmit?: (event: {
    frame: number;
    frameNumber: number;
    frameId: string;
    frameTimeMs?: number;
    timestamp: number;
    device: GPUDevice;
    context: GPUCanvasContext;
    canvas: HTMLCanvasElement;
    xrActive: boolean;
  }) => void;
  onFrameComplete?: (event: RendererFrameEvent) => void;
}

export interface CreateGpuRendererOptions extends RendererHooks {
  canvas?: HTMLCanvasElement | string;
  navigator?: Navigator | { gpu?: GPU };
  document?: Document;
  powerPreference?: GPUPowerPreference;
  alpha?: boolean;
  format?: GPUTextureFormat;
  clearColor?: RendererColor;
  requestAnimationFrame?: (cb: FrameRequestCallback) => number;
  cancelAnimationFrame?: (id: number) => void;
  frameIdFactory?: (event: {
    frame: number;
    timestamp: number;
    canvas: HTMLCanvasElement;
    xrActive: boolean;
  }) => string;
}

export interface GpuRenderer {
  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;
  device: GPUDevice;
  format: GPUTextureFormat | string;
  renderOnce(timestamp?: number): {
    frame: number;
    frameId: string;
    frameTimeMs?: number;
    timestamp: number;
  };
  start(): boolean;
  stop(): boolean;
  resize(cssWidth: number, cssHeight: number, devicePixelRatio?: number): {
    width: number;
    height: number;
  };
  setClearColor(value: RendererColor): [number, number, number, number];
  setXrActive(active: boolean): void;
  getSnapshot(): RendererSnapshot;
  bindXrManager(
    xrManager: {
      subscribe: (listener: (state: { activeSession: XRSession | null }) => void) => () => void;
      getState?: () => { activeSession: XRSession | null };
      store?: { getSnapshot: () => { activeSession: XRSession | null } };
    },
    bindOptions?: {
      onSessionStart?: (session: XRSession, renderer: GpuRenderer) => void;
      onSessionEnd?: (renderer: GpuRenderer) => void;
    }
  ): () => void;
  destroy(): void;
}

export function supportsWebGpu(options?: { navigator?: Navigator | { gpu?: GPU } }): boolean;

export function createGpuRenderer(options?: CreateGpuRendererOptions): Promise<GpuRenderer>;

export interface RendererDebugHooksOptions {
  debugSession: {
    recordFrame(sample: {
      frameId?: string;
      frameTimeMs: number;
      targetFrameTimeMs?: number;
      dropped?: boolean;
    }): boolean;
  };
  targetFrameTimeMs?: number;
  targetFrameRate?: number;
  getTargetFrameTimeMs?: (event: RendererFrameEvent) => number | undefined;
  onFrameStart?: (event: RendererFrameEvent & { owner: "renderer" }) => void;
  onFrameComplete?: (
    event: RendererFrameEvent & {
      owner: "renderer";
      targetFrameTimeMs?: number;
    }
  ) => void;
}

export function createRendererDebugHooks(
  options: RendererDebugHooksOptions
): Pick<RendererHooks, "onFrameStart" | "onFrameComplete">;

export function bindRendererToXrManager(
  renderer: Pick<GpuRenderer, "setXrActive">,
  xrManager: {
    subscribe: (listener: (state: { activeSession: XRSession | null }) => void) => () => void;
    getState?: () => { activeSession: XRSession | null };
    store?: { getSnapshot: () => { activeSession: XRSession | null } };
  },
  options?: {
    onSessionStart?: (session: XRSession, renderer: Pick<GpuRenderer, "setXrActive">) => void;
    onSessionEnd?: (renderer: Pick<GpuRenderer, "setXrActive">) => void;
  }
): () => void;

export type RendererWorkerProfileName = "realtime" | "xr";
export type RendererRepresentationBand = "near" | "mid" | "far" | "horizon";
export type RendererAccelerationStructureUpdateClass =
  | "static"
  | "rigid-dynamic"
  | "deforming"
  | "proxy";

export interface RendererInputBoundary {
  readonly type: "stable-visual-snapshot";
  readonly owner: typeof rendererDebugOwner;
  readonly profile: RendererWorkerProfileName;
  readonly authority: "visual";
  readonly source: "scene-preparation";
  readonly stable: true;
}

export interface RendererRenderStage {
  readonly key:
    | "primaryVisibility"
    | "shadowAssist"
    | "opaqueFoundation"
    | "rtDirectLighting"
    | "rtReflections"
    | "rtGlobalIllumination"
    | "denoiseTemporal"
    | "transparents"
    | "composition"
    | "present";
  readonly order: number;
  readonly required: true;
  readonly description: string;
  readonly profile: RendererWorkerProfileName;
  readonly workerJobKeys: readonly string[];
}

export interface RendererRepresentationPolicy {
  readonly band: RendererRepresentationBand;
  readonly profile: RendererWorkerProfileName;
  readonly rasterMode:
    | "full-live"
    | "simplified-live"
    | "proxy-or-cached"
    | "horizon-shell";
  readonly rtParticipation: "premium" | "selective" | "proxy" | "disabled";
  readonly shadowSource:
    | "ray-traced-primary"
    | "regional-raster-and-proxy"
    | "merged-proxy-casters"
    | "baked-impression";
  readonly temporalReuse: "balanced" | "aggressive" | "high" | "cached";
  readonly updateCadenceDivisor: number;
}

export interface RendererAccelerationStructureUpdatePolicy {
  readonly updateClass: RendererAccelerationStructureUpdateClass;
  readonly description: string;
  readonly profile: RendererWorkerProfileName;
}

export interface RendererWorkerBudgetLevelConfig {
  maxDispatchesPerFrame: number;
  maxJobsPerDispatch: number;
  cadenceDivisor: number;
  workgroupScale: number;
  maxQueueDepth: number;
  metadata: Readonly<{
    owner: typeof rendererDebugOwner;
    queueClass: typeof rendererWorkerQueueClass;
    jobType: string;
    quality: string;
  }>;
}

export interface RendererWorkerBudgetLevel {
  id: string;
  estimatedCostMs: number;
  config: RendererWorkerBudgetLevelConfig;
}

export interface RendererWorkerProfile {
  readonly name: RendererWorkerProfileName;
  readonly description: string;
  readonly jobs: readonly string[];
}

export interface RendererWorkerManifestJob {
  readonly key: string;
  readonly label: string;
  readonly worker: Readonly<{
    jobType: string;
    queueClass: typeof rendererWorkerQueueClass;
    priority: number;
    dependencies: readonly string[];
    schedulerMode: "dag";
  }>;
  readonly performance: Readonly<{
    id: string;
    jobType: string;
    queueClass: typeof rendererWorkerQueueClass;
    domain: "resolution" | "geometry" | "post-processing" | "xr";
    authority: "visual";
    importance: "high" | "critical";
    levels: readonly RendererWorkerBudgetLevel[];
  }>;
  readonly debug: Readonly<{
    owner: typeof rendererDebugOwner;
    queueClass: typeof rendererWorkerQueueClass;
    jobType: string;
    tags: readonly string[];
    suggestedAllocationIds: readonly string[];
  }>;
}

export interface RendererWorkerManifest {
  readonly schemaVersion: 1;
  readonly owner: typeof rendererDebugOwner;
  readonly profile: RendererWorkerProfileName;
  readonly description: string;
  readonly queueClass: typeof rendererWorkerQueueClass;
  readonly schedulerMode: "dag";
  readonly inputBoundary: RendererInputBoundary;
  readonly renderStages: readonly RendererRenderStage[];
  readonly representationBands: readonly RendererRepresentationPolicy[];
  readonly accelerationStructureUpdates: readonly RendererAccelerationStructureUpdatePolicy[];
  readonly suggestedAllocationIds: readonly string[];
  readonly jobs: readonly RendererWorkerManifestJob[];
}

export interface RayTracingRenderPlan {
  readonly schemaVersion: 1;
  readonly owner: typeof rendererDebugOwner;
  readonly profile: RendererWorkerProfileName;
  readonly inputBoundary: RendererInputBoundary & {
    readonly snapshotId: string;
  };
  readonly renderStages: readonly RendererRenderStage[];
  readonly representationBands: readonly (
    | RendererRepresentationPolicy
    | {
        readonly band: RendererRepresentationBand;
      }
  )[];
  readonly accelerationStructureUpdates: readonly RendererAccelerationStructureUpdatePolicy[];
  readonly workerManifest: RendererWorkerManifest;
}

export function getRendererWorkerProfile(
  name?: RendererWorkerProfileName
): RendererWorkerProfile;

export function getRendererWorkerManifest(
  name?: RendererWorkerProfileName
): RendererWorkerManifest;

export function createRayTracingRenderPlan(options: {
  snapshotId: string;
  profile?: RendererWorkerProfileName;
  representations?: readonly (
    | RendererRepresentationPolicy
    | {
        readonly band: RendererRepresentationBand;
        readonly [key: string]: unknown;
      }
  )[];
}): RayTracingRenderPlan;

export const rendererRepresentationBands: readonly RendererRepresentationBand[];
export const rendererAccelerationStructureUpdateClasses: readonly RendererAccelerationStructureUpdateClass[];
export const rendererRayTracingStageOrder: readonly RendererRenderStage["key"][];

export const defaultRendererClearColor: readonly [number, number, number, number];
export const rendererDebugOwner: "renderer";
export const rendererWorkerQueueClass: "render";
export const defaultRendererWorkerProfile: "realtime";
export const rendererWorkerProfileNames: readonly RendererWorkerProfileName[];
export const rendererWorkerProfiles: Readonly<
  Record<RendererWorkerProfileName, RendererWorkerProfile>
>;
export const rendererWorkerManifests: Readonly<
  Record<RendererWorkerProfileName, RendererWorkerManifest>
>;
