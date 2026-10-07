// Centreline guides authored for the hash-verified Wooden Crate 01 fixture.
// Coordinates match its unmodified metre-scale geometry; offset after grounding.
export function createCrateRopeGuides(heightOffset = 0) {
  if (!Number.isFinite(heightOffset)) throw new Error('Invalid crate groom height offset.');
  const loop = [
    [0.382,0.150,-0.058], [0.393,0.175,-0.062], [0.399,0.169,-0.072],
    [0.398,0.125,-0.070], [0.399,0.077,-0.063], [0.399,0.040,-0.042],
    [0.399,0.027,0.004], [0.399,0.044,0.052], [0.398,0.082,0.073],
    [0.397,0.130,0.078], [0.392,0.175,0.073], [0.377,0.169,0.059],
    [0.363,0.138,0.048], [0.361,0.120,0.010], [0.363,0.135,-0.043],
    [0.382,0.150,-0.058],
  ];
  const knot = [
    [0.380,0.121,-0.037], [0.399,0.126,-0.020], [0.400,0.100,0.002],
    [0.403,0.086,0.030], [0.402,0.102,0.039], [0.400,0.122,0.018],
    [0.404,0.140,0.000], [0.403,0.115,-0.012], [0.401,0.096,-0.017],
    [0.395,0.098,0.013],
  ];
  return [-1, 1].flatMap(side => [loop, knot].map(path =>
    path.map(([x, y, z]) => [side * x, y + heightOffset, z])));
}
