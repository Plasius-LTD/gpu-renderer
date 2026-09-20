export const PATH_NODE_STRUCT_WGSL = `
struct PathNode {
  directRadiance: vec3<f32>,
  flags: u32,
  terminalRadiance: vec3<f32>,
  terminalKind: u32,
  parent: u32,
  firstChild: u32,
  secondChild: u32,
  rootId: u32,
  sourcePixelId: u32,
  sampleId: u32,
  depth: u32,
  reserved: u32,
};
`;

export const PATH_TREE_WGSL = `
const PATH_NONE: u32 = 0xffffffffu;
const PATH_INITIALIZED: u32 = 1u;
const PATH_FAILED: u32 = 2u;

fn path_radiance_valid(value: vec3<f32>) -> bool {
  return all((bitcast<vec3<u32>>(value) & vec3<u32>(0x7f800000u)) < vec3<u32>(0x7f800000u)) && all(value >= vec3<f32>(0.0));
}

fn begin_path_node(input: RayRecord, queueIndex: u32) -> RayRecord {
  var ray = input;
  let nodeId = select(input.bounce * config.tilePixelCount + queueIndex, input.rayId, input.bounce == 0u);
  ray.parentRayId = nodeId; // Local writer handle; incoming parent is preserved below.
  var node = PathNode();
  node.flags = PATH_INITIALIZED;
  node.parent = input.parentRayId;
  node.firstChild = PATH_NONE;
  node.secondChild = PATH_NONE;
  node.rootId = input.rayId;
  node.sourcePixelId = input.sourcePixelId;
  node.sampleId = input.sampleId;
  node.depth = input.bounce;
  pathNodes[nodeId] = node;
  return ray;
}

fn fail_path_node(ray: RayRecord) {
  pathNodes[ray.parentRayId].flags = pathNodes[ray.parentRayId].flags | PATH_FAILED;
}

fn record_path_direct(ray: RayRecord, value: vec3<f32>) {
  let next = pathNodes[ray.parentRayId].directRadiance + value;
  if (!path_radiance_valid(value) || !path_radiance_valid(next)) { fail_path_node(ray); return; }
  pathNodes[ray.parentRayId].directRadiance = next;
}

fn record_path_terminal(ray: RayRecord, value: vec3<f32>, kind: u32) {
  if (!path_radiance_valid(value) || kind == 0u) { fail_path_node(ray); return; }
  pathNodes[ray.parentRayId].terminalRadiance = value;
  pathNodes[ray.parentRayId].terminalKind = kind;
}

fn link_path_child(ray: RayRecord, childQueueIndex: u32, secondary: bool) {
  let child = (ray.bounce + 1u) * config.tilePixelCount + childQueueIndex;
  if (secondary) { pathNodes[ray.parentRayId].secondChild = child; }
  else { pathNodes[ray.parentRayId].firstChild = child; }
}

// One root owns this walk; nodes are immutable after the bounce passes finish.
// Parent links provide constant traversal state instead of a per-invocation stack.
fn resolve_complete_path_tree(root: u32, sourcePixelId: u32, sampleId: u32) -> vec4<f32> {
  let nodeCount = arrayLength(&pathNodes);
  if (root >= config.tilePixelCount || root >= nodeCount) { return vec4<f32>(0.0); }
  var index = root;
  var previous = PATH_NONE;
  var radiance = vec3<f32>(0.0);
  for (var step = 0u; step <= nodeCount * 3u; step = step + 1u) {
    let node = pathNodes[index];
    if (node.flags != PATH_INITIALIZED || node.rootId != root || node.sourcePixelId != sourcePixelId || node.sampleId != sampleId || node.depth >= config.maxDepth || !path_radiance_valid(node.directRadiance) || !path_radiance_valid(node.terminalRadiance)) { return vec4<f32>(0.0); }
    if (index == root) {
      if (node.parent != PATH_NONE || node.depth != 0u) { return vec4<f32>(0.0); }
    } else {
      if (node.parent >= nodeCount) { return vec4<f32>(0.0); }
      if (pathNodes[node.parent].depth + 1u != node.depth) { return vec4<f32>(0.0); }
    }
    let hasChild = node.firstChild != PATH_NONE;
    if ((!hasChild && node.secondChild != PATH_NONE) || (hasChild && node.firstChild == node.secondChild) || (hasChild && node.terminalKind != 0u) || (!hasChild && node.terminalKind == 0u)) { return vec4<f32>(0.0); }
    var next = node.parent;
    if (previous == node.parent) {
      radiance = radiance + node.directRadiance + node.terminalRadiance;
      if (!path_radiance_valid(radiance)) { return vec4<f32>(0.0); }
      if (hasChild) { next = node.firstChild; }
    } else if (previous == node.firstChild) {
      if (node.secondChild != PATH_NONE) { next = node.secondChild; }
    } else if (previous != node.secondChild) { return vec4<f32>(0.0); }
    if (next == PATH_NONE) { return vec4<f32>(radiance, 1.0); }
    if (next >= nodeCount) { return vec4<f32>(0.0); }
    if (next != node.parent && pathNodes[next].parent != index) { return vec4<f32>(0.0); }
    previous = index;
    index = next;
  }
  return vec4<f32>(0.0);
}
`;
