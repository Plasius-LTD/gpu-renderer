import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WAVEFRONT_COMPUTE_WGSL} from '../src/wavefront-shaders.js';
import {functionSource} from './fixtures/rough-dielectric-numerical-harness.js';
import {OpticalWgslExec as Exec,OpticalWgslParser as Parser} from './fixtures/optical-wgsl-executor.js';
import {OPTICAL_RIM_RECONSTRUCTION_PROBE_WGSL,assertOpticalRimReconstructionProbe} from './fixtures/optical-rim-reconstruction-probe.js';

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
