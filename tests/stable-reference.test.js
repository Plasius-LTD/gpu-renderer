import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STABLE_REFERENCE, DEFAULT_REFERENCE, referenceSettingsFor, referenceArtifactStem, validateStableReferenceFrame } from "./fixtures/stable-reference-contract.js";

test("local reference defaults to fast fixed pattern, retaining explicit stable comparison",()=>{
 assert.equal(DEFAULT_REFERENCE.sampler,"fixed-pattern");
 assert.deepEqual(referenceSettingsFor(),DEFAULT_REFERENCE);
 assert.deepEqual(referenceSettingsFor("stable-pattern"),STABLE_REFERENCE);
 assert(Object.isFrozen(DEFAULT_REFERENCE));
 for(const mode of ["legacy","unknown",null,{},true])assert.throws(()=>referenceSettingsFor(mode),/sampler/);
 assert.equal(referenceArtifactStem("fixed-pattern"),"4k-fixed-pattern-6-bounces");
 assert.equal(referenceArtifactStem("stable-pattern"),"4k-stable-6-bounces");
 assert.throws(()=>referenceArtifactStem("../stable"),/sampler/);
 const html=readFileSync(new URL("./fixtures/native-stable-reference.html",import.meta.url),"utf8");
 assert.match(html,/<option value="fixed-pattern" selected>/);
 assert.match(html,/<label for="sampler">/);
 assert.match(html,/Known brightness bias/);
});

test("reference preview stays hidden until a successful capture",()=>{
 const html=readFileSync(new URL("./fixtures/native-stable-reference.html",import.meta.url),"utf8");
 assert.match(html,/img:not\(\[hidden\]\)\{display:block/);
 assert.match(html,/<img id="preview" hidden/);
});

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
 assert.equal(validateStableReferenceFrame({...frame,sampler:"fixed-pattern"},plan,DEFAULT_REFERENCE),true);
 assert.throws(()=>validateStableReferenceFrame(frame,plan,DEFAULT_REFERENCE),/sampling mode/);
 assert.throws(()=>validateStableReferenceFrame(frame,plan,{...STABLE_REFERENCE,maxDepth:4}),/settings/);
});
