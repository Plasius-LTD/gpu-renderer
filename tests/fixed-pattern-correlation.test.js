import test from "node:test";
import assert from "node:assert/strict";
import {fixedPatternWords} from "../src/wavefront-fixed-pattern.js";
import {WAVEFRONT_SAMPLE_DIMENSIONS as D} from "../src/wavefront-sampling-dimensions.js";

// Characterization of the retained fast control, NOT an acceptance test for
// correct multidimensional sampling. Changing this sampler needs a new control.
test("fast control has uniform scalar marginals but degenerate cross-event quadrants",()=>{
 for(const [a,b] of [[D.emissiveLightSelection,D.emissiveLightSurface],
  [D.bsdfLobeSelector,D.diffuseHemisphere],[D.directLightSelector,D.directEnvironment]]){
  for(const count of [32,1024]){
   const quadrants=[0,0,0,0];
   for(let sample=0;sample<count;sample++){
    const x=fixedPatternWords(sample,0,a)[0]>>>31,y=fixedPatternWords(sample,0,b)[0]>>>31;
    quadrants[2*x+y]++;
   }
   assert.deepEqual(quadrants,[0,count/2,count/2,0]);
   assert.equal(quadrants[0]+quadrants[1],count/2); // selector marginal
   assert.equal(quadrants[0]+quadrants[2],count/2); // surface-U marginal
   assert.notEqual(quadrants[0]/count,0.25); // joint integral's known value
  }
 }
});
