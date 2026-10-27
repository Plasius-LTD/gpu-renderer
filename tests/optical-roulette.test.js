import test from 'node:test';
import assert from 'node:assert/strict';
import {functionSource} from './fixtures/rough-dielectric-numerical-harness.js';
import {OpticalWgslExec as Exec,OpticalWgslParser as Parser} from './fixtures/optical-wgsl-executor.js';
import {WAVEFRONT_COMPUTE_WGSL} from '../src/wavefront-shaders.js';
import {createHash} from 'node:crypto';
import {withoutOpticalBudget} from './fixtures/optical-budget-baseline.js';

// Canonical policy, with explicit scene inputs rather than a second transport.
function run({beta=[1,1,1],local=[.5,.5,.5],secondary=[0,0,0],ior=1.5,
 transmission=true,bounded=true,nested=true,dielectric=true,rough=false}={}){
 const code=`struct RayRecord{throughput:vec4<f32>,} struct HitRecord{};
 fn max_component(v:vec3<f32>)->f32{return max(v.x,max(v.y,v.z));}
 fn bounded_dielectric_enabled()->bool{return ${bounded};}
 fn nested_media_enabled()->bool{return ${nested};}
 fn dielectric_event(h:HitRecord)->bool{return ${dielectric};}
 fn rough_dielectric_active(h:HitRecord)->bool{return ${rough};}
 fn medium_stack_current_id(r:RayRecord)->u32{return 1u;}
 fn transmitted_medium_ref_id(r:RayRecord,h:HitRecord)->u32{return 2u;}
 fn medium_optics(id:u32)->vec2<f32>{return vec2<f32>(select(1.333,${ior},id==2u),0);}
 ${functionSource('continuation_survival_probability')}
 @group(0) @binding(0)var<storage,read_write>o:array<vec4<f32>>;
 @compute @workgroup_size(1)fn probe(){var r=RayRecord();r.throughput=vec4<f32>(${beta.join(',')},1);
 o[0].x=continuation_survival_probability(r,HitRecord(),vec3<f32>(${local.join(',')}),vec3<f32>(${secondary.join(',')}),${transmission});}`;
 const o=new Float32Array(4);new Exec(new Parser().parse(code)).dispatchWorkgroups('probe',1,{0:{0:o}});return o[0];
}
const near=(actual,expected)=>assert(Math.abs(actual-expected)<2e-6,`${actual}/${expected}`);
function branch({eta=1/1.5,fresnel=.04,tint=1,transmission=1,nested=true,valid=true,tir=false}={}){
 const code=`struct RayRecord{} struct HitRecord{mediumRefId:u32,}
 fn max_component(v:vec3<f32>)->f32{return max(v.x,max(v.y,v.z));}
 fn dielectric_cannot_refract(r:RayRecord,h:HitRecord)->bool{return ${tir};}
 fn nested_media_enabled()->bool{return ${nested};}
 fn medium_valid(id:u32)->bool{return ${valid};}
 fn dielectric_ratio(r:RayRecord,h:HitRecord)->f32{return ${eta};}
 fn dielectric_reflection_weight(r:RayRecord,h:HitRecord)->vec3<f32>{return vec3<f32>(${fresnel});}
 fn dielectric_transmission_weight(r:RayRecord,h:HitRecord)->vec3<f32>{return vec3<f32>(${(1-fresnel)*tint*transmission*eta**2});}
 ${functionSource('dielectric_reflection_probability')}
 @group(0) @binding(0)var<storage,read_write>o:array<vec4<f32>>;
 @compute @workgroup_size(1)fn probe(){o[0].x=dielectric_reflection_probability(RayRecord(),HitRecord(1u));}`;
 const o=new Float32Array(4);new Exec(new Parser().parse(code)).dispatchWorkgroups('probe',1,{0:{0:o}});return o[0];
}
test('nested bounded branch selection does not mistake reversible refraction for transmission loss',()=>{
 for(const eta of [1/1.5,1.5,1.333/1.5,1.5/1.333,1])near(branch({eta}),.04);
 near(branch({tint:.5,transmission:.5}),.04/(.04+.96*.25));
 near(branch({transmission:0}),1);near(branch({tir:true}),1);
 const legacy=.04/(.04+.96/2.25);
 near(branch({nested:false}),legacy);near(branch({valid:false}),legacy);
});
test('optical roulette does not kill a lossless entry just because radiance eta squared is small',()=>{
 near(run({local:[1/2.25,1/2.25,1/2.25]}),1);
 // Captured re-entry: local-only roulette killed four of the eight controls.
 near(run({beta:[1.0280988,1.0280988,1.0280988],local:[.5,.5,.5]}),1);
 near(run({beta:[1/2.25,1/2.25,1/2.25],local:[2.25,2.25,2.25],ior:1}),1);
});
test('optical roulette follows cumulative attenuation and the occupied outgoing medium, including TIR',()=>{
 near(run({beta:[.1,.2,.05],local:[1,1,1],ior:1}),.2);
 near(run({beta:[.1,.2,.05],local:[1,1,1],transmission:false}),.2*1.333**2);
 near(run({beta:[1e-4,1e-4,1e-4],local:[1,1,1]}),.05);
 const p=run({beta:[.1,.2,.05],local:[.4,.3,.2]});
 for(let c=0;c<3;c++)near(p*([.1,.2,.05][c]*[.4,.3,.2][c]/p),[.1,.2,.05][c]*[.4,.3,.2][c]);
});
test('ordinary, split and rough roulette retain local policy and its secondary branch bound',()=>{
 for(const options of [{bounded:false},{nested:false},{dielectric:false},{rough:true}]){
  near(run({...options,beta:[.01,.01,.01]}),.5);
  near(run({...options,secondary:[.8,.6,.1]}),.8);
  near(run({...options,local:[2,2,2]}),.95);
 }
});
test('canonical staged and fused surface code share the corrected policy without changing depth or sampling',()=>{
 assert.match(WAVEFRONT_COMPUTE_WGSL,/let survivalProbability = continuation_survival_probability\(ray, hit, continuationThroughput, secondaryThroughput, transmissionBranch\)/);
 assert.match(WAVEFRONT_COMPUTE_WGSL,/continuationThroughput = continuationThroughput \/ survivalProbability/);
 assert.match(withoutOpticalBudget(WAVEFRONT_COMPUTE_WGSL),/ray.bounce \+ 1u >= config.maxDepth/);
 assert.match(WAVEFRONT_COMPUTE_WGSL,/SAMPLE_DIM_RUSSIAN_ROULETTE/);
 // Exact old source after reversing ONLY this intentional policy refinement.
 const prior=withoutOpticalBudget(WAVEFRONT_COMPUTE_WGSL).replace(functionSource('continuation_survival_probability')+'\n','')
  .replace(functionSource('dielectric_reflection_probability'),`fn dielectric_reflection_probability(ray: RayRecord, hit: HitRecord) -> f32 {
  if (dielectric_cannot_refract(ray, hit)) { return 1.0; }
  let r = max_component(dielectric_reflection_weight(ray, hit));
  let t = max_component(dielectric_transmission_weight(ray, hit));
  if (r + t == 0.0) { return 1.0; }
  return r / (r + t);
}`)
  .replace('let survivalProbability = continuation_survival_probability(ray, hit, continuationThroughput, secondaryThroughput, transmissionBranch);',
   'let survivalProbability = clamp(max(max_component(continuationThroughput), max_component(secondaryThroughput)), 0.05, 0.95);');
 assert.equal(createHash('sha256').update(prior).digest('hex'),'bc1931872d643330a6161e6e07e1b310da95ee21be4de276b63229711f5e51d4');
});
