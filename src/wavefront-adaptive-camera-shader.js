import { WAVEFRONT_CAMERA_RAY_RECORD_WGSL, WAVEFRONT_CAMERA_FRAME_CONFIG_WGSL, WAVEFRONT_MAKE_CAMERA_RAY_WGSL, WAVEFRONT_SAFE_NORMALIZE_WGSL } from "./wavefront-camera-shared-shader.js";
import { WAVEFRONT_SAMPLE_DIMENSIONS_WGSL, WAVEFRONT_SAMPLE_SEQUENCE_WGSL, WAVEFRONT_STABLE_SAMPLE_ROUTING_WGSL } from "./wavefront-sampling-dimensions.js";

// Internal camera bridge only. The fixed shader and its sampling function are
// shared verbatim; no bounce coordinator, radiance or completed count is run.
export const ADAPTIVE_CAMERA_WGSL = [WAVEFRONT_SAMPLE_DIMENSIONS_WGSL, WAVEFRONT_STABLE_SAMPLE_ROUTING_WGSL, WAVEFRONT_SAMPLE_SEQUENCE_WGSL,
  WAVEFRONT_CAMERA_RAY_RECORD_WGSL, WAVEFRONT_CAMERA_FRAME_CONFIG_WGSL,
  WAVEFRONT_SAFE_NORMALIZE_WGSL, WAVEFRONT_MAKE_CAMERA_RAY_WGSL].join("\n") + `
@group(0) @binding(0) var<storage, read_write> activeQueue: array<RayRecord>;
@group(0) @binding(5) var<uniform> config: FrameConfig;
struct AdaptiveCameraIds { words: array<u32>, };
struct AdaptiveCameraControl { count: u32, failure: u32, reserved0: u32, reserved1: u32, };
struct AdaptiveCameraTile {
  canvasWidth: u32, canvasHeight: u32, tileX: u32, tileY: u32,
  tileWidth: u32, tileHeight: u32, tier: u32, reserved: u32,
};
@group(1) @binding(0) var<storage, read> cameraIds: AdaptiveCameraIds;
@group(1) @binding(1) var<storage, read> cameraControl: AdaptiveCameraControl;
@group(1) @binding(2) var<uniform> cameraTile: AdaptiveCameraTile;

fn compacted_camera_config_valid() -> bool {
  if (cameraControl.failure != 0u || cameraControl.reserved0 != 0u || cameraControl.reserved1 != 0u || cameraTile.reserved != 0u) { return false; }
  if (config.canvasWidth == 0u || config.canvasHeight == 0u || config.tileWidth == 0u || config.tileHeight == 0u) { return false; }
  if (config.canvasWidth > 0xffffffffu / config.canvasHeight || config.tileWidth > 16384u / config.tileHeight) { return false; }
  if (config.tileX > config.canvasWidth || config.tileY > config.canvasHeight) { return false; }
  if (config.tileWidth > config.canvasWidth - config.tileX || config.tileHeight > config.canvasHeight - config.tileY) { return false; }
  if (config.tilePixelCount != config.tileWidth * config.tileHeight || cameraControl.count > config.tilePixelCount) { return false; }
  if (cameraControl.count > arrayLength(&activeQueue) || cameraControl.count > arrayLength(&cameraIds.words)) { return false; }
  if (cameraTile.canvasWidth != config.canvasWidth || cameraTile.canvasHeight != config.canvasHeight
    || cameraTile.tileX != config.tileX || cameraTile.tileY != config.tileY
    || cameraTile.tileWidth != config.tileWidth || cameraTile.tileHeight != config.tileHeight) { return false; }
  if (config.samplesPerPixel < 1u || config.samplesPerPixel > 256u || cameraTile.tier < 1u || cameraTile.tier > config.samplesPerPixel) { return false; }
  let ordinal = config.projectionAndSampling.w;
  return ordinal >= 0.0 && ordinal < f32(cameraTile.tier) && floor(ordinal) == ordinal;
}

@compute @workgroup_size(64)
fn generateCompactedCameraRays(@builtin(global_invocation_id) id: vec3<u32>) {
  if (!compacted_camera_config_valid()) { return; }
  let slot = id.x;
  if (slot >= cameraControl.count) { return; }
  let localPixelId = cameraIds.words[slot];
  if (localPixelId >= config.tilePixelCount) { return; }
  activeQueue[slot] = make_ray(localPixelId);
}
`;
