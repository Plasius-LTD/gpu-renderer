import {sobolPairWords,SOBOL_PAIR_WGSL} from './wavefront-progressive-sampling.js';

// Shared fixed camera coordinates. Transport dimensions have a separate key.
export function fixedCameraWords(sampleId,bounce=0){
 const key=Math.imul(bounce,64)>>>0,[x,y]=sobolPairWords(sampleId);
 return [(x^0x80000000^Math.imul(key,0x9e3779b9))>>>0,
  (y^0x80000000^Math.imul(key,0x7546dc55))>>>0];
}
export const FIXED_CAMERA_WGSL=SOBOL_PAIR_WGSL+`
fn fixed_camera_words(sampleId:u32,bounce:u32)->vec2<u32>{
 let key=bounce*64u;
 return sobol_pair_words(sampleId)^vec2<u32>(0x80000000u)^(vec2<u32>(key)*vec2<u32>(0x9e3779b9u,0x7546dc55u));
}
`;
