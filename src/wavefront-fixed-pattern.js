import {stablePatternWords,stablePatternWgsl} from './wavefront-stable-pattern.js';

// Fixed camera quadrature plus independently keyed transport. Reuse the same
// tested transport sequence as the explicit independent-transport diagnostic.
export function fixedPatternWords(sampleId,bounce,dimension,pixelId=0){
 return stablePatternWords(pixelId,sampleId,bounce,dimension,true);
}
export const FIXED_PATTERN_WGSL=stablePatternWgsl(true);
