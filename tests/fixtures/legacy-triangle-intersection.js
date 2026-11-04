// Frozen pre-ADR-0057 function from renderer 808583e; platform-independent
// flag-off numerical equivalence oracle. Never imported by runtime shaders.
export const LEGACY_TRIANGLE_INTERSECTION_WGSL=`
fn intersect_triangle(ray: RayRecord, triangle: TriangleRecord, triangleIndex: u32) -> Candidate {
  let edge1 = triangle.v1.xyz - triangle.v0.xyz;
  let edge2 = triangle.v2.xyz - triangle.v0.xyz;
  let pvec = cross(ray.direction.xyz, edge2);
  let det = dot(edge1, pvec);
  if (abs(det) < 0.0000001) {
    return no_candidate();
  }
  let mediumExit = triangle.mediumRefId != 0u &&
    (triangle.mediumRefId == medium_stack_current_id(ray) ||
      (nested_media_enabled() && medium_stack_contains(ray, triangle.mediumRefId))) &&
    (triangle.materialExtension.z > 0.001 || triangle.material.z < 0.999 ||
      (nested_media_enabled() && (triangle.materialKind == 2u || triangle.materialKind == 3u)));
  if (det < 0.0 && (triangle.flags & 0x40000000u) == 0u && !mediumExit) {
    return no_candidate();
  }

  let invDet = 1.0 / det;
  let tvec = ray.origin.xyz - triangle.v0.xyz;
  let u = dot(tvec, pvec) * invDet;
  if (u < 0.0 || u > 1.0) {
    return no_candidate();
  }

  let qvec = cross(tvec, edge1);
  let v = dot(ray.direction.xyz, qvec) * invDet;
  if (v < 0.0 || u + v > 1.0) {
    return no_candidate();
  }

  let distance = dot(edge2, qvec) * invDet;
  if (distance <= transport_ray_minimum()) {
    return no_candidate();
  }

  let geometric = safe_normalize(cross(edge1, edge2), vec3<f32>(0.0, 1.0, 0.0));
  let frontFace = select(0u, 1u, dot(ray.direction.xyz, geometric) < 0.0);
  let orientedGeometric = select(-geometric, geometric, frontFace == 1u);
  let w = 1.0 - u - v;
  let interpolated =
    triangle.n0.xyz * w +
    triangle.n1.xyz * u +
    triangle.n2.xyz * v;
  let shading = repair_shading_normal(orientedGeometric, interpolated);
  let barycentric = vec3<f32>(w, u, v);
  let uv =
    triangle.uv0uv1.xy * w +
    triangle.uv0uv1.zw * u +
    triangle.uv2Pad.xy * v;
  return surface_candidate(
    distance,
    orientedGeometric,
    shading,
    barycentric,
    uv,
    frontFace,
    triangleIndex,
    triangle.triangleId,
    triangle.materialRefId,
    triangle.mediumRefId
  );
}
`;
