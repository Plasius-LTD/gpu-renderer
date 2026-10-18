// Optical helpers shared by the staged and fused canonical transport. No new
// ray fields: the four existing stack slots hold occupied volumes, not IORs.
export const DIELECTRIC_TRANSPORT_WGSL = `
fn bounded_dielectric_enabled() -> bool {
  return transport_experiment_enabled(16384u);
}
fn nested_media_enabled() -> bool {
  return transport_experiment_enabled(32768u);
}
fn medium_optics(id: u32) -> vec2<f32> {
  if (id == 0u) { return vec2<f32>(1.0, 0.0); }
  return textureLoad(mediumTableTexture, vec2<i32>(i32(id), 2), 0).xy;
}
fn occupied_medium(stack: vec4<u32>) -> u32 {
  var selected = 0u;
  var priority = -1.0;
  for (var i = 0u; i < MAX_MEDIUM_STACK_DEPTH; i++) {
    let id = stack[i];
    if (id != 0u) {
      let p = medium_optics(id).y;
      if (p >= priority) { selected = id; priority = p; }
    }
  }
  return selected;
}
fn medium_stack_contains(ray: RayRecord, id: u32) -> bool {
  return id != 0u && any(ray.mediumStack == vec4<u32>(id));
}
fn medium_transition_failure(ray: RayRecord, hit: HitRecord) -> u32 {
  if (!nested_media_enabled() || !dielectric_event(hit) || hit.mediumRefId == 0u) { return 0u; }
  let present = medium_stack_contains(ray, hit.mediumRefId);
  if (!medium_valid(hit.mediumRefId)) { return 1u; }
  if (hit.frontFace == 1u && present) { return 2u; }
  if (hit.frontFace == 1u && ray.mediumStackDepth >= MAX_MEDIUM_STACK_DEPTH) { return 3u; }
  if (hit.frontFace == 0u && !present) { return 4u; }
  return 0u;
}
fn medium_transition_invalid(ray: RayRecord, hit: HitRecord) -> bool {
  return medium_transition_failure(ray, hit) != 0u;
}
fn dielectric_ratio(ray: RayRecord, hit: HitRecord) -> f32 {
  if (nested_media_enabled() && medium_valid(hit.mediumRefId)) {
    return medium_optics(medium_stack_current_id(ray)).x /
      medium_optics(transmitted_medium_ref_id(ray, hit)).x;
  }
  return dielectric_eta(hit);
}
fn optical_shading_normal(ray: RayRecord, hit: HitRecord) -> vec3<f32> {
  let normal = surface_shading_normal(hit);
  if (!nested_media_enabled() || !medium_valid(hit.mediumRefId)) { return normal; }
  let geometric = safe_normalize(hit.geometricNormal.xyz, normal);
  let eta = dielectric_ratio(ray, hit);
  let cosine = clamp(dot(-ray.direction.xyz, normal), 0.0, 1.0);
  // Reflection-only normal repair is insufficient for a dielectric. A valid
  // transmitted branch must cross the actual triangle before occupancy changes.
  if (dot(reflect(ray.direction.xyz, normal), geometric) <= 0.0) { return geometric; }
  if (eta * eta * (1.0 - cosine * cosine) < 1.0 &&
      dot(refract_direction(ray.direction.xyz, normal, eta), geometric) >= 0.0) { return geometric; }
  return normal;
}
// Unpolarised Fresnel with actual eta_i / eta_t, including TIR and equal media.
fn interface_fresnel(cosine: f32, eta: f32) -> f32 {
  if (eta == 1.0) { return 0.0; }
  let ci = clamp(abs(cosine), 0.0, 1.0);
  let st2 = eta * eta * max(0.0, 1.0 - ci * ci);
  if (st2 >= 1.0) { return 1.0; }
  let ct = sqrt(1.0 - st2);
  let rs = (eta * ci - ct) / (eta * ci + ct);
  let rp = (ci - eta * ct) / (ci + eta * ct);
  return clamp(0.5 * (rs * rs + rp * rp), 0.0, 1.0);
}
fn dielectric_reflection_weight(ray: RayRecord, hit: HitRecord) -> vec3<f32> {
  if (nested_media_enabled() && medium_valid(hit.mediumRefId)) {
    return vec3<f32>(interface_fresnel(dot(-ray.direction.xyz, optical_shading_normal(ray, hit)), dielectric_ratio(ray, hit)));
  }
  return surface_delta_reflection_throughput(hit, -ray.direction.xyz);
}
fn dielectric_transmission_weight(ray: RayRecord, hit: HitRecord) -> vec3<f32> {
  if (nested_media_enabled() && medium_valid(hit.mediumRefId)) {
    let eta = dielectric_ratio(ray, hit);
    let fresnel = interface_fresnel(dot(-ray.direction.xyz, optical_shading_normal(ray, hit)), eta);
    let tint = mix(vec3<f32>(1.0), clamp(hit.color.xyz, vec3<f32>(0.0), vec3<f32>(1.0)), clamp(hit.materialExtension.z, 0.0, 1.0));
    return (1.0 - fresnel) * tint * eta * eta;
  }
  return surface_delta_transmission_throughput(hit, -ray.direction.xyz);
}
fn dielectric_reflection_probability(ray: RayRecord, hit: HitRecord) -> f32 {
  if (dielectric_cannot_refract(ray, hit)) { return 1.0; }
  let r = max_component(dielectric_reflection_weight(ray, hit));
  let t = max_component(dielectric_transmission_weight(ray, hit));
  if (r + t == 0.0) { return 1.0; }
  return r / (r + t);
}
fn scatter_dielectric(ray: RayRecord, hit: HitRecord) -> ScatterResult {
  let normal = optical_shading_normal(ray, hit);
  let etaRatio = dielectric_ratio(ray, hit);
  let transmission = clamp(hit.materialExtension.z, 0.0, 1.0);
  let cannotRefract = dielectric_cannot_refract(ray, hit);
  let reflectChance = schlick(min(dot(-ray.direction.xyz, normal), 1.0), etaRatio);
  var transmissionReflectChance = select(reflectChance, max(reflectChance, 1.0 - transmission), transmission > 0.001);
  if (bounded_dielectric_enabled()) { transmissionReflectChance = dielectric_reflection_probability(ray, hit); }
  let selector = sample_dimension_1d(ray.sourcePixelId, ray.sampleId, ray.bounce, config.frameIndex, SAMPLE_DIM_TRANSMISSION_SELECTOR);
  if (cannotRefract || transmissionReflectChance >= 1.0 || selector < transmissionReflectChance) {
    return ScatterResult(vec4<f32>(reflect(ray.direction.xyz, normal), 0.0),
      select(1.0, transmissionReflectChance, bounded_dielectric_enabled()),
      ray.mediumRefId, RAY_FLAG_DELTA_SAMPLE, SCATTER_LOBE_DELTA_REFLECTION);
  }
  return ScatterResult(vec4<f32>(refract_direction(ray.direction.xyz, normal, etaRatio), 0.0),
    select(1.0, 1.0 - transmissionReflectChance, bounded_dielectric_enabled()),
    transmitted_medium_ref_id(ray, hit), RAY_FLAG_DELTA_SAMPLE, SCATTER_LOBE_DELTA_TRANSMISSION);
}
// Optical origins are offset from their source face. A positive t-min can
// erase a distinct adjacent rim exit even when the authored wall is thick.
var<private> optical_query_minimum: f32;
fn transport_ray_minimum() -> f32 {
  return select(0.001, optical_query_minimum, nested_media_enabled());
}
fn optical_origin_epsilon(position: vec3<f32>) -> f32 {
  let scale = max(max(abs(position.x), abs(position.y)), abs(position.z));
  return max(0.000001, scale * 0.00000047683716);
}
fn recoverable_optical_entry(ray: RayRecord, hit: HitRecord) -> bool {
  // A rounded cap hit can lie just beyond the adjoining wall. The already
  // occupied volume proves this is not a new optical interface. Never repair
  // distant duplicate entries, unmatched exits or camera-inside initialization.
  return nested_media_enabled() && ray.bounce > 0u &&
    medium_transition_failure(ray, hit) == 2u && hit.distance > 0.0 &&
    hit.distance <= optical_origin_epsilon(ray.origin.xyz);
}
fn optical_offset(position: vec3<f32>, normal: vec3<f32>, direction: vec3<f32>) -> vec3<f32> {
  let epsilon = optical_origin_epsilon(position);
  return position + normal * select(-epsilon, epsilon, dot(normal, direction) >= 0.0);
}
fn optical_interior_bound(value: f32, lower: f32, upper: f32) -> f32 {
  if (lower == upper || (value != lower && value != upper)) { return value; }
  let upward = value == lower;
  var candidate = 0.0;
  if (value == 0.0) {
    // WGSL may flush subnormals. This is binary32's smallest normal value,
    // not a scene epsilon; an unresolved interval is deliberately unchanged.
    candidate = select(-bitcast<f32>(0x00800000u), bitcast<f32>(0x00800000u), upward);
  } else {
    let bits = bitcast<u32>(value);
    candidate = bitcast<f32>(select(bits - 1u, bits + 1u, (value > 0.0) == upward));
  }
  return select(value, candidate, candidate > lower && candidate < upper);
}
fn optical_triangle_position(triangle: TriangleRecord, barycentric: vec3<f32>) -> vec3<f32> {
  // Reconstruct on the triangle, not along a distant ray. At the glass rim,
  // cancellation in origin + t*direction placed an admitted hit above its edge.
  let p = triangle.v0.xyz + (triangle.v1.xyz - triangle.v0.xyz) * barycentric.y +
    (triangle.v2.xyz - triangle.v0.xyz) * barycentric.z;
  let lower = min(triangle.v0.xyz, min(triangle.v1.xyz, triangle.v2.xyz));
  let upper = max(triangle.v0.xyz, max(triangle.v1.xyz, triangle.v2.xyz));
  let bounded = clamp(p, lower, upper);
  // A strictly interior wall hit can round onto an adjoining cap, erasing its
  // next exit at t=0. Retain representable interior coordinates (ADR 0060).
  // Genuine edge/vertex hits and planar axes must not be inset.
  if (!all(barycentric > vec3<f32>(0.0))) { return bounded; }
  return vec3<f32>(optical_interior_bound(bounded.x, lower.x, upper.x),
    optical_interior_bound(bounded.y, lower.y, upper.y),
    optical_interior_bound(bounded.z, lower.z, upper.z));
}
fn optical_projected_edge(a: vec2<f32>, b: vec2<f32>) -> f32 {
  // Use identical arithmetic for both orientations of a shared edge, including
  // implementations that contract multiply/subtract. Never widen its boundary.
  let ordered = a.x < b.x || (a.x == b.x && a.y <= b.y);
  let first = select(b, a, ordered);
  let second = select(a, b, ordered);
  let value = first.x * second.y - first.y * second.x;
  return select(-value, value, ordered);
}
fn optical_plane_dot(left: vec3<f32>, right: vec3<f32>) -> f32 {
  // Split rounded products at twelve low significand bits. Summing the high
  // parts separately prevents a contracted dot from losing the grazing-plane
  // remainder. The bit split is intentional: a plain product/error expression
  // permits contraction back into the cancellation-sensitive dot (ADR 0059).
  let high = bitcast<vec3<f32>>(bitcast<vec3<u32>>(left * right) & vec3<u32>(0xfffff000u));
  let low = fma(left, right, -high);
  return (high.x + high.y + high.z) + (low.x + low.y + low.z);
}
// Split heads deliberately cross an integer bit operation, so a compiler cannot
// contract the remainder back into the cancellation-sensitive scalar predicate.
// This bounded fallback improves precision; it is not arbitrary exact arithmetic.
fn optical_wide_head(value: f32) -> f32 {
  return bitcast<f32>(bitcast<u32>(value) & 0xfffff000u);
}
fn optical_wide_pair(head: f32, tail: f32) -> vec2<f32> {
  let high = optical_wide_head(head + tail);
  return vec2<f32>(high, (head - high) + tail);
}
fn optical_wide_value(value: f32) -> vec2<f32> {
  let high = optical_wide_head(value);
  return vec2<f32>(high, value - high);
}
fn optical_wide_add(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
  let high = optical_wide_head(a.x + b.x);
  return optical_wide_pair(high, ((a.x - high) + b.x) + (a.y + b.y));
}
fn optical_wide_multiply(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
  let high = optical_wide_head(a.x * b.x);
  return optical_wide_pair(high, (a.x * b.x - high) + (a.x * b.y + a.y * b.x) + a.y * b.y);
}
fn optical_wide_edge(ray: RayRecord, a: vec3<f32>, b: vec3<f32>) -> f32 {
  // Canonical endpoint order gives identical shared-edge magnitudes in either
  // triangle, including when the compiler contracts individual products.
  let ordered = a.x < b.x || (a.x == b.x && (a.y < b.y || (a.y == b.y && a.z <= b.z)));
  let first = select(b, a, ordered);
  let second = select(a, b, ordered);
  var left: array<vec2<f32>,3>;
  var right: array<vec2<f32>,3>;
  for (var i=0u; i<3u; i++) {
    let origin = optical_wide_value(ray.origin[i]);
    left[i] = optical_wide_add(optical_wide_value(first[i]), -origin);
    right[i] = optical_wide_add(optical_wide_value(second[i]), -origin);
  }
  var total = vec2<f32>(0.0);
  for (var i=0u; i<3u; i++) {
    let j=(i+1u)%3u; let k=(i+2u)%3u;
    let minor = optical_wide_add(optical_wide_multiply(left[j], right[k]),
      -optical_wide_multiply(left[k], right[j]));
    total = optical_wide_add(total, optical_wide_multiply(minor, optical_wide_value(ray.direction[i])));
  }
  return select(-(total.x + total.y), total.x + total.y, ordered);
}
fn optical_edge_uncertain(a: vec3<f32>, b: vec3<f32>, pa: vec2<f32>, pb: vec2<f32>, edge: f32) -> bool {
  // Broad arithmetic filter only: it selects more precise evaluation, NEVER
  // expands triangle coverage. Include translation/shear as well as edge error.
  let aa=abs(a); let bb=abs(b);
  let error = 0.00000095367431640625 *
    ((aa.x+aa.y+aa.z)*(abs(pb.x)+abs(pb.y)) + (bb.x+bb.y+bb.z)*(abs(pa.x)+abs(pa.y)));
  return abs(edge) <= error;
}
fn optical_triangle_coordinates(ray: RayRecord, triangle: TriangleRecord) -> vec4<f32> {
  // Ray-aligned edge tests keep adjoining triangles consistent. Independent
  // Moller-Trumbore barycentrics can both reject the same thin glass seam.
  let direction = ray.direction.xyz;
  let magnitude = abs(direction);
  var z = 0u;
  if (magnitude.y > magnitude[z]) { z = 1u; }
  if (magnitude.z > magnitude[z]) { z = 2u; }
  if (direction[z] == 0.0) { return vec4<f32>(0.0, 0.0, 0.0, -1.0); }
  let x = (z + 1u) % 3u;
  let y = (x + 1u) % 3u;
  let scale = vec2<f32>(direction[x], direction[y]) / direction[z];
  let a = triangle.v0.xyz - ray.origin.xyz;
  let b = triangle.v1.xyz - ray.origin.xyz;
  let c = triangle.v2.xyz - ray.origin.xyz;
  let pa = vec2<f32>(a[x], a[y]) - scale * a[z];
  let pb = vec2<f32>(b[x], b[y]) - scale * b[z];
  let pc = vec2<f32>(c[x], c[y]) - scale * c[z];
  var edges = vec3<f32>(optical_projected_edge(pb, pc),
    optical_projected_edge(pc, pa), optical_projected_edge(pa, pb));
  if (optical_edge_uncertain(b,c,pb,pc,edges.x) || optical_edge_uncertain(c,a,pc,pa,edges.y) ||
      optical_edge_uncertain(a,b,pa,pb,edges.z)) {
    edges = vec3<f32>(optical_wide_edge(ray,triangle.v1.xyz,triangle.v2.xyz),
      optical_wide_edge(ray,triangle.v2.xyz,triangle.v0.xyz), optical_wide_edge(ray,triangle.v0.xyz,triangle.v1.xyz));
  }
  if (any(edges < vec3<f32>(0.0)) && any(edges > vec3<f32>(0.0))) {
    return vec4<f32>(0.0, 0.0, 0.0, -1.0);
  }
  let determinant = edges.x + edges.y + edges.z;
  if (determinant == 0.0) { return vec4<f32>(0.0, 0.0, 0.0, -1.0); }
  let barycentric = edges / determinant;
  // Projected edges decide coverage, not distance ordering. Their normalization
  // is ill-conditioned at grazing corners and can put a re-entry before its
  // exit. Evaluate t on the original plane without the projected cancellation.
  let normal = cross(triangle.v1.xyz - triangle.v0.xyz, triangle.v2.xyz - triangle.v0.xyz);
  let denominator = optical_plane_dot(normal, direction);
  if (denominator == 0.0) { return vec4<f32>(0.0, 0.0, 0.0, -1.0); }
  let distance = optical_plane_dot(normal, a) / denominator;
  if (distance <= transport_ray_minimum()) { return vec4<f32>(0.0, 0.0, 0.0, -1.0); }
  return vec4<f32>(barycentric, distance);
}
`;
