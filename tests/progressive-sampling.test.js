import assert from "node:assert/strict";
import test from "node:test";
import { sobolPairWords, owenScramble24, progressiveSampleWords, sampleProgressivePair } from "../src/wavefront-progressive-sampling.js";
import { sampleWavefrontDimension2D,withProgressiveSampling } from "../src/wavefront-sampling-dimensions.js";
import { legacySamplingSource } from "./helpers/legacy-sampling-source.js";
import { WAVEFRONT_COMPUTE_WGSL,createWavefrontPathTracingComputeShaderSource } from "../src/wavefront-shaders.js";
import { resolveTransportExperiments } from "../src/wavefront-core.js";
import { createWavefrontPathTracingComputeConfig } from "../src/index.js";
import { createConfigPayload } from "../src/wavefront-packers.js";
import { createWavefrontPipelineResources } from "../src/wavefront-pipelines.js";
import { createAdaptiveCameraRayPipeline } from "../src/wavefront-adaptive-camera.js";
import { createSharedAdaptivePipelines } from "../src/wavefront-adaptive-shared.js";
import { createPrunedContinuationShader } from "../src/wavefront-pruned-continuations.js";

test("Sobol first two dimensions have known words and every power-of-two elementary interval", () => {
  const expected = [[0,0],[4,4],[2,6],[6,2],[1,5],[5,1],[3,3],[7,7]];
  assert.deepEqual(expected.map((_,i)=>sobolPairWords(i).map(w=>w/2**29)), expected);
  for (let power=0;power<=8;power++) for(let xBits=0;xBits<=power;xBits++) {
    const cells=new Set();
    for(let i=0;i<2**power;i++){
      const [x,y]=sobolPairWords(i);
      cells.add(`${Math.floor(x/2**(32-xBits))},${Math.floor(y/2**(32-(power-xBits)))}`);
    }
    assert.equal(cells.size,2**power);
  }
});

test("Nested Owen preserves elementary intervals across independent keys", () => {
  for (const seed of [0,7,0xffffffff]) for(let power=0;power<=8;power++) for(let xBits=0;xBits<=power;xBits++){
    const cells=new Set();
    for(let i=0;i<2**power;i++){
      const words=sobolPairWords(i),x=owenScramble24(words[0],seed),y=owenScramble24(words[1],seed^0x73ad81e5);
      assert.equal(x&255,0);assert.equal(y&255,0);
      cells.add(`${Math.floor(x/2**(32-xBits))},${Math.floor(y/2**(32-power+xBits))}`);
    }
    assert.equal(cells.size,2**power);
  }
});

test("Progressive prefixes do not depend on budget and separate dimensions, frame, pixel and bounce", () => {
  for(const mode of ["owen-sobol","independent-random"]){
    for(let i=0;i<32;i++){
      const pair=sampleProgressivePair(12,i,1,7,22,mode);
      assert.ok(pair.every(x=>x>=0&&x<1));
      assert.deepEqual(pair,progressiveSampleWords(12,i,1,7,22,mode).map(x=>(x>>>8)/2**24));
      for(const budget of [1,2,4,8,16,32,128])assert.deepEqual(sampleWavefrontDimension2D(12,i,1,7,22,budget,mode),pair);
    }
    const pairs=[[12,0,1,7,22],[13,0,1,7,22],[12,0,2,7,22],[12,0,1,19,22],[12,0,1,7,23]].map(args=>sampleProgressivePair(...args,mode).join(","));
    assert.equal(new Set(pairs).size,5);
  }
  assert.throws(()=>sampleProgressivePair(0,0,0,0,0,"invalid"),/sampler/i);
});

test("Independent keys integrate the unit square, whereas legacy truncated prefixes are biased", () => {
  for(const count of [1,2,4,8,16,32]){
    for(const mode of ["owen-sobol","independent-random"]){
      let sx=0,sy=0,sxy=0;
      for(let p=0;p<4096;p++)for(let i=0;i<count;i++){
        const [x,y]=sampleProgressivePair(p,i,0,7,22,mode);sx+=x;sy+=y;sxy+=x*y;
      }
      const n=4096*count;
      assert.ok(Math.abs(sx/n-0.5)<0.015);assert.ok(Math.abs(sy/n-0.5)<0.015);assert.ok(Math.abs(sxy/n-0.25)<0.015);
    }
    for(let i=0;i<count;i++) assert.ok(sampleWavefrontDimension2D(0,i,0,7,22,32)[0]<=count/32);
  }
  assert.deepEqual(sampleWavefrontDimension2D(0,0,0,7,22,32),sampleWavefrontDimension2D(0,0,0,7,22,32,"legacy"));
});

test("CPU reference uses exact wrapping multiplication, including high-bit keys",()=>{
  const u32=x=>BigInt.asUintN(32,x);
  const hash=word=>{let x=u32(word);x=u32((x>>16n^x)*0x45d9f3bn);x=u32((x>>16n^x)*0x45d9f3bn);return u32(x>>16n^x);};
  for(const args of [[0,0,0,7,22],[0xffffffff,255,7,43,42]]){
    let x=u32(args.map(BigInt).reduce((s,v,i)=>s^u32(v*[747796405n,2891336453n,277803737n,1442695041n,1597334677n][i]),0n));
    x^=x>>16n;x=u32(x*0x7feb352dn);x^=x>>15n;x=u32(x*0x846ca68bn);x^=x>>16n;
    assert.deepEqual(progressiveSampleWords(...args,"independent-random"),[0xa511e9b3n,0x63d83595n].map(s=>Number(hash(x^s)&0xffffff00n)));
  }
});

test("Sampler flags are independently default off, accept remote snapshots, reject conflicts and preserve false overrides", () => {
  const a="renderer.sampling.owenSobol.enabled",b="renderer.sampling.independentRandom.enabled";
  assert.equal(resolveTransportExperiments().bitmask,0);
  for(const [flag,key,bit] of [[a,"owenSobol",256],[b,"independentRandom",512]]){
    for(const options of [{[flag]:true},{featureFlags:{[flag]:true}},{featureFlags:{enabled:{[flag]:true}}},{featureFlags:{flags:{[flag]:true}}},{featureFlags:{renderer:{sampling:{[key]:true}}}},{featureFlags:{renderer:{sampling:{[key]:{enabled:true}}}}}]){
      const result=resolveTransportExperiments(options);
      assert.equal(result.bitmask,bit);assert.equal(result.effective[key],true);
      assert.equal(createWavefrontPathTracingComputeConfig(options).transportExperimentFlags,bit);
    }
    assert.equal(resolveTransportExperiments({[flag]:false,featureFlags:{[flag]:true}}).bitmask,0);
  }
  assert.throws(()=>resolveTransportExperiments({[a]:true,[b]:true}),/mutually exclusive/);
});

test("Sampler selection changes only the existing flag word, not allocation sizes or frame ABI",()=>{
  const options={width:1920,height:1080,samplesPerPixel:32,maxDepth:4};
  const baseline=createWavefrontPathTracingComputeConfig(options),tile={x:0,y:0,width:128,height:128};
  const before=new Uint8Array(createConfigPayload(baseline,tile,7,{sampleIndex:0,sampleWeight:1/32}));
  for(const flag of ["renderer.sampling.owenSobol.enabled","renderer.sampling.independentRandom.enabled"]){
    const config=createWavefrontPathTracingComputeConfig({...options,[flag]:true});
    assert.deepEqual(config.memory,baseline.memory);
    const after=new Uint8Array(createConfigPayload(config,tile,7,{sampleIndex:0,sampleWeight:1/32}));
    assert.equal(after.length,before.length);
    assert.equal(new DataView(after.buffer).getUint32(268,true),config.transportExperimentFlags);
    after.set(before.subarray(268,272),268);assert.deepEqual(after,before);
  }
});

test("Flag-off source is byte-identical; opt-in changes only the sampler and fails missing source",()=>{
  assert.equal(withProgressiveSampling(WAVEFRONT_COMPUTE_WGSL),WAVEFRONT_COMPUTE_WGSL);
  assert.equal(createWavefrontPathTracingComputeShaderSource(),WAVEFRONT_COMPUTE_WGSL);
  assert.equal(legacySamplingSource(createWavefrontPathTracingComputeShaderSource({progressiveSampling:true})),WAVEFRONT_COMPUTE_WGSL);
  assert.throws(()=>withProgressiveSampling("",true),/Missing canonical/);
});

test("All executed pipeline families select the sampler source only when opted in",async()=>{
  const modules=[],device={
    createBindGroupLayout:value=>value,createPipelineLayout:value=>value,
    createShaderModule:value=>{modules.push(value);return {getCompilationInfo:async()=>({messages:[]})};},
    createComputePipelineAsync:async value=>value,createRenderPipelineAsync:async value=>value,
  },constants={shader:{COMPUTE:4,FRAGMENT:2,VERTEX:1}};
  for(const enabled of [false,true]){
    modules.length=0;
    await createWavefrontPipelineResources({device,constants,format:"bgra8unorm",config:{transportExperimentFlags:enabled?256:0}});
    const main=modules.find(m=>m.label==="plasius.wavefront.computeShader").code;
    assert.equal(main,createWavefrontPathTracingComputeShaderSource({progressiveSampling:enabled}));
    modules.length=0;
    await createAdaptiveCameraRayPipeline(device,constants.shader,{enabled:true,progressiveSampling:enabled});
    await createSharedAdaptivePipelines(device,constants.shader,{enabled:true,progressiveSampling:enabled});
    for(const module of modules)assert.equal(module.code.includes("fn owen_scramble_24"),enabled);
    assert.equal(createPrunedContinuationShader({progressiveSampling:enabled}).includes("fn owen_scramble_24"),enabled);
  }
});
