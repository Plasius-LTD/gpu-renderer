const NONE = 0xffffffff;
const validRgb = (value) => Array.isArray(value) && value.length === 3
  && value.every((channel) => Number.isFinite(Math.fround(channel)) && channel >= 0);

// CPU correctness oracle, not a host renderer or a transport implementation.
export function reducePathTreeReference(nodes, root, { sourcePixelId, sampleId, maxDepth }) {
  const failure = () => ({ radiance: [0, 0, 0], complete: false, terminalPaths: 0 });
  if (!Array.isArray(nodes) || !Number.isSafeInteger(root) || root < 0 || root >= nodes.length
    || !Number.isSafeInteger(maxDepth) || maxDepth < 1 || maxDepth > 32) return failure();
  let index = root;
  let previous = NONE;
  let radiance = [0, 0, 0];
  let terminalPaths = 0;
  for (let step = 0; step <= nodes.length * 3; step += 1) {
    const node = nodes[index];
    if (!node || node.flags !== 1 || node.rootId !== root || node.sourcePixelId !== sourcePixelId || node.sampleId !== sampleId
      || !Number.isSafeInteger(node.depth) || node.depth < 0 || node.depth >= maxDepth
      || !validRgb(node.direct) || !validRgb(node.terminal)) return failure();
    if (index === root ? node.parent !== NONE || node.depth !== 0
      : !nodes[node.parent] || nodes[node.parent].depth + 1 !== node.depth) return failure();
    const hasChild = node.firstChild !== NONE;
    if ((!hasChild && node.secondChild !== NONE) || (hasChild && node.firstChild === node.secondChild)
      || (hasChild ? node.terminalKind !== 0 : !Number.isSafeInteger(node.terminalKind) || node.terminalKind < 1)) return failure();
    let next = node.parent;
    if (previous === node.parent) {
      radiance = radiance.map((value, channel) => Math.fround(value + Math.fround(node.direct[channel] + node.terminal[channel])));
      if (!validRgb(radiance)) return failure();
      if (!hasChild) terminalPaths += 1;
      if (hasChild) next = node.firstChild;
    } else if (previous === node.firstChild) {
      if (node.secondChild !== NONE) next = node.secondChild;
    } else if (previous !== node.secondChild) return failure();
    if (next === NONE) return { radiance, complete: true, terminalPaths };
    if (!Number.isSafeInteger(next) || next < 0 || next >= nodes.length) return failure();
    if (next !== node.parent && nodes[next]?.parent !== index) return failure();
    previous = index;
    index = next;
  }
  return failure();
}
