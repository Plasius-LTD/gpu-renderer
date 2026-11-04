import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {OpticalWgslExec as Exec,OpticalWgslParser as Parser} from './fixtures/optical-wgsl-executor.js';
import {WAVEFRONT_COMPUTE_WGSL} from '../src/wavefront-shaders.js';
import {functionSource} from './fixtures/rough-dielectric-numerical-harness.js';
import {BSDF_VARIANCE_DIAGNOSTIC,bsdfVarianceShader,bsdfVarianceConfig,summarizeBsdfVariance} from './fixtures/bsdf-variance-attribution.js';

const results=new Map();
function executeCase(albedo,diffuseProbability){
 const key=JSON.stringify([albedo,diffuseProbability]);if(results.has(key))return results.get(key);
 const {samples}=BSDF_VARIANCE_DIAGNOSTIC,code=bsdfVarianceShader({diffuseProbability});
 const parsed=new Parser().parse(code),values=new Float32Array(samples*5*4),exec=new Exec(parsed),bindings={0:{3:values,5:bsdfVarianceConfig({albedo})}};
 exec.dispatchWorkgroups('variance_conditional_probe',samples*2,bindings);
 exec.dispatchWorkgroups('variance_integral_probe',samples,bindings);
 const result=summarizeBsdfVariance(values,{albedo,diffuseProbability});results.set(key,result);return result;
}
for(const albedo of [.75,1])for(const diffuseProbability of [null,.8,.95])test(`production BSDF moments at albedo${albedo}, proposal${diffuseProbability??'canonical'}`,()=>{
 const result=executeCase(albedo,diffuseProbability);
 assert(Math.abs(result.mean-result.independentBsdfIntegral)<=BSDF_VARIANCE_DIAGNOSTIC.meanTolerance);
 assert(result.variance>=0);assert.equal(result.scope,'CPU WGSL analytic isolation; not physical WebGPU, full-scene causality or performance');
 if(diffuseProbability===null){assert(Math.abs(result.weights.diffuse-.4)<1e-6);assert(Math.abs(result.nullFraction-.3)<1e-6);}
 else assert(Math.abs(result.nullFraction-(1-diffuseProbability)*.5)<1e-6);
});
test('isolated diffuse-proposal controls reduce estimator variance while preserving physical integral',()=>{
 for(const albedo of [.75,1]){
  const records=[null,.8,.95].map(p=>executeCase(albedo,p)),canonical=records[0];
  assert.equal(records.length,3);
  for(const r of records.filter(r=>r!==canonical)){
   assert(r.variance<canonical.variance);assert(Math.abs(r.independentBsdfIntegral-canonical.independentBsdfIntegral)<1e-7);
   assert(Math.abs(r.mean-canonical.mean)<=BSDF_VARIANCE_DIAGNOSTIC.meanTolerance);
  }
 }
});
test('diagnostic source preserves production BSDF/sampler/PDF; only controlled shared weights and quadrature inputs differ',()=>{
 for(const probability of [null,.8,.95]){
  const source=bsdfVarianceShader({diffuseProbability:probability});
  for(const name of ['scatter_direction','evaluate_surface_bsdf','evaluate_surface_bsdf_pdf','importance_sample_ggx','cosine_sample_hemisphere'])assert(source.includes(functionSource(name)),name);
  assert.equal(source.includes(functionSource('surface_bsdf_sampling_weights')),probability===null);
 }
 assert.equal(createHash('sha256').update(WAVEFRONT_COMPUTE_WGSL).digest('hex'),'b50d988d92d0af5867fc3355cadad89ad8b1affe9c88bf051298df2c8acaf7b4');
 for(const diffuseProbability of [-1,0,1,NaN,'0.8'])assert.throws(()=>bsdfVarianceShader({diffuseProbability}));
 for(const albedo of [-1,NaN,1.01,'1'])assert.throws(()=>bsdfVarianceConfig({albedo}));
 assert.throws(()=>summarizeBsdfVariance(new Float32Array(),{albedo:1,diffuseProbability:null}));
 const invalid=new Float32Array(BSDF_VARIANCE_DIAGNOSTIC.samples*5*4);invalid[0]=NaN;
 assert.throws(()=>summarizeBsdfVariance(invalid,{albedo:1,diffuseProbability:null}),/finite/);
 assert.throws(()=>summarizeBsdfVariance(new Float32Array(invalid.length),{albedo:1,diffuseProbability:null}),/probability|PDF/);
});
test('conditional moment evidence includes null mass and rejects corrupted PDFs, probabilities and oracle data',()=>{
 const n=BSDF_VARIANCE_DIAGNOSTIC.samples,values=new Float32Array(n*5*4),settings={albedo:1,diffuseProbability:null};
 for(let i=0;i<n*2;i++)values.set([1,.5,.25,i<n?.4:.6,0,i<n?1:2,.4,.6],i*8);
 for(let i=0;i<n;i++)values.set([1,(i+.5)/n,0,0],(n*4+i)*4);
 const good=summarizeBsdfVariance(values,settings);assert(Math.abs(good.mean-1)<1e-6);assert.equal(good.nullFraction,0);
 for(const [index,value]of [[3,0],[8+3,.1],[1,-1],[2,-.1],[2,0],[4,1],[5,3],[n*4*4,1.1]]){
  const changed=values.slice();changed[index]=value;assert.throws(()=>summarizeBsdfVariance(changed,settings));
 }
});
