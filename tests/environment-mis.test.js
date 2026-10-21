import assert from 'node:assert/strict';
import test from 'node:test';
import {WAVEFRONT_COMPUTE_WGSL} from '../src/wavefront-shaders.js';
import {WAVEFRONT_SURFACE_BODY_WGSL} from '../src/wavefront-shader-kernels.js';
import {createPrunedContinuationShader} from '../src/wavefront-pruned-continuations.js';
import {withRoughBounceSplitting} from '../src/wavefront-rough-bounce-splitting.js';
import {functionSource} from './fixtures/rough-dielectric-numerical-harness.js';
import {OpticalWgslExec as Exec,OpticalWgslParser as Parser} from './fixtures/optical-wgsl-executor.js';
import {ENVIRONMENT_MIS_CASES,ENVIRONMENT_MIS_PROBE,ENVIRONMENT_MIS_PROBE_WGSL,environmentMisProbeConfig,summarizeEnvironmentMis} from './fixtures/environment-mis-probe.js';

// Execute production functions; only scene/config lookup is isolated as inputs.
function numerical(flags=0,{strict=true,map=false,importance=false,lights=0,portal=false}={}) {
 return `struct RayRecord {bounce:u32,flags:u32,origin:vec4<f32>,direction:vec4<f32>,throughput:vec4<f32>,}
 const RAY_FLAG_DELTA_SAMPLE:u32=2u;const RAY_FLAG_NO_COMPETING_NEE:u32=4u;
 const TRANSPORT_EXPERIMENT_DETERMINISTIC_DIRECT_LIGHTING:u32=8u;
 const TRANSPORT_EXPERIMENT_PRODUCT_STUDIO_IMPORTANCE:u32=16u;
 const TRANSPORT_EXPERIMENT_SOURCE_STABLE_DIRECT_LIGHTING:u32=64u;
 struct Config {emissiveTriangleCount:u32,environmentPortalCount:u32,environmentPortalMode:u32,}
 var<private> config=Config(${lights}u,${portal?1:0}u,${portal?2:0}u);
 fn transport_experiment_enabled(flag:u32)->bool{return (${flags}u & flag)!=0u;}
 fn strict_physical_low_spp_lighting_enabled()->bool{return ${strict};}
 fn environment_map_enabled()->bool{return ${map};}
 fn environment_importance_sampling_enabled()->bool{return ${importance};}
 fn environment_direction_pdf(d:vec3<f32>)->f32{return ${importance?'.2':'1.0/(4.0*3.14159265359)'};}
 fn environment_portal_radiance_scale(o:vec3<f32>,d:vec3<f32>)->vec3<f32>{return vec3<f32>(${portal?'0':'1'});}
 fn procedural_sky_radiance(d:vec3<f32>)->vec3<f32>{return vec3<f32>(1);}
 fn saturate(v:f32)->f32{return clamp(v,0.0,1.0);}
 fn max_component(v:vec3<f32>)->f32{return max(v.x,max(v.y,v.z));}
 ${['uniform_hemisphere_pdf','cosine_hemisphere_pdf','power_heuristic','terminal_mis_enabled',
 'emissive_direct_class_probability','environment_nee_selection_probability','environment_nee_samples_sky_only',
 'environment_nee_direction_pdf','terminal_environment_source'].map(functionSource).join('\n')}
 @group(0) @binding(0) var<storage,read_write> out:array<vec4<f32>>;
 @compute @workgroup_size(1) fn probe(@builtin(global_invocation_id) id:vec3<u32>){
  let c=(f32(id.x)+0.5)/4096.0;let n=vec3<f32>(0,0,1);let d=vec3<f32>(sqrt(1.0-c*c),0,c);
  let p=c/3.14159265359;let q=environment_nee_direction_pdf(n,d);
  var r=RayRecord();r.bounce=1u;r.direction=vec4<f32>(d,q);r.throughput.w=p;
  let terminal=terminal_environment_source(r,vec3<f32>(4));
  // Strict procedural NEE samples sky=1, not the additional glow=3.
  let sampled=select(4.0,1.0,environment_nee_samples_sky_only());
  out[id.x]=vec4<f32>(2.0*c*(sampled*power_heuristic(q,p)+terminal.x),q,
   environment_nee_direction_pdf(n,-d),environment_nee_selection_probability());
 }
 @compute @workgroup_size(1) fn eligibility(@builtin(global_invocation_id) id:vec3<u32>){
  var r=RayRecord();r.bounce=select(1u,0u,id.x==0u);r.flags=select(0u,2u,id.x==1u)|select(0u,4u,id.x==2u);
  r.throughput.w=0.3;r.direction=vec4<f32>(0,0,1,0.2);
  out[id.x]=vec4<f32>(terminal_environment_source(r,vec3<f32>(4)),0);
 }`;
}

test('canonical environment MIS has matched means, class probabilities and hemisphere support',()=>{
 for(const [flags,options,selection] of [[0,{},1],[16,{},1],[0,{lights:2},.5],[16,{lights:2},.5],
  [64,{lights:2},0],[8,{lights:2},1],[72,{lights:2},1],[0,{strict:false},1],
  [0,{map:true},1],[0,{map:true,importance:true,lights:2},.5]]) {
  const values=new Float32Array(4096*4);
  new Exec(new Parser().parse(numerical(flags,options))).dispatchWorkgroups('probe',4096,{0:{0:values}});
  let mean=0;
  for(let i=0;i<4096;i++){
   mean+=values[i*4]/4096;
   assert.equal(values[i*4+3],selection);
   if(options.strict!==false&&!options.map)assert.equal(values[i*4+2],0,'opposite hemisphere is unsupported');
  }
  assert.ok(Math.abs(mean-4)<2e-5,JSON.stringify({flags,options,mean}));
 }
});

test('primary, delta, no-competing-NEE and portal fallback are never attenuated',()=>{
 for(const portal of [false,true]){
  const values=new Float32Array(12);
  new Exec(new Parser().parse(numerical(0,{portal}))).dispatchWorkgroups('eligibility',3,{0:{0:values}});
  for(let i=0;i<3;i++)assert.equal(values[i*4],4);
 }
});

test('all surface and independent rough-child paths store previous-vertex PDF without growing records',()=>{
 assert.match(functionSource('continuation_environment_direction'),/surface_supports_direct_lighting/);
 assert.match(functionSource('continuation_environment_direction'),/optical_shading_normal/);
 assert.match(WAVEFRONT_SURFACE_BODY_WGSL,/continuation_environment_direction\(ray, hit, scatter\)/);
 assert.match(WAVEFRONT_SURFACE_BODY_WGSL,/vec4<f32>\(secondaryDirection, 0.0\)/);
 for(const fusedHits of [false,true]){
  const source=createPrunedContinuationShader({fusedHits});
  assert.ok(source.includes(WAVEFRONT_SURFACE_BODY_WGSL));
  const split=withRoughBounceSplitting(source,{enabled:true,splitDepth:2},true);
  assert.match(split,/continuation_environment_direction\(ray, hit, scatter\), vec4<f32>\(ray.throughput.xyz \* weight \* 0.5, scatter.pdf\)/);
 }
 assert.match(WAVEFRONT_COMPUTE_WGSL,/terminal_environment_source\(ray, sourceRadiance\)/);
});

test('retained wrong-PDF control overestimates a unit Lambertian sky',()=>{
 // d53ced3 terminal strategy: full sphere, unlike its hemisphere NEE. Keep
 // this rejected counterexample; do not promote its brightness to image truth.
 for(const cosine of [false,true]){
  let rejected=0,matched=0;const count=100000;
  const power=(a,b)=>a*a/Math.max(a*a+b*b,1e-6);
  for(let i=0;i<count;i++){
   const c=(i+.5)/count,p=c/Math.PI,q=cosine?p:1/(2*Math.PI);
   rejected+=2*c*(power(q,p)+power(p,1/(4*Math.PI)))/count;
   matched+=2*c*(power(q,p)+power(p,q))/count;
  }
  assert.ok(Math.abs(rejected-(cosine?1.3229229323:1.2252836441))<1e-8);
  assert.ok(Math.abs(matched-1)<3e-6);
 }
});

test('assembled contract controls distinguish ordinary diffuse from partial optical materials',()=>{
 for(const c of ENVIRONMENT_MIS_CASES){
  // Isolate texture-backed queries only. Material admission, orientation, flags,
  // carried PDFs, terminal evaluation and the real packed config remain canonical.
  const source=(WAVEFRONT_COMPUTE_WGSL+ENVIRONMENT_MIS_PROBE_WGSL)
   .replace(functionSource('medium_valid'),'fn medium_valid(id:u32)->bool{return id==1u;}')
   .replace(functionSource('medium_optics'),'fn medium_optics(id:u32)->vec2<f32>{return select(vec2<f32>(1,0),vec2<f32>(1.5,2),id==1u);}')
   .replace(functionSource('environment_direction_pdf'),`fn environment_direction_pdf(d:vec3<f32>)->f32{return ${c.importance?1/(2*Math.PI*Math.PI):1/(4*Math.PI)};}`)
   .replace(functionSource('environment_portal_radiance_scale'),`fn environment_portal_radiance_scale(o:vec3<f32>,d:vec3<f32>)->vec3<f32>{return vec3<f32>(${c.portal?0:1});}`);
  const contracts=new Float32Array(36);
  new Exec(new Parser().parse(source)).dispatchWorkgroups('environment_mis_contract',8,{0:{3:contracts,5:environmentMisProbeConfig(c)}});
  const values=new Float32Array(ENVIRONMENT_MIS_PROBE.samples*4);
  for(let i=0;i<ENVIRONMENT_MIS_PROBE.samples;i++)values.set([4,0,0,c.selection],i*4);
  assert.equal(summarizeEnvironmentMis(values,contracts,c).passed,true);
 }
});

test('native MIS evidence rejects missing, nonfinite, biased and wrong-PDF controls',()=>{
 const c=ENVIRONMENT_MIS_CASES[0],values=new Float32Array(ENVIRONMENT_MIS_PROBE.samples*4),contracts=new Float32Array(36);
 for(let i=0;i<ENVIRONMENT_MIS_PROBE.samples;i++)values.set([4,0,0,1],i*4);
 for(let i=0;i<8;i++){
  const noncompeting=i%4===1||i%4===2,partial=i>=4;
  contracts.set([noncompeting||partial?0:1/(2*Math.PI),4,Number(i%4===3),i%4===2?-1:Number(i%4!==3)],i*4);
 }
 contracts[32]=4;
 assert.equal(summarizeEnvironmentMis(values,contracts,c).passed,true);
 for(const [slot,value] of [[0,NaN],[0,100],[1,.01],[2,.1],[3,.5]]){
  const bad=values.slice();bad[slot]=value;
  assert.throws(()=>summarizeEnvironmentMis(bad,contracts,c));
 }
 assert.throws(()=>summarizeEnvironmentMis(values.slice(4),contracts,c));
 const wrong=contracts.slice();wrong[4]=.1;assert.throws(()=>summarizeEnvironmentMis(values,wrong,c));
 for(const profile of ENVIRONMENT_MIS_CASES){
  const payload=environmentMisProbeConfig(profile),data=new DataView(payload);
  assert.equal(data.getUint32(268,true),profile.flags);
  assert.equal(data.getUint32(252,true),profile.lights??0);
  assert.equal(payload.byteLength,320);
 }
});
