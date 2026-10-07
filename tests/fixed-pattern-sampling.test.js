import test from "node:test";
import assert from "node:assert/strict";
import { fixedPatternWords, FIXED_PATTERN_WGSL } from "../src/wavefront-fixed-pattern.js";
import { sampleWavefrontDimension1D, sampleWavefrontDimension2D, listWavefrontSampleDimensions, withProgressiveSampling } from "../src/wavefront-sampling-dimensions.js";
import { resolveTransportExperiments } from "../src/wavefront-core.js";
import { WAVEFRONT_COMPUTE_WGSL, createWavefrontPathTracingComputeShaderSource } from "../src/wavefront-shaders.js";
import { createWavefrontPipelineResources } from "../src/wavefront-pipelines.js";
import { createAdaptiveCameraRayPipeline } from "../src/wavefront-adaptive-camera.js";
import { createSharedAdaptivePipelines } from "../src/wavefront-adaptive-shared.js";
import { createPrunedContinuationShader } from "../src/wavefront-pruned-continuations.js";
import { createWavefrontPathTracingComputeConfig } from "../src/index.js";

const flag="renderer.sampling.fixedPattern.enabled";
test("fixed pattern starts at camera centre and never depends on pixel, frame or budget",()=>{
  assert.deepEqual(fixedPatternWords(0,0,1),[0x80000000,0x80000000]);
  assert.deepEqual(sampleWavefrontDimension2D(100,0,0,43,1,32,"fixed-pattern"),[0.5,0.5]);
  for(const {dimension} of listWavefrontSampleDimensions())for(let bounce=0;bounce<8;bounce++)for(let ordinal=0;ordinal<32;ordinal++){
    const expected=fixedPatternWords(ordinal,bounce,dimension).map(x=>(x>>>8)/2**24);
    for(const [pixel,frame,budget] of [[0,0,1],[23,7,8],[0xffffffff,43,32]]){
      assert.deepEqual(sampleWavefrontDimension2D(pixel,ordinal,bounce,frame,dimension,budget,"fixed-pattern"),expected);
      assert.equal(sampleWavefrontDimension1D(pixel,ordinal,bounce,frame,dimension,"fixed-pattern"),expected[0]);
    }
    assert.ok(expected.every(x=>x>=0&&x<1));
  }
  assert.notDeepEqual(fixedPatternWords(0,0,22),fixedPatternWords(0,1,22));
  assert.notDeepEqual(fixedPatternWords(0,0,22),fixedPatternWords(0,0,23));
});
test("fixed digital shifts preserve 2D dyadic prefix occupancy, not independent-key unbiasedness",()=>{
  for(const dimension of [1,22,42])for(let p=0;p<=8;p++)for(let bits=0;bits<=p;bits++){
    const cells=new Set();
    for(let i=0;i<2**p;i++){
      const [x,y]=fixedPatternWords(i,2,dimension);
      cells.add(`${Math.floor(x/2**(32-bits))},${Math.floor(y/2**(32-p+bits))}`);
    }
    assert.equal(cells.size,2**p);
  }
});
test("fixed pattern flag accepts snapshots, rejects other samplers, and preserves off ABI",()=>{
  assert.equal(resolveTransportExperiments().effective.fixedPattern,false);
  for(const options of [{[flag]:true},{featureFlags:{[flag]:true}},{featureFlags:{enabled:{[flag]:true}}},{featureFlags:{flags:{[flag]:true}}},{featureFlags:{renderer:{sampling:{fixedPattern:true}}}},{featureFlags:{renderer:{sampling:{fixedPattern:{enabled:true}}}}}]){
    assert.equal(resolveTransportExperiments(options).bitmask,1024);
    assert.deepEqual(createWavefrontPathTracingComputeConfig(options).memory,createWavefrontPathTracingComputeConfig().memory);
  }
  assert.equal(resolveTransportExperiments({[flag]:false,featureFlags:{[flag]:true}}).bitmask,0);
  for(const other of ["owenSobol","independentRandom"])assert.throws(()=>resolveTransportExperiments({[flag]:true,[`renderer.sampling.${other}.enabled`]:true}),/mutually exclusive/);
});
test("fixed-only shader replaces all 1D/2D randomness while preserving legacy source",async()=>{
  assert.equal(withProgressiveSampling(WAVEFRONT_COMPUTE_WGSL),WAVEFRONT_COMPUTE_WGSL);
  const source=createWavefrontPathTracingComputeShaderSource({progressiveSampling:"fixed-pattern"});
  assert.ok(source.includes(FIXED_PATTERN_WGSL));
  assert.doesNotMatch(source,/return random01\(mix_seed|fn owen_scramble_24|let stratified = fract/);
  assert.match(source,/return f32\(fixed_pattern_words\(sampleId, bounce, dimension\).x >> 8u\)/);
  const modules=[],device={createBindGroupLayout:x=>x,createPipelineLayout:x=>x,
    createShaderModule:x=>{modules.push(x);return {getCompilationInfo:async()=>({messages:[]})};},
    createComputePipelineAsync:async x=>x,createRenderPipelineAsync:async x=>x};
  await createWavefrontPipelineResources({device,constants:{shader:{COMPUTE:4,FRAGMENT:2,VERTEX:1}},format:"bgra8unorm",config:{transportExperimentFlags:1024}});
  assert.equal(modules.find(m=>m.label==="plasius.wavefront.computeShader").code,source);
  modules.length=0;
  await createAdaptiveCameraRayPipeline(device,{}, {enabled:true,progressiveSampling:"fixed-pattern"});
  await createSharedAdaptivePipelines(device,{}, {enabled:true,progressiveSampling:"fixed-pattern"});
  for(const m of modules)assert.ok(m.code.includes(FIXED_PATTERN_WGSL));
  assert.ok(createPrunedContinuationShader({progressiveSampling:"fixed-pattern"}).includes(FIXED_PATTERN_WGSL));
});
