import test from "node:test";
import assert from "node:assert/strict";
import { STABLE_REFERENCE, validateStableReferenceFrame } from "./fixtures/stable-reference-contract.js";

test("reference locks native 4K, six bounces and corrected stable sampling",()=>{
 assert.deepEqual(STABLE_REFERENCE,{width:3840,height:2160,maxDepth:6,maximumSpp:32,sampler:"stable-pattern",denoise:false});
 assert(Object.isFrozen(STABLE_REFERENCE));
});
test("reference rejects incomplete, wrong-sized, wrong-mode and mismatched budget evidence",()=>{
 const plan={totalSamples:49351680,bands:[{spp:1,pixels:2073600},{spp:32,pixels:414720}]};
 const frame={width:3840,height:2160,mode:"radial",sampler:"stable-pattern",diagnostics:true,fused:false,validationErrors:0,actualSamples:plan.totalSamples,actualHistogram:{1:2073600,32:414720}};
 assert.equal(validateStableReferenceFrame(frame,plan),true);
 for(const patch of [{width:1920},{height:1080},{mode:"fixed"},{sampler:"fixed-pattern"},{diagnostics:false},{fused:true},{validationErrors:1},{actualSamples:null},{actualHistogram:{1:2073600,32:1}}])
  assert.throws(()=>validateStableReferenceFrame({...frame,...patch},plan),/reference/);
});
