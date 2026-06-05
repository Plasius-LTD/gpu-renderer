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
export type RendererWavefrontHitType =
  | "surface"
  | "emissive"
  | "environment"
  | "transparent"
  | "miss";
export type RendererWavefrontPassKey =
  | "generatePrimaryRays"
  | "intersectActiveQueue"
  | "resolveSurfaceRecords"
  | "accumulateTerminalRadiance"
  | "scatterContinuations"
  | "compactAndSwapQueues";

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
  readonly wavefront: RendererWavefrontPathTracingPlan;
  readonly workerManifest: RendererWorkerManifest;
}

export interface RendererWavefrontFieldContract {
  readonly name: string;
  readonly type: string;
  readonly description: string;
}

export interface RendererWavefrontRecordContract {
  readonly schemaVersion: typeof rendererWavefrontBufferSchemaVersion;
  readonly recordName: string;
  readonly fields: readonly RendererWavefrontFieldContract[];
}

export interface RendererWavefrontQueueDescriptor {
  readonly name: "active" | "next";
  readonly role: "current-bounce" | "next-bounce";
}

export interface RendererWavefrontBounceStep {
  readonly bounce: number;
  readonly readQueue: "active" | "next";
  readonly writeQueue: "active" | "next";
  readonly passOrder: readonly RendererWavefrontPassKey[];
}

export interface RendererWavefrontTerminationPolicy {
  readonly terminalHitTypes: readonly RendererWavefrontHitType[];
  readonly continuationHitTypes: readonly RendererWavefrontHitType[];
  readonly emissive: Readonly<{
    action: "accumulate-and-stop";
    contributesRadiance: true;
  }>;
  readonly environment: Readonly<{
    action: "accumulate-and-stop";
    contributesRadiance: true;
  }>;
  readonly miss: Readonly<{
    action: "accumulate-environment-or-dark-stop";
    contributesRadiance: true;
  }>;
}

export interface RendererWavefrontPathTracingPlan {
  readonly schemaVersion: typeof rendererWavefrontBufferSchemaVersion;
  readonly owner: typeof rendererDebugOwner;
  readonly maxDepth: number;
  readonly queueCapacity: number;
  readonly explicitLightSampling: boolean;
  readonly accumulationResetEpoch: number;
  readonly queueLayout: Readonly<{
    strategy: typeof rendererWavefrontQueuePairStrategy;
    compactAfterScatter: true;
    queues: readonly RendererWavefrontQueueDescriptor[];
  }>;
  readonly bufferContracts: Readonly<{
    ray: RendererWavefrontRecordContract;
    hit: RendererWavefrontRecordContract;
    surface: RendererWavefrontRecordContract;
    materialReference: RendererWavefrontRecordContract;
    mediumReference: RendererWavefrontRecordContract;
    accumulation: RendererWavefrontRecordContract;
  }>;
  readonly bounceSchedule: readonly RendererWavefrontBounceStep[];
  readonly terminationPolicy: RendererWavefrontTerminationPolicy;
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
  wavefront?: {
    maxDepth?: number;
    queueCapacity?: number;
    explicitLightSampling?: boolean;
    accumulationResetEpoch?: number;
  };
}): RayTracingRenderPlan;

export function createWavefrontPathTracingPlan(options?: {
  maxDepth?: number;
  queueCapacity?: number;
  explicitLightSampling?: boolean;
  accumulationResetEpoch?: number;
}): RendererWavefrontPathTracingPlan;

export interface WavefrontPathTracingComputeTile {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly pixelCount: number;
  readonly workgroups: number;
}

export type WavefrontPathTracingSceneObjectKind = "box" | "sphere";

export interface WavefrontPathTracingSceneObject {
  readonly kind?: WavefrontPathTracingSceneObjectKind;
  readonly type?: WavefrontPathTracingSceneObjectKind;
  readonly materialKind?: 1 | 2 | 3 | 4 | 5 | 6;
  readonly color?: readonly [number, number, number] | readonly [number, number, number, number];
  readonly emission?: readonly [number, number, number] | readonly [number, number, number, number];
  readonly ior?: number;
  readonly bounds?: Readonly<{
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  }>;
  readonly min?: readonly [number, number, number];
  readonly max?: readonly [number, number, number];
  readonly center?: readonly [number, number, number];
  readonly radius?: number;
}

export interface WavefrontPathTracingNormalizedSceneObject {
  readonly kind: 1 | 2;
  readonly materialKind: 1 | 2 | 3 | 4 | 5 | 6;
  readonly boundsMin: readonly [number, number, number, number];
  readonly boundsMax: readonly [number, number, number, number];
  readonly color: readonly [number, number, number, number];
  readonly emission: readonly [number, number, number, number];
}

export interface WavefrontPathTracingComputeConfig {
  readonly mode: typeof rendererWavefrontComputeMode;
  readonly width: number;
  readonly height: number;
  readonly samples: 1;
  readonly maxDepth: number;
  readonly queueCapacity: number;
  readonly primaryRayCount: number;
  readonly workgroupSize: number;
  readonly primaryWorkgroups: number;
  readonly bouncePasses: number;
  readonly indirectDispatch: false;
  readonly cpuReference: false;
  readonly denoise: boolean;
  readonly format: GPUTextureFormat | "rgba8unorm";
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly tilePixelCapacity: number;
  readonly sceneObjects: readonly WavefrontPathTracingNormalizedSceneObject[];
  readonly sceneObjectCount: number;
  readonly sceneObjectCapacity: number;
  readonly tileCountX: number;
  readonly tileCountY: number;
  readonly tileCount: number;
  readonly maxTileWorkgroups: number;
  readonly tiles: readonly WavefrontPathTracingComputeTile[];
}

export interface WavefrontPathTracingOutputProbe {
  readonly sampledPixels: number;
  readonly nonZeroSamples: number;
  readonly maxChannel: number;
}

export interface WavefrontPathTracingComputeStats {
  readonly plan: Readonly<{
    mode: typeof rendererWavefrontComputeMode;
    maxDepth: number;
    queueCapacity: number;
    dispatch: Readonly<{
      workgroupSize: number;
      primaryWorkgroups: number;
      indirectDispatch: true;
      tileWidth: number;
      tileHeight: number;
      tileCount: number;
      maxTileWorkgroups: number;
    }>;
  }>;
  readonly settings: WavefrontPathTracingComputeConfig;
  readonly renderMs: number;
  readonly queueOverflow: number;
  readonly outputProbe: WavefrontPathTracingOutputProbe | null;
  readonly bounces: readonly {
    readonly bounce: number;
    readonly active: number;
    readonly surfaceHits: number;
    readonly emissiveHits: number;
    readonly environmentHits: number;
    readonly spawned: number;
    readonly ambientFallback: number;
    readonly queueOverflow: number;
    readonly maxDepth: number;
  }[];
  readonly termination: Readonly<{
    emissive: number;
    environment: number;
    ambientFallback: number;
    maxDepth: number;
  }>;
}

export interface WavefrontPathTracingComputeRenderer {
  readonly config: WavefrontPathTracingComputeConfig;
  readonly device: GPUDevice;
  readonly context: GPUCanvasContext;
  readonly canvas: HTMLCanvasElement;
  renderFrame(options?: {
    readStats?: boolean;
    readOutputProbe?: boolean;
  }): Promise<WavefrontPathTracingComputeStats>;
  destroy(): void;
}

export function supportsWavefrontPathTracingCompute(options?: {
  navigator?: Navigator | { gpu?: GPU };
}): boolean;

export function createWavefrontPathTracingComputeConfig(options?: {
  width?: number;
  height?: number;
  samples?: 1;
  maxDepth?: number;
  queueCapacity?: number;
  workgroupSize?: number;
  denoise?: boolean;
  format?: GPUTextureFormat | "rgba8unorm";
  tileWidth?: number;
  tileHeight?: number;
  sceneObjects?: readonly WavefrontPathTracingSceneObject[];
  sceneObjectLimit?: number;
}): WavefrontPathTracingComputeConfig;

export function createWavefrontPathTracingComputeShaderSource(options?: {
  workgroupSize?: number;
}): string;

export function createWavefrontPathTracingComputeRenderer(options: {
  canvas: HTMLCanvasElement;
  width?: number;
  height?: number;
  samples?: 1;
  maxDepth?: number;
  queueCapacity?: number;
  workgroupSize?: number;
  denoise?: boolean;
  format?: GPUTextureFormat | "rgba8unorm";
  tileWidth?: number;
  tileHeight?: number;
  sceneObjects?: readonly WavefrontPathTracingSceneObject[];
  sceneObjectLimit?: number;
  navigator?: Navigator | { gpu?: GPU };
  gpu?: GPU;
  adapter?: GPUAdapter;
  device?: GPUDevice;
  context?: GPUCanvasContext;
}): Promise<WavefrontPathTracingComputeRenderer>;

export function renderWavefrontPathTracingComputeFrame(options: {
  canvas: HTMLCanvasElement;
  width?: number;
  height?: number;
  samples?: 1;
  maxDepth?: number;
  queueCapacity?: number;
  workgroupSize?: number;
  denoise?: boolean;
  format?: GPUTextureFormat | "rgba8unorm";
  tileWidth?: number;
  tileHeight?: number;
  sceneObjects?: readonly WavefrontPathTracingSceneObject[];
  sceneObjectLimit?: number;
  navigator?: Navigator | { gpu?: GPU };
  gpu?: GPU;
  adapter?: GPUAdapter;
  device?: GPUDevice;
  context?: GPUCanvasContext;
  readStats?: boolean;
  readOutputProbe?: boolean;
  destroy?: boolean;
}): Promise<WavefrontPathTracingComputeStats>;

export const rendererRepresentationBands: readonly RendererRepresentationBand[];
export const rendererAccelerationStructureUpdateClasses: readonly RendererAccelerationStructureUpdateClass[];
export const rendererRayTracingStageOrder: readonly RendererRenderStage["key"][];
export const rendererWavefrontBufferSchemaVersion: 1;
export const rendererWavefrontQueuePairStrategy: "ping-pong-active-next";
export const rendererWavefrontHitTypes: readonly RendererWavefrontHitType[];
export const rendererWavefrontPassOrder: readonly RendererWavefrontPassKey[];
export const rendererWavefrontComputeMode: "webgpu-compute";
export const rendererWavefrontComputeStatsStride: 8;
export const rendererWavefrontComputeWorkgroupSize: 64;

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
