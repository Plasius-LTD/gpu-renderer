import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {analyzeWgslSource} from '@plasius/gpu-shader/node';
import {sampleWavefrontDimension1D as draw,WAVEFRONT_SAMPLE_DIMENSIONS as D} from '../src/wavefront-sampling-dimensions.js';
import {OPTICAL_PATH_PROBE as P,opticalSlabReference,opticalPathProbeShader,summarizeOpticalPaths} from './fixtures/optical-path-sampling-probe.js';
import {functionSource} from './fixtures/rough-dielectric-numerical-harness.js';
import {rejectedFixedPatternWords} from './fixtures/rejected-renderer-contracts.js';

// Independent closed-form planar slab, not a replacement renderer. Exercise the
// actual scalar sequences and the same importance probabilities/roulette policy.
function slabSamples(sampler){
 const out=new Float32Array(P.cosines.length*P.samples*P.pixels*4);let offset=0;
 for(const ci of P.cosines)for(let pixel=0;pixel<P.pixels;pixel++)for(let sample=0;sample<P.samples;sample++){
  let weight=1,escaped=0,roulette=0,result=0;
  for(let b=0;b<P.maxInteractions;b++){
   const eta=b?P.ior:1/P.ior,cosine=b?Math.sqrt(1-(1-ci*ci)/P.ior**2):ci;
   const ct=Math.sqrt(1-eta*eta*(1-cosine*cosine));
   const r=.5*(((eta*cosine-ct)/(eta*cosine+ct))**2+((cosine-eta*ct)/(cosine+eta*ct))**2),t=(1-r)*eta*eta,probability=r/(r+t);
   const reflection=(sampler==='rejected-fixed-pattern'?(rejectedFixedPatternWords(sample,b,D.transmissionSelector)[0]>>>8)/16777216:draw(pixel,sample,b,7,D.transmissionSelector,sampler))<probability;
   let w=reflection?r/probability:t/(1-probability);
   if(b>=2){const nextIor=reflection?P.ior:1;
    const survival=Math.max(.05,Math.min(1,weight*w*nextIor**2));if((sampler==='rejected-fixed-pattern'?(rejectedFixedPatternWords(sample,b,D.russianRoulette)[0]>>>8)/16777216:draw(pixel,sample,b,7,D.russianRoulette,sampler))>survival){roulette=1;break;}w/=survival;}
   weight*=w;if((b===0&&reflection)||(b>0&&!reflection)){result=weight;escaped=1;break;}
  }
  out.set([result,escaped,roulette,1-escaped-roulette],offset);offset+=4;
 }
 return out;
}
test('corrected fixed transport meets a finite-horizon optical slab mean while frozen original remains rejected',()=>{
 const good=summarizeOpticalPaths(slabSamples('stable-camera-random'));
 assert(good.every(c=>c.passed),JSON.stringify(good));
 assert(summarizeOpticalPaths(slabSamples('fixed-pattern')).every(c=>c.passed));
 const fixed=summarizeOpticalPaths(slabSamples('rejected-fixed-pattern'));
 assert.equal(fixed.at(-1).passed,false,'retain known conditional bias instead of treating uniform scalar marginals as proof');
 assert(fixed.at(-1).error>.04);
 for(const c of P.cosines){assert(opticalSlabReference(c)<=1);assert(opticalSlabReference(c)>.9999);}
});
test('path probe uses assembled canonical optical estimator for every comparison sampler',()=>{
 for(const mode of ['fixed-pattern','stable-pattern','stable-camera-random']){
  const code=opticalPathProbeShader(mode),analysis=analyzeWgslSource(code,'slab-'+mode);
  assert(analysis.bindings.some(b=>b.binding===32));
  assert.match(code,/let scatter=scatter_dielectric\(ray,hit\)/);
  assert.match(code,/SAMPLE_DIM_RUSSIAN_ROULETTE/);
 }
 assert.throws(()=>opticalPathProbeShader('bad'),/Unknown/);
});
test('canonical WGSL optical paths agree with independent slab reference samples',async()=>{
 const require=createRequire(import.meta.resolve('@plasius/gpu-shader/node'));
 const {WgslExec,WgslParser}=await import(pathToFileURL(require.resolve('wgsl_reflect/wgsl_reflect.module.js')));
 for(const sampler of ['fixed-pattern','stable-camera-random']){
  // The software executor sign-extends some unsigned vector shifts, so feed
  // the exact CPU scalar samples here. Real-device parity separately executes
  // the unmodified shader sampler; do not mistake executor output for GPU proof.
  const samples=new Float32Array(64*P.maxInteractions*2);
  for(let s=0;s<64;s++)for(let b=0;b<P.maxInteractions;b++){
   samples.set([draw(0,s,b,7,D.transmissionSelector,sampler),draw(0,s,b,7,D.russianRoulette,sampler)],(s*P.maxInteractions+b)*2);
  }
  const source=opticalPathProbeShader(sampler)
   .replace(functionSource('transport_experiment_enabled'),'fn transport_experiment_enabled(flag:u32)->bool{return (flag & 49152u)!=0u;}')
   .replace(functionSource('medium_optics'),'fn medium_optics(id:u32)->vec2<f32>{return select(vec2<f32>(1.5,2.0),vec2<f32>(1.0,0.0),id==0u);}')
   .replace(functionSource('medium_valid'),'fn medium_valid(id:u32)->bool{return id==1u;}')
   .replace('let lane=id.x/paths;','let lane=2u;').replaceAll('config.frameIndex','7u')
   .replace('@workgroup_size(64) fn optical_path_probe','@workgroup_size(1) fn optical_path_probe')
   .replace(/fn sample_dimension_1d\([\s\S]*?\n}/,`fn sample_dimension_1d(pixelId:u32,sampleId:u32,bounce:u32,frameIndex:u32,dimension:u32)->f32{return sampleInputs[sampleId*${P.maxInteractions}u+bounce][select(0u,1u,dimension==26u)];}`)
   +'\n@group(1) @binding(0) var<storage,read> sampleInputs:array<vec2<f32>>;';
  const output=new Float32Array(64*4);
  new WgslExec(new WgslParser().parse(source)).dispatchWorkgroups('optical_path_probe',64,{0:{3:output},1:{0:samples}});
  const reference=slabSamples(sampler).slice(P.samples*P.pixels*2*4,P.samples*P.pixels*2*4+output.length);
  output.forEach((value,i)=>assert(Math.abs(value-reference[i])<.0001,`${sampler} field ${i}: ${value}/${reference[i]}`));
 }
});
test('slab evidence rejects wrong lengths, non-finite output and missing terminal accounting',()=>{
 assert.throws(()=>summarizeOpticalPaths([]),/length/);
 const values=slabSamples('stable-camera-random');
 values[0]=NaN;assert.throws(()=>summarizeOpticalPaths(values),/Invalid/);
 values[0]=0;values[1]=0;values[2]=0;values[3]=0;
 assert.throws(()=>summarizeOpticalPaths(values),/Invalid/);
});
