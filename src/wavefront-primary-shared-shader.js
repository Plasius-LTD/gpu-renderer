// Canonical declarations/helpers shared verbatim by fixed transport and adaptive bootstrap.
export const WAVEFRONT_TERMINATION_METRICS_WGSL = `struct TerminationMetrics {
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
  deterministicResidualZeroCount: atomic<u32>,
  transportDirectExplicitLuminanceScaled: atomic<u32>,
  transportCachedIndirectLuminanceScaled: atomic<u32>,
  transportResidualLuminanceScaled: atomic<u32>,
  transportZeroTerminationCount: atomic<u32>,
  transportChecksum: atomic<u32>,
  transportPad0: atomic<u32>,
  transportPad1: atomic<u32>,
  transportPad2: atomic<u32>,
};`;

export const WAVEFRONT_COUNTERS_WGSL = `struct Counters {
  activeCount: atomic<u32>,
  nextCount: atomic<u32>,
  terminatedCount: atomic<u32>,
  hitCount: atomic<u32>,
  dispatchX: u32,
  dispatchY: u32,
  dispatchZ: u32,
  dispatchPad: u32,
  termination: TerminationMetrics,
};`;

export const WAVEFRONT_DEFERRED_PATH_ENABLED_WGSL = `fn deferred_path_resolve_enabled() -> bool {
  return config.pathResolveSettings.x > 0.5;
}`;

export const WAVEFRONT_CLEAR_DEFERRED_PATH_WGSL = `fn path_vertex_count_per_ray() -> u32 {
  return config.maxDepth + 1u;
}

fn path_vertex_index(rayId: u32, depth: u32) -> u32 {
  return rayId * path_vertex_count_per_ray() + min(depth, config.maxDepth);
}

fn clear_deferred_path(rayId: u32) {
  if (!deferred_path_resolve_enabled()) {
    return;
  }

  for (var depth = 0u; depth <= config.maxDepth; depth = depth + 1u) {
    pathVertices[path_vertex_index(rayId, depth)] = vec4<f32>(0.0);
    if (depth == config.maxDepth) {
      break;
    }
  }
}`;

