export const PROGRESSIVE_WGSL = `
@group(0) @binding(45) var<storage, read_write> progressiveHistory: array<vec4<f32>>;
@group(0) @binding(46) var<uniform> progressiveCounts: vec4<u32>;

@compute @workgroup_size(8, 8)
fn accumulateProgressiveRadiance(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= config.canvasWidth || id.y >= config.canvasHeight) { return; }
  let pixel = vec2<i32>(id.xy);
  let index = id.y * config.canvasWidth + id.x;
  let batch = textureLoad(denoiseInputRadiance, pixel, 0).xyz;
  let previousCount = f32(progressiveCounts.x);
  let batchCount = f32(progressiveCounts.y);
  // Branch explicitly: discarded history may contain non-finite values after a reset.
  var mean = batch;
  if (progressiveCounts.x > 0u) {
    let previous = progressiveHistory[index].xyz;
    mean = previous + (batch - previous) * (batchCount / (previousCount + batchCount));
  }
  progressiveHistory[index] = vec4<f32>(mean, 1.0);
  textureStore(denoisedRadianceImage, pixel, vec4<f32>(mean, 1.0));
  if (config.denoise == 0u) {
    textureStore(denoisedOutputImage, pixel, vec4<f32>(present_radiance(mean), 1.0));
  }
}
`;
