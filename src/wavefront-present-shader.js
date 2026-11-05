export const PRESENT_WGSL = `
struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOut {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  var uvs = array<vec2<f32>, 3>(
    vec2<f32>(0.0, 1.0),
    vec2<f32>(2.0, 1.0),
    vec2<f32>(0.0, -1.0)
  );
  var out: VertexOut;
  out.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
  out.uv = uvs[vertexIndex];
  return out;
}

@group(0) @binding(0) var renderTexture: texture_2d<f32>;
@group(0) @binding(1) var renderSampler: sampler;
// The first four words of the existing frame config; no new GPU allocation.
@group(0) @binding(2) var<uniform> viewport: vec4<u32>;

@fragment
fn fragmentMain(in: VertexOut) -> @location(0) vec4<f32> {
  let allocated = textureDimensions(renderTexture);
  if (all(viewport.xy == allocated)) {
    return textureSample(renderTexture, renderSampler, in.uv);
  }
  let dimensions = vec2<f32>(allocated);
  let activeDimensions = vec2<f32>(viewport.xy);
  let uv = clamp(in.uv * activeDimensions / dimensions, vec2<f32>(0.5) / dimensions,
    (activeDimensions - vec2<f32>(0.5)) / dimensions);
  return textureSample(renderTexture, renderSampler, uv);
}
`;
