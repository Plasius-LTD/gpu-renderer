export type RendererColor = string | [number, number, number, number?];
export type AnimatedSceneVector3 = readonly [number, number, number] | readonly number[];
export type AnimatedScenePropKind =
  | "crop-row"
  | "fence-segment"
  | "crate"
  | "cart"
  | "small-tree"
  | "path-marker";

export interface AnimatedScenePathPoint {
  readonly id: string;
  readonly position: AnimatedSceneVector3;
  readonly arriveMs: number;
}

export interface AnimatedSceneBeat {
  readonly id: string;
  readonly order: number;
  readonly kind?: string;
  readonly clipId: string;
  readonly durationMs: number;
  readonly pathPointId?: string;
  readonly rootMotion?: "prefer-root-motion" | "route-driven" | "in-place" | string;
  readonly validatedDurationMs?: number;
  readonly movementRequirement?: {
    readonly type: "stationary" | "travel" | "jump" | "root-authored";
    readonly distance?: number;
    readonly maxDrift?: number;
    readonly speedRange?: readonly [number, number] | readonly number[];
    readonly directionToleranceDegrees?: number;
    readonly verticalArc?: readonly [number, number] | readonly number[];
    readonly loop?: "once" | "repeat" | "hold";
    readonly validatedDurationMs?: number;
  };
  readonly blend?: {
    readonly inMs?: number;
    readonly outMs?: number;
  };
}

export interface AnimatedSceneCameraFollowRig {
  readonly mode?: "lagged-follow" | "editor" | "spectator" | "third-person" | "first-person";
  readonly viewMode?: "editor" | "spectator" | "third-person" | "first-person";
  readonly cubicBezier?: readonly [number, number, number, number] | readonly number[];
  readonly lagMs?: number;
  readonly lookAheadMs?: number;
  readonly offset?: AnimatedSceneVector3;
  readonly constraints?: {
    readonly minDistance?: number;
    readonly maxDistance?: number;
    readonly minPolarAngle?: number;
    readonly maxPolarAngle?: number;
    readonly firstPersonHeadOffset?: number;
    readonly headLookMaxYaw?: number;
    readonly headLookMaxPitch?: number;
    readonly headLookWeight?: number;
  };
  readonly headLook?: {
    readonly enabled?: boolean;
    readonly activeOnly?: boolean;
    readonly returnMs?: number;
  };
  readonly headBoneAvailable?: boolean;
  readonly headHeight?: number;
}

export interface AnimatedSceneProp {
  readonly id?: string;
  readonly kind: AnimatedScenePropKind | string;
  readonly position: AnimatedSceneVector3;
}

export interface AnimatedSceneClipAsset {
  readonly id: string;
  readonly asset?: ArrayBuffer | null;
  readonly movementProfile?: {
    readonly motionMode?: "stationary" | "calibrated-in-place" | "root-authored" | "jump" | "modifier" | "invalid" | string;
    readonly durationMs?: number;
    readonly rootTranslationDistance?: number;
    readonly strideLength?: number;
    readonly strideLengthMeters?: number;
    readonly expectedSpeed?: number;
    readonly worldDisplacementAllowed?: boolean;
    readonly footSlideTolerance?: number;
  } | null;
}

export interface CreateAnimatedSceneRendererOptions {
  readonly canvas: string | HTMLCanvasElement | {
    width: number;
    height: number;
    style?: Record<string, string>;
    getContext(type: "2d"): CanvasRenderingContext2D | null;
  };
  readonly route?: readonly AnimatedScenePathPoint[];
  readonly beats?: readonly AnimatedSceneBeat[];
  readonly props?: readonly AnimatedSceneProp[];
  readonly camera?: AnimatedSceneCameraFollowRig;
  readonly modelAsset?: ArrayBuffer | null;
  readonly clipAssets?: readonly AnimatedSceneClipAsset[];
  readonly animationAdventure?: {
    readonly route?: readonly AnimatedScenePathPoint[];
    readonly beats?: readonly AnimatedSceneBeat[];
    readonly props?: readonly AnimatedSceneProp[];
    readonly camera?: AnimatedSceneCameraFollowRig;
    readonly modelAsset?: ArrayBuffer | null;
    readonly clipAssets?: readonly AnimatedSceneClipAsset[];
  };
  readonly requestAnimationFrame?: (callback: FrameRequestCallback) => number;
  readonly cancelAnimationFrame?: (handle: number) => void;
}

export interface CreateProfessionalAnimatedSceneRendererOptions extends Omit<CreateAnimatedSceneRendererOptions, "canvas"> {
  readonly canvas: string | HTMLCanvasElement | {
    width: number;
    height: number;
    style?: Record<string, string>;
    getContext(type: "webgpu"): GPUCanvasContext | null;
  };
  readonly navigator?: Navigator;
  readonly document?: Document;
  readonly clearColor?: RendererColor;
}

export interface AnimatedSceneSnapshot {
  readonly frame: number;
  readonly running: boolean;
  readonly activeClipId: string;
  readonly activeBeatId: string;
  readonly activeMovementMode: "stationary" | "travel" | "jump" | "root-authored" | string;
  readonly blendProgress: number;
  readonly clipTimeMs: number;
  readonly characterPosition: readonly [number, number, number];
  readonly cameraPosition: readonly [number, number, number];
  readonly cameraViewMode: "editor" | "spectator" | "third-person" | "first-person";
  readonly cameraTransform: {
    readonly position: readonly [number, number, number];
    readonly target: readonly [number, number, number];
    readonly up: readonly [number, number, number];
  };
  readonly targetDistance: number;
  readonly headLook: {
    readonly status: "inactive" | "active" | "returning" | "unavailable";
    readonly yaw: number;
    readonly pitch: number;
    readonly weight: number;
    readonly target: readonly [number, number, number];
  };
  readonly characterGroundY: number;
  readonly characterVisible: boolean;
  readonly modelLoaded: boolean;
  readonly modelRenderable: boolean;
  readonly fallbackProxyActive: boolean;
  readonly skinnedVertexCount: number;
  readonly skinnedTriangleCount: number;
  readonly skinnedJointCount: number;
  readonly skinnedAnimatedNodeCount: number;
  readonly skinnedClipCount: number;
  readonly activeClipRenderable: boolean;
  readonly propGroundAnchors: readonly {
    readonly id: string;
    readonly kind: string;
    readonly groundY: number;
    readonly depth: number;
    readonly visible: boolean;
  }[];
  readonly movementValidation: {
    readonly status: "passed" | "warning" | "failed";
    readonly warnings: readonly string[];
    readonly activeBeatId: string;
    readonly activeClipId: string;
    readonly motionMode: string;
    readonly rootMotionSource: string;
    readonly expectedSpeed: number;
    readonly actualSpeed: number;
    readonly movementDistance: number;
    readonly loopCount: number;
    readonly footSlideWarning?: string | null;
  };
  readonly frameState: "initialized" | "running" | "rendered-once" | "destroyed";
}

export interface ProfessionalAnimatedSceneSnapshot extends Omit<AnimatedSceneSnapshot, "cameraViewMode" | "headLook" | "targetDistance" | "characterGroundY" | "characterVisible" | "propGroundAnchors"> {
  readonly renderMode: "webgpu-pbr";
  readonly webGpuActive: boolean;
  readonly texturedSkinnedRenderingActive: boolean;
  readonly pbrMaterialActive: boolean;
  readonly shadowPassActive: boolean;
  readonly textureCount: number;
  readonly materialCount: number;
  readonly normalTextureActive: boolean;
  readonly cameraViewMode: "cinematic-follow";
  readonly movementValidation: AnimatedSceneSnapshot["movementValidation"] & {
    readonly rootMotionPolicy: "root-motion-required";
    readonly rootTranslationDistance?: number;
  };
}

export interface AnimatedSceneRenderer {
  start(): void;
  resize(width: number, height: number, devicePixelRatio?: number): void;
  renderOnce(timestamp?: number): AnimatedSceneSnapshot;
  getSnapshot(): AnimatedSceneSnapshot;
  setCamera(nextCamera?: Partial<AnimatedSceneCameraFollowRig>): void;
  setCameraViewMode(viewMode: "editor" | "spectator" | "third-person" | "first-person"): void;
  applyCameraControl(
    control: {
      readonly type?: "orbit" | "truck" | "pan" | "dolly" | "look";
      readonly deltaAzimuth?: number;
      readonly deltaPolar?: number;
      readonly deltaX?: number;
      readonly deltaY?: number;
      readonly deltaYaw?: number;
      readonly deltaPitch?: number;
      readonly distance?: number;
    },
    options?: { readonly activeControl?: boolean },
  ): void;
  destroy(): void;
}

export function createAnimatedSceneRenderer(options: CreateAnimatedSceneRendererOptions): AnimatedSceneRenderer;

export function createProfessionalAnimatedSceneRenderer(
  options: CreateProfessionalAnimatedSceneRendererOptions,
): Promise<{
  start(): void;
  resize(width: number, height: number, devicePixelRatio?: number): void;
  renderOnce(timestamp?: number): ProfessionalAnimatedSceneSnapshot;
  getSnapshot(): ProfessionalAnimatedSceneSnapshot;
  destroy(): void;
}>;

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

export interface WavefrontAdaptiveSamplingLevelConfig {
  readonly samplesPerPixel: number;
  readonly frameTimeBudgetMs: number;
  readonly minimumSamplesPerPixel: number;
}

export interface WavefrontAdaptiveSamplingLevel {
  readonly id: string;
  readonly label: string;
  readonly estimatedCostMs: number;
  readonly config: WavefrontAdaptiveSamplingLevelConfig;
}

export interface CreateWavefrontAdaptiveSamplingLevelsResult {
  readonly requestedSamplesPerPixel: number;
  readonly minimumSamplesPerPixel: number;
  readonly frameTimeBudgetMs: number;
  readonly levels: readonly WavefrontAdaptiveSamplingLevel[];
}

export interface WavefrontTextureSampleInput {
  readonly texCoord?: number;
  readonly scale?: number;
  readonly strength?: number;
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray | Uint8Array | readonly number[];
}

export interface WavefrontMediumInput {
  readonly id?: number;
  readonly mediumId?: number;
  readonly phaseModel?: number | "isotropic";
  readonly density?: number;
  readonly attenuationColor?: RendererColor | readonly number[];
  readonly attenuationDistance?: number;
  readonly absorption?: readonly [number, number, number] | readonly number[];
  readonly scattering?: readonly [number, number, number] | readonly number[];
}

export interface WavefrontMaterialExtensionTextureInputs {
  readonly clearcoat?: WavefrontTextureSampleInput | null;
  readonly clearcoatRoughness?: WavefrontTextureSampleInput | null;
  readonly clearcoatNormal?: WavefrontTextureSampleInput | null;
  readonly transmission?: WavefrontTextureSampleInput | null;
  readonly thickness?: WavefrontTextureSampleInput | null;
  readonly sheenColor?: WavefrontTextureSampleInput | null;
  readonly sheenRoughness?: WavefrontTextureSampleInput | null;
  readonly specular?: WavefrontTextureSampleInput | null;
  readonly specularColor?: WavefrontTextureSampleInput | null;
  readonly iridescence?: WavefrontTextureSampleInput | null;
  readonly iridescenceThickness?: WavefrontTextureSampleInput | null;
  readonly anisotropy?: WavefrontTextureSampleInput | null;
}

export interface WavefrontMaterialExtensions {
  readonly clearcoat: number;
  readonly clearcoatRoughness: number;
  readonly ior: number;
  readonly transmission: number;
  readonly volumeThickness: number;
  readonly sheenColor: readonly number[];
  readonly sheenRoughness: number;
  readonly specular: number;
  readonly specularColor: readonly number[];
  readonly iridescence: number;
  readonly iridescenceIor: number;
  readonly iridescenceThicknessMinimum: number;
  readonly iridescenceThicknessMaximum: number;
  readonly dispersion: number;
  readonly anisotropy: number;
  readonly anisotropyRotation: number;
  readonly unlit: boolean;
  readonly textures: WavefrontMaterialExtensionTextureInputs;
}

export interface WavefrontVolumeInput {
  readonly thickness?: number;
  readonly phaseModel?: number | "isotropic";
  readonly density?: number;
  readonly attenuationColor?: RendererColor | readonly number[];
  readonly attenuationDistance?: number;
  readonly absorption?: readonly [number, number, number] | readonly number[];
  readonly scattering?: readonly [number, number, number] | readonly number[];
}

export interface WavefrontCameraOptions {
  readonly position?: readonly [number, number, number] | readonly number[];
  readonly target?: readonly [number, number, number] | readonly number[];
  readonly up?: readonly [number, number, number] | readonly number[];
  readonly fovYDegrees?: number;
  readonly fov?: number;
}

export function createWavefrontAdaptiveSamplingLevels(options?: {
  readonly samplesPerPixel?: number;
  readonly frameTimeBudgetMs?: number;
  readonly minimumSamplesPerPixel?: number;
}): CreateWavefrontAdaptiveSamplingLevelsResult;

export interface WavefrontSceneObjectInput {
  readonly id?: number;
  readonly kind?: WavefrontSceneObjectKind;
  readonly type?: WavefrontSceneObjectKind;
  readonly materialKind?: WavefrontMaterialKind;
  readonly flags?: number;
  readonly mediumRefId?: number;
  readonly mediumId?: number;
  readonly medium?: WavefrontMediumInput | null;
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
  readonly sheen?: number;
  readonly sheenTint?: number;
  readonly sheenColor?: RendererColor | readonly number[];
  readonly clearcoat?: number;
  readonly clearcoatRoughness?: number;
  readonly specular?: number;
  readonly specularColor?: RendererColor | readonly number[];
  readonly thickness?: number;
  readonly transmission?: number;
  readonly volume?: WavefrontVolumeInput | null;
  readonly extensions?: Record<string, Record<string, unknown>>;
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
    readonly sheen?: number;
    readonly sheenTint?: number;
    readonly sheenColor?: RendererColor | readonly number[];
    readonly clearcoat?: number;
    readonly clearcoatRoughness?: number;
    readonly specular?: number;
    readonly specularColor?: RendererColor | readonly number[];
    readonly thickness?: number;
    readonly transmission?: number;
    readonly medium?: WavefrontMediumInput | null;
    readonly mediumId?: number;
    readonly volume?: WavefrontVolumeInput | null;
  };
}

export interface WavefrontSceneObject {
  readonly id: number;
  readonly kind: number;
  readonly materialKind: number;
  readonly flags: number;
  readonly mediumRefId: number;
  readonly medium: WavefrontMediumInput | null;
  readonly center: readonly [number, number, number] | readonly number[];
  readonly halfExtent: readonly [number, number, number] | readonly number[];
  readonly color: readonly [number, number, number, number] | readonly number[];
  readonly emission: readonly [number, number, number, number] | readonly number[];
  readonly roughness: number;
  readonly metallic: number;
  readonly opacity: number;
  readonly ior: number;
  readonly sheen: number;
  readonly sheenTint: number;
  readonly sheenColor: readonly [number, number, number, number] | readonly number[];
  readonly clearcoat: number;
  readonly clearcoatRoughness: number;
  readonly specular: number;
  readonly specularColor: readonly [number, number, number, number] | readonly number[];
  readonly thickness: number;
  readonly transmission: number;
  readonly materialExtensions: WavefrontMaterialExtensions;
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
  readonly sheen?: number;
  readonly sheenTint?: number;
  readonly sheenColor?: RendererColor | readonly number[];
  readonly clearcoat?: number;
  readonly clearcoatRoughness?: number;
  readonly specular?: number;
  readonly specularColor?: RendererColor | readonly number[];
  readonly thickness?: number;
  readonly transmission?: number;
  readonly volume?: WavefrontVolumeInput | null;
  readonly extensions?: Record<string, Record<string, unknown>>;
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
    readonly sheen?: number;
    readonly sheenTint?: number;
    readonly sheenColor?: RendererColor | readonly number[];
    readonly clearcoat?: number;
    readonly clearcoatRoughness?: number;
    readonly specular?: number;
    readonly specularColor?: RendererColor | readonly number[];
    readonly thickness?: number;
    readonly transmission?: number;
    readonly id?: number;
    readonly medium?: WavefrontMediumInput | null;
    readonly mediumId?: number;
    readonly volume?: WavefrontVolumeInput | null;
    readonly extensions?: Record<string, Record<string, unknown>>;
    readonly baseColorTexture?: WavefrontTextureSampleInput | null;
    readonly metallicRoughnessTexture?: WavefrontTextureSampleInput | null;
    readonly normalTexture?: WavefrontTextureSampleInput | null;
    readonly occlusionTexture?: WavefrontTextureSampleInput | null;
    readonly emissiveTexture?: WavefrontTextureSampleInput | null;
  };
  readonly baseColorTexture?: WavefrontTextureSampleInput | null;
  readonly metallicRoughnessTexture?: WavefrontTextureSampleInput | null;
  readonly normalTexture?: WavefrontTextureSampleInput | null;
  readonly occlusionTexture?: WavefrontTextureSampleInput | null;
  readonly emissiveTexture?: WavefrontTextureSampleInput | null;
  readonly medium?: WavefrontMediumInput | null;
  readonly extensions?: Record<string, Record<string, unknown>>;
}

export interface WavefrontTriangleRecord {
  readonly triangleId: number;
  readonly meshId: number;
  readonly materialKind: number;
  readonly flags: number;
  readonly materialRefId: number;
  readonly mediumRefId: number;
  readonly materialSlot?: number;
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
  readonly materialResponse: readonly number[];
  readonly materialExtension?: readonly number[];
  readonly materialExtension2?: readonly number[];
  readonly materialExtension3?: readonly number[];
  readonly specularColor?: readonly number[];
  readonly baseColorAtlas?: readonly number[];
  readonly metallicRoughnessAtlas?: readonly number[];
  readonly normalAtlas?: readonly number[];
  readonly occlusionAtlas?: readonly number[];
  readonly emissiveAtlas?: readonly number[];
  readonly textureSettings?: readonly number[];
  readonly extensionTextures?: Readonly<Record<string, readonly number[]>>;
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
  readonly mediumStackDepth: number;
  readonly mediumStack: readonly [number, number, number, number] | readonly number[];
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
  readonly materialResponse: readonly number[];
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
      readonly medium: WavefrontMediumInput | null;
      readonly color: readonly number[];
      readonly emission: readonly number[];
      readonly roughness: number;
      readonly metallic: number;
      readonly opacity: number;
      readonly ior: number;
      readonly sheen: number;
      readonly sheenTint: number;
      readonly sheenColor: readonly [number, number, number, number] | readonly number[];
      readonly clearcoat: number;
      readonly clearcoatRoughness: number;
      readonly specular: number;
      readonly specularColor: readonly [number, number, number, number] | readonly number[];
      readonly thickness: number;
      readonly transmission: number;
      readonly baseColorTexture: WavefrontTextureSampleInput | null;
      readonly metallicRoughnessTexture: WavefrontTextureSampleInput | null;
      readonly normalTexture: WavefrontTextureSampleInput | null;
      readonly occlusionTexture: WavefrontTextureSampleInput | null;
      readonly emissiveTexture: WavefrontTextureSampleInput | null;
    }>[];
    readonly count: number;
    readonly recordBytes: number;
  }>;
  readonly triangleCount: number;
  readonly bvhNodeCapacity: number;
}

export interface WavefrontGpuTextureAtlasSource {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
  readonly defaultRect: readonly [number, number, number, number] | readonly number[];
}

export interface WavefrontGpuMaterialSource {
  readonly buffer: ArrayBuffer;
  readonly count: number;
  readonly recordBytes: number;
  readonly baseColorAtlas: WavefrontGpuTextureAtlasSource;
  readonly metallicRoughnessAtlas: WavefrontGpuTextureAtlasSource;
  readonly normalAtlas: WavefrontGpuTextureAtlasSource;
  readonly occlusionAtlas: WavefrontGpuTextureAtlasSource;
  readonly emissiveAtlas: WavefrontGpuTextureAtlasSource;
  readonly extensionAtlases: Readonly<
    Record<string, WavefrontGpuTextureAtlasSource>
  >;
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

export interface WavefrontEnvironmentMapInput {
  readonly enabled?: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly mipLevelCount?: number;
  readonly projection?: "equirectangular" | string;
  readonly format?: GPUTextureFormat | "rgba16float";
  readonly texture?: GPUTexture;
  readonly view?: GPUTextureView;
  readonly sampler?: GPUSampler;
  readonly data?: readonly number[] | Float32Array | Uint16Array | Uint8Array;
  readonly intensity?: number;
  readonly radianceScale?: number;
  readonly rotationRadians?: number;
  readonly rotation?: number;
  readonly ambientStrength?: number;
  readonly hasImportanceData?: boolean;
}

export interface WavefrontEnvironmentMapSnapshot {
  readonly enabled: boolean;
  readonly width: number;
  readonly height: number;
  readonly mipLevelCount: number;
  readonly projection: string;
  readonly intensity: number;
  readonly rotationRadians: number;
  readonly ambientStrength: number;
  readonly hasImportanceData: boolean;
}

export interface WavefrontPathTracingComputeConfig {
  readonly mode: typeof rendererWavefrontComputeMode;
  readonly width: number;
  readonly height: number;
  readonly maxDepth: number;
  readonly tileSize: number;
  readonly samplesPerPixel: number;
  readonly maxFramePassesPerSubmission: number;
  readonly tilePixelCapacity: number;
  readonly sceneObjects: readonly WavefrontSceneObject[];
  readonly sceneObjectCount: number;
  readonly sceneObjectCapacity: number;
  readonly mediums: readonly Readonly<{
    readonly id: number;
    readonly phaseModel: number;
    readonly density: number;
    readonly attenuationColor: readonly [number, number, number, number] | readonly number[];
    readonly attenuationDistance: number;
    readonly absorption: readonly [number, number, number] | readonly number[];
    readonly scattering: readonly [number, number, number] | readonly number[];
  }>[];
  readonly mediumCount: number;
  readonly accelerationBuildMode: WavefrontAccelerationBuildMode;
  readonly gpuAccelerationBuildRequired: boolean;
  readonly gpuMeshSource: WavefrontGpuMeshSource;
  readonly gpuMaterialSource: WavefrontGpuMaterialSource;
  readonly meshAcceleration: WavefrontMeshAcceleration;
  readonly emissiveTriangleIndices: WavefrontEmissiveTriangleIndexSource;
  readonly emissiveTriangleCount: number;
  readonly emissiveTriangleCapacity: number;
  readonly environmentPortals: readonly WavefrontEnvironmentPortalRecord[];
  readonly environmentPortalCount: number;
  readonly environmentPortalCapacity: number;
  readonly environmentPortalMode: 0 | 1 | 2;
  readonly environmentMap: WavefrontEnvironmentMapInput;
  readonly deferredPathResolve: boolean;
  readonly strictPhysicalLowSppLighting: boolean;
  readonly transportExperiments: WavefrontTransportExperimentState;
  readonly transportExperimentFlags: number;
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

export interface WavefrontRendererFeatureFlags {
  readonly "renderer.transport.strictPhysicalLowSppLighting"?: boolean;
  readonly "renderer.transport.stableSampleRouting.enabled"?: boolean;
  readonly "renderer.transport.strictZeroOverflow.enabled"?: boolean;
  readonly "renderer.transport.deferLowSppRussianRoulette.enabled"?: boolean;
  readonly "renderer.transport.deterministicDirectLighting.enabled"?: boolean;
  readonly "renderer.transport.sourceStableDirectLighting.enabled"?: boolean;
  readonly "renderer.transport.deterministicLowSppIndirect.enabled"?: boolean;
  readonly "renderer.environment.productStudioImportance.enabled"?: boolean;
  readonly "renderer.diagnostics.productTransportTelemetry.enabled"?: boolean;
  readonly enabled?: {
    readonly "renderer.transport.strictPhysicalLowSppLighting"?: boolean;
    readonly "renderer.transport.stableSampleRouting.enabled"?: boolean;
    readonly "renderer.transport.strictZeroOverflow.enabled"?: boolean;
    readonly "renderer.transport.deferLowSppRussianRoulette.enabled"?: boolean;
    readonly "renderer.transport.deterministicDirectLighting.enabled"?: boolean;
    readonly "renderer.transport.sourceStableDirectLighting.enabled"?: boolean;
    readonly "renderer.transport.deterministicLowSppIndirect.enabled"?: boolean;
    readonly "renderer.environment.productStudioImportance.enabled"?: boolean;
    readonly "renderer.diagnostics.productTransportTelemetry.enabled"?: boolean;
  };
  readonly flags?: {
    readonly "renderer.transport.strictPhysicalLowSppLighting"?: boolean;
    readonly "renderer.transport.stableSampleRouting.enabled"?: boolean;
    readonly "renderer.transport.strictZeroOverflow.enabled"?: boolean;
    readonly "renderer.transport.deferLowSppRussianRoulette.enabled"?: boolean;
    readonly "renderer.transport.deterministicDirectLighting.enabled"?: boolean;
    readonly "renderer.transport.sourceStableDirectLighting.enabled"?: boolean;
    readonly "renderer.transport.deterministicLowSppIndirect.enabled"?: boolean;
    readonly "renderer.environment.productStudioImportance.enabled"?: boolean;
    readonly "renderer.diagnostics.productTransportTelemetry.enabled"?: boolean;
  };
  readonly renderer?: {
    readonly transport?: {
      readonly strictPhysicalLowSppLighting?: boolean;
      readonly stableSampleRouting?: boolean;
      readonly strictZeroOverflow?: boolean;
      readonly deferLowSppRussianRoulette?: boolean;
      readonly deterministicDirectLighting?: boolean;
      readonly sourceStableDirectLighting?: boolean | { readonly enabled?: boolean };
      readonly deterministicLowSppIndirect?: boolean | { readonly enabled?: boolean };
    };
    readonly environment?: {
      readonly productStudioImportance?: boolean;
    };
    readonly diagnostics?: {
      readonly productTransportTelemetry?: boolean;
    };
  };
}

export interface WavefrontTransportExperimentFlags {
  readonly stableSampleRouting: boolean;
  readonly strictZeroOverflow: boolean;
  readonly deferLowSppRussianRoulette: boolean;
  readonly deterministicDirectLighting: boolean;
  readonly productStudioImportance: boolean;
  readonly productTransportTelemetry: boolean;
  readonly sourceStableDirectLighting: boolean;
  readonly deterministicLowSppIndirect: boolean;
}

export interface WavefrontTransportExperimentState {
  readonly requested: WavefrontTransportExperimentFlags;
  readonly effective: WavefrontTransportExperimentFlags;
  readonly bitmask: number;
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
  readonly sunlitBaseline?: number;
  readonly daylightBaseline?: number;
  readonly environmentPortals?: readonly WavefrontEnvironmentPortalInput[];
  readonly environmentPortalMode?: WavefrontEnvironmentPortalMode;
  readonly environmentMap?: WavefrontEnvironmentMapInput;
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
  readonly sunlitBaseline: number;
}

export interface WavefrontPathTracingMemoryEstimate {
  readonly queueBytes: number;
  readonly queuePairBytes: number;
  readonly hitBytes: number;
  readonly accumulationBytes: number;
  readonly pathVertexBytes: number;
  readonly sceneObjectBytes: number;
  readonly triangleBytes: number;
  readonly materialTableBytes: number;
  readonly bvhNodeBytes: number;
  readonly bvhLeafReferenceBytes: number;
  readonly emissiveTriangleMetadataBytes: number;
  readonly environmentPortalBytes: number;
  readonly configBytes: number;
  readonly counterBytes: number;
  readonly indirectDispatchBytes: number;
  readonly totalHotBufferBytes: number;
}

export interface WavefrontGpuParallelismDiagnostics {
  readonly physicalCoreCount: number | null;
  readonly physicalCoreCountAvailable: boolean;
  readonly physicalCoreCountUnavailableReason: string;
  readonly adapterInfo: Readonly<{
    readonly vendor: string;
    readonly architecture: string;
    readonly device: string;
    readonly description: string;
  }> | null;
  readonly adapterLimits: Readonly<{
    readonly maxComputeInvocationsPerWorkgroup: number | null;
    readonly maxComputeWorkgroupSizeX: number | null;
    readonly maxComputeWorkgroupSizeY: number | null;
    readonly maxComputeWorkgroupSizeZ: number | null;
    readonly maxComputeWorkgroupsPerDimension: number | null;
    readonly maxStorageBuffersPerShaderStage: number | null;
    readonly maxSampledTexturesPerShaderStage: number | null;
    readonly maxStorageBufferBindingSize: number | null;
  }>;
  readonly configuredWorkgroupSize: number;
  readonly directDispatches: number;
  readonly directWorkgroups: number;
  readonly directShaderInvocations: number;
  readonly multiWorkgroupDispatches: number;
  readonly largestDirectWorkgroupsPerDispatch: number;
  readonly indirectDispatches: number;
  readonly estimatedIndirectWorkgroupsUpperBound: number;
  readonly estimatedIndirectShaderInvocationsUpperBound: number;
  readonly indirectDispatchesWithMultiWorkgroupCapacity: number;
  readonly largestEstimatedIndirectWorkgroupsPerDispatch: number;
  readonly totalEstimatedWorkgroupsUpperBound: number;
  readonly totalEstimatedShaderInvocationsUpperBound: number;
  readonly exposesMultiWorkgroupParallelism: boolean;
  readonly likelyUsesMoreThanOnePhysicalGpuCore: boolean | null;
  readonly coreUtilizationStatus: "not-exposed-by-webgpu";
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
  readonly maxFramePassesPerSubmission?: number;
  readonly tilePixelCapacity?: number;
  readonly sceneObjectCapacity?: number;
  readonly sceneObjects?: readonly WavefrontSceneObjectInput[];
  readonly mediums?: readonly WavefrontMediumInput[];
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
  readonly environmentMap?: WavefrontEnvironmentMapInput;
  readonly environmentTexture?: WavefrontEnvironmentMapInput;
  readonly deferredPathResolve?: boolean;
  readonly deferredResolve?: boolean;
  readonly pathResolve?: { readonly deferred?: boolean };
  readonly accelerationBuildMode?: WavefrontAccelerationBuildMode;
  readonly camera?: WavefrontCameraOptions;
  readonly environmentColor?: readonly [number, number, number, number?] | readonly number[];
  readonly ambientColor?: readonly [number, number, number, number?] | readonly number[];
  readonly environmentLighting?: WavefrontEnvironmentLightingInput;
  readonly displayQuality?: boolean;
  readonly denoise?: boolean;
  readonly presentationOutput?: "tone-mapped" | "linear";
  readonly strictPhysicalLowSppLighting?: boolean;
  readonly "renderer.transport.stableSampleRouting.enabled"?: boolean;
  readonly "renderer.transport.strictZeroOverflow.enabled"?: boolean;
  readonly "renderer.transport.deferLowSppRussianRoulette.enabled"?: boolean;
  readonly "renderer.transport.deterministicDirectLighting.enabled"?: boolean;
  readonly "renderer.transport.sourceStableDirectLighting.enabled"?: boolean;
  readonly "renderer.transport.deterministicLowSppIndirect.enabled"?: boolean;
  readonly "renderer.environment.productStudioImportance.enabled"?: boolean;
  readonly "renderer.diagnostics.productTransportTelemetry.enabled"?: boolean;
  readonly featureFlags?: WavefrontRendererFeatureFlags;
  readonly frameIndex?: number;
}

export interface WavefrontPathTracingComputeRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly context: GPUCanvasContext;
  readonly device: GPUDevice;
  readonly format: GPUTextureFormat | string;
  readonly config: WavefrontPathTracingComputeConfig;
  renderOnce(): WavefrontPathTracingComputeFrameStats;
  renderFrame(options?: {
    readStats?: boolean;
    readOutputProbe?: boolean;
    awaitGPUCompletion?: boolean;
    submittedWorkTimeoutMs?: number;
    samplesPerPixel?: number;
    minimumSamplesPerPixel?: number;
    frameTimeBudgetMs?: number;
    probe?: { x?: number; y?: number };
  }): Promise<WavefrontPathTracingComputeFrameStats>;
  readOutputProbe(options?: { x?: number; y?: number }): Promise<
    Readonly<{
      x: number;
      y: number;
      rgba: readonly number[];
      luminance: number;
    }>
  >;
  updateSceneObjects(sceneObjects: readonly WavefrontSceneObjectInput[]): WavefrontPathTracingComputeConfig;
  updateCamera(camera: WavefrontCameraOptions): WavefrontPathTracingComputeConfig;
  getSnapshot(): Readonly<{
    frame: number;
    width: number;
    height: number;
    maxDepth: number;
    tiles: number;
    tileSize: number;
    samplesPerPixel: number;
    maxFramePassesPerSubmission: number;
    sceneObjectCount: number;
    triangleCount: number;
    emissiveTriangleCount: number;
    environmentPortalCount: number;
    environmentPortalMode: 0 | 1 | 2;
    mediumCount: number;
    environmentMap: WavefrontEnvironmentMapSnapshot;
    deferredPathResolve: boolean;
    strictPhysicalLowSppLighting: boolean;
    transportExperiments: WavefrontTransportExperimentState;
    transportExperimentFlags: number;
    bvhNodeCount: number;
    displayQuality: boolean;
    accelerationBuildMode: WavefrontAccelerationBuildMode;
    gpuAccelerationBuildRequired: boolean;
    accelerationBuilt: boolean;
    accelerationBuildCount: number;
    frameConfigSlots: number;
    gpuParallelism: WavefrontGpuParallelismDiagnostics;
    memory: WavefrontPathTracingMemoryEstimate;
  }>;
  destroy(): void;
}

export interface WavefrontPathTracingComputeFrameStats {
  readonly frame: number;
  readonly width: number;
  readonly height: number;
  readonly maxDepth: number;
  readonly tiles: number;
  readonly tileSize: number;
  readonly samplesPerPixel: number;
  readonly renderedSamplesPerPixel: number;
  readonly frameTimeBudgetMs: number | null;
  readonly budgetConstrained: boolean;
  readonly maxFramePassesPerSubmission: number;
  readonly screenRays: number;
  readonly primaryRays: number;
  readonly sceneObjectCount: number;
  readonly triangleCount: number;
  readonly emissiveTriangleCount: number;
  readonly environmentPortalCount: number;
  readonly environmentPortalMode: 0 | 1 | 2;
  readonly mediumCount: number;
  readonly environmentMap: WavefrontEnvironmentMapSnapshot;
  readonly deferredPathResolve: boolean;
  readonly strictPhysicalLowSppLighting: boolean;
  readonly transportExperiments: WavefrontTransportExperimentState;
  readonly transportExperimentFlags: number;
  readonly bvhNodeCount: number;
  readonly displayQuality: boolean;
  readonly accelerationBuildMode: WavefrontAccelerationBuildMode;
  readonly gpuAccelerationBuildRequired: boolean;
  readonly accelerationBuildSubmitted: boolean;
  readonly accelerationBuilt: boolean;
  readonly accelerationBuildCount: number;
  readonly commandSubmissions: number;
  readonly deviceLossStatus?: "not-detected" | "pending" | "not-exposed" | "lost";
  readonly gpuWorkerJobs: Readonly<{
    completedPerFrame: number;
    completedPerSecond: number | null;
    completedPerSubmission: number;
    directDispatchesCompleted: number;
    indirectDispatchesCompleted: number;
    frameTimeMs: number;
    awaitedGpuCompletion: boolean;
  }>;
  readonly transportGuardrails?: Readonly<{
    status: "pass" | "warn" | "fail";
    thresholds: Readonly<{
      maxPerJobRegressionRatio: number;
    }>;
    current: Readonly<{
      jobsPerFrame: number;
      jobsPerSecond: number | null;
      jobsPerSubmission: number;
      commandSubmissions: number;
      frameTimeMs: number;
      awaitedGpuCompletion: boolean;
      maxFramePassesPerSubmission: number;
      queueOverflow: number;
      deviceLossStatus: "not-detected" | "pending" | "not-exposed" | "lost";
      radianceDiagnostics: Readonly<{
        invalidSamples: number;
        legacyClampEquivalentSamples: number;
      }>;
      memory: Readonly<{
        totalBytes: number;
        breakdown: WavefrontPathTracingMemoryEstimate | null;
      }>;
    }>;
    checks: readonly Readonly<{
      id: string;
      status: "pass" | "warn" | "fail";
      details: string;
    }>[];
  }>;
  readonly frameConfigSlots: number;
  readonly gpuParallelism: WavefrontGpuParallelismDiagnostics;
  readonly memory: WavefrontPathTracingMemoryEstimate;
  readonly outputProbe?: Readonly<{
    x: number;
    y: number;
    rgba: readonly number[];
    luminance: number;
    sampledPixels: number;
    nonZeroSamples: number;
    maxChannel: number;
  }> | null;
  readonly bounces?: readonly unknown[];
  readonly termination?: Readonly<{
    emissive: number;
    environment: number;
    ambientFallback: number;
    maxDepth: number;
    absorptionNull: number;
    russianRoulette: number;
    strictMaxDepth: number;
    deterministicResidualZero: number;
  }>;
  readonly terminalRadiance?: Readonly<{
    totalLuminance: number;
    ambientResidualLuminance: number;
    ambientResidualShare: number;
  }>;
  readonly radianceDiagnostics?: Readonly<{
    invalidSamples: number;
    legacyClampEquivalentSamples: number;
  }>;
  readonly transportContributions?: Readonly<{
    directExplicitLuminance: number;
    cachedIndirectLuminance: number;
    stochasticResidualLuminance: number;
    zeroTerminationCount: number;
    deterministicChecksum: number;
  }>;
  readonly queueOverflow?: number;
}

export function normalizeWavefrontSceneObject(
  input?: WavefrontSceneObjectInput,
  index?: number
): WavefrontSceneObject;
export function createWavefrontGpuMaterialSource(
  meshes?: readonly WavefrontMeshInput[] | WavefrontMeshInput
): WavefrontGpuMaterialSource;
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
  sheen: number;
  sheenTint: number;
  sheenColor: readonly [number, number, number, number] | readonly number[];
  clearcoat: number;
  clearcoatRoughness: number;
  specular: number;
  specularColor: readonly [number, number, number, number] | readonly number[];
  transmission: number;
  baseColorTexture: WavefrontTextureSampleInput | null;
  metallicRoughnessTexture: WavefrontTextureSampleInput | null;
  normalTexture: WavefrontTextureSampleInput | null;
  occlusionTexture: WavefrontTextureSampleInput | null;
}>;
export function createWavefrontMeshAcceleration(
  meshes?: readonly WavefrontMeshInput[] | WavefrontMeshInput
): WavefrontMeshAcceleration;
export function createWavefrontGpuMeshSource(
  meshes?: readonly WavefrontMeshInput[] | WavefrontMeshInput,
  gpuMaterialSource?: WavefrontGpuMaterialSource | null
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
export const MAX_MEDIUM_STACK_DEPTH: 4;
export const MAX_TRANSPORT_BRANCHES: 2;
export const DEFAULT_SPECTRAL_WAVELENGTHS: readonly number[];
export function createMediumStack(
  mediumIds?: readonly number[],
  maxDepth?: number
): readonly number[];
export function currentMediumId(stack?: readonly number[] | null): number;
export function enterMediumStack(
  stack: readonly number[] | null | undefined,
  mediumId: number,
  maxDepth?: number
): Readonly<{ stack: readonly number[]; mediumId: number; overflowed: boolean }>;
export function exitMediumStack(
  stack: readonly number[] | null | undefined,
  mediumId: number,
  maxDepth?: number
): Readonly<{ stack: readonly number[]; mediumId: number; matched: boolean }>;
export function transitionMediumStack(
  stack: readonly number[] | null | undefined,
  mediumId: number,
  entering: boolean,
  maxDepth?: number
): Readonly<{ stack: readonly number[]; mediumId: number; matched?: boolean; overflowed?: boolean }>;
export function beerLambertTransmittance(
  medium: WavefrontMediumInput | null | undefined,
  distance: number
): readonly [number, number, number];
export function resolveSpectralIor(
  ior: number,
  dispersion?: number,
  wavelengthNm?: number,
  referenceWavelengthNm?: number
): number;
export function createSpectralSamples(options?: {
  ior?: number;
  dispersion?: number;
  wavelengths?: readonly number[];
}): readonly Readonly<{
  wavelengthNm: number;
  ior: number;
  weight: number;
}>[];
export function createTransportBranches(options?: Record<string, unknown>): readonly Readonly<Record<string, unknown>>[];
export function normalizeWavefrontMaterialExtensions(
  input?: Record<string, unknown> | null
): WavefrontMaterialExtensions;
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
export function renderWavefrontPathTracingComputeFrame(
  options?: CreateWavefrontPathTracingComputeRendererOptions & {
    readStats?: boolean;
    readOutputProbe?: boolean;
  }
): Promise<WavefrontPathTracingComputeFrameStats>;
export function createWavefrontPathTracingComputeShaderSource(options?: {
  workgroupSize?: number;
  outputTextureFormat?: GPUTextureFormat | "rgba8unorm";
}): string;

export const rendererWavefrontComputeMode: "webgpu-compute";
export const rendererWavefrontComputeWorkgroupSize: 64;
export const rendererWavefrontComputeStatsStride: 8;

export const wavefrontPathTracingComputeLimits: Readonly<{
  workgroupSize: 64;
  traceStorageBufferBindings: number;
  traceSampledTextureBindings: number;
  rayRecordBytes: 96;
  hitRecordBytes: 256;
  sceneObjectRecordBytes: 160;
  meshVertexRecordBytes: 48;
  meshRangeRecordBytes: 240;
  triangleRecordBytes: 576;
  materialRecordBytes: 192;
  bvhNodeRecordBytes: 48;
  bvhLeafReferenceRecordBytes: 16;
  emissiveTriangleIndexBytes: 4;
  emissiveTriangleMetadataRecordBytes: 48;
  environmentPortalRecordBytes: 96;
  accumulationRecordBytes: 16;
  pathVertexRecordBytes: 16;
  counterRecordBytes: 128;
  indirectDispatchRecordBytes: 12;
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
