// Exact u32 multiplication matches WGSL. Do not alter the legacy CPU reference
// during this isolated experiment: its floating multiplication loses low bits.
function hashUint32(value) {
  let x=value>>>0;
  x=Math.imul((x>>>16)^x,0x45d9f3b)>>>0;
  x=Math.imul((x>>>16)^x,0x45d9f3b)>>>0;
  return ((x>>>16)^x)>>>0;
}
function mixSeed(pixelId,sampleId,bounce,frameIndex,dimension) {
  let x=Math.imul(pixelId,747796405)^Math.imul(sampleId,2891336453)^Math.imul(bounce,277803737)^Math.imul(frameIndex,1442695041)^Math.imul(dimension,1597334677);
  x^=x>>>16;x=Math.imul(x,0x7feb352d);x^=x>>>15;
  x=Math.imul(x,0x846ca68b);return (x^(x>>>16))>>>0;
}

// First two Sobol direction sequences, indexed directly (no budget-dependent
// permutation). Every power-of-two prefix is a two-dimensional digital net.
export function sobolPairWords(sampleId) {
  let index=sampleId>>>0, x=0, y=0, vx=0x80000000, vy=0x80000000;
  while(index){
    if(index&1){x^=vx;y^=vy;}
    index>>>=1;vx>>>=1;vy=(vy^(vy>>>1))>>>0;
  }
  return [x>>>0,y>>>0];
}

// Each node in the ORIGINAL-bit prefix tree chooses its own binary permutation.
// Hash-driven nested Owen scrambling, truncated to 24 bits for exact f32 [0,1).
// The key must remain constant over a pixel/event/component sample sequence.
export function owenScramble24(word, seed) {
  let prefix=0,result=0;
  for(let level=0;level<24;level++){
    const shift=31-level,bit=(word>>>shift)&1;
    const flip=hashUint32(seed^prefix^Math.imul(level+1,0x9e3779b9))&1;
    result|=(bit^flip)<<shift;prefix|=bit<<shift;
  }
  return result>>>0;
}

export function progressiveSampleWords(pixelId,sampleId,bounce,frameIndex,dimension,mode) {
  if(mode==="independent-random"){
    const seed=mixSeed(pixelId,sampleId,bounce,frameIndex,dimension);
    return [hashUint32(seed^0xa511e9b3)&0xffffff00,hashUint32(seed^0x63d83595)&0xffffff00].map(x=>x>>>0);
  }
  if(mode!=="owen-sobol")throw new Error("Unknown progressive sampler");
  const seed=mixSeed(pixelId,0,bounce,frameIndex,dimension),[x,y]=sobolPairWords(sampleId);
  return [owenScramble24(x,hashUint32(seed^0xa511e9b3)),owenScramble24(y,hashUint32(seed^0x63d83595))];
}

export function sampleProgressivePair(...args) {
  return progressiveSampleWords(...args).map(word=>(word>>>8)/16777216);
}

export const WAVEFRONT_PROGRESSIVE_SAMPLING_WGSL = `
fn sobol_pair_words(sampleId: u32) -> vec2<u32> {
  var index=sampleId;
  var value=vec2<u32>(0u);
  var direction=vec2<u32>(0x80000000u);
  while(index!=0u){
    if((index&1u)!=0u){value=value^direction;}
    index=index>>1u;
    direction=vec2<u32>(direction.x>>1u,direction.y^(direction.y>>1u));
  }
  return value;
}

fn owen_scramble_24(word: u32, seed: u32) -> u32 {
  var prefix=0u;
  var result=0u;
  for(var level=0u;level<24u;level=level+1u){
    let shift=31u-level;
    let bit=(word>>shift)&1u;
    let flip=hash_u32(seed^prefix^((level+1u)*0x9e3779b9u))&1u;
    result=result|((bit^flip)<<shift);
    prefix=prefix|(bit<<shift);
  }
  return result;
}

fn progressive_sample_words(pixelId: u32, sampleId: u32, bounce: u32, frameIndex: u32, dimension: u32, independent: bool) -> vec2<u32> {
  if(independent){
    let seed=mix_seed(pixelId,sampleId,bounce,frameIndex,dimension);
    return vec2<u32>(hash_u32(seed^0xa511e9b3u),hash_u32(seed^0x63d83595u))&vec2<u32>(0xffffff00u);
  }
  let seed=mix_seed(pixelId,0u,bounce,frameIndex,dimension);
  let word=sobol_pair_words(sampleId);
  return vec2<u32>(owen_scramble_24(word.x,hash_u32(seed^0xa511e9b3u)),owen_scramble_24(word.y,hash_u32(seed^0x63d83595u)));
}
`;
