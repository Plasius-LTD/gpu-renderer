import test from "node:test";
import assert from "node:assert/strict";
import { stablePatternWords } from "../src/wavefront-stable-pattern.js";
import { fixedPatternWords } from "../src/wavefront-fixed-pattern.js";
import { sampleWavefrontDimension1D, sampleWavefrontDimension2D, listWavefrontSampleDimensions, withProgressiveSampling } from "../src/wavefront-sampling-dimensions.js";
import { resolveTransportExperiments } from "../src/wavefront-core.js";
import { WAVEFRONT_COMPUTE_WGSL, createWavefrontPathTracingComputeShaderSource } from "../src/wavefront-shaders.js";
import { createWavefrontPathTracingComputeConfig } from "../src/index.js";
import { createWavefrontPipelineResources } from "../src/wavefront-pipelines.js";
import { createAdaptiveCameraRayPipeline } from "../src/wavefront-adaptive-camera.js";
import { createSharedAdaptivePipelines } from "../src/wavefront-adaptive-shared.js";
import { createPrunedContinuationShader } from "../src/wavefront-pruned-continuations.js";

test("stable pattern preserves camera points but separates lighting across pixels/events/bounces",()=>{
  for(const mode of ["stable-pattern","stable-camera-random"]) {
    for(const ordinal of [0,1,2,31,255,65537,0xffffffff]) {
      const expected=fixedPatternWords(ordinal,0,1).map(w=>(w>>>8)/2**24);
      assert.deepEqual(sampleWavefrontDimension2D(99,ordinal,0,43,1,1,mode),expected);
    }
    for(const {dimension} of listWavefrontSampleDimensions()) for(const ordinal of [0,1,31,255]) {
      assert.deepEqual(sampleWavefrontDimension2D(99,ordinal,2,7,dimension,32,mode),sampleWavefrontDimension2D(99,ordinal,2,43,dimension,1,mode));
      assert.equal(sampleWavefrontDimension1D(99,ordinal,2,7,dimension,mode),sampleWavefrontDimension1D(99,ordinal,2,43,dimension,mode));
    }
  }
  assert.deepEqual(stablePatternWords(0,0,0,1),[0x80000000,0x80000000]);
  assert.notDeepEqual(stablePatternWords(0,0,0,22),stablePatternWords(1,0,0,22));
  assert.notDeepEqual(stablePatternWords(0,0,0,22),stablePatternWords(0,0,1,22));
  assert.notDeepEqual(stablePatternWords(0,0,0,22),stablePatternWords(0,0,0,23));
});
test("stable lighting keeps dyadic pair occupancy through 256 samples",()=>{
  for(const pixel of [0,7,0xffffffff])for(const dimension of [11,22,42])for(let p=0;p<=8;p++)for(let bits=0;bits<=p;bits++){
    const cells=new Set();
    for(let i=0;i<2**p;i++){
      const [x,y]=stablePatternWords(pixel,i,3,dimension);
      cells.add(`${Math.floor(x/2**(32-bits))},${Math.floor(y/2**(32-p+bits))}`);
      assert.ok(x>=0&&x<=0xffffffff&&y>=0&&y<=0xffffffff);
    }
    assert.equal(cells.size,2**p);
  }
});
test("stable lighting covers analytic single and cross-event integrals spatially",()=>{
  for(const count of [1,2,8,32]){
    let meanX=0,meanXY=0,cross=0;
    const pixels=8192;
    for(let pixel=0;pixel<pixels;pixel++)for(let s=0;s<count;s++){
      const [x,y]=stablePatternWords(pixel,s,0,22).map(w=>(w>>>8)/2**24);
      const [z]=stablePatternWords(pixel,s,1,31).map(w=>(w>>>8)/2**24);
      meanX+=x;meanXY+=x*y;cross+=x*z;
    }
    const n=pixels*count;
    assert.ok(Math.abs(meanX/n-.5)<.01);
    assert.ok(Math.abs(meanXY/n-.25)<.01);
    assert.ok(Math.abs(cross/n-.25)<.01);
  }
});
test("stable flag fails closed on conflicts and preserves default memory/source",async()=>{
  const flag="renderer.sampling.stablePattern.enabled";
  assert.equal(resolveTransportExperiments().effective.stablePattern,false);
  for(const options of [{[flag]:true},{featureFlags:{[flag]:true}},{featureFlags:{enabled:{[flag]:true}}},{featureFlags:{flags:{[flag]:true}}},{featureFlags:{renderer:{sampling:{stablePattern:true}}}},{featureFlags:{renderer:{sampling:{stablePattern:{enabled:true}}}}}]){
    assert.equal(resolveTransportExperiments(options).bitmask,2048);
    assert.deepEqual(createWavefrontPathTracingComputeConfig(options).memory,createWavefrontPathTracingComputeConfig().memory);
  }
  assert.equal(resolveTransportExperiments({[flag]:false,featureFlags:{[flag]:true}}).bitmask,0);
  for(const other of ["owenSobol","independentRandom","fixedPattern"])assert.throws(()=>resolveTransportExperiments({[flag]:true,[`renderer.sampling.${other}.enabled`]:true}),/mutually exclusive/);
  assert.equal(withProgressiveSampling(WAVEFRONT_COMPUTE_WGSL),WAVEFRONT_COMPUTE_WGSL);
  assert.throws(()=>withProgressiveSampling(WAVEFRONT_COMPUTE_WGSL,"typo"),/Unknown/);
  for(const mode of ["stable-pattern","stable-camera-random"]){
    const source=createWavefrontPathTracingComputeShaderSource({progressiveSampling:mode});
    assert.match(source,/fn stable_pattern_words/);assert.doesNotMatch(source,/fn owen_scramble_24|level<24u/);
    const modules=[],device={createBindGroupLayout:x=>x,createPipelineLayout:x=>x,createShaderModule:x=>{modules.push(x);return {getCompilationInfo:async()=>({messages:[]})};},createComputePipelineAsync:async x=>x,createRenderPipelineAsync:async x=>x};
    if(mode==="stable-pattern"){
      await createWavefrontPipelineResources({device,constants:{shader:{COMPUTE:4,FRAGMENT:2,VERTEX:1}},format:"bgra8unorm",config:{transportExperimentFlags:2048}});
      assert.equal(modules.find(m=>m.label==="plasius.wavefront.computeShader").code,source);
    }
    modules.length=0;
    await createAdaptiveCameraRayPipeline(device,{}, {enabled:true,progressiveSampling:mode});
    await createSharedAdaptivePipelines(device,{}, {enabled:true,progressiveSampling:mode});
    assert.ok(modules.every(m=>m.code.includes("fn stable_pattern_words")));
    assert.match(createPrunedContinuationShader({progressiveSampling:mode}),/fn stable_pattern_words/);
  }
});

