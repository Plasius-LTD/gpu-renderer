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

/** Static metre-scale rope fuzz. Regenerate only when authoring changes, not per frame. */
export function createRopeFibres({ vertices, texcoords, ranges, seed = 7349,
  density = 24000, maxFibres = 1600, length = 0.006, radius = 0.00012 } = {}) {
  if (!(vertices instanceof Float32Array) || vertices.length % (STRIDE * 3) ||
      vertices.length > 600000 * STRIDE || !(texcoords instanceof Float32Array) ||
      texcoords.length !== vertices.length / STRIDE * 2 ||
      !vertices.every(Number.isFinite) || !texcoords.every(Number.isFinite) ||
      !Array.isArray(ranges) || ranges.length > 256 ||
      !bounded(density, 0, 1000000) || !Number.isInteger(maxFibres) || !bounded(maxFibres, 1, 2000) ||
      !bounded(length, 0.0001, 0.02) || !bounded(radius, 0.00001, Math.min(0.001, length / 4)) ||
      !Number.isInteger(seed) || !bounded(seed, 0, 0xffffffff)) fail();
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
  const output = new Float32Array(fibreCount * VERTICES_PER_FIBRE * STRIDE);
  const outputUv = new Float32Array(fibreCount * VERTICES_PER_FIBRE * 2);
  let state = seed, cursor = 0;
  const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
  for (let fibre = 0; fibre < fibreCount; fibre++) {
    const target = random() * totalArea;
    let lo = 0, hi = triangles.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (target < triangles[mid].areaEnd) hi = mid; else lo = mid + 1;
    }
    const triangle = triangles[lo];
    const r = Math.sqrt(random()), b = random() * r;
    const weights = [1 - r, b, r - b];
    const interpolate = (array, stride, start, count) => Array.from({ length: count }, (_, component) =>
      weights.reduce((sum, weight, i) => sum + weight * array[(triangle.first + i) * stride + start + component], 0));
    const root = interpolate(vertices, STRIDE, 0, 3);
    const authoredNormal = interpolate(vertices, STRIDE, 3, 3);
    const normal = Math.hypot(...authoredNormal) > 1e-8 ? unit(authoredNormal) : triangle.normal;
    const tangent = unit(cross(normal, Math.abs(normal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
    const bitangent = cross(normal, tangent), angle = random() * Math.PI * 2;
    const direction = add(mul(tangent, Math.cos(angle)), mul(bitangent, Math.sin(angle)));
    const side = cross(normal, direction);
    // Dense short fuzz, with only a few longer loose ends. Curves sweep along
    // the surface before lifting, rather than forming a radial brush of spikes.
    const strandLength = length * (random() < 0.08 ? 1.2 : 0.25 + 0.65 * random() ** 2);
    const curl = (random() - 0.5) * 0.9;
    const thickness = radius * (0.6 + 0.4 * random());
    const tint = 0.9 + random() * 0.3;
    const colour = interpolate(vertices, STRIDE, 6, 3).map(v => Math.max(0, Math.min(1, v * tint)));
    const uv = interpolate(texcoords, 2, 0, 2);
    const rings = [];
    for (let segment = 0; segment <= 4; segment++) {
      const t = segment / 4;
      const centre = add(root, add(mul(direction, strandLength * (t - 0.3 * t * t)),
        add(mul(normal, -thickness * 0.5 + strandLength * (0.08 * t + 0.55 * t * t)), mul(side, strandLength * curl * t * t))));
      const axis = unit(add(mul(direction, 1 - 0.6 * t), add(mul(normal, 0.08 + 1.1 * t), mul(side, curl * 2 * t))));
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
  return { vertices: output, texcoords: outputUv, fibreCount };
}
