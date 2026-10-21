import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WAVEFRONT_COMPUTE_WGSL} from '../src/wavefront-shaders.js';
import {functionSource} from './fixtures/rough-dielectric-numerical-harness.js';
import {OpticalWgslExec as Exec,OpticalWgslParser as Parser} from './fixtures/optical-wgsl-executor.js';
import {OPTICAL_RIM_RECONSTRUCTION_PROBE_WGSL,assertOpticalRimReconstructionProbe,OPTICAL_PROJECTED_INTERIOR_PROBE_WGSL,assertOpticalProjectedInteriorProbe} from './fixtures/optical-rim-reconstruction-probe.js';
import {WAVEFRONT_INTERSECTION_BODY_WGSL} from '../src/wavefront-shader-kernels.js';

const frozen=JSON.parse(readFileSync(new URL('../docs/evidence/room-rim-reconstruction-2026-10-21.json',import.meta.url)));
const source=WAVEFRONT_COMPUTE_WGSL.replace(functionSource('transport_experiment_enabled'),
 'fn transport_experiment_enabled(flag:u32)->bool{return (flag & 32768u)!=0u;}')+`
 @group(1) @binding(0)var<storage,read>cases:array<vec4<f32>>;
 @compute @workgroup_size(1)fn reconstruct(@builtin(global_invocation_id)id:vec3<u32>){
  let o=id.x*8u;var triangle=TriangleRecord();triangle.v0=cases[o];triangle.v1=cases[o+1u];triangle.v2=cases[o+2u];
  let position=optical_triangle_position(triangle,cases[o+3u].xyz);
  var next=TriangleRecord();next.v0=cases[o+4u];next.v1=cases[o+5u];next.v2=cases[o+6u];
  var ray=RayRecord();ray.origin=vec4<f32>(position,1);ray.direction=cases[o+7u];
  accumulation[id.x*2u]=vec4<f32>(position,0);
  accumulation[id.x*2u+1u]=optical_triangle_coordinates(ray,next);
 }`;

function projectedWeights(vertices,p){
 const [a,b,c]=vertices,axes=[0,1,2].filter(axis=>a[axis]!==b[axis]||a[axis]!==c[axis]);
 assert.equal(axes.length,2,'frozen rim is an exact coordinate plane');
 const [x,y]=axes,edge=(u,v)=> (u[x]-p[x])*(v[y]-p[y])-(u[y]-p[y])*(v[x]-p[x]);
 const weights=[edge(b,c),edge(c,a),edge(a,b)],sum=weights.reduce((s,v)=>s+v,0);
 return weights.map(v=>v/sum);
}

test('frozen 4K rim reconstruction stays inside the admitted face and retains the nearby exit with fused/non-fused interpolation',()=>{
 const variants=[];
 for(const axes of [[0,1,2],[1,2,0],[2,0,1]])for(const sign of [-1,1])for(const order of [[0,1,2],[1,2,0],[2,0,1],[0,2,1],[2,1,0],[1,0,2]]){
  const transform=v=>axes.map(axis=>v[axis]*sign);
  variants.push({vertices:order.map(i=>transform(frozen.primary.vertices[i])),bary:order.map(i=>frozen.primary.capturedBarycentric[i]),
   next:frozen.reference.nextVertices.map(transform),direction:transform(frozen.continuedDirection)});
 }
 const inputs=new Float32Array(variants.flatMap(v=>[...v.vertices.map(p=>[...p,1]),[...v.bary,0],...v.next.map(p=>[...p,1]),[...v.direction,0]].flat()));
 const unfused=source.replace('fma(triangle.v1.xyz - triangle.v0.xyz, vec3<f32>(barycentric.y),\n    (triangle.v2.xyz - triangle.v0.xyz) * barycentric.z)',
  '(triangle.v1.xyz - triangle.v0.xyz) * barycentric.y + (triangle.v2.xyz - triangle.v0.xyz) * barycentric.z');
 assert.notEqual(unfused,source,'exercise both arithmetic variants explicitly');
 for(const code of [source,unfused]){
  const output=new Float32Array(variants.length*8);
  new Exec(new Parser().parse(code)).dispatchWorkgroups('reconstruct',variants.length,{0:{3:output},1:{0:inputs}});
  variants.forEach((v,i)=>{
   const point=Array.from(output.slice(i*8,i*8+3)),weights=projectedWeights(v.vertices,point),distance=output[i*8+7];
   assert(weights.every(w=>w>0),`variant ${i}: rounded point left the admitted triangle: ${weights}`);
   assert(distance>0&&distance<2e-6,`variant ${i}: distinct inner-wall exit lost: ${distance}`);
  });
 }
});

test('projected guard preserves safe points, rejects unresolvable interiors and chooses the nearest valid neighbour',()=>{
 const code=WAVEFRONT_COMPUTE_WGSL+`
 @group(1) @binding(0)var<storage,read>cases:array<vec4<f32>>;
 @compute @workgroup_size(1)fn guard(@builtin(global_invocation_id)id:vec3<u32>){let o=id.x*4u;
  var t=TriangleRecord();t.v0=cases[o];t.v1=cases[o+1u];t.v2=cases[o+2u];accumulation[id.x]=optical_triangle_projected_position(t,cases[o+3u].xyz);
 }`;
 const edgePoint=[2.895268440246582,-0.5140840411186218,-0.07656029611825943];
 const cases=[{vertices:[[0,0,0],[1,0,0],[0,1,0]],point:[.25,.25,0],valid:1},
  {vertices:[[1,1,0],[1+2**-23,1,0],[1,1+2**-23,0]],point:[1,1,0],valid:0},
  {vertices:frozen.primary.vertices,point:edgePoint,valid:1}];
 const input=new Float32Array(cases.flatMap(c=>[...c.vertices.map(v=>[...v,1]),[...c.point,0]].flat())),out=new Float32Array(12);
 new Exec(new Parser().parse(code)).dispatchWorkgroups('guard',3,{0:{3:out},1:{0:input}});
 assert.deepEqual(Array.from(out.slice(0,4)),[.25,.25,0,1]);
 assert.equal(out[7],0);assert.equal(out[11],1);assert.equal(out[9],edgePoint[1],'dominant normal coordinate is unchanged');
 const step=(v,positive)=>{const f=new Float32Array([v]),u=new Uint32Array(f.buffer);u[0]+=((v>0)===positive)?1:-1;return f[0];};
 let closest=Infinity;
 for(const dx of [-1,0,1])for(const dz of [-1,0,1]){if(!dx&&!dz)continue;
  const p=[dx?step(edgePoint[0],dx>0):edgePoint[0],edgePoint[1],dz?step(edgePoint[2],dz>0):edgePoint[2]];
  if(projectedWeights(frozen.primary.vertices,p).every(w=>w>0))closest=Math.min(closest,p.reduce((s,v,i)=>s+(v-edgePoint[i])**2,0));
 }
 assert.equal(Array.from(out.slice(8,11)).reduce((s,v,i)=>s+(v-edgePoint[i])**2,0),closest);
});

test('raw and staged optical reconstruction fail closed before hidden-boundary traversal',()=>{
 for(const body of [WAVEFRONT_INTERSECTION_BODY_WGSL,functionSource('trace_material_hit_raw')]){
  assert.match(body,/if \(nested_media_enabled\(\)\)[\s\S]*hitTriangle.mediumRefId != 0u && all\(candidate.barycentric > vec3<f32>\(0.0\)\)/);
  assert.match(body,/unresolvedOpticalPosition = reconstructed.w == 0.0/);
  assert.match(body,/if \(unresolvedOpticalPosition\) \{ hitType = 5u; positionError = 8.0; \}/);
 }
 const nested=functionSource('intersect_nested_ray');
 assert(nested.indexOf('if (hit.hitType == 5u)')<nested.indexOf('if (recoverable_optical_entry'));
 assert(nested.indexOf('if (hit.hitType == 5u)')<nested.indexOf('rough_dielectric_active'));
});

test('unresolved reconstruction reason survives nested traversal without an occupancy repair',()=>{
 const code=WAVEFRONT_COMPUTE_WGSL.replace(functionSource('trace_material_after'),`
 fn trace_material_after(ray:RayRecord,minimum:f32)->HitRecord{var hit=HitRecord();hit.hitType=5u;hit.pad2=8.0;hit.mediumRefId=1u;hit.materialKind=2u;hit.materialExtension.z=1.0;hit.distance=1.0;return hit;}`)+`
 @compute @workgroup_size(1)fn invalid(){var ray=RayRecord();ray.bounce=3u;ray.sampleId=7u;ray.sourcePixelId=19u;
  ray.mediumStack=vec4<u32>(1,0,0,0);ray.mediumRefId=1u;ray.mediumStackDepth=1u;
  let result=intersect_nested_ray(ray);accumulation[0]=vec4<f32>(f32(result.hit.hitType),result.hit.pad2,f32(result.ray.mediumRefId),f32(result.ray.mediumStackDepth));
  accumulation[1]=vec4<f32>(f32(result.ray.bounce),f32(result.ray.sampleId),f32(result.ray.sourcePixelId),f32(result.ray.mediumStack.x));
 }`;
 const out=new Float32Array(8);new Exec(new Parser().parse(code)).dispatchWorkgroups('invalid',1,{0:{3:out}});
 assert.deepEqual(Array.from(out),[5,8,1,1,3,7,19,1]);
});

test('projected edge filter agrees with independent exact binary32 orientation including cancellation',()=>{
 const integer=value=>{const bits=new Uint32Array(new Float32Array([value]).buffer)[0],e=(bits>>>23)&255;
  return (bits>>>31?-1n:1n)*BigInt((bits&0x7fffff)|(e?0x800000:0))<<BigInt(Math.max(0,e-1));};
 const cases=[];
 for(const axis of [0,1,2])for(const exponent of [-100,0,100])for(const sign of [-1,1]){
  const scale=sign*2**exponent;
  for(const p of [[0,0,0],[.7,.7,0],[.7,.7+2**-24,0]]){
   const transform=v=>{const result=[0,0,0];result[(axis+1)%3]=Math.fround(v[0]*scale);result[(axis+2)%3]=Math.fround(v[1]*scale);result[axis]=Math.fround(v[2]*scale);return result;};
   cases.push({p:transform(p),a:transform([0,0,0]),b:transform([1,1,0]),axis});
  }
 }
 cases.push({p:[2.895268440246582,-0.5140840411186218,-0.07656029611825943],a:frozen.primary.vertices[1],b:frozen.primary.vertices[2],axis:1});
 const code=WAVEFRONT_COMPUTE_WGSL+`
 @group(1) @binding(0)var<storage,read>cases:array<vec4<f32>>;
 @compute @workgroup_size(1)fn edges(@builtin(global_invocation_id)id:vec3<u32>){let o=id.x*3u;accumulation[id.x]=vec4<f32>(optical_position_edge(cases[o].xyz,cases[o+1u].xyz,cases[o+2u].xyz,u32(cases[o].w)),0,0,0);}`;
 const input=new Float32Array(cases.flatMap(c=>[...c.p,c.axis,...c.a,0,...c.b,0])),out=new Float32Array(cases.length*4);
 new Exec(new Parser().parse(code)).dispatchWorkgroups('edges',cases.length,{0:{3:out},1:{0:input}});
 cases.forEach((c,i)=>{const x=(c.axis+1)%3,y=(x+1)%3,p=c.p.map(integer),a=c.a.map(integer),b=c.b.map(integer);
  const determinant=(a[x]-p[x])*(b[y]-p[y])-(a[y]-p[y])*(b[x]-p[x]),expected=determinant<0n?-1:determinant>0n?1:0;
  assert.equal(Math.sign(out[i*4]),expected,`case ${i}`);
 });
});

test('projected interior device preflight rejects bad status, lost exits and false unresolved success',()=>{
 const code=WAVEFRONT_COMPUTE_WGSL
  .replace(functionSource('transport_experiment_enabled'),'fn transport_experiment_enabled(flag:u32)->bool{return (flag & 32768u)!=0u;}')
  .replace(functionSource('medium_optics'),'fn medium_optics(id:u32)->vec2<f32>{return vec2<f32>(1.5,2.0);}')+
  OPTICAL_PROJECTED_INTERIOR_PROBE_WGSL+`
  @compute @workgroup_size(1)fn probe(){let r=optical_projected_interior_probe();for(var i=0u;i<4u;i++){accumulation[i]=r[i];}}`;
 const out=new Float32Array(16);new Exec(new Parser().parse(code)).dispatchWorkgroups('probe',1,{0:{3:out}});
 assert.doesNotThrow(()=>assertOpticalProjectedInteriorProbe(out,{nested:true}));
 assert.doesNotThrow(()=>assertOpticalProjectedInteriorProbe([],{nested:false}));
 for(const [index,bad] of [[0,0],[1,0],[2,1],[3,0],[3,1],[3,NaN],[7,0],[11,1],[15,1]]){
  const values=out.slice();values[index]=bad;
  assert.throws(()=>assertOpticalProjectedInteriorProbe(values,{nested:true}),/Optical projected interior mismatch/);
 }
});

test('assembled rim reconstruction preflight rejects missing exits without accepting the rejected stored point',()=>{
 const code=WAVEFRONT_COMPUTE_WGSL
  .replace(functionSource('transport_experiment_enabled'),'fn transport_experiment_enabled(flag:u32)->bool{return (flag & 32768u)!=0u;}')
  .replace(functionSource('medium_optics'),'fn medium_optics(id:u32)->vec2<f32>{return vec2<f32>(1.5,2.0);}')+
  OPTICAL_RIM_RECONSTRUCTION_PROBE_WGSL+`
  @compute @workgroup_size(1)fn rim(){let result=optical_rim_reconstruction_probe();for(var i=0u;i<4u;i++){accumulation[i]=result[i];}}`;
 const out=new Float32Array(16);new Exec(new Parser().parse(code)).dispatchWorkgroups('rim',1,{0:{3:out}});
 assert.doesNotThrow(()=>assertOpticalRimReconstructionProbe(out,{nested:true}));
 assert.doesNotThrow(()=>assertOpticalRimReconstructionProbe([],{nested:false}));
 for(const [index,bad] of [[0,0],[1,0],[2,0],[3,1],[7,1],[11,0],[11,1],[12,0],[12,NaN],[13,0],[14,1]]){
  const rejected=out.slice();rejected[index]=bad;
  assert.throws(()=>assertOpticalRimReconstructionProbe(rejected,{nested:true}),/Optical rim reconstruction mismatch/);
 }
 const rejectedCode=code.replace(functionSource('optical_triangle_position'),functionSource('optical_triangle_position')
  .replace(/let edgeOffset =[\s\S]*?let p = triangle.v0.xyz \+ edgeOffset;/,
   'let p = triangle.v0.xyz + (triangle.v1.xyz - triangle.v0.xyz) * barycentric.y + (triangle.v2.xyz - triangle.v0.xyz) * barycentric.z;'));
 assert.notEqual(rejectedCode,code);
 const rejected=new Float32Array(16);new Exec(new Parser().parse(rejectedCode)).dispatchWorkgroups('rim',1,{0:{3:rejected}});
 assert.throws(()=>assertOpticalRimReconstructionProbe(rejected,{nested:true}),/Optical rim reconstruction mismatch/);
});

test('near-edge positive barycentrics require a certified representable interior, not just nearest rounding',()=>{
 // Before the guard exists this is exactly the old acceptance: return the
 // rounded point as valid. Preserve that rejected characterization as a red test.
 const absentGuard=WAVEFRONT_COMPUTE_WGSL.includes('fn optical_triangle_projected_position(')?'':
  'fn optical_triangle_projected_position(t:TriangleRecord,p:vec3<f32>)->vec4<f32>{return vec4<f32>(p,1);}';
 const code=WAVEFRONT_COMPUTE_WGSL+absentGuard+`
 @group(1) @binding(0)var<storage,read>cases:array<vec4<f32>>;
 @compute @workgroup_size(1)fn sweep(@builtin(global_invocation_id)id:vec3<u32>){
  let o=id.x*4u;var t=TriangleRecord();t.v0=cases[o];t.v1=cases[o+1u];t.v2=cases[o+2u];
  let p=optical_triangle_position(t,cases[o+3u].xyz);accumulation[id.x]=optical_triangle_projected_position(t,p);
 }`;
 const cases=[];
 for(const axes of [[0,1,2],[1,2,0],[2,0,1]])for(const sign of [-1,1])
 for(const small of [2**-24,2**-20,1e-5,1e-4])for(const t of [.1,.3,.7,.9])for(const order of [[0,1,2],[1,2,0],[2,0,1],[0,2,1]]){
  const bary=[small,t,1-small-t].map(Math.fround),transform=v=>axes.map(axis=>v[axis]*sign);
  cases.push({vertices:order.map(i=>transform(frozen.primary.vertices[i])),bary:order.map(i=>bary[i])});
 }
 const input=new Float32Array(cases.flatMap(c=>[...c.vertices.map(v=>[...v,1]),[...c.bary,0]].flat())),out=new Float32Array(cases.length*4);
 new Exec(new Parser().parse(code)).dispatchWorkgroups('sweep',cases.length,{0:{3:out},1:{0:input}});
 cases.forEach((c,i)=>{
  assert.equal(out[i*4+3],1,`case ${i} must have a representable interior neighbour`);
  const weights=projectedWeights(c.vertices,Array.from(out.slice(i*4,i*4+3)));
  assert(weights.every(w=>w>0),`case ${i}: accepted outside face ${weights}`);
 });
});
