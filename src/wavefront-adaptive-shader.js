// Bit semantics are shared by CPU packing and final assembled WGSL.
export const ADAPTIVE_COUNT_BITS = 9;
export const ADAPTIVE_COUNT_MASK = (1 << ADAPTIVE_COUNT_BITS) - 1;
export const ADAPTIVE_FLAG_SHIFT = ADAPTIVE_COUNT_BITS * 2;
export const ADAPTIVE_MAX_FLAGS = 2 ** (32 - ADAPTIVE_FLAG_SHIFT) - 1;
export const ADAPTIVE_MAX_SAMPLES = 256;

export const ADAPTIVE_METADATA_WGSL = `
const ADAPTIVE_COUNT_MASK: u32 = ${ADAPTIVE_COUNT_MASK}u;
const ADAPTIVE_COMPLETED_SHIFT: u32 = ${ADAPTIVE_COUNT_BITS}u;

struct AdaptivePixelState { word: u32, };
struct AdaptivePixelStates { records: array<AdaptivePixelState>, };
struct AdaptiveFirstHitDistance { distance: f32, };
struct AdaptiveNormalMaterialRisk { word: u32, };
struct AdaptiveWorklistEntry { localPixelId: u32, };
struct AdaptiveHistoryWord { mask: u32, };
struct AdaptiveDispatchArguments { x: u32, y: u32, z: u32, };

@group(0) @binding(0) var<storage, read_write> pixels: AdaptivePixelStates;

@compute @workgroup_size(64)
fn reset_adaptive_counts(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= arrayLength(&pixels.records)) { return; }
  // Budgets were selected before contributing samples. Preserve them and flags.
  pixels.records[id.x].word &= ~(ADAPTIVE_COUNT_MASK << ADAPTIVE_COMPLETED_SHIFT);
}
`;
