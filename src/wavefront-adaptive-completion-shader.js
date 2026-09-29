import { WAVEFRONT_CAMERA_RAY_RECORD_WGSL, WAVEFRONT_CAMERA_FRAME_CONFIG_WGSL } from "./wavefront-camera-shared-shader.js";
import { WAVEFRONT_TERMINATION_METRICS_WGSL, WAVEFRONT_COUNTERS_WGSL } from "./wavefront-primary-shared-shader.js";
import { PATH_NODE_STRUCT_WGSL, PATH_TREE_WGSL } from "./wavefront-path-tree-shader.js";
import { ADAPTIVE_CAMERA_SAMPLE_RECORD_WGSL, ADAPTIVE_RESOLVE_CONFIG_RECORD_WGSL } from "./wavefront-adaptive-sample-records.js";

export const ADAPTIVE_COMPLETION_WGSL = [WAVEFRONT_CAMERA_RAY_RECORD_WGSL, WAVEFRONT_CAMERA_FRAME_CONFIG_WGSL,
  WAVEFRONT_TERMINATION_METRICS_WGSL, WAVEFRONT_COUNTERS_WGSL, PATH_NODE_STRUCT_WGSL,
  ADAPTIVE_CAMERA_SAMPLE_RECORD_WGSL, ADAPTIVE_RESOLVE_CONFIG_RECORD_WGSL, PATH_TREE_WGSL].join("\n") + `
struct CompletionControl { count: u32, failure: u32, reserved0: u32, reserved1: u32, };
@group(0) @binding(0) var<uniform> config: FrameConfig;
@group(0) @binding(1) var<storage, read_write> pathNodes: array<PathNode>;
@group(0) @binding(2) var<storage, read> pixelWords: array<u32>;
@group(0) @binding(3) var<storage, read_write> cameraSamples: array<AdaptiveCameraSample>;
@group(0) @binding(4) var<storage, read> control: CompletionControl;
@group(0) @binding(5) var<storage, read_write> counters: Counters;
@group(0) @binding(6) var<uniform> sampleConfig: AdaptiveResolveConfig;

fn complete_config_valid() -> bool {
  if (config.canvasWidth == 0u || config.canvasHeight == 0u || config.tileWidth == 0u || config.tileHeight == 0u) { return false; }
  if (config.canvasWidth > 0xffffffffu / config.canvasHeight || config.tileWidth > 16384u / config.tileHeight) { return false; }
  if (config.tileX >= config.canvasWidth || config.tileY >= config.canvasHeight
    || config.tileWidth > config.canvasWidth - config.tileX || config.tileHeight > config.canvasHeight - config.tileY) { return false; }
  if (config.tilePixelCount != config.tileWidth * config.tileHeight || config.maxDepth < 1u || config.maxDepth > 32u) { return false; }
  if (config.tilePixelCount > arrayLength(&pathNodes) / (config.maxDepth + 1u) || config.tilePixelCount > arrayLength(&cameraSamples)
    || config.canvasWidth * config.canvasHeight > arrayLength(&pixelWords)) { return false; }
  if (sampleConfig.canvasWidth != config.canvasWidth || sampleConfig.canvasHeight != config.canvasHeight
    || sampleConfig.tileX != config.tileX || sampleConfig.tileY != config.tileY
    || sampleConfig.tileWidth != config.tileWidth || sampleConfig.tileHeight != config.tileHeight) { return false; }
  if (sampleConfig.frameValid != 1u || sampleConfig.reserved0 != 0u || sampleConfig.reserved1 != 0u || sampleConfig.reserved2 != 0u) { return false; }
  if (config.samplesPerPixel < 1u || config.samplesPerPixel > 256u || sampleConfig.selectedTier < 1u
    || sampleConfig.selectedTier > config.samplesPerPixel || sampleConfig.sampleOrdinal >= sampleConfig.selectedTier) { return false; }
  if (config.projectionAndSampling.z != 1.0 || config.projectionAndSampling.w != f32(sampleConfig.sampleOrdinal)) { return false; }
  if (control.failure != 0u || control.reserved0 != 0u || control.reserved1 != 0u || control.count > config.tilePixelCount) { return false; }
  return atomicLoad(&counters.activeCount) == 0u && atomicLoad(&counters.nextCount) == 0u
    && atomicLoad(&counters.termination.ambientQueueOverflowCount) == 0u;
}

@compute @workgroup_size(64)
fn produce_complete_camera_sample(@builtin(global_invocation_id) id: vec3<u32>) {
  let root = id.x;
  if (root >= arrayLength(&cameraSamples)) { return; }
  // Never leave a previous sample's completed status available after bad input.
  var sample = AdaptiveCameraSample();
  sample.status = 2u;
  cameraSamples[root] = sample;
  if (!complete_config_valid() || root >= config.tilePixelCount) { return; }
  let pixel = (config.tileY + root / config.tileWidth) * config.canvasWidth + config.tileX + root % config.tileWidth;
  if ((pixelWords[pixel] & 511u) != sampleConfig.selectedTier) { return; }
  sample.sourcePixelId = pixel;
  sample.sampleOrdinal = sampleConfig.sampleOrdinal;
  if ((pixelWords[pixel] & 0x80000000u) == 0u) {
    let complete = resolve_complete_path_tree(root, pixel, sampleConfig.sampleOrdinal);
    if (complete.w == 1.0) { sample.radiance = complete.xyz; sample.status = 1u; }
  }
  cameraSamples[root] = sample;
}
`;
