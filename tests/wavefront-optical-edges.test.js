import test from 'node:test';
import assert from 'node:assert/strict';
import {OpticalWgslExec as WgslExec,OpticalWgslParser as WgslParser} from './fixtures/optical-wgsl-executor.js';
import {functionSource} from './fixtures/rough-dielectric-numerical-harness.js';
import {WAVEFRONT_COMPUTE_WGSL} from '../src/wavefront-shaders.js';
import {OPTICAL_EDGE_PROBE_WGSL} from './fixtures/optical-edge-probe.js';
import {OPTICAL_ORDER_PROBE_WGSL} from './fixtures/optical-order-probe.js';
import {LEGACY_TRIANGLE_INTERSECTION_WGSL} from './fixtures/legacy-triangle-intersection.js';
import {assertOpticalOrderingProbe,DIELECTRIC_PROBE_CASES} from './fixtures/dielectric-transport-probe.js';

test('ordering preflight retains both complete records on rejection without relaxing the gate',()=>{
 const values=new Float32Array(DIELECTRIC_PROBE_CASES*16);
 for(const index of [19,20])values.set([1,1,.030731821650255987,.030732102132163742,0,1,0,1,0,.030731821650255987,1,.030732102132163742],index*16);
 const flags={bounded:false,nested:true};
 assert.doesNotThrow(()=>assertOpticalOrderingProbe(values,flags));
 assert.doesNotThrow(()=>assertOpticalOrderingProbe([], {...flags,nested:false}));
 const physical=values.slice();
 for(const index of [19,20]){physical[index*16+2]=.030731819570064545;physical[index*16+9]=.030731821432709694;}
 assert.doesNotThrow(()=>assertOpticalOrderingProbe(physical,flags),'different call sites may differ one ULP while both satisfy the frozen plane-distance contract');
 for(const index of [19,20])for(const [field,bad] of [[0,0],[3,.030732138082385063],[6,1],[7,0],[8,1],[9,0],[10,0],[11,1],[2,NaN]]){
  const rejected=values.slice();rejected[index*16+field]=bad;
  assert.throws(()=>assertOpticalOrderingProbe(rejected,flags),error=>{
   const evidence=JSON.parse(error.message.slice('Optical ordering mismatch '.length));
   assert.equal(evidence.index,index);assert.equal(evidence.field,field);
   assert.deepEqual(evidence.records.map(r=>r.index),[19,20]);
   assert(evidence.records.every(r=>r.values.length===12));
   if(field===3)assert.equal(evidence.tolerance,2e-8);
   return true;
  });
 }
});

test('grazing plane distance tolerates contracted dot and non-fused fma arithmetic',async()=>{
 // Explicit f32 intermediates: the executor's ordinary dot uses wider arithmetic
 // and missed the device's 0.030732138082385063 entry-distance regression.
 const helpers=`
 fn device_dot(left:vec3<f32>,right:vec3<f32>)->f32{return fma(left.z,right.z,fma(left.y,right.y,left.x*right.x));}
 fn unfused_remainder(left:vec3<f32>,right:vec3<f32>,head:vec3<f32>)->vec3<f32>{let product=left*right;return product-head;}
 @compute @workgroup_size(1) fn precision(){
  let forward=optical_order_probe(false);let backward=optical_order_probe(true);
  for(var i=0u;i<3u;i++){accumulation[i]=forward[i];accumulation[i+3u]=backward[i];}
 }`;
 const base=WAVEFRONT_COMPUTE_WGSL
  .replace(functionSource('transport_experiment_enabled'),'fn transport_experiment_enabled(flag:u32)->bool{return (flag & 32768u)!=0u;}')
  .replace(functionSource('medium_optics'),'fn medium_optics(id:u32)->vec2<f32>{return vec2<f32>(1.5,2.0);}')
  .replace('let denominator = dot(normal, direction)','let denominator = device_dot(normal, direction)')
  .replace('let distance = dot(normal, a)','let distance = device_dot(normal, a)');
 for(const fused of [true,false])for(const axis of ['xyz','yzx','zxy']){
  const transformed=OPTICAL_ORDER_PROBE_WGSL.replace('let a=intersect_triangle',
   ['ray.origin','ray.direction','exitFace.v0','exitFace.v1','exitFace.v2','entryFace.v0','entryFace.v1','entryFace.v2']
    .map(v=>`${v}=vec4<f32>(${v}.${axis},${v}.w);`).join('\n')+'\n let a=intersect_triangle');
  const code=(fused?base:base.replace('fma(left, right, -high)','unfused_remainder(left, right, high)'))+transformed+helpers;
  const values=new Float32Array(24);
  new WgslExec(new WgslParser().parse(code)).dispatchWorkgroups('precision',1,{0:{3:values}});
  for(const o of [0,12]){
   assert.deepEqual(Array.from(values.slice(o,o+2)),[1,1]);
   assert(values[o+2]<values[o+3]);
   assert(Math.abs(values[o+2]-.030731821650255987)<2e-8,`exit: ${values[o+2]}, fused=${fused}, axis=${axis}`);
   assert(Math.abs(values[o+3]-.030732102132163742)<2e-8,`entry: ${values[o+3]}, fused=${fused}, axis=${axis}`);
   assert.deepEqual(Array.from(values.slice(o+4,o+9)),[0,1,0,1,0]);
   assert.equal(values[o+10],1,'second traversal query must retain re-entry, not repeat the exit');
   assert(Math.abs(values[o+11]-.030732102132163742)<2e-8);
  }
 }
});

test('grazing glass exit precedes re-entry in either BVH order and survives the exclusive cursor',async()=>{
 const base=WAVEFRONT_COMPUTE_WGSL
  .replace(functionSource('transport_experiment_enabled'),'fn transport_experiment_enabled(flag:u32)->bool{return (flag & 32768u)!=0u;}')
  .replace(functionSource('medium_optics'),'fn medium_optics(id:u32)->vec2<f32>{return vec2<f32>(1.5,2.0);}');
 const kernel=`
 @compute @workgroup_size(1) fn ordering(){
  let forward=optical_order_probe(false);let backward=optical_order_probe(true);
  for(var i=0u;i<3u;i++){accumulation[i]=forward[i];accumulation[i+3u]=backward[i];}
 }`;
 for(const axis of ['xyz','yzx','zxy'])for(const reverseWinding of [false,true]){
  const vectors=['ray.origin','ray.direction','exitFace.v0','exitFace.v1','exitFace.v2','entryFace.v0','entryFace.v1','entryFace.v2'];
  const transform=vectors.map(v=>`${v}=vec4<f32>(${v}.${axis},${v}.w);`).join('\n')+(reverseWinding?`
   let swapExit=exitFace.v1;exitFace.v1=exitFace.v2;exitFace.v2=swapExit;
   let swapEntry=entryFace.v1;entryFace.v1=entryFace.v2;entryFace.v2=swapEntry;
   exitFace.flags=0x40000000u;entryFace.flags=0x40000000u;`:``);
  const code=base+OPTICAL_ORDER_PROBE_WGSL.replace('let a=intersect_triangle',transform+'\n let a=intersect_triangle')+kernel;
  const values=new Float32Array(24);
  new WgslExec(new WgslParser().parse(code)).dispatchWorkgroups('ordering',1,{0:{3:values}});
  for(const o of [0,12]){
   assert.deepEqual(Array.from(values.slice(o,o+2)),[1,1]);
   assert(values[o+2]<values[o+3],'exit must precede entry, not be reordered by rounded projected barycentrics');
   assert(Math.abs(values[o+2]-.030731821650255987)<2e-8);
   assert(Math.abs(values[o+3]-.030732102132163742)<2e-8);
   assert.deepEqual(Array.from(values.slice(o+4,o+8)),[Number(reverseWinding),Number(!reverseWinding),0,1],'strict cursor excludes first face but retains second');
   assert.equal(values[o+8],Number(reverseWinding),'closest BVH candidate must be the original exit face');
   assert.equal(values[o+10],Number(!reverseWinding),'exclusive traversal cursor must select the second face');
   assert(Math.abs(values[o+9]-.030731821650255987)<2e-8);
   assert(Math.abs(values[o+11]-.030732102132163742)<2e-8);
  }
 }
});

test('assembled collision executes retained seams and preserves frozen flag-off results',async()=>{
 const source=WAVEFRONT_COMPUTE_WGSL
  .replace(functionSource('transport_experiment_enabled'),'fn transport_experiment_enabled(flag:u32)->bool{return (flag & 32768u)!=0u;}')
  .replace(functionSource('medium_optics'),'fn medium_optics(id:u32)->vec2<f32>{return vec2<f32>(1.5,2.0);}')+OPTICAL_EDGE_PROBE_WGSL+`
 @compute @workgroup_size(1) fn collision(){accumulation[0]=optical_edge_probe(false);accumulation[1]=optical_edge_probe(true);}`;
 const run=code=>{const values=new Float32Array(8);new WgslExec(new WgslParser().parse(code)).dispatchWorkgroups('collision',1,{0:{3:values}});return values;};
 const result=run(source);assert(result[0]>=1&&result[4]>=1);assert(Math.abs(result[1]-.0040711072)<2e-7);assert(Math.abs(result[5]-.0358458877)<2e-7);
 const disabled=source.replace('(flag & 32768u)!=0u','false');
 assert.deepEqual(run(disabled),run(disabled.replace(functionSource('intersect_triangle'),LEGACY_TRIANGLE_INTERSECTION_WGSL)));
});

test('optical edge coordinates preserve shared-edge hits, winding, axes and strict cursor',async()=>{
 const source=`struct RayRecord{origin:vec4<f32>,direction:vec4<f32>};
 struct TriangleRecord{v0:vec4<f32>,v1:vec4<f32>,v2:vec4<f32>};
 @group(0) @binding(0) var<storage,read> inputs:array<vec4<f32>>;
 @group(0) @binding(1) var<storage,read_write> outputs:array<vec4<f32>>;
 fn transport_ray_minimum()->f32{return inputs[5].x;}
 ${functionSource('optical_projected_edge')}
 ${functionSource('optical_plane_dot')}
 ${['optical_multiply_words','optical_accumulate_product','optical_exact_edge','optical_edge_uncertain'].map(functionSource).join('\n')}
 ${functionSource('optical_triangle_coordinates')}
 @compute @workgroup_size(1) fn probe(){
  outputs[0]=optical_triangle_coordinates(RayRecord(inputs[0],inputs[1]),TriangleRecord(inputs[2],inputs[3],inputs[4]));
  outputs[1]=vec4<f32>(optical_projected_edge(inputs[2].xy,inputs[3].xy),optical_projected_edge(inputs[3].xy,inputs[2].xy),0,0);
 }`;
 const ast=new WgslParser().parse(source);
 const run=(origin,direction,vertices,minimum=0)=>{
  const input=new Float32Array([...origin,0,...direction,0,...vertices.flatMap(v=>[...v,0]),minimum,0,0,0]),output=new Float32Array(8);
  new WgslExec(ast).dispatchWorkgroups('probe',1,{0:{0:input,1:output}});
  assert(output.every(Number.isFinite));assert.equal(output[4]+output[5],0);return output;
 };
 for(let axis=0;axis<3;axis++)for(const sign of [-1,1])for(const reverse of [false,true]){
  const permute=v=>[v[axis],v[(axis+1)%3],v[(axis+2)%3]];
  const origin=permute([0,0,sign]),direction=permute([0,0,-sign]);
  const triangles=[[[-1,-1,0],[1,-1,0],[1,1,0]],[[-1,-1,0],[1,1,0],[-1,1,0]]].map(v=>(reverse?v.toReversed():v).map(permute));
  const hits=triangles.map(v=>run(origin,direction,v));assert(hits.some(v=>v[3]===1));
  for(const v of triangles){assert(run(origin,direction,v,1)[3]<0);assert(run(permute([3,0,sign]),direction,v)[3]<0);}
  assert(triangles.some(v=>run(permute([1,1,sign]),direction,v)[3]===1),'shared vertex');
 }
 // Retained physical ray: the near inner wall must be hit before the far entry.
 const origin=[2.8936612606048584,-0.5178312063217163,-0.06655824929475784],direction=[-0.7860987782478333,-0.1896992027759552,-0.5882711410522461];
 const vertices=[[2.8924050331115723,-0.5140840411186218,-0.071665920317173],[2.890460968017578,-0.6820840239524841,-0.06895316392183304],[2.890460968017578,-0.5140840411186218,-0.06895316392183304]];
 const next=[vertices[2],vertices[1],[Math.fround(2.888343811035156),-0.6820840239524841,-0.06637336313724518]];
 assert([vertices,next].some(v=>{const hit=run(origin,direction,v);return hit[3]>0&&Math.abs(hit[3]-.0040711072)<1e-7;}));
 assert(run([0,0,1],[0,0,-1],[[0,0,0],[0,0,0],[0,0,0]])[3]<0,'degenerate');
 assert(run([0,0,1],[1,0,0],[[-1,-1,0],[1,-1,0],[0,1,0]])[3]<0,'parallel');
});

test('only nested mode selects edge-consistent coordinates; culling and material interpolation remain shared',()=>{
 const source=functionSource('intersect_triangle');
 assert.match(source,/if \(nested_media_enabled\(\)\) \{[\s\S]*optical_triangle_coordinates\(ray, triangle\)/);
 assert.match(source,/mediumExit/);assert.match(source,/triangle.flags & 0x40000000u/);
 assert.match(source,/u < 0.0 \|\| u > 1.0/);assert.match(source,/u \+ v > 1.0/);
 assert.match(WAVEFRONT_COMPUTE_WGSL,/medium_transition_invalid\(ray, hit\)/);
});

test('nested BVH bounds conservatively retain a rounded shared-edge candidate',async()=>{
 const code=`struct RayRecord{origin:vec4<f32>,direction:vec4<f32>};
 @group(0) @binding(0) var<storage,read_write> result:array<u32>;
 fn nested_media_enabled()->bool{return true;}
 fn transport_ray_minimum()->f32{return 0.0;}
 ${functionSource('safe_inverse')}
 ${functionSource('intersect_bounds')}
 @compute @workgroup_size(1) fn bounds(){
  let ray=RayRecord(vec4<f32>(2.8936612606048584,-0.5178312063217163,-0.06655824929475784,1),vec4<f32>(-0.7860987782478333,-0.1896992027759552,-0.5882711410522461,0));
  result[0]=select(0u,1u,intersect_bounds(ray,vec3<f32>(2.8883438110351562,-0.6820840239524841,-0.06895316392183304),vec3<f32>(2.890460968017578,-0.5140840411186218,-0.06637336313724518),1.0));
 }`;
 // This helper also has a portable source invariant: only broad-phase admission
 // is padded, while final hit/cursor testing stays strict.
 assert.match(code,/2.0 \* gamma3/);
 const values=new Uint32Array(1);new WgslExec(new WgslParser().parse(code)).dispatchWorkgroups('bounds',1,{0:{0:values}});assert.equal(values[0],1);
});
