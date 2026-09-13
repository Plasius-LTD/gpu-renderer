export const ADAPTIVE_PRIMARY_WGSL = `
struct AdaptivePrimaryWords { words: array<u32>, };
struct AdaptivePrimaryConfig {
  canvasWidth: u32, canvasHeight: u32, tileX: u32, tileY: u32,
  tileWidth: u32, tileHeight: u32, tier: u32, reserved: u32,
};
struct AdaptivePrimaryControl {
  count: atomic<u32>, failure: atomic<u32>, reserved0: u32, reserved1: u32,
};
struct AdaptivePrimaryDispatch { x: u32, y: u32, z: u32, };
@group(0) @binding(0) var<storage, read> pixels: AdaptivePrimaryWords;
@group(0) @binding(1) var<storage, read_write> worklist: AdaptivePrimaryWords;
@group(0) @binding(2) var<storage, read_write> control: AdaptivePrimaryControl;
@group(0) @binding(3) var<storage, read_write> dispatch: AdaptivePrimaryDispatch;
@group(0) @binding(4) var<uniform> config: AdaptivePrimaryConfig;
var<workgroup> prefix: array<u32, 64>;
var<workgroup> destinationBase: u32;

fn primary_config_valid() -> bool {
  if (config.canvasWidth == 0u || config.canvasHeight == 0u || config.tileWidth == 0u || config.tileHeight == 0u) { return false; }
  if (config.canvasWidth > 0xffffffffu / config.canvasHeight || config.tileWidth > 16384u / config.tileHeight) { return false; }
  if (config.tileX > config.canvasWidth || config.tileY > config.canvasHeight) { return false; }
  if (config.tileWidth > config.canvasWidth - config.tileX || config.tileHeight > config.canvasHeight - config.tileY) { return false; }
  return config.tier >= 1u && config.tier <= 256u && config.reserved == 0u
    && config.canvasWidth * config.canvasHeight <= arrayLength(&pixels.words);
}

@compute @workgroup_size(64)
fn initialize_primary_worklist(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x < arrayLength(&worklist.words)) { worklist.words[id.x] = 0xffffffffu; }
  if (id.x == 0u) {
    atomicStore(&control.count, 0u);
    atomicStore(&control.failure, select(1u, 0u, primary_config_valid()));
    control.reserved0 = 0u; control.reserved1 = 0u;
    dispatch.x = 0u; dispatch.y = 1u; dispatch.z = 1u;
  }
}

@compute @workgroup_size(64)
fn compact_primary_tier(@builtin(global_invocation_id) id: vec3<u32>, @builtin(local_invocation_id) lane: vec3<u32>) {
  // This predicate is uniform for the entire dispatch, before any barriers.
  if (!primary_config_valid()) { return; }
  var eligible = 0u;
  if (id.x < config.tileWidth * config.tileHeight) {
    let pixelId = (config.tileY + id.x / config.tileWidth) * config.canvasWidth + config.tileX + id.x % config.tileWidth;
    let word = pixels.words[pixelId];
    let requested = word & 511u;
    let completed = (word >> 9u) & 511u;
    let valid = requested >= 1u && requested <= 256u && completed <= requested && (word & 0x80000000u) == 0u;
    if (!valid || (requested == config.tier && completed != 0u)) { atomicOr(&control.failure, 2u); }
    eligible = select(0u, 1u, valid && requested == config.tier && completed == 0u);
  }
  prefix[lane.x] = eligible;
  workgroupBarrier();
  for (var offset = 1u; offset < 64u; offset = offset * 2u) {
    var previous = 0u;
    if (lane.x >= offset) { previous = prefix[lane.x - offset]; }
    workgroupBarrier();
    prefix[lane.x] = prefix[lane.x] + previous;
    workgroupBarrier();
  }
  if (lane.x == 63u) { destinationBase = atomicAdd(&control.count, prefix[63u]); }
  workgroupBarrier();
  if (eligible != 0u) {
    let destination = destinationBase + prefix[lane.x] - 1u;
    if (destination < arrayLength(&worklist.words)) { worklist.words[destination] = id.x; }
    else { atomicOr(&control.failure, 4u); }
  }
}

@compute @workgroup_size(1)
fn finalize_primary_dispatch() {
  let count = atomicLoad(&control.count);
  if (count > arrayLength(&worklist.words)) { atomicOr(&control.failure, 4u); }
  dispatch.x = 0u; dispatch.y = 1u; dispatch.z = 1u;
  if (atomicLoad(&control.failure) == 0u) { dispatch.x = (count + 63u) / 64u; }
}
`;
