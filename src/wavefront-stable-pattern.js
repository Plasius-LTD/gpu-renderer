import { sobolPairWords, SOBOL_PAIR_WGSL, hashUint32, mixSeed, progressiveSampleWords } from "./wavefront-progressive-sampling.js";
import { fixedPatternWords } from "./wavefront-fixed-pattern.js";

function reverseBits(word) {
  let x=word>>>0;
  x=((x>>>1)&0x55555555)|((x&0x55555555)<<1);
  x=((x>>>2)&0x33333333)|((x&0x33333333)<<2);
  x=((x>>>4)&0x0f0f0f0f)|((x&0x0f0f0f0f)<<4);
  x=((x>>>8)&0x00ff00ff)|((x&0x00ff00ff)<<8);
  return ((x>>>16)|(x<<16))>>>0;
}

// Fast prefix-preserving permutation (PBRT 4e, Sobol Samplers).
// Cheaper approximate scramble, not the full nested Owen construction.
export function fastScrambleWord(word, key) {
  let v=reverseBits(word);
  v=(v^Math.imul(v,0x3d20adea))>>>0;
  v=(v+key)>>>0;
  v=Math.imul(v,(key>>>16)|1)>>>0;
  v=(v^Math.imul(v,0x05526c56))>>>0;
  v=(v^Math.imul(v,0x53a22864))>>>0;
  return reverseBits(v);
}

export function stablePatternWords(pixelId, sampleId, bounce, dimension, cameraOnly=false) {
  if(dimension===1)return fixedPatternWords(sampleId,bounce,dimension);
  if(cameraOnly)return progressiveSampleWords(pixelId,sampleId,bounce,0,dimension,"independent-random");
  const seed=mixSeed(pixelId,0,bounce,0,dimension),[x,y]=sobolPairWords(sampleId);
  return [fastScrambleWord(x,hashUint32(seed^0xa511e9b3)),fastScrambleWord(y,hashUint32(seed^0x63d83595))];
}

// Source specialization keeps experimental alternatives outside active shaders.
export function stablePatternWgsl(cameraOnly=false) {
  const lighting=cameraOnly?`
  let seed=mix_seed(pixelId,sampleId,bounce,0u,dimension);
  return vec2<u32>(hash_u32(seed^0xa511e9b3u),hash_u32(seed^0x63d83595u))&vec2<u32>(0xffffff00u);
`:`
  let seed=mix_seed(pixelId,0u,bounce,0u,dimension);
  let word=sobol_pair_words(sampleId);
  return vec2<u32>(fast_scramble_word(word.x,hash_u32(seed^0xa511e9b3u)),fast_scramble_word(word.y,hash_u32(seed^0x63d83595u)));
`;
  return SOBOL_PAIR_WGSL+`
fn fast_scramble_word(word:u32,key:u32)->u32 {
  var v=reverseBits(word);
  v=v^(v*0x3d20adeau);
  v=v+key;
  v=v*((key>>16u)|1u);
  v=v^(v*0x05526c56u);
  v=v^(v*0x53a22864u);
  return reverseBits(v);
}
fn stable_pattern_words(pixelId:u32,sampleId:u32,bounce:u32,dimension:u32)->vec2<u32>{
  if(dimension==1u){
    let key=(dimension-1u)+bounce*64u;
    return sobol_pair_words(sampleId)^vec2<u32>(0x80000000u)^(vec2<u32>(key)*vec2<u32>(0x9e3779b9u,0x7546dc55u));
  }
`+lighting+`
}
fn sample_dimension_1d(pixelId:u32,sampleId:u32,bounce:u32,frameIndex:u32,dimension:u32)->f32{
  return f32(stable_pattern_words(pixelId,sampleId,bounce,dimension).x>>8u)/16777216.0;
}
fn sample_dimension_2d(pixelId:u32,sampleId:u32,bounce:u32,frameIndex:u32,dimension:u32,strataCount:u32)->vec2<f32>{
  return vec2<f32>(stable_pattern_words(pixelId,sampleId,bounce,dimension)>>vec2<u32>(8u))/16777216.0;
}
`;
}

