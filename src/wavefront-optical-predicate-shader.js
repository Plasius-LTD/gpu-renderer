// Near-cancellation fallback only. Integer arithmetic prevents floating-point
// reassociation from deleting the edge determinant's small signed remainder.
export const OPTICAL_PREDICATE_WGSL = `
fn optical_multiply_words(wordA: u32, wordB: u32) -> vec2<u32> {
  let low = (wordA & 65535u) * (wordB & 65535u);
  let middle = (wordA >> 16u) * (wordB & 65535u) + (low >> 16u);
  let next = (wordA & 65535u) * (wordB >> 16u) + (middle & 65535u);
  return vec2<u32>((next << 16u) | (low & 65535u),
    (wordA >> 16u) * (wordB >> 16u) + (middle >> 16u) + (next >> 16u));
}
fn optical_accumulate_product(accumulator: ptr<function,array<u32,27>>, factorA: f32, factorB: f32, factorC: f32, negate: bool) {
  let bits = vec3<u32>(bitcast<u32>(factorA),bitcast<u32>(factorB),bitcast<u32>(factorC));
  let exponents = (bits >> vec3<u32>(23u)) & vec3<u32>(255u);
  let mantissa = (bits & vec3<u32>(0x007fffffu)) |
    select(vec3<u32>(0u),vec3<u32>(0x00800000u),exponents != vec3<u32>(0u));
  if (any(mantissa == vec3<u32>(0u))) { return; }
  let ab = optical_multiply_words(mantissa.x,mantissa.y);
  let low = optical_multiply_words(ab.x,mantissa.z);
  let high = optical_multiply_words(ab.y,mantissa.z);
  let middle = low.y + high.x;
  let product = vec3<u32>(low.x,middle,high.y + select(0u,1u,middle < low.y));
  // Every finite binary32 is an integer significand times 2^[-149,104].
  // Align triple products to 2^-447. 18 terms need at most 837 signed bits.
  let powers = max(exponents,vec3<u32>(1u));
  let shift = powers.x + powers.y + powers.z - 3u;
  let word = shift / 32u; let offset = shift % 32u;
  var terms: array<u32,4>;
  terms[0] = product.x << offset;
  terms[1] = (product.y << offset) | select(0u,product.x >> (32u-offset),offset != 0u);
  terms[2] = (product.z << offset) | select(0u,product.y >> (32u-offset),offset != 0u);
  terms[3] = select(0u,product.z >> (32u-offset),offset != 0u);
  let negative = (((bits.x ^ bits.y ^ bits.z) & 0x80000000u) != 0u) != negate;
  var carry = 0u;
  for (var i=word; i<27u; i++) {
    let local = i-word;
    if (local >= 4u && carry == 0u) { break; }
    var term = 0u;
    if (local < 4u) { term = terms[local]; }
    let withCarry = term + carry;
    let overflow = withCarry < term;
    let before = (*accumulator)[i];
    if (negative) {
      carry = select(0u,1u,overflow || before < withCarry);
      (*accumulator)[i] = before - withCarry;
    } else {
      let after = before + withCarry;
      carry = select(0u,1u,overflow || after < before);
      (*accumulator)[i] = after;
    }
  }
}
// Signed leading significand and power of two; sign is exact, interpolation
// retains the leading 24 bits. Scale all three edges together before conversion.
fn optical_exact_edge(ray: RayRecord, a: vec3<f32>, b: vec3<f32>) -> vec2<f32> {
  var sum: array<u32,27>;
  let o=ray.origin.xyz; let d=ray.direction.xyz;
  for (var i=0u; i<3u; i++) {
    let j=(i+1u)%3u; let k=(i+2u)%3u;
    // cross(a-o,b-o).d, expanded so translations are never rounded first.
    optical_accumulate_product(&sum,a[j],b[k],d[i],false);
    optical_accumulate_product(&sum,a[j],o[k],d[i],true);
    optical_accumulate_product(&sum,o[j],b[k],d[i],true);
    optical_accumulate_product(&sum,a[k],b[j],d[i],true);
    optical_accumulate_product(&sum,a[k],o[j],d[i],false);
    optical_accumulate_product(&sum,o[k],b[j],d[i],false);
  }
  let negative=(sum[26] & 0x80000000u) != 0u;
  if (negative) {
    var carry=1u;
    for (var i=0u; i<27u; i++) {
      let inverted=~sum[i]; let value=inverted+carry;
      carry=select(0u,1u,value<inverted); sum[i]=value;
    }
  }
  for (var n=27u; n>0u; n--) {
    let i=n-1u;
    if (sum[i] == 0u) { continue; }
    let leading=i*32u + 31u-countLeadingZeros(sum[i]);
    let shift=select(0u,leading-23u,leading>=23u);
    let word=shift/32u; let offset=shift%32u;
    var significand=sum[word] >> offset;
    if (offset != 0u && word+1u<27u) { significand |= sum[word+1u] << (32u-offset); }
    return vec2<f32>(select(f32(significand),-f32(significand),negative),f32(i32(shift)-447));
  }
  return vec2<f32>(0.0,-447.0);
}
`;
