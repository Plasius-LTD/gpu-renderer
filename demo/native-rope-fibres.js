// Source-demo geometry authoring. Uses the existing native triangle/UV contract;
// caller-selected rope ranges own material identity, never colour/name heuristics.
import { validateNativeMaterials } from "../src/native-surface-materials.js";

export function createRopeFibreMaterial(ropeMaterial) {
  validateNativeMaterials([ropeMaterial]);
  // Suspended fibres do not inherit the packed rope's baked creases/occlusion.
  return { baseColor: ropeMaterial.baseColor, clearcoat: 0 };
}

const STRIDE = 12;
const VERTICES_PER_FIBRE = 63; // Four triangular tube segments, tapering to one tip.
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, s) => a.map(v => v * s);
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => mul(a, 1 / Math.hypot(...a));
const bounded = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;
const fail = () => { throw new Error("Invalid rope fibre input or budget."); };

function prepareGuides(guides) {
  const invalid = () => { throw new Error("Invalid rope groom guides."); };
  if (!Array.isArray(guides) || guides.length > 8) invalid();
  return guides.flatMap(path => {
    if (!Array.isArray(path) || path.length < 2 || path.length > 65 ||
        path.some(p => !Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite))) invalid();
    return path.slice(1).map((point, i) => {
      const a = path[i], d = sub(point, a), squared = dot(d, d);
      if (!Number.isFinite(squared) || squared < 1e-12) invalid();
      return { a, d, squared };
    });
  });
}

function groomTangent(root, normal, guides, fallback) {
  let closest = Infinity, axis = fallback;
  for (const { a, d, squared } of guides) {
    const t = Math.max(0, Math.min(1, dot(sub(root, a), d) / squared));
    const delta = root.map((v, j) => v - a[j] - d[j] * t), distance = dot(delta, delta);
    if (distance < closest) { closest = distance; axis = d; }
  }
  const projected = sub(axis, mul(normal, dot(axis, normal)));
  const tangent = Math.hypot(...projected) > 1e-8 ? unit(projected) : fallback;
  // Consistent helical lay, with only small tuft/strand variations added later.
  return unit(add(tangent, mul(cross(normal, tangent), 0.4)));
}

/** Static metre-scale rope fuzz. Regenerate only when authoring changes, not per frame. */
export function createRopeFibres({ vertices, texcoords, ranges, seed = 7349,
  density = 24000, maxFibres = 1600, length = 0.006, radius = 0.00012, fray = 0.08, guides = [] } = {}) {
  if (!(vertices instanceof Float32Array) || vertices.length % (STRIDE * 3) ||
      vertices.length > 600000 * STRIDE || !(texcoords instanceof Float32Array) ||
      texcoords.length !== vertices.length / STRIDE * 2 ||
      !vertices.every(Number.isFinite) || !texcoords.every(Number.isFinite) ||
      !Array.isArray(ranges) || ranges.length > 256 ||
      !bounded(density, 0, 1000000) || !Number.isInteger(maxFibres) || !bounded(maxFibres, 1, 4000) ||
      !bounded(length, 0.0001, 0.02) || !bounded(radius, 0.00001, Math.min(0.001, length / 4)) ||
      !Number.isInteger(seed) || !bounded(seed, 0, 0xffffffff) || !bounded(fray, 0, 1)) fail();
  const groom = prepareGuides(guides);
  let end = 0;
  for (const range of ranges) {
    if (!range || !Number.isInteger(range.firstVertex) || range.firstVertex < end || range.firstVertex % 3 ||
        !Number.isInteger(range.vertexCount) || range.vertexCount < 3 || range.vertexCount % 3 ||
        range.firstVertex + range.vertexCount > vertices.length / STRIDE) fail();
    end = range.firstVertex + range.vertexCount;
  }
  const position = vertex => [...vertices.slice(vertex * STRIDE, vertex * STRIDE + 3)];
  const triangles = [];
  let totalArea = 0;
  for (const range of ranges) {
    for (let i = range.firstVertex; i < range.firstVertex + range.vertexCount; i += 3) {
      const face = cross(sub(position(i + 1), position(i)), sub(position(i + 2), position(i)));
      const area = Math.hypot(...face) / 2;
      if (area <= 1e-12) continue;
      totalArea += area;
      triangles.push({ first: i, areaEnd: totalArea, normal: unit(face) });
    }
  }
  const fibreCount = Math.min(maxFibres, Math.round(totalArea * density));
  const looseEndCount = Math.round(fibreCount * fray);
  // Independent seeded permutation gives exact, nested wear selections without
  // consuming geometry randomness or moving roots when the fray level changes.
  const ranks = Uint32Array.from({ length: fibreCount }, (_, i) => i);
  let rankState = (seed ^ 0x9e3779b9) >>> 0;
  for (let i = fibreCount - 1; i > 0; i--) {
    rankState = (rankState * 1664525 + 1013904223) >>> 0;
    const j = Math.floor(rankState / 4294967296 * (i + 1));
    [ranks[i], ranks[j]] = [ranks[j], ranks[i]];
  }
  const output = new Float32Array(fibreCount * VERTICES_PER_FIBRE * STRIDE);
  const outputUv = new Float32Array(fibreCount * VERTICES_PER_FIBRE * 2);
  let state = seed, cursor = 0;
  const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
  let triangle, anchor, anchorWeights, tuftAngle, tuftCurl;
  for (let fibre = 0; fibre < fibreCount; fibre++) {
    if (fibre % 4 === 0) {
      const target = random() * totalArea;
      let lo = 0, hi = triangles.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (target < triangles[mid].areaEnd) hi = mid; else lo = mid + 1;
      }
      triangle = triangles[lo];
      const r = Math.sqrt(random()), b = random() * r;
      anchorWeights = [1 - r, b, r - b];
      anchor = [0, 1, 2].map(j => anchorWeights.reduce((sum, w, i) => sum + w * vertices[(triangle.first + i) * STRIDE + j], 0));
      tuftAngle = (random() - 0.5) * 0.12;
      tuftCurl = (random() - 0.5) * 0.18;
    }
    const r = Math.sqrt(random()), b = random() * r;
    let weights = [1 - r, b, r - b];
    const candidate = [0, 1, 2].map(j => weights.reduce((sum, w, i) => sum + w * vertices[(triangle.first + i) * STRIDE + j], 0));
    const spread = fibre % 4 === 0 ? 0 : Math.min(0.2, 0.001 / Math.max(1e-12, Math.hypot(...sub(candidate, anchor))));
    weights = weights.map((w, i) => anchorWeights[i] * (1 - spread) + w * spread);
    const interpolate = (array, stride, start, count) => Array.from({ length: count }, (_, component) =>
      weights.reduce((sum, weight, i) => sum + weight * array[(triangle.first + i) * stride + start + component], 0));
    const root = interpolate(vertices, STRIDE, 0, 3);
    const authoredNormal = interpolate(vertices, STRIDE, 3, 3);
    const normal = Math.hypot(...authoredNormal) > 1e-8 ? unit(authoredNormal) : triangle.normal;
    const fallback = unit(cross(normal, Math.abs(normal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
    const tangent = groomTangent(root, normal, groom, fallback);
    const bitangent = cross(normal, tangent), angle = tuftAngle + (random() - 0.5) * 0.14;
    const direction = add(mul(tangent, Math.cos(angle)), mul(bitangent, Math.sin(angle)));
    const side = cross(normal, direction);
    // Fine nap follows the lay in small tufts, with restrained lift and bend.
    const loose = ranks[fibre] < looseEndCount, variation = random();
    const strandLength = length * (loose ? 1.3 + variation * 0.7 : 0.25 + 0.65 * variation ** 2);
    const curl = tuftCurl + (random() - 0.5) * 0.05;
    const lift = loose ? 0.24 : 0.14;
    const thickness = radius * (0.6 + 0.4 * random());
    const tint = 0.9 + random() * 0.3;
    const colour = interpolate(vertices, STRIDE, 6, 3).map(v => Math.max(0, Math.min(1, v * tint)));
    const uv = interpolate(texcoords, 2, 0, 2);
    const rings = [];
    for (let segment = 0; segment <= 4; segment++) {
      const t = segment / 4;
      const centre = add(root, add(mul(direction, strandLength * (t - 0.2 * t * t)),
        add(mul(normal, -thickness * 0.5 + strandLength * (0.08 * t + lift * t * t)), mul(side, strandLength * curl * t * t))));
      const axis = unit(add(mul(direction, 1 - 0.4 * t), add(mul(normal, 0.08 + 2 * lift * t), mul(side, curl * 2 * t))));
      const u = unit(sub(side, mul(axis, dot(side, axis)))), v = cross(axis, u);
      rings.push(Array.from({ length: 3 }, (_, radial) => {
        const theta = radial * Math.PI * 2 / 3;
        const n = add(mul(u, Math.cos(theta)), mul(v, Math.sin(theta)));
        return { p: add(centre, mul(n, thickness * (1 - t) ** 1.3)), n };
      }));
    }
    const emit = point => {
      output.set([...point.p, ...point.n, ...colour, 1, 0, 0], cursor * STRIDE);
      // Fixed root UV prevents pulling unrelated atlas texels onto loose ends.
      outputUv.set(uv, cursor * 2);
      cursor++;
    };
    for (let segment = 0; segment < 4; segment++) {
      for (let radial = 0; radial < 3; radial++) {
        const next = (radial + 1) % 3;
        const a = rings[segment][radial], b = rings[segment + 1][radial], c = rings[segment][next];
        emit(a); emit(c); emit(b);
        if (segment < 3) { emit(c); emit(rings[segment + 1][next]); emit(b); }
      }
    }
  }
  return { vertices: output, texcoords: outputUv, fibreCount, looseEndCount };
}
