export const WAVEFRONT_INSTANCE_SHADER_WGSL = `
struct MeshInstance {
  world: mat4x4<f32>,
  inverse: mat4x4<f32>,
  objectId: u32,
  root: u32,
  handedness: f32,
  _pad: u32,
};
@group(0) @binding(47) var meshInstances: texture_2d<u32>;
fn read_mesh_instance(index: u32) -> MeshInstance {
  let recordsPerRow = textureDimensions(meshInstances).x / 9u;
  let x = i32((index % recordsPerRow) * 9u);
  let y = i32(index / recordsPerRow);
  let metadata = textureLoad(meshInstances, vec2<i32>(x + 8, y), 0);
  return MeshInstance(
    mat4x4<f32>(bitcast<vec4<f32>>(textureLoad(meshInstances, vec2<i32>(x, y), 0)),
      bitcast<vec4<f32>>(textureLoad(meshInstances, vec2<i32>(x + 1, y), 0)),
      bitcast<vec4<f32>>(textureLoad(meshInstances, vec2<i32>(x + 2, y), 0)),
      bitcast<vec4<f32>>(textureLoad(meshInstances, vec2<i32>(x + 3, y), 0))),
    mat4x4<f32>(bitcast<vec4<f32>>(textureLoad(meshInstances, vec2<i32>(x + 4, y), 0)),
      bitcast<vec4<f32>>(textureLoad(meshInstances, vec2<i32>(x + 5, y), 0)),
      bitcast<vec4<f32>>(textureLoad(meshInstances, vec2<i32>(x + 6, y), 0)),
      bitcast<vec4<f32>>(textureLoad(meshInstances, vec2<i32>(x + 7, y), 0))),
    metadata.x, metadata.y, bitcast<f32>(metadata.z), 0u);
}

fn instance_normal(instance: MeshInstance, normal: vec3<f32>) -> vec3<f32> {
  let normalMatrix = transpose(mat3x3<f32>(instance.inverse[0].xyz, instance.inverse[1].xyz, instance.inverse[2].xyz));
  return safe_normalize(normalMatrix * normal, vec3<f32>(0.0, 1.0, 0.0));
}

fn triangle_for_candidate(candidate: Candidate) -> TriangleRecord {
  var triangle = triangles[candidate.triangleIndex];
  let instance = read_mesh_instance(candidate.instanceIndex);
  triangle.v0 = instance.world * vec4<f32>(triangle.v0.xyz, 1.0);
  triangle.v1 = instance.world * vec4<f32>(triangle.v1.xyz, 1.0);
  triangle.v2 = instance.world * vec4<f32>(triangle.v2.xyz, 1.0);
  triangle.meshId = instance.objectId;
  return triangle;
}

fn intersect_bvh(ray: RayRecord, initialNearest: f32) -> Candidate {
  var nearest = initialNearest;
  var best = no_candidate();
  let inverseDirection = traversal_inverse_direction(ray);
  let root = bvhNodes[0];
  var stack = array<BvhStackEntry, 64>();
  var stackSize = 1u;
  stack[0] = BvhStackEntry(0u, bounds_entry_distance(ray.origin.xyz, inverseDirection, root.boundsMin.xyz, root.boundsMax.xyz));
  loop {
    if (stackSize == 0u) { break; }
    stackSize -= 1u;
    let entry = stack[stackSize];
    if (entry.distance < 0.0 || entry.distance > nearest) { continue; }
    let node = bvhNodes[entry.index];
    if (node.triangleCount == 0u) {
      let children = ordered_bvh_children(ray.origin.xyz, inverseDirection, node);
      if (children.far.distance >= 0.0 && children.far.distance <= nearest && stackSize < 64u) {
        stack[stackSize] = children.far;
        stackSize += 1u;
      }
      if (children.near.distance >= 0.0 && children.near.distance <= nearest && stackSize < 64u) {
        stack[stackSize] = children.near;
        stackSize += 1u;
      }
    } else {
      let instanceIndex = node.childOrFirst;
      let instance = read_mesh_instance(instanceIndex);
      var localRay = ray;
      localRay.origin = instance.inverse * vec4<f32>(ray.origin.xyz, 1.0);
      // Keep this direction unnormalized so t remains the world-space ray parameter.
      localRay.direction = instance.inverse * vec4<f32>(ray.direction.xyz, 0.0);
      var candidate = intersect_geometry_bvh(localRay, nearest, instance.root, best.hit == 1u);
      let equalWinner = best.hit == 1u && candidate.distance == nearest && instanceIndex > best.instanceIndex;
      if (candidate.hit == 1u && (candidate.distance < nearest || equalWinner)) {
        candidate.geometricNormal = instance_normal(instance, candidate.geometricNormal);
        candidate.shadingNormal = repair_shading_normal(candidate.geometricNormal,
          instance_normal(instance, candidate.shadingNormal));
        if (instance.handedness < 0.0) { candidate.frontFace = 1u - candidate.frontFace; }
        candidate.instanceIndex = instanceIndex;
        nearest = candidate.distance;
        best = candidate;
      }
    }
  }
  return best;
}
`;

export const WAVEFRONT_UNINSTANCED_SHADER_WGSL = `
fn triangle_for_candidate(candidate: Candidate) -> TriangleRecord {
  return triangles[candidate.triangleIndex];
}
fn intersect_bvh(ray: RayRecord, initialNearest: f32) -> Candidate {
  return intersect_geometry_bvh(ray, initialNearest, 0u, false);
}
`;
