import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeWavefrontMesh} from '../src/wavefront-scene-normalizers.js';
import {createWavefrontMeshAcceleration,createWavefrontGpuMeshSource} from '../src/wavefront-mesh-sources.js';
import {packWavefrontTriangles} from '../src/wavefront-packers.js';
import * as reference from '../src/wavefront-reference.js';
import {WAVEFRONT_COMPUTE_WGSL} from '../src/wavefront-shaders.js';

const mesh={positions:[-1,-1,0,1,-1,0,0,1,0],indices:[0,1,2],uvs:[0,0,1,0,.5,1]};
const ray=(origin,direction,extra={})=>({origin,direction,rayId:0,sourcePixelId:0,mediumStackDepth:0,mediumStack:[0,0,0,0],...extra});
const triangle=options=>createWavefrontMeshAcceleration([{...mesh,...options}]).triangles[0];
const dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0);
const unit=a=>a.map(v=>v/Math.hypot(...a));
test('single-sided default and explicit two-sided policy survive both packing paths',()=>{
 for(const doubleSided of [undefined,false,true]){
  const input={...mesh,doubleSided,flags:8},n=normalizeWavefrontMesh(input);
  assert.equal(n.doubleSided,doubleSided===true);
  assert.equal(normalizeWavefrontMesh(n).doubleSided,n.doubleSided);
  const expected=8+(doubleSided?0x40000000:0);
  assert.equal(n.flags,expected);
  assert.equal(new Uint32Array(packWavefrontTriangles([triangle(input)]).buffer)[3],expected);
  assert.equal(new Uint32Array(createWavefrontGpuMeshSource([input]).meshes.buffer)[2],expected);
 }
 assert.equal(normalizeWavefrontMesh({...mesh,flags:0x40000000}).flags,0);
 assert.equal(normalizeWavefrontMesh({...mesh,material:{doubleSided:true}}).doubleSided,true);
 assert.throws(()=>normalizeWavefrontMesh({...mesh,doubleSided:'false'}),/doubleSided/);
});
test('back-face candidates are skipped, not black hits; explicit two-sided normals reverse',()=>{
 const front=ray([0,0,1],[0,0,-1]),back=ray([0,0,-1],[0,0,1]),t=triangle();
 assert(reference.intersectWavefrontReferenceTriangle(front,t));
 assert.equal(reference.intersectWavefrontReferenceTriangle(back,t),null);
 const hit=reference.intersectWavefrontReferenceTriangle(back,triangle({doubleSided:true}));
 assert.equal(hit.frontFace,false);assert.equal(hit.geometricNormal[2],-1);
 const behind={...t,triangleId:2,v0:[-1,-1,1],v1:[0,1,1],v2:[1,-1,1]};
 assert.equal(reference.traceWavefrontReferenceTriangles({},back,[t,behind]).triangleId,2);
 // The same candidate predicate is used by the shadow BVH, without a bounce.
 assert.match(WAVEFRONT_COMPUTE_WGSL,/let meshCandidate = intersect_bvh\(testRay, nearest\)/);
});
test('only an explicitly occupied matching medium admits a single-sided exit',()=>{
 const t=triangle({transmission:1,mediumRefId:7}),back=ray([0,0,-1],[0,0,1]);
 assert.equal(reference.intersectWavefrontReferenceTriangle(back,t),null);
 assert.equal(reference.intersectWavefrontReferenceTriangle({...back,mediumStackDepth:1,mediumStack:[8,0,0,0]},t),null);
 assert(reference.intersectWavefrontReferenceTriangle({...back,mediumStackDepth:1,mediumStack:[7,0,0,0]},t));
 assert(reference.intersectWavefrontReferenceTriangle({...back,mediumRefId:7},t));
 assert.equal(reference.intersectWavefrontReferenceTriangle({...back,mediumStackDepth:1,mediumStack:[7,0,0,0]},triangle({mediumRefId:7})),null);
});
test('normal validity keeps valid normals and repairs view-opposed reflection hemispheres',()=>{
 assert.equal(typeof reference.repairWavefrontReferenceNormal,'function');
 const repair=reference.repairWavefrontReferenceNormal,g=[0,0,1];
 for(const v of [[0,0,1],unit([1,0,.1]),unit([-.7,.2,.8])]){
  assert.deepEqual(repair(g,g,v),g);
  for(let i=0;i<100;i++){
   const n=unit([Math.sin(i)*.99,Math.cos(i)*.99,.08]);
   const result=repair(g,n,v),reflected=result.map((x,j)=>2*dot(result,v)*x-v[j]);
   assert(result.every(Number.isFinite));assert(Math.abs(Math.hypot(...result)-1)<1e-10);
   assert(dot(result,g)>0&&dot(result,v)>0);assert(dot(reflected,g)>=-1e-10);
   if(dot(n,v)>0&&dot(n.map((x,j)=>2*dot(n,v)*x-v[j]),g)>=Math.min(.01,.9*dot(g,v)))assert(result.every((x,j)=>Math.abs(x-n[j])<1e-14));
  }
 }
 assert.match(WAVEFRONT_COMPUTE_WGSL,/valid_surface_normal\(candidate.geometricNormal,.*-ray.direction.xyz\)/s);
});
