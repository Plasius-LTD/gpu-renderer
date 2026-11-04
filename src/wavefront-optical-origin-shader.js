// Binary32 operation bounds, not scene tolerances. Valid-hit pad2 carries the
// error projected onto its geometric normal; no HitRecord ABI/allocation change.
export const OPTICAL_ORIGIN_WGSL = `
fn optical_rounding_gamma(operations: f32) -> f32 {
  let unitRoundoff = 0.000000059604644775390625;
  return (operations * unitRoundoff) / (1.0 - operations * unitRoundoff);
}
fn optical_triangle_error(triangle: TriangleRecord, barycentric: vec3<f32>, normal: vec3<f32>) -> f32 {
  // Covers edge subtraction, products, reconstruction, bounding and its inward
  // representable step. Constant axes reconstruct exactly from the stored base.
  var error = optical_rounding_gamma(12.0) *
    (abs(triangle.v0.xyz * barycentric.x) + abs(triangle.v1.xyz * barycentric.y) + abs(triangle.v2.xyz * barycentric.z));
  let constantAxis = (triangle.v0.xyz == triangle.v1.xyz) & (triangle.v0.xyz == triangle.v2.xyz);
  error = select(error, vec3<f32>(0.0), constantAxis);
  return dot(abs(normal), error) * (1.0 + optical_rounding_gamma(3.0));
}
fn optical_step_outward(value: f32, positive: bool) -> f32 {
  if (value == 0.0) {
    return select(-bitcast<f32>(0x00800000u),bitcast<f32>(0x00800000u),positive);
  }
  let bits = bitcast<u32>(value);
  return bitcast<f32>(select(bits-1u,bits+1u,(value>0.0)==positive));
}
fn optical_offset_error(position: vec3<f32>, normal: vec3<f32>, direction: vec3<f32>, projectedError: f32) -> vec3<f32> {
  if (projectedError <= 0.0) { return position; }
  let side = select(-1.0,1.0,dot(normal,direction)>=0.0);
  // Clear the same normal-projected error on the best-conditioned axis. A
  // tiny nonzero normal component must not force an unrelated coordinate one
  // ULP across its adjacent boundary (the captured glass-bottom regression).
  var axis=0u;
  if (abs(normal.y)>abs(normal.x)) { axis=1u; }
  if (abs(normal.z)>abs(normal[axis])) { axis=2u; }
  let displacement=side*projectedError/normal[axis];
  var result=position;
  result[axis]=optical_step_outward(position[axis]+displacement,displacement>0.0);
  return result;
}
`;
