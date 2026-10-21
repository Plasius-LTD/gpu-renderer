import test from 'node:test';
import assert from 'node:assert/strict';
import {WAVEFRONT_COMPUTE_WGSL} from '../src/wavefront-shaders.js';
import {OpticalWgslExec as Exec,OpticalWgslParser as Parser} from './fixtures/optical-wgsl-executor.js';
import {OPTICAL_COPLANAR_PROBE_WGSL,assertOpticalCoplanarProbe} from './fixtures/optical-coplanar-probe.js';
import {readFileSync} from 'node:fs';
import {functionSource} from './fixtures/rough-dielectric-numerical-harness.js';
import {WAVEFRONT_INTERSECTION_BODY_WGSL} from '../src/wavefront-shader-kernels.js';

const frozen=JSON.parse(readFileSync(new URL('../docs/evidence/rim-shared-diagonal-2026-10-21.json',import.meta.url)));
const integer=value=>{const bits=new Uint32Array(new Float32Array([value]).buffer)[0],e=(bits>>>23)&255;
 return (bits>>>31?-1n:1n)*BigInt((bits&0x7fffff)|(e?0x800000:0))<<BigInt(Math.max(0,e-1));};
const determinant=([a,b,c,d])=>{const v=[b,c,d].map(p=>p.map((x,i)=>integer(x)-integer(a[i]))),[u,w,z]=v;
 return u[0]*(w[1]*z[2]-w[2]*z[1])-u[1]*(w[0]*z[2]-w[2]*z[0])+u[2]*(w[0]*z[1]-w[1]*z[0]);};

test('captured rounded point inside its shared coplanar wall is not rejected at an internal diagonal',()=>{
 // Before implementation the old policy has no neighbour certificate.
 const missing=WAVEFRONT_COMPUTE_WGSL.includes('fn optical_coplanar_neighbor_pair(')?'':`
 fn optical_coplanar_neighbor_pair(a:TriangleRecord,b:TriangleRecord,axis:u32)->vec4<f32>{return vec4<f32>(0);}
 fn optical_neighbor_contains(a:TriangleRecord,b:TriangleRecord,p:vec3<f32>,axis:u32,proof:vec4<f32>)->bool{return false;}`;
 const code=WAVEFRONT_COMPUTE_WGSL+missing+OPTICAL_COPLANAR_PROBE_WGSL+`
 @compute @workgroup_size(1)fn probe(){let r=optical_coplanar_probe();for(var i=0u;i<4u;i++){accumulation[i]=r[i];}}`;
 const out=new Float32Array(16);new Exec(new Parser().parse(code)).dispatchWorkgroups('probe',1,{0:{3:out}});
 assert.doesNotThrow(()=>assertOpticalCoplanarProbe(out,{nested:true}));
 assert.doesNotThrow(()=>assertOpticalCoplanarProbe([],{nested:false}));
 for(const [index,value]of [[0,0],[1,0],[2,1],[3,1],[1,NaN]]){const bad=out.slice();bad[index]=value;
  assert.throws(()=>assertOpticalCoplanarProbe(bad,{nested:true}),/Optical coplanar face mismatch/);}
});

test('24-product coplanarity agrees with an independent exact binary32 determinant',()=>{
 const cases=[];
 for(const exponent of [-100,0,100])for(const sign of [-1,1])for(const axes of [[0,1,2],[1,2,0],[2,0,1]]){
  const transform=v=>axes.map(a=>Math.fround(v[a]*sign*2**exponent));
  const plane=[[1,1,1],[3,1,2],[1,3,2],[3,3,3]].map(transform);
  cases.push(plane);const folded=plane.map(v=>v.slice());
  const floats=new Float32Array([folded[3][axes.indexOf(2)]]),bits=new Uint32Array(floats.buffer);bits[0]++;
  folded[3][axes.indexOf(2)]=floats[0];cases.push(folded);
 }
 cases.push([...frozen.vertices,frozen.coplanarNeighbour.vertices[1]]);
 // Non-Sterbenz/exponent-mixed coordinates exercise the expansion itself.
 for(let i=0;i<20;i++)cases.push([[2**-100,1,2**100],[1,2**100,2**-100],[2**100,2**-100,1],[i-10,3,7]]);
 const code=WAVEFRONT_COMPUTE_WGSL+`
 @group(1) @binding(0)var<storage,read>cases:array<vec4<f32>>;
 @compute @workgroup_size(1)fn coplanar(@builtin(global_invocation_id)id:vec3<u32>){let o=id.x*4u;
  accumulation[id.x]=vec4<f32>(select(0.0,1.0,optical_exact_coplanar(cases[o].xyz,cases[o+1u].xyz,cases[o+2u].xyz,cases[o+3u].xyz)),0,0,0);}`;
 const input=new Float32Array(cases.flatMap(c=>c.flatMap(p=>[...p,0]))),out=new Float32Array(cases.length*4);
 new Exec(new Parser().parse(code)).dispatchWorkgroups('coplanar',cases.length,{0:{3:out},1:{0:input}});
 cases.forEach((c,i)=>assert.equal(out[i*4],determinant(c)===0n?1:0,`exact determinant ${i}`));
});

test('coplanar certification preserves ownership, winding and open-edge topology',()=>{
 const code=WAVEFRONT_COMPUTE_WGSL+`
 @compute @workgroup_size(1)fn topology(@builtin(global_invocation_id)id:vec3<u32>){
  var a=TriangleRecord();a.meshId=1u;a.mediumRefId=1u;a.materialRefId=2u;a.materialKind=2u;
  a.v0=vec4<f32>(0,0,0,1);a.v1=vec4<f32>(1,0,0,1);a.v2=vec4<f32>(0,1,0,1);
  var b=a;b.v0=a.v1;b.v1=vec4<f32>(1,1,0,1);b.v2=a.v2;
  switch(id.x){
   case 1u:{b.meshId=2u;}case 2u:{b.mediumRefId=2u;}case 3u:{b.materialRefId=3u;}case 4u:{b.materialSlot=1u;}
   case 5u:{b.flags=1u;}case 6u:{b.materialKind=3u;}case 7u:{let temp=b.v1;b.v1=b.v2;b.v2=temp;}
   case 8u:{b.v1.z=0.0000001;}case 9u:{b.v0.x=2.0;}case 10u:{a.mediumRefId=0u;}default:{}
  }
  let p=optical_coplanar_neighbor_pair(a,b,2u);
  accumulation[id.x]=vec4<f32>(p.w,select(0.0,1.0,optical_neighbor_contains(a,b,vec3<f32>(0.5,0.5,0),2u,p)),
   select(0.0,1.0,optical_neighbor_contains(a,b,vec3<f32>(1,0,0),2u,p)),select(0.0,1.0,optical_neighbor_contains(a,b,vec3<f32>(1.1,0.5,0),2u,p)));
 }`;
 const out=new Float32Array(44);new Exec(new Parser().parse(code)).dispatchWorkgroups('topology',11,{0:{3:out}});
 assert.deepEqual(Array.from(out.slice(0,4)),[1,1,0,0]);assert(out.slice(4).every(v=>v===0));
});

test('bounded canonical BVH search accepts the unchanged captured point and fails closed on malformed traversal',()=>{
 // Isolate only scene input; execute the actual canonical lookup and predicates.
 const setup=OPTICAL_COPLANAR_PROBE_WGSL.slice(OPTICAL_COPLANAR_PROBE_WGSL.indexOf(' var first='),OPTICAL_COPLANAR_PROBE_WGSL.indexOf(' let proof='));
 for(const kind of ['leaf','branch','missing','bad-index','bad-range','cycle','overflow','empty']){
  const nodeCount=kind==='branch'?3:kind==='overflow'?65:1;
  const code=WAVEFRONT_COMPUTE_WGSL+`
  @compute @workgroup_size(1)fn lookup(){${setup}
   triangles[0]=first;triangles[1]=other;
   var n=BvhNode();n.boundsMin=vec4<f32>(-10);n.boundsMax=vec4<f32>(10);n.triangleCount=2u;
   bvhNodes[0]=n;
   ${kind==='branch'?'n.triangleCount=0u;n.childOrFirst=1u;n.rightChild=2u;bvhNodes[0]=n;n.triangleCount=1u;n.childOrFirst=0u;bvhNodes[1]=n;n.childOrFirst=1u;bvhNodes[2]=n;':''}
   ${kind==='missing'?'triangles[1].mediumRefId=2u;':''}
   ${kind==='bad-index'?'bvhNodes[0].triangleCount=0u;bvhNodes[0].rightChild=99u;':''}
   ${kind==='bad-range'?'bvhNodes[0].triangleCount=3u;':''}
   ${kind==='cycle'?'bvhNodes[0].triangleCount=0u;':''}
   ${kind==='overflow'?'for(var i=0u;i<65u;i++){n.triangleCount=0u;n.childOrFirst=i;n.rightChild=i+1u;bvhNodes[i]=n;}':''}
   accumulation[0]=optical_coplanar_neighbor_position(first,0u,point);
  }`;
  const config=new Uint32Array(80);config[11]=kind==='empty'?0:2;config[12]=nodeCount;
  const out=new Float32Array(4);
  new Exec(new Parser().parse(code)).dispatchWorkgroups('lookup',1,{0:{5:config,3:out,8:new Float32Array(1024),9:new Float32Array(nodeCount*12)}});
  assert.deepEqual(Array.from(out.slice(0,3)),frozen.position,kind);assert.equal(out[3],['leaf','branch'].includes(kind)?1:0,kind);
 }
});

test('shared-face lookup remains unresolved-only and nested optical-volume-only in both hit paths',()=>{
 for(const fn of [functionSource('trace_material_hit_raw'),WAVEFRONT_INTERSECTION_BODY_WGSL]){
  assert.match(fn,/if \(reconstructed.w == 0.0\) \{\s*reconstructed = optical_coplanar_neighbor_position/);
  assert.match(fn,/if \(nested_media_enabled\(\)\)[\s\S]*hitTriangle.mediumRefId != 0u && all\(candidate.barycentric > vec3<f32>\(0.0\)\)/);
 }
});
