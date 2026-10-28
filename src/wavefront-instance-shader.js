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
  var stack = array<u32, 64>();
  var stackSize = 1u;
  stack[0] = 0u;
  loop {
    if (stackSize == 0u) { break; }
    stackSize -= 1u;
    let node = bvhNodes[stack[stackSize]];
    if (!intersect_bounds(ray, node.boundsMin.xyz, node.boundsMax.xyz, nearest)) { continue; }
    if (node.triangleCount == 0u) {
      stack[stackSize] = node.childOrFirst;
      stack[stackSize + 1u] = node.rightChild;
      stackSize += 2u;
    } else {
      let instanceIndex = node.childOrFirst;
      let instance = read_mesh_instance(instanceIndex);
      var localRay = ray;
      localRay.origin = instance.inverse * vec4<f32>(ray.origin.xyz, 1.0);
      // Keep this direction unnormalized so t remains the world-space ray parameter.
      localRay.direction = instance.inverse * vec4<f32>(ray.direction.xyz, 0.0);
      var candidate = intersect_geometry_bvh(localRay, nearest, instance.root);
      if (candidate.hit == 1u && candidate.distance < nearest) {
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
  return intersect_geometry_bvh(ray, initialNearest, 0u);
}
`;
