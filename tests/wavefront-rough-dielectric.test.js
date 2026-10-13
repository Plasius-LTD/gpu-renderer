import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveTransportExperiments} from '../src/wavefront-core.js';
import {createWavefrontPathTracingComputeConfig} from '../src/wavefront-config.js';
import {packWavefrontSceneObjects} from '../src/wavefront-packers.js';
import {WAVEFRONT_COMPUTE_WGSL as shader} from '../src/wavefront-shaders.js';
import {analyzeWgslSource} from '@plasius/gpu-shader/node';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {roughDielectricNumericalHarness,functionSource} from './fixtures/rough-dielectric-numerical-harness.js';
import {integrateOpticalEnergy} from './fixtures/rough-dielectric-reference.js';
import {roughDielectricProbeShader,validateRoughOpticalProbe,ROUGH_OPTICAL_PROBE} from './fixtures/rough-dielectric-transport-probe.js';

const flag='renderer.transport.roughDielectricTransport.enabled';
const nested='renderer.transport.nestedMediaRefraction.enabled';
test('assembled optical shaders never use the WGSL reserved token smooth',async()=>{
 // The reflection parser accepts this reserved word, unlike the device compiler.
 // Scan tokens so comments and valid identifiers such as smoothstep are ignored.
 // https://www.w3.org/TR/2026/CRD-WGSL-20260921/#reserved-words
 const require=createRequire(import.meta.resolve('@plasius/gpu-shader/node'));
 const {WgslScanner}=await import(pathToFileURL(require.resolve('wgsl_reflect/wgsl_reflect.module.js')));
 const forbiddenLines=source=>new WgslScanner(source).scanTokens()
  .filter(token=>token.lexeme==='smooth').map(token=>token.line);
 assert.deepEqual(forbiddenLines('let smooth = true;'),[1],'guard rejects the reported regression');
 assert.deepEqual(forbiddenLines('// smooth\n/* smooth /* smooth */ */ let isSmooth = smoothstep(0.0, 1.0, 0.5);'),[]);
 for(const [name,source] of [['canonical',shader],['rough-optical-probe',roughDielectricProbeShader()]]){
  assert.deepEqual(forbiddenLines(source),[],`${name} uses the reserved WGSL token smooth`);
 }
});
test('rough optical transport is explicit, default off and requires nested media',()=>{
 assert.equal(resolveTransportExperiments().effective.roughDielectricTransport,false);
 assert.throws(()=>resolveTransportExperiments({[flag]:true}),/nestedMediaRefraction/);
 for(const options of [{[flag]:true,[nested]:true},{featureFlags:{renderer:{transport:{roughDielectricTransport:{enabled:true},nestedMediaRefraction:{enabled:true}}}}}]){
  const flags=resolveTransportExperiments(options);
  assert.equal(flags.effective.roughDielectricTransport,true);
  assert.equal(flags.bitmask,65536+32768);
 }
});

test('new volume transport rejects untracked or alpha-covered surfaces before GPU allocation',()=>{
 const sceneObjects=[{kind:'sphere',materialKind:'transparent',transmission:.5,roughness:.5,opacity:1,color:[1,1,1,1]}];
 const options={[flag]:true,[nested]:true,sceneObjects};
 assert.throws(()=>createWavefrontPathTracingComputeConfig(options),/medium/);
 const material={...sceneObjects[0],mediumRefId:1,medium:{id:1,ior:1.5}};
 assert.doesNotThrow(()=>createWavefrontPathTracingComputeConfig({...options,sceneObjects:[material]}));
 const previous=createWavefrontPathTracingComputeConfig({...options,[flag]:false,sceneObjects:[material]});
 const next=createWavefrontPathTracingComputeConfig({...options,sceneObjects:[material]});
 assert.deepEqual(next.memory,previous.memory,'rough transport must not enlarge queues or records');
 for(const t of [0,.25,.5,1]){
  const packed=packWavefrontSceneObjects([{...material,transmission:t}]);
  const values=new Float32Array(packed.buffer);
  assert.equal(values[24],.5);assert.equal(values[26],1);assert.equal(values[34],t);
  assert.equal(new Uint32Array(packed.buffer)[4],1);
 }
 for(const change of [{opacity:.5},{color:[1,1,1,.5]}])assert.throws(()=>createWavefrontPathTracingComputeConfig({...options,sceneObjects:[{...material,...change}]}),/alpha coverage/);
 for(const change of [{metallic:.5},{materialKind:'metal',roughness:0},{clearcoat:.5}])assert.throws(()=>createWavefrontPathTracingComputeConfig({...options,sceneObjects:[{...material,...change}]}),/metallic or clearcoat/);
 assert.doesNotThrow(()=>createWavefrontPathTracingComputeConfig({sceneObjects}));
});

test('canonical WGSL numerical execution: partial transmission, TIR, roughness and medium ownership',async()=>{
 // Use the already pinned parser/executor owned by @plasius/gpu-shader. This is
 // software arithmetic verification, explicitly not physical WebGPU evidence.
 const require=createRequire(import.meta.resolve('@plasius/gpu-shader/node'));
 const {WgslExec,WgslParser}=await import(pathToFileURL(require.resolve('wgsl_reflect/wgsl_reflect.module.js')));
 const source=roughDielectricNumericalHarness();
 const ast=new WgslParser().parse(source);
 const near=(a,b,t=1e-4)=>assert(Math.abs(a-b)<=t,`${a} != ${b}`);
 const run=(eta,rough,t,proposal,direction=[0,0,-1])=>{
  const inputs=new Float32Array([eta,rough,t,0,...direction,0,1,1,1,1,...proposal]);
  const outputs=new Float32Array(12*(proposal.length/4));
  new WgslExec(ast).dispatchWorkgroups('numerical_probe',proposal.length/4,{0:{0:inputs,1:outputs}});
  assert([...outputs].every(Number.isFinite));return outputs;
 };
 for(const t of [0,.25,.5,1]){
  const reflected=run(1/1.5,0,t,[.99,0,.3,.4]);
  near(reflected[6],1);near(reflected[9],1); // direction.z and retained medium
  near(reflected[0]*reflected[3],.04);
  const transmitted=run(1/1.5,0,t,[.99,.9999,.3,.4]);
  if(t===0){near(transmitted[7],4);continue;}
  near(transmitted[6],-1);near(transmitted[9],2);near(transmitted[7],5);
  near(transmitted[0]*transmitted[3],.96*t/(1.5**2));
 }
 const smooth=run(1/1.5,0,1,[.99,.99,.3,.5]);
 const rough=run(1/1.5,.8,1,[.99,.99,.3,.5]);
 assert(Math.abs(rough[4])+Math.abs(rough[5])>.05);
 near(smooth[6],-1);near(rough[7],6);near(rough[3],rough[8]);near(rough[9],2);near(rough[10],4);
 const tir=run(1.5,0,1,[.9,.99,.3,.4],[.8,0,-.6]);
 near(tir[0],1);near(tir[3],1);near(tir[7],4);near(tir[9],1);
 const equal=run(1,.8,1,[.9,.99,.3,.4]);near(equal[0],1);near(equal[6],-1);near(equal[7],5);
 const diffuse=run(1/1.5,.8,.25,[0,.5,.3,.4]);assert(diffuse[0]>0);near(diffuse[7],1);near(diffuse[9],1);near(diffuse[3],diffuse[8]);
 const inverse=(index,base)=>{let scale=1,value=0;while(index){scale/=base;value+=index%base*scale;index=Math.floor(index/base);}return value;};
 const samples=1024,proposals=Array.from({length:samples},(_,n)=>[2,3,5,7].map(base=>inverse(n+1,base))).flat();
 for(const roughness of [0,.35,.8])for(const t of [0,.25,.5,1]){
  const values=run(1/1.5,roughness,t,proposals);let reflected=0,transmitted=0;
  for(let n=0;n<samples;n++){
   const offset=n*12,weight=values[offset];assert(weight>=0);assert(values[offset+3]>=0);
   if([5,6].includes(values[offset+7]))transmitted+=weight/samples;else reflected+=weight/samples;
  }
  const reference=integrateOpticalEnergy(roughness,t);
  near(reflected,reference.reflected,.03);near(transmitted,reference.transmitted,.03);
 }
});

test('full assembled physical probe retains strict collision, PDF and mean gates',()=>{
 const source=roughDielectricProbeShader();analyzeWgslSource(source,'rough-optical-probe');
 assert.match(source,/intersect_triangle\(collisionRay,triangle,0u\)/);
 const values=new Float32Array(ROUGH_OPTICAL_PROBE.samples*12*4);
 for(let c=0;c<12;c++){
  const energy=integrateOpticalEnergy(ROUGH_OPTICAL_PROBE.roughness[Math.floor(c/4)],ROUGH_OPTICAL_PROBE.transmission[c%4]);
  for(let i=0;i<ROUGH_OPTICAL_PROBE.samples;i++)values.set([energy.reflected,energy.transmitted,1,0],(c*ROUGH_OPTICAL_PROBE.samples+i)*4);
 }
 assert.equal(validateRoughOpticalProbe(values).cases.length,12);
 const old=values[0];values[0]=NaN;assert.throws(()=>validateRoughOpticalProbe(values),/Invalid/);values[0]=old;
 values[3]=32;assert.throws(()=>validateRoughOpticalProbe(values),/collision/);values[3]=0;
 values[0]+=ROUGH_OPTICAL_PROBE.samples;assert.throws(()=>validateRoughOpticalProbe(values),/energy mismatch/);
});

test('canonical collision execution retains transparent entries and occupied exits for lighting rays',async()=>{
 const require=createRequire(import.meta.resolve('@plasius/gpu-shader/node'));
 const {WgslExec,WgslParser}=await import(pathToFileURL(require.resolve('wgsl_reflect/wgsl_reflect.module.js')));
 // Replace only resource lookups with explicit test metadata. Triangle collision,
 // stack selection and visibility-ray construction execute their production WGSL.
 const source=shader
  .replace(functionSource('transport_experiment_enabled'),'fn transport_experiment_enabled(flag:u32)->bool{return (flag & 98304u)!=0u;}')
  .replace(functionSource('medium_optics'),'fn medium_optics(id:u32)->vec2<f32>{return vec2<f32>(select(1.0,1.5,id>0u),f32(id));}')+`
 @compute @workgroup_size(1) fn collision_probe(){
  var parent=RayRecord();parent.mediumRefId=1u;parent.mediumStack=vec4<u32>(1,0,0,0);parent.mediumStackDepth=1u;
  let shadow=transport_visibility_ray(parent,vec3<f32>(0,0,-1),vec3<f32>(0,0,1));
  var triangle=TriangleRecord();triangle.v0=vec4<f32>(-1,-1,0,1);triangle.v1=vec4<f32>(1,-1,0,1);triangle.v2=vec4<f32>(0,1,0,1);
  triangle.materialKind=2u;triangle.mediumRefId=1u;triangle.materialExtension.z=1.0;triangle.material.z=0.0;
  let exit=intersect_triangle(shadow,triangle,0u);
  var entryRay=shadow;entryRay.origin.z=1.0;entryRay.direction.z=-1.0;entryRay.mediumStack=vec4<u32>(0);entryRay.mediumRefId=0u;entryRay.mediumStackDepth=0u;
  let entry=intersect_triangle(entryRay,triangle,0u);
  let airShadow=visibility_test_ray(shadow.origin.xyz,shadow.direction.xyz);
  let airExit=intersect_triangle(airShadow,triangle,0u);
  accumulation[0]=vec4<f32>(f32(exit.hit),f32(entry.hit),f32(airExit.hit),f32(shadow.mediumStackDepth));
 }
 `;
 const values=new Float32Array(4);
 new WgslExec(new WgslParser().parse(source)).dispatchWorkgroups('collision_probe',1,{0:{3:values}});
 assert.deepEqual([...values],[1,1,0,1]);
 const disabled=source.replace('(flag & 98304u)!=0u','(flag & 32768u)!=0u');
 new WgslExec(new WgslParser().parse(disabled)).dispatchWorkgroups('collision_probe',1,{0:{3:values}});
 assert.deepEqual([...values],[0,1,0,0],'disabled mode retains the existing air-only lighting query');
});
test('optical sampling preserves collisions and separates actual transmission from delta classification',()=>{
 assert.match(shader,/fn scatter_is_transmission/);
 assert.match(shader,/SCATTER_LOBE_ROUGH_TRANSMISSION/);
 assert.match(shader,/!transmissionBranch/);
 assert.match(shader,/rough_dielectric_active\(hit\) && !medium_valid\(hit.mediumRefId\)/);
 assert.match(shader,/!bounded_dielectric_enabled\(\) && !rough_dielectric_active\(hit\)/);
 assert.match(shader,/RAY_FLAG_NO_COMPETING_NEE/);
 assert.match(shader,/fn rough_dielectric_bsdf/);
 assert.match(shader,/fn rough_dielectric_pdf/);
 assert.match(shader,/rough_dielectric_throughput\(ray, hit, scatter\)/);
 assert.match(shader,/transport_surface_bsdf\(ray, hit, viewDirection, lightDirection\)/);
 assert.match(shader,/testRay.mediumStack = parent.mediumStack/);
 assert.match(shader,/scene_ray_visibility_blocked\(transport_visibility_ray\(ray, origin, lightDirection\), lightSample.maxDistance\)/);
 const layout=analyzeWgslSource(shader,'rough-dielectric');
 assert.equal(layout.records.find(r=>r.name==='RayRecord').byteSize,96);
});
