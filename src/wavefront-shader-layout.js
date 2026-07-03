import { WAVEFRONT_SAMPLE_DIMENSIONS_WGSL } from "./wavefront-sampling-dimensions.js";

export const WAVEFRONT_SHADER_LAYOUT_WGSL = `
const RAY_FLAG_GUIDED_EMISSIVE: u32 = 1u;
const RAY_FLAG_DELTA_SAMPLE: u32 = 2u;
const DIRECT_LIGHT_FLAG_DELTA: u32 = 1u;
const DIRECT_LIGHT_FLAG_PHYSICAL_SUN: u32 = 2u;
const SCATTER_LOBE_DIFFUSE: u32 = 1u;
const SCATTER_LOBE_SPECULAR: u32 = 2u;
const SCATTER_LOBE_CLEARCOAT: u32 = 3u;
const SCATTER_LOBE_DELTA_REFLECTION: u32 = 4u;
const SCATTER_LOBE_DELTA_TRANSMISSION: u32 = 5u;
${WAVEFRONT_SAMPLE_DIMENSIONS_WGSL}

struct RayRecord {
  rayId: u32,
  parentRayId: u32,
  sourcePixelId: u32,
  sampleId: u32,
  bounce: u32,
  mediumRefId: u32,
  flags: u32,
  pad0: u32,
  origin: vec4<f32>,
  direction: vec4<f32>,
  throughput: vec4<f32>,
};

struct HitRecord {
  rayId: u32,
  sourcePixelId: u32,
  hitType: u32,
  objectId: u32,
  materialKind: u32,
  frontFace: u32,
  primitiveId: u32,
  materialRefId: u32,
  mediumRefId: u32,
  materialSlot: u32,
  pad0: u32,
  pad1: u32,
  distance: f32,
  occlusion: f32,
  pad2: vec2<f32>,
  position: vec4<f32>,
  geometricNormal: vec4<f32>,
  shadingNormal: vec4<f32>,
  barycentric: vec4<f32>,
  uv: vec4<f32>,
  color: vec4<f32>,
  emission: vec4<f32>,
  material: vec4<f32>,
  materialResponse: vec4<f32>,
  materialExtension: vec4<f32>,
  specularColor: vec4<f32>,
};

struct SceneObject {
  kind: u32,
  objectId: u32,
  materialKind: u32,
  flags: u32,
  mediumRefId: u32,
  pad0: u32,
  pad1: u32,
  pad2: u32,
  center: vec4<f32>,
  halfExtent: vec4<f32>,
  color: vec4<f32>,
  emission: vec4<f32>,
  material: vec4<f32>,
  materialResponse: vec4<f32>,
  materialExtension: vec4<f32>,
  specularColor: vec4<f32>,
};

struct TriangleRecord {
  triangleId: u32,
  meshId: u32,
  materialKind: u32,
  flags: u32,
  materialRefId: u32,
  mediumRefId: u32,
  materialSlot: u32,
  pad1: u32,
  v0: vec4<f32>,
  v1: vec4<f32>,
  v2: vec4<f32>,
  n0: vec4<f32>,
  n1: vec4<f32>,
  n2: vec4<f32>,
  uv0uv1: vec4<f32>,
  uv2Pad: vec4<f32>,
  color: vec4<f32>,
  emission: vec4<f32>,
  material: vec4<f32>,
  materialResponse: vec4<f32>,
  materialExtension: vec4<f32>,
  specularColor: vec4<f32>,
  baseColorAtlas: vec4<f32>,
  metallicRoughnessAtlas: vec4<f32>,
  normalAtlas: vec4<f32>,
  occlusionAtlas: vec4<f32>,
  emissiveAtlas: vec4<f32>,
  textureSettings: vec4<f32>,
};

struct BvhNode {
  boundsMin: vec4<f32>,
  boundsMax: vec4<f32>,
  childOrFirst: u32,
  triangleCount: u32,
  rightChild: u32,
  pad0: u32,
};

struct BvhLeafRef {
  key: u32,
  triangleIndex: u32,
  pad0: u32,
  pad1: u32,
};

struct ScatterResult {
  direction: vec4<f32>,
  pdf: f32,
  mediumRefId: u32,
  flags: u32,
  lobeKind: u32,
};

struct MeshVertex {
  position: vec4<f32>,
  normal: vec4<f32>,
  uv: vec4<f32>,
};

struct MeshRange {
  meshId: u32,
  materialKind: u32,
  flags: u32,
  materialRefId: u32,
  mediumRefId: u32,
  firstIndex: u32,
  indexCount: u32,
  firstTriangle: u32,
  triangleCount: u32,
  firstVertex: u32,
  vertexCount: u32,
  materialSlot: u32,
  color: vec4<f32>,
  emission: vec4<f32>,
  material: vec4<f32>,
  materialResponse: vec4<f32>,
  materialExtension: vec4<f32>,
  specularColor: vec4<f32>,
  baseColorAtlas: vec4<f32>,
  metallicRoughnessAtlas: vec4<f32>,
  normalAtlas: vec4<f32>,
  occlusionAtlas: vec4<f32>,
  emissiveAtlas: vec4<f32>,
  textureSettings: vec4<f32>,
};

struct FrameConfig {
  canvasWidth: u32,
  canvasHeight: u32,
  tileX: u32,
  tileY: u32,
  tileWidth: u32,
  tileHeight: u32,
  tilePixelCount: u32,
  maxDepth: u32,
  sceneObjectCount: u32,
  frameIndex: u32,
  denoise: u32,
  triangleCount: u32,
  bvhNodeCount: u32,
  displayQuality: u32,
  meshSourceCount: u32,
  bvhNodeCapacity: u32,
  cameraPosition: vec4<f32>,
  cameraForward: vec4<f32>,
  cameraRight: vec4<f32>,
  cameraUp: vec4<f32>,
  projectionAndSampling: vec4<f32>,
  environmentColor: vec4<f32>,
  ambientColor: vec4<f32>,
  environmentHorizonColor: vec4<f32>,
  environmentZenithColor: vec4<f32>,
  environmentSunDirectionIntensity: vec4<f32>,
  environmentSunColor: vec4<f32>,
  bvhBuildNodeStart: u32,
  bvhBuildNodeCount: u32,
  bvhSortItemCount: u32,
  emissiveTriangleCount: u32,
  environmentPortalCount: u32,
  environmentPortalMode: u32,
  samplesPerPixel: u32,
  transportExperimentFlags: u32,
  environmentMapSettings: vec4<f32>,
  pathResolveSettings: vec4<f32>,
  environmentMapMeta: vec4<f32>,
};

struct TerminationMetrics {
  emissiveCount: atomic<u32>,
  environmentCount: atomic<u32>,
  ambientMaxDepthCount: atomic<u32>,
  ambientQueueOverflowCount: atomic<u32>,
  ambientResidualLuminanceScaled: atomic<u32>,
  totalTerminalLuminanceScaled: atomic<u32>,
  invalidSampleCount: atomic<u32>,
  legacyClampEquivalentCount: atomic<u32>,
  absorptionNullCount: atomic<u32>,
  russianRouletteCount: atomic<u32>,
  strictMaxDepthCount: atomic<u32>,
  strictPad0: atomic<u32>,
};

const TERMINAL_SOURCE_KIND_EMISSIVE = 1u;
const TERMINAL_SOURCE_KIND_ENVIRONMENT = 2u;
const TERMINAL_SOURCE_KIND_AMBIENT_MAX_DEPTH = 3u;
const TERMINAL_SOURCE_KIND_AMBIENT_QUEUE_OVERFLOW = 4u;
const TERMINAL_SOURCE_KIND_ABSORPTION_NULL = 5u;
const TERMINAL_SOURCE_KIND_RUSSIAN_ROULETTE = 6u;
const TERMINAL_SOURCE_KIND_MAX_DEPTH_STRICT = 7u;
const TERMINATION_LUMINANCE_SCALE = 1000000.0;
const TRANSPORT_EXPERIMENT_STABLE_SAMPLE_ROUTING = 1u;
const TRANSPORT_EXPERIMENT_STRICT_ZERO_OVERFLOW = 2u;
const TRANSPORT_EXPERIMENT_DEFER_LOW_SPP_RUSSIAN_ROULETTE = 4u;
const TRANSPORT_EXPERIMENT_DETERMINISTIC_DIRECT_LIGHTING = 8u;
const TRANSPORT_EXPERIMENT_PRODUCT_STUDIO_IMPORTANCE = 16u;
const TRANSPORT_EXPERIMENT_PRODUCT_TRANSPORT_TELEMETRY = 32u;
const TRANSPORT_EXPERIMENT_SOURCE_STABLE_DIRECT_LIGHTING = 64u;

struct Counters {
  activeCount: atomic<u32>,
  nextCount: atomic<u32>,
  terminatedCount: atomic<u32>,
  hitCount: atomic<u32>,
  dispatchX: u32,
  dispatchY: u32,
  dispatchZ: u32,
  dispatchPad: u32,
  termination: TerminationMetrics,
};

struct Candidate {
  hit: u32,
  distance: f32,
  geometricNormal: vec3<f32>,
  shadingNormal: vec3<f32>,
  barycentric: vec3<f32>,
  uv: vec2<f32>,
  frontFace: u32,
  triangleIndex: u32,
  primitiveId: u32,
  materialRefId: u32,
  mediumRefId: u32,
};

struct EnvironmentPortal {
  kind: u32,
  flags: u32,
  _pad0: u32,
  _pad1: u32,
  position: vec4<f32>,
  normal: vec4<f32>,
  tangent: vec4<f32>,
  bitangent: vec4<f32>,
  color: vec4<f32>,
};

@group(0) @binding(0) var<storage, read_write> activeQueue: array<RayRecord>;
@group(0) @binding(1) var<storage, read_write> nextQueue: array<RayRecord>;
@group(0) @binding(2) var<storage, read_write> hits: array<HitRecord>;
@group(0) @binding(3) var<storage, read_write> accumulation: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read> sceneObjects: array<SceneObject>;
@group(0) @binding(5) var<uniform> config: FrameConfig;
@group(0) @binding(6) var<storage, read_write> counters: Counters;
@group(0) @binding(7) var outputImage: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(8) var<storage, read_write> triangles: array<TriangleRecord>;
@group(0) @binding(9) var<storage, read_write> bvhNodes: array<BvhNode>;
@group(0) @binding(10) var<storage, read> meshVertices: array<MeshVertex>;
@group(0) @binding(11) var<storage, read> meshIndices: array<u32>;
@group(0) @binding(12) var<storage, read> meshRanges: array<MeshRange>;
@group(0) @binding(13) var<storage, read_write> bvhLeafRefs: array<BvhLeafRef>;
@group(0) @binding(14) var denoiseInputRadiance: texture_2d<f32>;
@group(0) @binding(15) var denoisedRadianceImage: texture_storage_2d<rgba16float, write>;
@group(0) @binding(16) var radianceImage: texture_storage_2d<rgba16float, write>;
@group(0) @binding(17) var finalDenoiseInputRadiance: texture_2d<f32>;
@group(0) @binding(18) var denoisedOutputImage: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(19) var<storage, read> environmentPortals: array<EnvironmentPortal>;
@group(0) @binding(20) var environmentMapTexture: texture_2d<f32>;
@group(0) @binding(21) var environmentMapSampler: sampler;
@group(0) @binding(22) var<storage, read_write> pathVertices: array<vec4<f32>>;
@group(0) @binding(23) var baseColorAtlasTexture: texture_2d<f32>;
@group(0) @binding(24) var metallicRoughnessAtlasTexture: texture_2d<f32>;
@group(0) @binding(25) var normalAtlasTexture: texture_2d<f32>;
@group(0) @binding(26) var occlusionAtlasTexture: texture_2d<f32>;
@group(0) @binding(27) var emissiveAtlasTexture: texture_2d<f32>;
@group(0) @binding(28) var materialAtlasSampler: sampler;
@group(0) @binding(29) var brdfLutTexture: texture_2d<f32>;
@group(0) @binding(30) var brdfLutSampler: sampler;
@group(0) @binding(31) var environmentSamplingTexture: texture_2d<f32>;
@group(0) @binding(32) var mediumTableTexture: texture_2d<f32>;

fn hash_u32(value: u32) -> u32 {
  var x = value;
  x = ((x >> 16u) ^ x) * 0x45d9f3bu;
  x = ((x >> 16u) ^ x) * 0x45d9f3bu;
  x = (x >> 16u) ^ x;
  return x;
}

fn mix_seed(pixelId: u32, sampleId: u32, bounce: u32, frameIndex: u32, dimension: u32) -> u32 {
  var x =
    (pixelId * 747796405u) ^
    (sampleId * 2891336453u) ^
    (bounce * 277803737u) ^
    (frameIndex * 1442695041u) ^
    (dimension * 1597334677u);
  x = x ^ (x >> 16u);
  x = x * 0x7feb352du;
  x = x ^ (x >> 15u);
  x = x * 0x846ca68bu;
  x = x ^ (x >> 16u);
  return x;
}

fn random01(seed: u32) -> f32 {
  return f32(hash_u32(seed) & 0x00ffffffu) / 16777215.0;
}

fn transport_experiment_enabled(bit: u32) -> bool {
  return (config.transportExperimentFlags & bit) != 0u;
}

fn sample_frame_index(frameIndex: u32) -> u32 {
  return select(frameIndex, 0u, transport_experiment_enabled(TRANSPORT_EXPERIMENT_STABLE_SAMPLE_ROUTING));
}

fn radical_inverse_vdc(bits: u32) -> f32 {
  var value = bits;
  value = (value << 16u) | (value >> 16u);
  value = ((value & 0x55555555u) << 1u) | ((value & 0xaaaaaaaau) >> 1u);
  value = ((value & 0x33333333u) << 2u) | ((value & 0xccccccccu) >> 2u);
  value = ((value & 0x0f0f0f0fu) << 4u) | ((value & 0xf0f0f0f0u) >> 4u);
  value = ((value & 0x00ff00ffu) << 8u) | ((value & 0xff00ff00u) >> 8u);
  return f32(value) * 2.3283064365386963e-10;
}

fn sample_dimension_1d(
  pixelId: u32,
  sampleId: u32,
  bounce: u32,
  frameIndex: u32,
  dimension: u32
) -> f32 {
  return random01(mix_seed(pixelId, sampleId, bounce, sample_frame_index(frameIndex), dimension));
}

fn sample_dimension_2d(
  pixelId: u32,
  sampleId: u32,
  bounce: u32,
  frameIndex: u32,
  dimension: u32,
  strataCount: u32
) -> vec2<f32> {
  let strata = max(strataCount, 1u);
  let jitter = sample_dimension_1d(pixelId, sampleId, bounce, frameIndex, dimension);
  let scramble = hash_u32(mix_seed(pixelId, sampleId, bounce, sample_frame_index(frameIndex), dimension));
  let stratified = fract((f32(sampleId % strata) + jitter) / f32(strata));
  let lowDiscrepancy = fract(radical_inverse_vdc(sampleId ^ scramble) + jitter);
  return vec2<f32>(stratified, lowDiscrepancy);
}

fn safe_normalize(value: vec3<f32>, fallback: vec3<f32>) -> vec3<f32> {
  let len = length(value);
  if (len <= 0.000001) {
    return fallback;
  }
  return value / len;
}

struct TangentBasis {
  tangent: vec3<f32>,
  bitangent: vec3<f32>,
};

struct SurfaceMaterialSample {
  color: vec4<f32>,
  emission: vec4<f32>,
  material: vec4<f32>,
  materialResponse: vec4<f32>,
  materialExtension: vec4<f32>,
  specularColor: vec4<f32>,
  shadingNormal: vec3<f32>,
  occlusion: f32,
};
`;
