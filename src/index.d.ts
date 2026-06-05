export type RendererColor = string | [number, number, number, number?];
export type WavefrontSceneObjectKind = "sphere" | "box" | "aabb" | "bounds" | number;
export type WavefrontMaterialKind =
  | "diffuse"
  | "metal"
  | "reflective"
  | "dielectric"
  | "refractive"
  | "glass"
  | "transparent"
  | "transmission"
  | "emissive"
  | "light"
  | number;

export interface WavefrontCameraOptions {
  readonly position?: readonly [number, number, number] | readonly number[];
  readonly target?: readonly [number, number, number] | readonly number[];
  readonly up?: readonly [number, number, number] | readonly number[];
  readonly fovYDegrees?: number;
  readonly fov?: number;
}

export interface WavefrontSceneObjectInput {
  readonly id?: number;
  readonly kind?: WavefrontSceneObjectKind;
  readonly type?: WavefrontSceneObjectKind;
  readonly materialKind?: WavefrontMaterialKind;
  readonly flags?: number;
  readonly center?: readonly [number, number, number] | readonly number[];
  readonly position?: readonly [number, number, number] | readonly number[];
  readonly radius?: number;
  readonly halfExtent?: readonly [number, number, number] | readonly number[];
  readonly halfExtents?: readonly [number, number, number] | readonly number[];
  readonly extents?: readonly [number, number, number] | readonly number[];
  readonly min?: readonly [number, number, number] | readonly number[];
  readonly max?: readonly [number, number, number] | readonly number[];
  readonly bounds?: {
    readonly min?: readonly [number, number, number] | readonly number[];
    readonly max?: readonly [number, number, number] | readonly number[];
  };
  readonly color?: RendererColor | readonly number[];
  readonly baseColor?: RendererColor | readonly number[];
  readonly albedo?: RendererColor | readonly number[];
  readonly emission?: readonly [number, number, number, number?] | readonly number[];
  readonly emissive?: readonly [number, number, number, number?] | readonly number[];
  readonly roughness?: number;
  readonly metallic?: number;
  readonly opacity?: number;
  readonly ior?: number;
  readonly material?: {
    readonly kind?: WavefrontMaterialKind;
    readonly color?: RendererColor | readonly number[];
    readonly baseColor?: RendererColor | readonly number[];
    readonly emission?: readonly [number, number, number, number?] | readonly number[];
    readonly emissive?: readonly [number, number, number, number?] | readonly number[];
    readonly roughness?: number;
    readonly metallic?: number;
    readonly opacity?: number;
    readonly ior?: number;
  };
}

export interface WavefrontSceneObject {
  readonly id: number;
  readonly kind: number;
  readonly materialKind: number;
  readonly flags: number;
  readonly center: readonly [number, number, number] | readonly number[];
  readonly halfExtent: readonly [number, number, number] | readonly number[];
  readonly color: readonly [number, number, number, number] | readonly number[];
  readonly emission: readonly [number, number, number, number] | readonly number[];
  readonly roughness: number;
  readonly metallic: number;
  readonly opacity: number;
  readonly ior: number;
}

export interface WavefrontMeshInput {
  readonly id?: number;
  readonly positions: readonly number[] | Float32Array;
  readonly indices?: readonly number[] | Uint16Array | Uint32Array;
  readonly normals?: readonly number[] | Float32Array | null;
  readonly uvs?: readonly number[] | Float32Array | null;
  readonly texcoords?: readonly number[] | Float32Array | null;
  readonly uv?: readonly number[] | Float32Array | null;
  readonly materialKind?: WavefrontMaterialKind;
  readonly flags?: number;
  readonly materialRefId?: number;
  readonly materialId?: number;
  readonly mediumRefId?: number;
  readonly mediumId?: number;
  readonly color?: RendererColor | readonly number[];
  readonly baseColor?: RendererColor | readonly number[];
  readonly albedo?: RendererColor | readonly number[];
  readonly emission?: readonly [number, number, number, number?] | readonly number[];
  readonly emissive?: readonly [number, number, number, number?] | readonly number[];
  readonly roughness?: number;
  readonly metallic?: number;
  readonly opacity?: number;
  readonly ior?: number;
  readonly material?: {
    readonly kind?: WavefrontMaterialKind;
    readonly color?: RendererColor | readonly number[];
    readonly baseColor?: RendererColor | readonly number[];
    readonly emission?: readonly [number, number, number, number?] | readonly number[];
    readonly emissive?: readonly [number, number, number, number?] | readonly number[];
    readonly roughness?: number;
    readonly metallic?: number;
    readonly opacity?: number;
    readonly ior?: number;
    readonly id?: number;
  };
  readonly medium?: {
    readonly id?: number;
  };
}

export interface WavefrontTriangleRecord {
  readonly triangleId: number;
  readonly meshId: number;
  readonly materialKind: number;
  readonly flags: number;
  readonly materialRefId: number;
  readonly mediumRefId: number;
  readonly v0: readonly number[];
  readonly v1: readonly number[];
  readonly v2: readonly number[];
  readonly n0: readonly number[];
  readonly n1: readonly number[];
  readonly n2: readonly number[];
  readonly uv0: readonly number[];
  readonly uv1: readonly number[];
  readonly uv2: readonly number[];
  readonly color: readonly number[];
  readonly emission: readonly number[];
  readonly material: readonly number[];
  readonly bounds: Readonly<{ min: readonly number[]; max: readonly number[] }>;
  readonly centroid: readonly number[];
}

export interface WavefrontBvhNodeRecord {
  readonly bounds: Readonly<{ min: readonly number[]; max: readonly number[] }>;
  readonly firstTriangle: number;
  readonly triangleCount: number;
  readonly leftChild: number;
  readonly rightChild: number;
}

export interface WavefrontBvhBuildLevel {
  readonly start: number;
  readonly count: number;
}

export interface WavefrontBvhSortStage {
  readonly compareDistance: number;
  readonly sequenceSize: number;
}

export interface WavefrontMeshAcceleration {
  readonly nodes: readonly WavefrontBvhNodeRecord[];
  readonly triangles: readonly WavefrontTriangleRecord[];
}

export interface WavefrontReferenceRay {
  readonly rayId: number;
  readonly parentRayId: number;
  readonly sourcePixelId: number;
  readonly sampleId: number;
  readonly bounce: number;
  readonly mediumRefId: number;
  readonly flags: number;
  readonly origin: readonly [number, number, number] | readonly number[];
  readonly direction: readonly [number, number, number] | readonly number[];
  readonly throughput: readonly [number, number, number, number] | readonly number[];
  readonly pixelX: number;
  readonly pixelY: number;
}

export interface WavefrontReferenceTile {
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
}

export interface CreateWavefrontReferenceRayOptions {
  readonly tile?: WavefrontReferenceTile;
  readonly pixelIndex?: number;
  readonly sampleIndex?: number;
  readonly frameIndex?: number;
  readonly jitterScale?: number;
}

export interface WavefrontReferenceHit {
  readonly hitType: "surface" | "environment";
  readonly rayId: number;
  readonly sourcePixelId: number;
  readonly distance: number;
  readonly entityId: number;
  readonly instanceId: number;
  readonly primitiveId: number;
  readonly materialId: number;
  readonly materialRefId: number;
  readonly mediumRefId: number;
  readonly barycentrics: readonly [number, number, number] | readonly number[];
  readonly uv: readonly [number, number] | readonly number[];
  readonly geometricNormal: readonly [number, number, number] | readonly number[];
  readonly shadingNormal: readonly [number, number, number] | readonly number[];
  readonly frontFace: boolean;
  readonly triangleIndex: number;
  readonly triangleId: number;
  readonly position: readonly [number, number, number] | readonly number[];
  readonly color: readonly number[];
  readonly emission: readonly number[];
  readonly material: readonly number[];
}

export interface IntersectWavefrontReferenceTriangleOptions {
  readonly maxDistance?: number;
  readonly triangleIndex?: number;
}

export interface TraceWavefrontReferenceTrianglesOptions {
  readonly maxDistance?: number;
}

export type WavefrontAccelerationBuildMode = "gpu" | "cpu-debug";

export interface WavefrontGpuMeshSource {
  readonly vertices: Readonly<{
    readonly buffer: ArrayBuffer;
    readonly count: number;
    readonly recordBytes: number;
  }>;
  readonly indices: Readonly<{
    readonly buffer: ArrayBuffer;
    readonly count: number;
    readonly recordBytes: 4;
  }>;
  readonly meshes: Readonly<{
    readonly buffer: ArrayBuffer;
    readonly records: readonly Readonly<{
      readonly id: number;
      readonly positions: readonly number[];
      readonly indices: readonly number[];
      readonly normals: readonly number[] | null;
      readonly uvs: readonly number[] | null;
      readonly materialKind: number;
      readonly flags: number;
      readonly materialRefId: number;
      readonly mediumRefId: number;
      readonly color: readonly number[];
      readonly emission: readonly number[];
      readonly roughness: number;
      readonly metallic: number;
      readonly opacity: number;
      readonly ior: number;
    }>[];
    readonly count: number;
    readonly recordBytes: number;
  }>;
  readonly triangleCount: number;
  readonly bvhNodeCapacity: number;
}

export interface WavefrontEmissiveTriangleIndexSource {
  readonly buffer: ArrayBuffer;
  readonly indices: readonly number[];
  readonly count: number;
  readonly capacity: number;
  readonly recordBytes: 4;
}

export type WavefrontEnvironmentPortalMode =
  | 0
  | 1
  | 2
  | "disabled"
  | "guide"
  | "guide-and-gate"
  | "gate";

export interface WavefrontEnvironmentPortalInput {
  readonly kind?: "rectangle";
  readonly shape?: "rectangle";
  readonly position?: readonly [number, number, number] | readonly number[];
  readonly center?: readonly [number, number, number] | readonly number[];
  readonly normal?: readonly [number, number, number] | readonly number[];
  readonly tangent?: readonly [number, number, number] | readonly number[];
  readonly width?: number;
  readonly height?: number;
  readonly halfWidth?: number;
  readonly halfHeight?: number;
  readonly radianceScale?: number;
  readonly intensity?: number;
  readonly color?: readonly [number, number, number, number?] | readonly number[];
  readonly twoSided?: boolean;
}

export interface WavefrontEnvironmentPortalRecord {
  readonly kind: 1;
  readonly flags: number;
  readonly position: readonly [number, number, number, number] | readonly number[];
  readonly normal: readonly [number, number, number, number] | readonly number[];
  readonly tangent: readonly [number, number, number, number] | readonly number[];
  readonly bitangent: readonly [number, number, number, number] | readonly number[];
  readonly color: readonly [number, number, number, number] | readonly number[];
}

export interface WavefrontPathTracingComputeConfig {
  readonly width: number;
  readonly height: number;
  readonly maxDepth: number;
  readonly tileSize: number;
  readonly samplesPerPixel: number;
  readonly tilePixelCapacity: number;
  readonly sceneObjects: readonly WavefrontSceneObject[];
  readonly sceneObjectCount: number;
  readonly sceneObjectCapacity: number;
  readonly accelerationBuildMode: WavefrontAccelerationBuildMode;
  readonly gpuAccelerationBuildRequired: boolean;
  readonly gpuMeshSource: WavefrontGpuMeshSource;
  readonly meshAcceleration: WavefrontMeshAcceleration;
  readonly emissiveTriangleIndices: WavefrontEmissiveTriangleIndexSource;
  readonly emissiveTriangleCount: number;
  readonly emissiveTriangleCapacity: number;
  readonly environmentPortals: readonly WavefrontEnvironmentPortalRecord[];
  readonly environmentPortalCount: number;
  readonly environmentPortalCapacity: number;
  readonly environmentPortalMode: 0 | 1 | 2;
  readonly triangleCount: number;
  readonly triangleCapacity: number;
  readonly bvhNodeCount: number;
  readonly bvhNodeCapacity: number;
  readonly bvhLeafSortCapacity: number;
  readonly bvhSortStages: readonly WavefrontBvhSortStage[];
  readonly bvhBuildLevels: readonly WavefrontBvhBuildLevel[];
  readonly camera: Readonly<{
    readonly position: readonly number[];
    readonly forward: readonly number[];
    readonly right: readonly number[];
    readonly up: readonly number[];
    readonly fovYDegrees: number;
    readonly aspect: number;
    readonly tanHalfFovY: number;
  }>;
  readonly environmentColor: readonly [number, number, number, number] | readonly number[];
  readonly ambientColor: readonly [number, number, number, number] | readonly number[];
  readonly environmentLighting: WavefrontEnvironmentLightingConfig;
  readonly displayQuality: boolean;
  readonly requiresMeshBvhForDisplayQuality: true;
  readonly denoise: boolean;
  readonly frameIndex: number;
  readonly memory: WavefrontPathTracingMemoryEstimate;
}

export interface WavefrontEnvironmentLightingInput {
  readonly environmentColor?: readonly [number, number, number, number?] | readonly number[];
  readonly ambientColor?: readonly [number, number, number, number?] | readonly number[];
  readonly horizonColor?: readonly [number, number, number, number?] | readonly number[];
  readonly zenithColor?: readonly [number, number, number, number?] | readonly number[];
  readonly sunDirection?: readonly [number, number, number] | readonly number[];
  readonly sunColor?: readonly [number, number, number, number?] | readonly number[];
  readonly intensity?: number;
  readonly mode?: number;
  readonly exposure?: number;
  readonly environmentPortals?: readonly WavefrontEnvironmentPortalInput[];
  readonly environmentPortalMode?: WavefrontEnvironmentPortalMode;
}

export interface WavefrontEnvironmentLightingConfig {
  readonly environmentColor: readonly [number, number, number, number] | readonly number[];
  readonly ambientColor: readonly [number, number, number, number] | readonly number[];
  readonly horizonColor: readonly [number, number, number, number] | readonly number[];
  readonly zenithColor: readonly [number, number, number, number] | readonly number[];
  readonly sunDirection: readonly [number, number, number] | readonly number[];
  readonly sunColor: readonly [number, number, number, number] | readonly number[];
  readonly intensity: number;
  readonly mode: number;
  readonly exposure: number;
}

export interface WavefrontPathTracingMemoryEstimate {
  readonly queueBytes: number;
  readonly queuePairBytes: number;
  readonly hitBytes: number;
  readonly accumulationBytes: number;
  readonly sceneObjectBytes: number;
  readonly triangleBytes: number;
  readonly bvhNodeBytes: number;
  readonly bvhLeafReferenceBytes: number;
  readonly emissiveTriangleMetadataBytes: number;
  readonly environmentPortalBytes: number;
  readonly configBytes: number;
  readonly counterBytes: number;
  readonly totalHotBufferBytes: number;
}

export interface CreateWavefrontPathTracingComputeRendererOptions {
  readonly canvas?: HTMLCanvasElement | string;
  readonly navigator?: Navigator | { gpu?: GPU };
  readonly document?: Document;
  readonly deviceDescriptor?: GPUDeviceDescriptor;
  readonly requiredLimits?: Partial<Record<string, number>>;
  readonly powerPreference?: GPUPowerPreference;
  readonly alpha?: boolean;
  readonly format?: GPUTextureFormat;
  readonly width?: number;
  readonly height?: number;
  readonly maxDepth?: number;
  readonly tileSize?: number;
  readonly samplesPerPixel?: number;
  readonly tilePixelCapacity?: number;
  readonly sceneObjectCapacity?: number;
  readonly sceneObjects?: readonly WavefrontSceneObjectInput[];
  readonly mesh?: WavefrontMeshInput;
  readonly meshes?: readonly WavefrontMeshInput[];
  readonly triangleCapacity?: number;
  readonly bvhNodeCapacity?: number;
  readonly bvhLeafSortCapacity?: number;
  readonly emissiveTriangleCapacity?: number;
  readonly environmentPortalCapacity?: number;
  readonly environmentPortals?: readonly WavefrontEnvironmentPortalInput[];
  readonly environmentLightPortals?: readonly WavefrontEnvironmentPortalInput[];
  readonly environmentPortalMode?: WavefrontEnvironmentPortalMode;
  readonly portalMode?: WavefrontEnvironmentPortalMode;
  readonly accelerationBuildMode?: WavefrontAccelerationBuildMode;
  readonly camera?: WavefrontCameraOptions;
  readonly environmentColor?: readonly [number, number, number, number?] | readonly number[];
  readonly ambientColor?: readonly [number, number, number, number?] | readonly number[];
  readonly environmentLighting?: WavefrontEnvironmentLightingInput;
  readonly displayQuality?: boolean;
  readonly denoise?: boolean;
  readonly frameIndex?: number;
}

export interface WavefrontPathTracingComputeRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly context: GPUCanvasContext;
  readonly device: GPUDevice;
  readonly format: GPUTextureFormat | string;
  readonly config: WavefrontPathTracingComputeConfig;
  renderOnce(): Readonly<{
    frame: number;
    width: number;
    height: number;
    maxDepth: number;
    tiles: number;
    tileSize: number;
    samplesPerPixel: number;
    screenRays: number;
    primaryRays: number;
    sceneObjectCount: number;
    triangleCount: number;
    emissiveTriangleCount: number;
    environmentPortalCount: number;
    environmentPortalMode: 0 | 1 | 2;
    bvhNodeCount: number;
    displayQuality: boolean;
    accelerationBuildMode: WavefrontAccelerationBuildMode;
    gpuAccelerationBuildRequired: boolean;
    accelerationBuildSubmitted: boolean;
    accelerationBuilt: boolean;
    accelerationBuildCount: number;
    commandSubmissions: number;
    frameConfigSlots: number;
    memory: WavefrontPathTracingMemoryEstimate;
  }>;
  readOutputProbe(options?: { x?: number; y?: number }): Promise<
    Readonly<{
      x: number;
      y: number;
      rgba: readonly number[];
      luminance: number;
    }>
  >;
  updateSceneObjects(sceneObjects: readonly WavefrontSceneObjectInput[]): WavefrontPathTracingComputeConfig;
  getSnapshot(): Readonly<{
    frame: number;
    width: number;
    height: number;
    maxDepth: number;
    tiles: number;
    tileSize: number;
    samplesPerPixel: number;
    sceneObjectCount: number;
    triangleCount: number;
    emissiveTriangleCount: number;
    environmentPortalCount: number;
    environmentPortalMode: 0 | 1 | 2;
    bvhNodeCount: number;
    displayQuality: boolean;
    accelerationBuildMode: WavefrontAccelerationBuildMode;
    gpuAccelerationBuildRequired: boolean;
    accelerationBuilt: boolean;
    accelerationBuildCount: number;
    frameConfigSlots: number;
    memory: WavefrontPathTracingMemoryEstimate;
  }>;
  destroy(): void;
}

export function normalizeWavefrontSceneObject(
  input?: WavefrontSceneObjectInput,
  index?: number
): WavefrontSceneObject;
export function createDefaultWavefrontSceneObjects(): readonly WavefrontSceneObject[];
export function estimateWavefrontPathTracingMemory(options?: {
  tilePixelCapacity?: number;
  sceneObjectCapacity?: number;
  triangleCapacity?: number;
  bvhNodeCapacity?: number;
  bvhLeafSortCapacity?: number;
  emissiveTriangleCapacity?: number;
}): WavefrontPathTracingMemoryEstimate;
export function normalizeWavefrontMesh(
  input: WavefrontMeshInput,
  meshIndex?: number
): Readonly<{
  id: number;
  positions: readonly number[];
  indices: readonly number[];
  normals: readonly number[] | null;
  uvs: readonly number[] | null;
  materialKind: number;
  flags: number;
  materialRefId: number;
  mediumRefId: number;
  color: readonly number[];
  emission: readonly number[];
  roughness: number;
  metallic: number;
  opacity: number;
  ior: number;
}>;
export function createWavefrontMeshAcceleration(
  meshes?: readonly WavefrontMeshInput[] | WavefrontMeshInput
): WavefrontMeshAcceleration;
export function createWavefrontGpuMeshSource(
  meshes?: readonly WavefrontMeshInput[] | WavefrontMeshInput
): WavefrontGpuMeshSource;
export function createWavefrontEmissiveTriangleIndexSource(
  meshes?: readonly WavefrontMeshInput[] | WavefrontMeshInput,
  capacity?: number
): WavefrontEmissiveTriangleIndexSource;
export function createWavefrontBvhBuildLevels(
  triangleCount: number
): readonly WavefrontBvhBuildLevel[];
export function createWavefrontBvhSortStages(
  itemCount: number
): readonly WavefrontBvhSortStage[];
export function createWavefrontPathTracingComputeConfig(
  options?: CreateWavefrontPathTracingComputeRendererOptions
): WavefrontPathTracingComputeConfig;
export function createWavefrontReferenceRay(
  config: WavefrontPathTracingComputeConfig,
  options?: CreateWavefrontReferenceRayOptions
): WavefrontReferenceRay;
export function intersectWavefrontReferenceTriangle(
  ray: WavefrontReferenceRay,
  triangle: WavefrontTriangleRecord,
  options?: IntersectWavefrontReferenceTriangleOptions
): WavefrontReferenceHit | null;
export function traceWavefrontReferenceTriangles(
  config: WavefrontPathTracingComputeConfig,
  ray: WavefrontReferenceRay,
  triangles: readonly WavefrontTriangleRecord[],
  options?: TraceWavefrontReferenceTrianglesOptions
): WavefrontReferenceHit;
export function packWavefrontSceneObjects(
  sceneObjects: readonly WavefrontSceneObjectInput[],
  capacity?: number
): Readonly<{
  buffer: ArrayBuffer;
  objects: readonly WavefrontSceneObject[];
  count: number;
  capacity: number;
}>;
export function packWavefrontTriangles(
  triangles: readonly WavefrontTriangleRecord[],
  capacity?: number
): Readonly<{
  buffer: ArrayBuffer;
  triangles: readonly WavefrontTriangleRecord[];
  count: number;
  capacity: number;
}>;
export function packWavefrontBvhNodes(
  nodes: readonly WavefrontBvhNodeRecord[],
  capacity?: number
): Readonly<{
  buffer: ArrayBuffer;
  nodes: readonly WavefrontBvhNodeRecord[];
  count: number;
  capacity: number;
}>;
export function supportsWavefrontPathTracingCompute(options?: {
  navigator?: Navigator | { gpu?: GPU };
}): boolean;
export function createWavefrontPathTracingComputeRenderer(
  options?: CreateWavefrontPathTracingComputeRendererOptions
): Promise<WavefrontPathTracingComputeRenderer>;

export const wavefrontPathTracingComputeLimits: Readonly<{
  workgroupSize: 64;
  rayRecordBytes: 80;
  hitRecordBytes: 208;
  sceneObjectRecordBytes: 96;
  meshVertexRecordBytes: 48;
  meshRangeRecordBytes: 96;
  triangleRecordBytes: 208;
  bvhNodeRecordBytes: 48;
  bvhLeafReferenceRecordBytes: 16;
  emissiveTriangleIndexBytes: 4;
  emissiveTriangleMetadataRecordBytes: 48;
  environmentPortalRecordBytes: 96;
  accumulationRecordBytes: 16;
}>;
export const wavefrontSceneObjectKinds: Readonly<{
  sphere: 1;
  box: 2;
}>;
export const wavefrontMaterialKinds: Readonly<{
  diffuse: 0;
  metal: 1;
  dielectric: 2;
  transparent: 3;
  emissive: 4;
}>;

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

export const rendererRepresentationBands: readonly RendererRepresentationBand[];
export const rendererAccelerationStructureUpdateClasses: readonly RendererAccelerationStructureUpdateClass[];
export const rendererRayTracingStageOrder: readonly RendererRenderStage["key"][];
export const rendererWavefrontBufferSchemaVersion: 1;
export const rendererWavefrontQueuePairStrategy: "ping-pong-active-next";
export const rendererWavefrontHitTypes: readonly RendererWavefrontHitType[];
export const rendererWavefrontPassOrder: readonly RendererWavefrontPassKey[];

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
