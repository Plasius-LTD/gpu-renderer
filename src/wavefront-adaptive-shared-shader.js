import { WAVEFRONT_CAMERA_RAY_RECORD_WGSL, WAVEFRONT_CAMERA_FRAME_CONFIG_WGSL, WAVEFRONT_MAKE_CAMERA_RAY_WGSL, WAVEFRONT_SAFE_NORMALIZE_WGSL } from "./wavefront-camera-shared-shader.js";
import { WAVEFRONT_SAMPLE_DIMENSIONS_WGSL, WAVEFRONT_SAMPLE_SEQUENCE_WGSL, WAVEFRONT_STABLE_SAMPLE_ROUTING_WGSL } from "./wavefront-sampling-dimensions.js";
import { WAVEFRONT_TERMINATION_METRICS_WGSL, WAVEFRONT_COUNTERS_WGSL, WAVEFRONT_DEFERRED_PATH_ENABLED_WGSL } from "./wavefront-primary-shared-shader.js";
import { PATH_NODE_STRUCT_WGSL, PATH_TREE_WGSL } from "./wavefront-path-tree-shader.js";
import { ADAPTIVE_PREFIX_SCAN_WGSL } from "./wavefront-adaptive-scan-shader.js";

export const SHARED_ADAPTIVE_WGSL = [WAVEFRONT_SAMPLE_DIMENSIONS_WGSL, WAVEFRONT_STABLE_SAMPLE_ROUTING_WGSL, WAVEFRONT_SAMPLE_SEQUENCE_WGSL,
  WAVEFRONT_CAMERA_RAY_RECORD_WGSL, WAVEFRONT_CAMERA_FRAME_CONFIG_WGSL, WAVEFRONT_SAFE_NORMALIZE_WGSL, WAVEFRONT_MAKE_CAMERA_RAY_WGSL,
  WAVEFRONT_TERMINATION_METRICS_WGSL, WAVEFRONT_COUNTERS_WGSL, WAVEFRONT_DEFERRED_PATH_ENABLED_WGSL, PATH_NODE_STRUCT_WGSL, PATH_TREE_WGSL].join("\n") + `
struct SharedPhase {
  canvasWidth: u32, canvasHeight: u32, tileX: u32, tileY: u32,
  tileWidth: u32, tileHeight: u32, firstSample: u32, sampleLimit: u32,
};
struct SharedWords { words: array<u32>, };
struct SharedControl { count: atomic<u32>, failure: atomic<u32>, reserved0: u32, reserved1: u32, };
struct SharedDispatch { x: u32, y: u32, z: u32, };
@group(0) @binding(0) var<uniform> config: FrameConfig;
@group(0) @binding(1) var<uniform> phase: SharedPhase;
@group(0) @binding(2) var<storage, read_write> pixels: SharedWords;
@group(0) @binding(3) var<storage, read_write> worklist: SharedWords;
@group(0) @binding(4) var<storage, read_write> control: SharedControl;
@group(0) @binding(5) var<storage, read_write> dispatch: SharedDispatch;
@group(0) @binding(6) var<storage, read_write> activeQueue: array<RayRecord>;
@group(0) @binding(7) var<storage, read_write> pathNodes: array<PathNode>;
@group(0) @binding(8) var<storage, read_write> counters: Counters;
@group(0) @binding(9) var<storage, read_write> sums: array<vec4<f32>>;
@group(0) @binding(10) var<storage, read_write> resolved: array<vec4<f32>>;
var<workgroup> prefix: array<u32, 64>;
var<workgroup> destinationBase: u32;

fn shared_config_valid() -> bool {
  if (config.canvasWidth == 0u || config.canvasHeight == 0u || config.tileWidth == 0u || config.tileHeight == 0u) { return false; }
  if (config.canvasWidth > 0xffffffffu / config.canvasHeight || config.tileWidth > 16384u / config.tileHeight) { return false; }
  if (config.tileX >= config.canvasWidth || config.tileY >= config.canvasHeight || config.tileWidth > config.canvasWidth - config.tileX || config.tileHeight > config.canvasHeight - config.tileY) { return false; }
  if (config.tilePixelCount != config.tileWidth * config.tileHeight || config.maxDepth < 1u || config.maxDepth > 32u) { return false; }
  if (config.tilePixelCount > arrayLength(&worklist.words) || config.tilePixelCount > arrayLength(&activeQueue)
    || config.tilePixelCount > arrayLength(&pathNodes) / (config.maxDepth + 1u) || config.tilePixelCount > arrayLength(&sums) || config.tilePixelCount > arrayLength(&resolved)
    || config.canvasWidth * config.canvasHeight > arrayLength(&pixels.words)) { return false; }
  if (phase.canvasWidth != config.canvasWidth || phase.canvasHeight != config.canvasHeight || phase.tileX != config.tileX || phase.tileY != config.tileY
    || phase.tileWidth != config.tileWidth || phase.tileHeight != config.tileHeight) { return false; }
  if (!deferred_path_resolve_enabled() || config.projectionAndSampling.z != 1.0 || config.samplesPerPixel < 1u || config.samplesPerPixel > 256u) { return false; }
  if (phase.firstSample >= phase.sampleLimit || phase.sampleLimit > config.samplesPerPixel) { return false; }
  let ordinal = config.projectionAndSampling.w;
  return ordinal >= f32(phase.firstSample) && ordinal < f32(phase.sampleLimit) && floor(ordinal) == ordinal;
}
fn shared_pixel(local: u32) -> u32 { return (config.tileY + local / config.tileWidth) * config.canvasWidth + config.tileX + local % config.tileWidth; }
fn shared_control_valid() -> bool {
  return atomicLoad(&control.failure) == 0u && control.reserved0 == 0u && control.reserved1 == 0u && atomicLoad(&control.count) <= config.tilePixelCount;
}
fn shared_word_valid(word: u32) -> bool {
  let requested = word & 511u;
  return requested > 0u && requested <= config.samplesPerPixel && ((word >> 9u) & 511u) <= requested && (word & 0x80000000u) == 0u;
}

@compute @workgroup_size(64)
fn initialize_shared_phase(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x < arrayLength(&worklist.words)) { worklist.words[id.x] = 0xffffffffu; }
  if (id.x == 0u) {
    atomicStore(&control.count, 0u);
    atomicStore(&control.failure, select(1u, 0u, shared_config_valid() && config.projectionAndSampling.w == f32(phase.firstSample)));
    control.reserved0 = 0u; control.reserved1 = 0u;
    dispatch.x = 0u; dispatch.y = 1u; dispatch.z = 1u;
  }
}
@compute @workgroup_size(64)
fn compact_shared_phase(@builtin(global_invocation_id) id: vec3<u32>, @builtin(local_invocation_id) lane: vec3<u32>) {
  if (!shared_config_valid()) { return; }
  var eligible = 0u;
  if (id.x < config.tilePixelCount) {
    let word = pixels.words[shared_pixel(id.x)];
    let requested = word & 511u;
    let expected = min(requested, phase.firstSample);
    let covered = requested <= phase.firstSample || requested >= phase.sampleLimit;
    let valid = shared_word_valid(word) && ((word >> 9u) & 511u) == expected && covered;
    if (!valid) { atomicOr(&control.failure, 2u); }
    eligible = select(0u, 1u, valid && requested >= phase.sampleLimit);
  }
${ADAPTIVE_PREFIX_SCAN_WGSL}
}
@compute @workgroup_size(1)
fn finalize_shared_phase() {
  dispatch.x = 0u; dispatch.y = 1u; dispatch.z = 1u;
  if (!shared_control_valid()) { atomicOr(&control.failure, 4u); return; }
  dispatch.x = (atomicLoad(&control.count) + 63u) / 64u;
}
@compute @workgroup_size(64)
fn validate_shared_phase(@builtin(global_invocation_id) id: vec3<u32>) {
  if (!shared_config_valid() || !shared_control_valid()) { if (id.x == 0u) { atomicOr(&control.failure, 8u); } return; }
  if (id.x >= atomicLoad(&control.count)) { return; }
  let root = worklist.words[id.x];
  if (root >= config.tilePixelCount) { atomicOr(&control.failure, 16u); return; }
  let word = pixels.words[shared_pixel(root)];
  if (!shared_word_valid(word) || (word & 511u) < phase.sampleLimit || ((word >> 9u) & 511u) != phase.firstSample) { atomicOr(&control.failure, 16u); }
}

@compute @workgroup_size(64)
fn prepare_shared_sample(@builtin(global_invocation_id) id: vec3<u32>) {
  // Worklist is GPU-produced, validated and immutable throughout this phase.
  // Counters were cleared; no invocation reads the newly written counter values.
  if (!shared_config_valid() || !shared_control_valid()) { if (id.x == 0u) { atomicOr(&control.failure, 32u); } return; }
  let count = atomicLoad(&control.count);
  if (id.x == 0u) {
    atomicStore(&counters.activeCount, count);
    counters.dispatchX = (count + 63u) / 64u; counters.dispatchY = 1u; counters.dispatchZ = 1u;
  }
  if (id.x >= count) { return; }
  let root = worklist.words[id.x];
  pathNodes[root] = PathNode();
  activeQueue[id.x] = make_ray(root);
}

@compute @workgroup_size(64)
fn commit_shared_sample(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= min(atomicLoad(&control.count), arrayLength(&worklist.words))) { return; }
  if (!shared_config_valid()) { atomicOr(&control.failure, 64u); return; }
  let root = worklist.words[id.x];
  if (root >= config.tilePixelCount) { atomicOr(&control.failure, 64u); return; }
  let pixel = shared_pixel(root);
  let word = pixels.words[pixel];
  let ordinal = u32(config.projectionAndSampling.w);
  // Only sticky failure uses atomics here. Each compacted root owns its sum/count.
  var valid = shared_control_valid() && shared_word_valid(word) && (word & 511u) >= phase.sampleLimit && ((word >> 9u) & 511u) == ordinal
    && atomicLoad(&counters.activeCount) == 0u && atomicLoad(&counters.nextCount) == 0u && atomicLoad(&counters.termination.ambientQueueOverflowCount) == 0u;
  var sample = vec4<f32>(0.0);
  if (valid) { sample = resolve_complete_path_tree(root, pixel, ordinal); }
  var prior = vec3<f32>(0.0);
  if (ordinal > 0u) { prior = sums[root].xyz; }
  let next = prior + sample.xyz;
  valid = valid && sample.w == 1.0 && path_radiance_valid(prior) && path_radiance_valid(next);
  if (!valid) { pixels.words[pixel] = word | 0x80000000u; atomicOr(&control.failure, 64u); return; }
  sums[root] = vec4<f32>(next, 0.0);
  pixels.words[pixel] = (word & ~(511u << 9u)) | ((ordinal + 1u) << 9u);
}
@compute @workgroup_size(64)
fn resolve_shared_frame(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= arrayLength(&resolved)) { return; }
  resolved[id.x] = vec4<f32>(0.0);
  if (!shared_config_valid() || !shared_control_valid() || id.x >= config.tilePixelCount) { return; }
  let word = pixels.words[shared_pixel(id.x)];
  let requested = word & 511u;
  if (!shared_word_valid(word) || ((word >> 9u) & 511u) != requested || !path_radiance_valid(sums[id.x].xyz)) { return; }
  resolved[id.x] = vec4<f32>(sums[id.x].xyz / f32(requested), 1.0);
}
`;
