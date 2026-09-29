import { WAVEFRONT_CAMERA_RAY_RECORD_WGSL, WAVEFRONT_CAMERA_FRAME_CONFIG_WGSL } from "./wavefront-camera-shared-shader.js";
import { WAVEFRONT_TERMINATION_METRICS_WGSL, WAVEFRONT_COUNTERS_WGSL,
  WAVEFRONT_DEFERRED_PATH_ENABLED_WGSL } from "./wavefront-primary-shared-shader.js";
import { PATH_NODE_STRUCT_WGSL } from "./wavefront-path-tree-shader.js";
import { MAX_PATH_TRACING_DEPTH } from "./wavefront-core.js";

export const ADAPTIVE_BOOTSTRAP_WGSL = [WAVEFRONT_CAMERA_RAY_RECORD_WGSL, WAVEFRONT_CAMERA_FRAME_CONFIG_WGSL,
  WAVEFRONT_TERMINATION_METRICS_WGSL, WAVEFRONT_COUNTERS_WGSL,
  WAVEFRONT_DEFERRED_PATH_ENABLED_WGSL, PATH_NODE_STRUCT_WGSL].join("\n") + `
@group(0) @binding(0) var<storage, read> bootstrapRays: array<RayRecord>;
@group(0) @binding(3) var<storage, read_write> accumulation: array<vec4<f32>>;
@group(0) @binding(5) var<uniform> config: FrameConfig;
@group(0) @binding(6) var<storage, read_write> counters: Counters;
@group(0) @binding(22) var<storage, read_write> pathNodes: array<PathNode>;
struct AdaptiveBootstrapIds { words: array<u32>, };
struct AdaptiveBootstrapControl { count: atomic<u32>, failure: atomic<u32>, reserved0: u32, reserved1: u32, };
struct AdaptiveBootstrapTile {
  canvasWidth: u32, canvasHeight: u32, tileX: u32, tileY: u32,
  tileWidth: u32, tileHeight: u32, tier: u32, reserved: u32,
};
@group(1) @binding(0) var<storage, read> bootstrapIds: AdaptiveBootstrapIds;
@group(1) @binding(1) var<storage, read_write> bootstrapControl: AdaptiveBootstrapControl;
@group(1) @binding(2) var<uniform> bootstrapTile: AdaptiveBootstrapTile;

fn bootstrap_config_valid(groups: vec3<u32>) -> bool {
  if (bootstrapControl.reserved0 != 0u || bootstrapControl.reserved1 != 0u || bootstrapTile.reserved != 0u) { return false; }
  if (config.canvasWidth == 0u || config.canvasHeight == 0u || config.tileWidth == 0u || config.tileHeight == 0u) { return false; }
  if (config.canvasWidth > 0xffffffffu / config.canvasHeight || config.tileWidth > 16384u / config.tileHeight) { return false; }
  if (config.tileX > config.canvasWidth || config.tileY > config.canvasHeight) { return false; }
  if (config.tileWidth > config.canvasWidth - config.tileX || config.tileHeight > config.canvasHeight - config.tileY) { return false; }
  if (config.tilePixelCount != config.tileWidth * config.tileHeight || config.maxDepth < 1u || config.maxDepth > ${MAX_PATH_TRACING_DEPTH}u) { return false; }
  if (groups.x < (config.tilePixelCount + 63u) / 64u || groups.y != 1u || groups.z != 1u) { return false; }
  if (bootstrapTile.canvasWidth != config.canvasWidth || bootstrapTile.canvasHeight != config.canvasHeight
    || bootstrapTile.tileX != config.tileX || bootstrapTile.tileY != config.tileY
    || bootstrapTile.tileWidth != config.tileWidth || bootstrapTile.tileHeight != config.tileHeight) { return false; }
  let count = atomicLoad(&bootstrapControl.count);
  if (count > config.tilePixelCount || count > arrayLength(&bootstrapIds.words) || count > arrayLength(&bootstrapRays)) { return false; }
  if (config.tilePixelCount > arrayLength(&accumulation) || config.tilePixelCount > arrayLength(&pathNodes) / (config.maxDepth + 1u)) { return false; }
  if (!deferred_path_resolve_enabled() || config.projectionAndSampling.z != 1.0) { return false; }
  if (config.samplesPerPixel < 1u || config.samplesPerPixel > 256u || bootstrapTile.tier < 1u || bootstrapTile.tier > config.samplesPerPixel) { return false; }
  let ordinal = config.projectionAndSampling.w;
  return ordinal >= 0.0 && ordinal < f32(bootstrapTile.tier) && floor(ordinal) == ordinal;
}

@compute @workgroup_size(64)
fn validate_compacted_sample(@builtin(global_invocation_id) id: vec3<u32>, @builtin(num_workgroups) groups: vec3<u32>) {
  if (id.x == 0u && (atomicLoad(&counters.activeCount) != 0u || atomicLoad(&counters.nextCount) != 0u
    || atomicLoad(&counters.terminatedCount) != 0u || atomicLoad(&counters.hitCount) != 0u
    || counters.dispatchX != 0u || counters.dispatchY != 0u || counters.dispatchZ != 0u || counters.dispatchPad != 0u)) {
    atomicOr(&bootstrapControl.failure, 32u);
  }
  if (!bootstrap_config_valid(groups)) {
    if (id.x == 0u) { atomicOr(&bootstrapControl.failure, 8u); }
    return;
  }
  if (atomicLoad(&bootstrapControl.failure) != 0u || id.x >= atomicLoad(&bootstrapControl.count)) { return; }
  if (bootstrapIds.words[id.x] >= config.tilePixelCount) { atomicOr(&bootstrapControl.failure, 16u); }
}

@compute @workgroup_size(64)
fn initialize_compacted_sample(@builtin(global_invocation_id) id: vec3<u32>, @builtin(num_workgroups) groups: vec3<u32>) {
  let valid = atomicLoad(&bootstrapControl.failure) == 0u && bootstrap_config_valid(groups);
  let count = select(0u, atomicLoad(&bootstrapControl.count), valid);
  if (id.x == 0u) {
    atomicStore(&counters.activeCount, count);
    counters.dispatchX = max(1u, (count + 63u) / 64u);
    counters.dispatchY = 1u; counters.dispatchZ = 1u; counters.dispatchPad = 0u;
  }
  if (!valid || id.x >= count) { return; }
  let localPixelId = bootstrapIds.words[id.x];
  // Worklist/control remain immutable between validation and consumption.
  if (localPixelId >= config.tilePixelCount) { return; }
  // Each bounce initializes its own depth/queue-owned node. Invalidate the root
  // here so a missing primary cannot reuse a complete tree from an earlier sample.
  pathNodes[localPixelId] = PathNode();
  accumulation[localPixelId] = vec4<f32>(0.0);
}
`;
