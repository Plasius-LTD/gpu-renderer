// Canonical camera WGSL shared by fixed and compacted primary generation.
export const WAVEFRONT_CAMERA_RAY_RECORD_WGSL = `struct RayRecord {
  rayId: u32,
  parentRayId: u32,
  sourcePixelId: u32,
  sampleId: u32,
  bounce: u32,
  mediumRefId: u32,
  flags: u32,
  mediumStackDepth: u32,
  origin: vec4<f32>,
  direction: vec4<f32>,
  throughput: vec4<f32>,
  mediumStack: vec4<u32>,
};`;

export const WAVEFRONT_CAMERA_FRAME_CONFIG_WGSL = `struct FrameConfig {
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
};`;

export const WAVEFRONT_MAKE_CAMERA_RAY_WGSL = `fn make_ray(pixelIndex: u32) -> RayRecord {
  let localX = pixelIndex % config.tileWidth;
  let localY = pixelIndex / config.tileWidth;
  let px = config.tileX + localX;
  let py = config.tileY + localY;
  let sampleId = u32(config.projectionAndSampling.w);
  let sourcePixelId = py * config.canvasWidth + px;
  let jitter = sample_dimension_2d(
    sourcePixelId,
    sampleId,
    0u,
    config.frameIndex,
    SAMPLE_DIM_CAMERA_JITTER,
    config.samplesPerPixel
  ) - vec2<f32>(0.5);
  let jitterX = jitter.x;
  let jitterY = jitter.y;
  let ndcX = ((f32(px) + 0.5 + jitterX * 0.35) / f32(config.canvasWidth)) * 2.0 - 1.0;
  let ndcY = 1.0 - ((f32(py) + 0.5 + jitterY * 0.35) / f32(config.canvasHeight)) * 2.0;
  let viewX = ndcX * config.projectionAndSampling.x * config.projectionAndSampling.y;
  let viewY = ndcY * config.projectionAndSampling.x;
  let direction = safe_normalize(
    config.cameraForward.xyz + config.cameraRight.xyz * viewX + config.cameraUp.xyz * viewY,
    config.cameraForward.xyz
  );
  return RayRecord(
    pixelIndex,
    0xffffffffu,
    sourcePixelId,
    sampleId,
    0u,
    0u,
    0u,
    0u,
    vec4<f32>(config.cameraPosition.xyz, 1.0),
    vec4<f32>(direction, 0.0),
    vec4<f32>(1.0, 1.0, 1.0, 1.0),
    vec4<u32>(0u)
  );
}`;

export const WAVEFRONT_SAFE_NORMALIZE_WGSL = `fn safe_normalize(value: vec3<f32>, fallback: vec3<f32>) -> vec3<f32> {
  let len = length(value);
  if (len <= 0.000001) {
    return fallback;
  }
  return value / len;
}`;

