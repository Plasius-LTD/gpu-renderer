import test from 'node:test';
import assert from 'node:assert/strict';
import {WAVEFRONT_COMPUTE_WGSL} from '../src/wavefront-shaders.js';
import {functionSource} from './fixtures/rough-dielectric-numerical-harness.js';
import {OpticalWgslExec as Exec,OpticalWgslParser as Parser} from './fixtures/optical-wgsl-executor.js';

const base=WAVEFRONT_COMPUTE_WGSL.replace(functionSource('transport_experiment_enabled'),'fn transport_experiment_enabled(flag:u32)->bool{return (flag & 32768u)!=0u;}');
test('small and grazing triangles retain correct facing and normal, rejecting true degeneracy/backfaces',()=>{
 const source=base+`
 @group(1) @binding(0)var<storage,read>cases:array<vec4<f32>>;
 @compute @workgroup_size(1)fn geometry(@builtin(global_invocation_id)id:vec3<u32>){
  let q=cases[id.x];var ray=RayRecord();ray.origin=vec4<f32>(q.x*0.25,q.x*0.25,q.x,0);ray.direction=vec4<f32>(0,0,-1,0);
  var triangle=TriangleRecord();triangle.v1=vec4<f32>(q.x,0,0,0);triangle.v2=vec4<f32>(0,q.x,0,0);
  if(q.y==1.0){let swap=triangle.v1;triangle.v1=triangle.v2;triangle.v2=swap;}
  if(q.y==2.0){triangle.v2=triangle.v1;}
  if(q.y==3.0){ray.origin=vec4<f32>(-0.75,0.25,0.00000005,0);ray.direction=vec4<f32>(1,0,-0.00000005,0);}
  if(q.y==4.0){ray.direction=vec4<f32>(1,0,0,0);}
  let hit=intersect_triangle(ray,triangle,0u);accumulation[id.x]=vec4<f32>(f32(hit.hit),f32(hit.frontFace),hit.geometricNormal.z,hit.distance);
 }`;
 const inputs=new Float32Array([1,0,0,0,.01,0,0,0,.0001,0,0,0,.0001,1,0,0,1,2,0,0,1,3,0,0,1,4,0,0]),out=new Float32Array(28);
 new Exec(new Parser().parse(source)).dispatchWorkgroups('geometry',7,{0:{3:out},1:{0:inputs}});
 for(const i of [0,1,2,5]){assert.equal(out[i*4],1);assert.equal(out[i*4+1],1);assert(Math.abs(out[i*4+2]-1)<1e-6);}
 for(const i of [3,4,6])assert.equal(out[i*4],0);
});

test('error-aware origins leave sloped translated surfaces on the requested side',()=>{
 const source=base+`
 @group(1) @binding(0)var<storage,read>cases:array<vec4<f32>>;
 @compute @workgroup_size(1)fn projected(@builtin(global_invocation_id)id:vec3<u32>){
  let q=cases[id.x];var triangle=TriangleRecord();triangle.v0=vec4<f32>(q.x,0,q.x,0);triangle.v1=vec4<f32>(q.x+1.0,0,q.x-1.0,0);triangle.v2=vec4<f32>(q.x,1,q.x,0);
  let normal=normalize(vec3<f32>(1,0,1));let bary=vec3<f32>(0.2,0.3,0.5);
  let point=optical_triangle_position(triangle,bary);let bound=optical_triangle_error(triangle,bary,normal);
  let outgoing=optical_offset_error(point,normal,normal,bound);let incoming=optical_offset_error(point,normal,-normal,bound);
  accumulation[id.x*2u]=vec4<f32>(point,bound);accumulation[id.x*2u+1u]=vec4<f32>(outgoing.x+outgoing.z-2.0*q.x,incoming.x+incoming.z-2.0*q.x,0,0);
 }`;
 const positions=[1,-1,10000,-10000,Math.fround(3.17)],out=new Float32Array(positions.length*8);
 new Exec(new Parser().parse(source)).dispatchWorkgroups('projected',positions.length,{0:{3:out},1:{0:new Float32Array(positions.flatMap(p=>[p,0,0,0]))}});
 for(let i=0;i<positions.length;i++){assert(out[i*8+3]>0);assert(out[i*8+4]>0);assert(out[i*8+5]<0);}
});

test('zero-error planes retain the nearest representable neighbour at zero and translated coordinates',()=>{
 const source=base+`
 @group(1) @binding(0)var<storage,read>cases:array<vec4<f32>>;
 @compute @workgroup_size(1)fn origin(@builtin(global_invocation_id)id:vec3<u32>){
  let q=cases[id.x];var triangle=TriangleRecord();triangle.v0=vec4<f32>(-1,-1,q.x,0);triangle.v1=vec4<f32>(1,-1,q.x,0);triangle.v2=vec4<f32>(0,1,q.x,0);
  let error=optical_triangle_error(triangle,vec3<f32>(0.25,0.25,0.5),vec3<f32>(0,0,1));
  var hit=HitRecord();hit.position=vec4<f32>(0,0,q.x,1);hit.geometricNormal=vec4<f32>(0,0,1,0);hit.pad2=error;
  let start=offset_hit_origin(hit,vec3<f32>(0,0,-1));
  triangle.v0.z=q.y;triangle.v1.z=q.y;triangle.v2.z=q.y;
  var ray=RayRecord();ray.origin=vec4<f32>(start,1);ray.direction=vec4<f32>(0,0,-1,0);
  let next=intersect_triangle(ray,triangle,0u);accumulation[id.x]=vec4<f32>(error,start.z,f32(next.hit),next.distance);
 }`;
 const cases=[[0,-.0000005],[1,1-2**-24],[-1,-1-2**-23]],out=new Float32Array(12);
 new Exec(new Parser().parse(source)).dispatchWorkgroups('origin',3,{0:{3:out},1:{0:new Float32Array(cases.flatMap(([p,n])=>[p,n,0,0]))}});
 for(let i=0;i<3;i++){assert.equal(out[i*4],0);assert.equal(out[i*4+1],cases[i][0]);assert.equal(out[i*4+2],1);assert(out[i*4+3]>0);}
});
