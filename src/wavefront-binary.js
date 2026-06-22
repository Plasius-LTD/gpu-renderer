export function writeVec4(floatView, byteOffset, value) {
  const offset = byteOffset / 4;
  floatView[offset] = value?.[0] ?? 0;
  floatView[offset + 1] = value?.[1] ?? 0;
  floatView[offset + 2] = value?.[2] ?? 0;
  floatView[offset + 3] = value?.[3] ?? 0;
}
