export const WAVEFRONT_SHADER_BVH_WGSL = `
fn default_mesh_range() -> MeshRange {
  return MeshRange(
    0u,
    0u,
    0u,
    0u,
    0u,
    0u,
    0u,
    0u,
    0u,
    0u,
    0u,
    0u,
    vec4<f32>(0.72, 0.72, 0.68, 1.0),
    vec4<f32>(0.0),
    vec4<f32>(0.72, 0.0, 1.0, 1.45),
    vec4<f32>(0.0, 0.0, 0.0, 0.08),
    vec4<f32>(1.0, 1.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 1.0, 1.0),
    vec4<f32>(1.0, 1.0, 1.0, 0.0)
  );
}

fn mesh_range_for_triangle(triangleIndex: u32) -> MeshRange {
  var selected = default_mesh_range();
  for (var meshIndex = 0u; meshIndex < config.meshSourceCount; meshIndex = meshIndex + 1u) {
    let mesh = meshRanges[meshIndex];
    let triangleStart = mesh.firstTriangle;
    let triangleEnd = mesh.firstTriangle + mesh.triangleCount;
    if (triangleIndex >= triangleStart && triangleIndex < triangleEnd) {
      selected = mesh;
      break;
    }
  }
  return selected;
}

fn node_bounds_min(left: BvhNode, right: BvhNode) -> vec3<f32> {
  return min(left.boundsMin.xyz, right.boundsMin.xyz);
}

fn node_bounds_max(left: BvhNode, right: BvhNode) -> vec3<f32> {
  return max(left.boundsMax.xyz, right.boundsMax.xyz);
}

fn ordered_float_key(value: f32) -> u32 {
  let bits = bitcast<u32>(value);
  let sign = bits & 0x80000000u;
  let mask = select(0x80000000u, 0xffffffffu, sign != 0u);
  return bits ^ mask;
}

fn split_by_3(value: u32) -> u32 {
  var x = value & 0x000003ffu;
  x = (x | (x << 16u)) & 0x030000ffu;
  x = (x | (x << 8u)) & 0x0300f00fu;
  x = (x | (x << 4u)) & 0x030c30c3u;
  x = (x | (x << 2u)) & 0x09249249u;
  return x;
}

fn morton_key_from_centroid(centroid: vec3<f32>) -> u32 {
  let x = (ordered_float_key(centroid.x) >> 12u) & 0x000003ffu;
  let y = (ordered_float_key(centroid.y) >> 12u) & 0x000003ffu;
  let z = (ordered_float_key(centroid.z) >> 12u) & 0x000003ffu;
  return (split_by_3(x) << 2u) | (split_by_3(y) << 1u) | split_by_3(z);
}

fn leaf_ref_less(left: BvhLeafRef, right: BvhLeafRef) -> bool {
  if (left.key < right.key) {
    return true;
  }
  if (left.key > right.key) {
    return false;
  }
  return left.triangleIndex < right.triangleIndex;
}

@compute @workgroup_size(64)
fn prepareMeshTrianglesAndLeaves(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let triangleIndex = globalId.x;
  if (triangleIndex >= config.triangleCount) {
    if (triangleIndex < config.bvhSortItemCount) {
      bvhLeafRefs[triangleIndex] = BvhLeafRef(0xffffffffu, 0xffffffffu, 0u, 0u);
    }
    return;
  }

  let mesh = mesh_range_for_triangle(triangleIndex);
  let localTriangle = triangleIndex - mesh.firstTriangle;
  let indexOffset = mesh.firstIndex + localTriangle * 3u;
  let index0 = meshIndices[indexOffset];
  let index1 = meshIndices[indexOffset + 1u];
  let index2 = meshIndices[indexOffset + 2u];
  let vertex0 = meshVertices[index0];
  let vertex1 = meshVertices[index1];
  let vertex2 = meshVertices[index2];
  let edge1 = vertex1.position.xyz - vertex0.position.xyz;
  let edge2 = vertex2.position.xyz - vertex0.position.xyz;
  let centroid = (vertex0.position.xyz + vertex1.position.xyz + vertex2.position.xyz) / 3.0;
  let faceNormal = safe_normalize(cross(edge1, edge2), vec3<f32>(0.0, 1.0, 0.0));
  let n0 = select(faceNormal, safe_normalize(vertex0.normal.xyz, faceNormal), vertex0.normal.w > 0.5);
  let n1 = select(faceNormal, safe_normalize(vertex1.normal.xyz, faceNormal), vertex1.normal.w > 0.5);
  let n2 = select(faceNormal, safe_normalize(vertex2.normal.xyz, faceNormal), vertex2.normal.w > 0.5);
  let uv0 = select(vec2<f32>(0.0), vertex0.uv.xy, vertex0.uv.z > 0.5);
  let uv1 = select(vec2<f32>(0.0), vertex1.uv.xy, vertex1.uv.z > 0.5);
  let uv2 = select(vec2<f32>(0.0), vertex2.uv.xy, vertex2.uv.z > 0.5);

  triangles[triangleIndex] = TriangleRecord(
    triangleIndex,
    mesh.meshId,
    mesh.materialKind,
    mesh.flags,
    mesh.materialRefId,
    mesh.mediumRefId,
    mesh.materialSlot,
    0u,
    vec4<f32>(vertex0.position.xyz, 0.0),
    vec4<f32>(vertex1.position.xyz, 0.0),
    vec4<f32>(vertex2.position.xyz, 0.0),
    vec4<f32>(n0, 0.0),
    vec4<f32>(n1, 0.0),
    vec4<f32>(n2, 0.0),
    vec4<f32>(uv0, uv1),
    vec4<f32>(uv2, 0.0, 0.0),
    mesh.color,
    mesh.emission,
    mesh.material,
    mesh.materialResponse,
    mesh.materialExtension,
    mesh.specularColor,
    mesh.baseColorAtlas,
    mesh.metallicRoughnessAtlas,
    mesh.normalAtlas,
    mesh.occlusionAtlas,
    mesh.emissiveAtlas,
    mesh.textureSettings
  );

  let leafBase = config.triangleCount - 1u;
  let nodeIndex = leafBase + triangleIndex;
  let boundsMin = min(vertex0.position.xyz, min(vertex1.position.xyz, vertex2.position.xyz));
  let boundsMax = max(vertex0.position.xyz, max(vertex1.position.xyz, vertex2.position.xyz));
  bvhLeafRefs[triangleIndex] = BvhLeafRef(
    morton_key_from_centroid(centroid),
    triangleIndex,
    0u,
    0u
  );
  bvhNodes[nodeIndex] = BvhNode(
    vec4<f32>(boundsMin, 0.0),
    vec4<f32>(boundsMax, 0.0),
    triangleIndex,
    1u,
    0u,
    0u
  );
}

@compute @workgroup_size(64)
fn sortBvhLeafRefs(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let index = globalId.x;
  let sortCount = config.bvhSortItemCount;
  if (sortCount <= 1u || index >= sortCount) {
    return;
  }

  let compareDistance = config.bvhBuildNodeStart;
  let sequenceSize = config.bvhBuildNodeCount;
  if (compareDistance == 0u || sequenceSize == 0u) {
    return;
  }

  let partner = index ^ compareDistance;
  if (partner <= index || partner >= sortCount) {
    return;
  }

  let left = bvhLeafRefs[index];
  let right = bvhLeafRefs[partner];
  let ascending = (index & sequenceSize) == 0u;
  let leftIsLess = leaf_ref_less(left, right);
  let rightIsLess = leaf_ref_less(right, left);
  let shouldSwap = select(leftIsLess, rightIsLess, ascending);
  if (shouldSwap) {
    bvhLeafRefs[index] = right;
    bvhLeafRefs[partner] = left;
  }
}

@compute @workgroup_size(64)
fn writeSortedBvhLeaves(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let sortedIndex = globalId.x;
  if (sortedIndex >= config.triangleCount || config.triangleCount == 0u) {
    return;
  }

  let leafRef = bvhLeafRefs[sortedIndex];
  if (leafRef.triangleIndex >= config.triangleCount) {
    return;
  }

  let triangle = triangles[leafRef.triangleIndex];
  let boundsMin = min(triangle.v0.xyz, min(triangle.v1.xyz, triangle.v2.xyz));
  let boundsMax = max(triangle.v0.xyz, max(triangle.v1.xyz, triangle.v2.xyz));
  let leafBase = config.triangleCount - 1u;
  let nodeIndex = leafBase + sortedIndex;
  bvhNodes[nodeIndex] = BvhNode(
    vec4<f32>(boundsMin, 0.0),
    vec4<f32>(boundsMax, 0.0),
    leafRef.triangleIndex,
    1u,
    0u,
    0u
  );
}

@compute @workgroup_size(64)
fn buildBvhInternalLevel(@builtin(global_invocation_id) globalId: vec3<u32>) {
  if (config.triangleCount <= 1u || globalId.x >= config.bvhBuildNodeCount) {
    return;
  }

  let internalCount = config.triangleCount - 1u;
  let nodeIndex = config.bvhBuildNodeStart + globalId.x;
  if (nodeIndex >= internalCount || nodeIndex >= config.bvhNodeCapacity) {
    return;
  }

  let leftIndex = nodeIndex * 2u + 1u;
  let rightIndex = nodeIndex * 2u + 2u;
  if (rightIndex >= config.bvhNodeCapacity || rightIndex >= config.bvhNodeCount) {
    return;
  }

  let left = bvhNodes[leftIndex];
  let right = bvhNodes[rightIndex];
  bvhNodes[nodeIndex] = BvhNode(
    vec4<f32>(node_bounds_min(left, right), 0.0),
    vec4<f32>(node_bounds_max(left, right), 0.0),
    leftIndex,
    0u,
    rightIndex,
    0u
  );
}

fn make_ray(pixelIndex: u32) -> RayRecord {
  let localX = pixelIndex % config.tileWidth;
  let localY = pixelIndex / config.tileWidth;
  let px = config.tileX + localX;
  let py = config.tileY + localY;
  let sampleId = u32(config.projectionAndSampling.w);
  let sourcePixelId = py * config.canvasWidth + px;
  let jitter = sample_dimension_2d(
    sourcePixelId,
    sampleId,
    0u,
    config.frameIndex,
    SAMPLE_DIM_CAMERA_JITTER,
    config.samplesPerPixel
  ) - vec2<f32>(0.5);
  let jitterX = jitter.x;
  let jitterY = jitter.y;
  let ndcX = ((f32(px) + 0.5 + jitterX * 0.35) / f32(config.canvasWidth)) * 2.0 - 1.0;
  let ndcY = 1.0 - ((f32(py) + 0.5 + jitterY * 0.35) / f32(config.canvasHeight)) * 2.0;
  let viewX = ndcX * config.projectionAndSampling.x * config.projectionAndSampling.y;
  let viewY = ndcY * config.projectionAndSampling.x;
  let direction = safe_normalize(
    config.cameraForward.xyz + config.cameraRight.xyz * viewX + config.cameraUp.xyz * viewY,
    config.cameraForward.xyz
  );
  return RayRecord(
    pixelIndex,
    0xffffffffu,
    sourcePixelId,
    sampleId,
    0u,
    0u,
    0u,
    0u,
    vec4<f32>(config.cameraPosition.xyz, 1.0),
    vec4<f32>(direction, 0.0),
    vec4<f32>(1.0, 1.0, 1.0, 1.0)
  );
}

fn make_miss(ray: RayRecord) -> HitRecord {
  let radiance = gated_environment_radiance(ray.origin.xyz, ray.direction.xyz);
  return HitRecord(
    ray.rayId,
    ray.sourcePixelId,
    2u,
    0u,
    0u,
    1u,
    0u,
    0u,
    0u,
    0u,
    0u,
    0u,
    -1.0,
    1.0,
    vec2<f32>(0.0),
    vec4<f32>(ray.origin.xyz + ray.direction.xyz * 1000.0, 1.0),
    vec4<f32>(-ray.direction.xyz, 0.0),
    vec4<f32>(-ray.direction.xyz, 0.0),
    vec4<f32>(0.0),
    vec4<f32>(0.0),
    vec4<f32>(radiance, 1.0),
    vec4<f32>(0.0),
    vec4<f32>(1.0, 0.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 0.0, 0.08),
    vec4<f32>(0.08, 1.0, 0.0, 0.0),
    vec4<f32>(1.0, 1.0, 1.0, 1.0)
  );
}

fn intersect_sphere(ray: RayRecord, object: SceneObject) -> Candidate {
  let oc = ray.origin.xyz - object.center.xyz;
  let radius = max(object.halfExtent.x, 0.001);
  let halfB = dot(oc, ray.direction.xyz);
  let c = dot(oc, oc) - radius * radius;
  let discriminant = halfB * halfB - c;
  if (discriminant < 0.0) {
    return no_candidate();
  }
  let sqrtD = sqrt(discriminant);
  var distance = -halfB - sqrtD;
  if (distance <= 0.001) {
    distance = -halfB + sqrtD;
  }
  if (distance <= 0.001) {
    return no_candidate();
  }
  let position = ray.origin.xyz + ray.direction.xyz * distance;
  let outward = safe_normalize((position - object.center.xyz) / radius, vec3<f32>(0.0, 1.0, 0.0));
  let frontFace = select(0u, 1u, dot(ray.direction.xyz, outward) < 0.0);
  let normal = select(-outward, outward, frontFace == 1u);
  return surface_candidate(
    distance,
    normal,
    normal,
    vec3<f32>(1.0, 0.0, 0.0),
    vec2<f32>(0.0),
    frontFace,
    0xffffffffu,
    object.objectId,
    object.objectId,
    object.mediumRefId
  );
}

fn safe_inverse(value: f32) -> f32 {
  if (abs(value) < 0.000001) {
    return select(-1000000.0, 1000000.0, value >= 0.0);
  }
  return 1.0 / value;
}

fn intersect_box(ray: RayRecord, object: SceneObject) -> Candidate {
  let boxMin = object.center.xyz - object.halfExtent.xyz;
  let boxMax = object.center.xyz + object.halfExtent.xyz;
  let inv = vec3<f32>(
    safe_inverse(ray.direction.x),
    safe_inverse(ray.direction.y),
    safe_inverse(ray.direction.z)
  );
  let t0 = (boxMin - ray.origin.xyz) * inv;
  let t1 = (boxMax - ray.origin.xyz) * inv;
  let tNear = min(t0, t1);
  let tFar = max(t0, t1);
  let entry = max(max(tNear.x, tNear.y), tNear.z);
  let exit = min(min(tFar.x, tFar.y), tFar.z);
  if (exit < max(entry, 0.001)) {
    return no_candidate();
  }
  let distance = max(entry, 0.001);
  let position = ray.origin.xyz + ray.direction.xyz * distance;
  let rel = (position - object.center.xyz) / max(object.halfExtent.xyz, vec3<f32>(0.001));
  let absRel = abs(rel);
  var outward = vec3<f32>(0.0, 1.0, 0.0);
  if (absRel.x >= absRel.y && absRel.x >= absRel.z) {
    outward = vec3<f32>(select(-1.0, 1.0, rel.x >= 0.0), 0.0, 0.0);
  } else if (absRel.y >= absRel.z) {
    outward = vec3<f32>(0.0, select(-1.0, 1.0, rel.y >= 0.0), 0.0);
  } else {
    outward = vec3<f32>(0.0, 0.0, select(-1.0, 1.0, rel.z >= 0.0));
  }
  let frontFace = select(0u, 1u, dot(ray.direction.xyz, outward) < 0.0);
  let normal = select(-outward, outward, frontFace == 1u);
  return surface_candidate(
    distance,
    normal,
    normal,
    vec3<f32>(1.0, 0.0, 0.0),
    vec2<f32>(0.0),
    frontFace,
    0xffffffffu,
    object.objectId,
    object.objectId,
    object.mediumRefId
  );
}

fn intersect_bounds(ray: RayRecord, boundsMin: vec3<f32>, boundsMax: vec3<f32>, nearest: f32) -> bool {
  let inv = vec3<f32>(
    safe_inverse(ray.direction.x),
    safe_inverse(ray.direction.y),
    safe_inverse(ray.direction.z)
  );
  let t0 = (boundsMin - ray.origin.xyz) * inv;
  let t1 = (boundsMax - ray.origin.xyz) * inv;
  let tNear = min(t0, t1);
  let tFar = max(t0, t1);
  let entry = max(max(tNear.x, tNear.y), tNear.z);
  let exit = min(min(tFar.x, tFar.y), tFar.z);
  return exit >= max(entry, 0.001) && entry <= nearest;
}

fn repair_shading_normal(geometricNormal: vec3<f32>, shadingNormal: vec3<f32>) -> vec3<f32> {
  var normal = safe_normalize(shadingNormal, geometricNormal);
  if (dot(normal, geometricNormal) < 0.0) {
    normal = -normal;
  }
  return normal;
}

fn no_candidate() -> Candidate {
  return Candidate(
    0u,
    0.0,
    vec3<f32>(0.0, 1.0, 0.0),
    vec3<f32>(0.0, 1.0, 0.0),
    vec3<f32>(0.0),
    vec2<f32>(0.0),
    1u,
    0xffffffffu,
    0xffffffffu,
    0u,
    0u
  );
}

fn surface_candidate(
  distance: f32,
  geometricNormal: vec3<f32>,
  shadingNormal: vec3<f32>,
  barycentric: vec3<f32>,
  uv: vec2<f32>,
  frontFace: u32,
  triangleIndex: u32,
  primitiveId: u32,
  materialRefId: u32,
  mediumRefId: u32
) -> Candidate {
  return Candidate(
    1u,
    distance,
    geometricNormal,
    shadingNormal,
    barycentric,
    uv,
    frontFace,
    triangleIndex,
    primitiveId,
    materialRefId,
    mediumRefId
  );
}

fn intersect_triangle(ray: RayRecord, triangle: TriangleRecord, triangleIndex: u32) -> Candidate {
  let edge1 = triangle.v1.xyz - triangle.v0.xyz;
  let edge2 = triangle.v2.xyz - triangle.v0.xyz;
  let pvec = cross(ray.direction.xyz, edge2);
  let det = dot(edge1, pvec);
  if (abs(det) < 0.0000001) {
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
  if (distance <= 0.001) {
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

fn intersect_bvh(ray: RayRecord, initialNearest: f32) -> Candidate {
  var nearest = initialNearest;
  var best = no_candidate();
  if (config.bvhNodeCount == 0u || config.triangleCount == 0u) {
    return best;
  }

  var stack = array<u32, 64>();
  var stackSize = 1u;
  stack[0] = 0u;

  loop {
    if (stackSize == 0u) {
      break;
    }

    stackSize = stackSize - 1u;
    let nodeIndex = stack[stackSize];
    if (nodeIndex >= config.bvhNodeCount) {
      continue;
    }

    let node = bvhNodes[nodeIndex];
    if (!intersect_bounds(ray, node.boundsMin.xyz, node.boundsMax.xyz, nearest)) {
      continue;
    }

    if (node.triangleCount > 0u) {
      for (var offset = 0u; offset < node.triangleCount; offset = offset + 1u) {
        let triangleIndex = node.childOrFirst + offset;
        if (triangleIndex >= config.triangleCount) {
          continue;
        }
        let current = intersect_triangle(ray, triangles[triangleIndex], triangleIndex);
        if (current.hit == 1u && current.distance < nearest) {
          nearest = current.distance;
          best = current;
        }
      }
    } else {
      if (stackSize + 2u <= 64u) {
        stack[stackSize] = node.childOrFirst;
        stack[stackSize + 1u] = node.rightChild;
        stackSize = stackSize + 2u;
      }
    }
  }

  return best;
}
`;
