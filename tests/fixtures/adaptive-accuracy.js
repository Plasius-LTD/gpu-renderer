// Test oracle for exactly representable, positive normal f32 results only.
// WGSL 15.7.4 defines ULP using the minimum adjacent spacing, including powers of two.
// Division permits 2.5 ULP: https://www.w3.org/TR/WGSL/#floating-point-accuracy
export const WGSL_F32_DIVISION_MAX_ULPS = 2.5;

export function divisionErrorUlps(actual, expected) {
  if (!Number.isFinite(actual) || !Number.isFinite(expected) || expected < 2 ** -126
    || Math.fround(expected) !== expected) return Infinity;
  const floats = new Float32Array([expected]);
  const bits = new Uint32Array(floats.buffer);
  bits[0] -= 1;
  return Math.abs(actual - expected) / (expected - floats[0]);
}
