import test from 'node:test';
import assert from 'node:assert/strict';
import {OpticalWgslExec as WgslExec,OpticalWgslParser as WgslParser} from './fixtures/optical-wgsl-executor.js';
import {functionSource} from './fixtures/rough-dielectric-numerical-harness.js';
import {WAVEFRONT_COMPUTE_WGSL} from '../src/wavefront-shaders.js';
import {OPTICAL_CORNER_PROBE_WGSL,assertOpticalCornerProbe} from './fixtures/optical-corner-probe.js';


test('interior wall reflection retains its distinct bottom exit after position rounding',()=>{
 const base=WAVEFRONT_COMPUTE_WGSL
  .replace(functionSource('transport_experiment_enabled'),'fn transport_experiment_enabled(flag:u32)->bool{return (flag & 32768u)!=0u;}')
  .replace(functionSource('medium_optics'),'fn medium_optics(id:u32)->vec2<f32>{return vec2<f32>(1.5,2.0);}');
 for(const axis of ['xyz','yzx','zxy']){
  const transform=['ray.origin','ray.direction','wall.v0','wall.v1','wall.v2','bottom.v0','bottom.v1','bottom.v2']
   .map(v=>`${v}=vec4<f32>(${v}.${axis},${v}.w);`).join('\n')+`\n reflected=reflected.${axis};\n`;
  const code=base+OPTICAL_CORNER_PROBE_WGSL.replace('let hit=intersect_triangle',transform+'let hit=intersect_triangle')+`
   @compute @workgroup_size(1) fn probe(){let result=optical_corner_probe();for(var i=0u;i<4u;i++){accumulation[i]=result[i];}}
  `;
  const values=new Float32Array(16);
  new WgslExec(new WgslParser().parse(code)).dispatchWorkgroups('probe',1,{0:{3:values}});
  assert.deepEqual(Array.from(values.slice(0,3)),[1,0,1]);
  assert(values[4+axis.indexOf('y')]>Math.fround(-.6940840482711792),'positive barycentric interior must not round onto the adjacent bottom plane');
  assert.equal(values[3],1,'the next bottom exit cannot disappear at t=0');
  assert.equal(values[12],0,'occupied glass must exit before reaching the pedestal');
  assert.equal(values[13],1,'bottom bounds must admit the continuation');
  assert(values[11]>0&&values[11]<2e-7,'exit distance stays within one coordinate ULP along this ray');
 }
});

test('interior coordinate adjustment respects signs, bounds, zero and unresolved intervals',()=>{
 const source=`
 @group(0) @binding(0) var<storage,read> inputs:array<vec4<f32>>;
 @group(0) @binding(1) var<storage,read_write> outputs:array<f32>;
 ${functionSource('optical_interior_bound')}
 @compute @workgroup_size(1) fn probe(@builtin(global_invocation_id) id:vec3<u32>){let v=inputs[id.x];outputs[id.x]=optical_interior_bound(v.x,v.y,v.z);}`;
 const cases=[
  [1,1,2,1+2**-23],[2,1,2,2-2**-23],[-1,-1,-.5,-1+2**-24],[-.5,-1,-.5,-.5-2**-24],
  [0,0,1,2**-126],[0,-1,0,-(2**-126)],[2,2,2,2],[1.5,1,2,1.5],
  [1,1,1+2**-23,1],[1+2**-23,1,1+2**-23,1+2**-23],[0,0,2**-126,0],
 ];
 const inputs=new Float32Array(cases.flatMap(v=>[...v.slice(0,3),0])),outputs=new Float32Array(cases.length);
 new WgslExec(new WgslParser().parse(source)).dispatchWorkgroups('probe',cases.length,{0:{0:inputs,1:outputs}});
 assert.deepEqual(Array.from(outputs),cases.map(v=>Math.fround(v[3])));
});

test('position reconstruction preserves genuine edges, vertices, flat axes and ordinary interior',()=>{
 const source=`struct TriangleRecord{v0:vec4<f32>,v1:vec4<f32>,v2:vec4<f32>};
 @group(0) @binding(0) var<storage,read> inputs:array<vec4<f32>>;
 @group(0) @binding(1) var<storage,read_write> outputs:array<vec4<f32>>;
 ${functionSource('optical_interior_bound')}
 ${functionSource('optical_triangle_position')}
 @compute @workgroup_size(1) fn probe(){outputs[0]=vec4<f32>(optical_triangle_position(TriangleRecord(inputs[0],inputs[1],inputs[2]),inputs[3].xyz),1);}`;
 const ast=new WgslParser().parse(source);
 for(const [bary,expected] of [[[1,0,0],[1,1,2]],[[.5,.5,0],[1.5,1,2]],[[.25,.25,.5],[1.25,1.5,2]]])for(const reverse of [false,true]){
  const vertices=reverse?[1,1,2,1,1,2,2,1,2,1,2,1]:[1,1,2,1,2,1,2,1,1,2,2,1];
  const weights=reverse?[bary[0],bary[2],bary[1]]:bary;
  const input=new Float32Array([...vertices,...weights,0]),output=new Float32Array(4);
  new WgslExec(ast).dispatchWorkgroups('probe',1,{0:{0:input,1:output}});
  assert.deepEqual(Array.from(output),[...expected,1]);
 }
});

test('corner device gate rejects lost exits, collapsed origins and invalid distance',()=>{
 const values=[1,0,1,1,2.8562755584716797,-.6940839886665344,-.15461844205856323,-.6940840482711792,
  2.8562753200531006,-.6940839886665344,-.1546170860528946,7.5e-8,0,1,0,0];
 assert.doesNotThrow(()=>assertOpticalCornerProbe(values,{bounded:true,nested:true}));
 assert.doesNotThrow(()=>assertOpticalCornerProbe([],{bounded:false,nested:false}));
 for(const [field,bad] of [[3,0],[5,values[7]],[9,values[7]],[11,0],[11,1],[11,NaN],[12,1],[13,0]]){
  const rejected=values.slice();rejected[field]=bad;
  assert.throws(()=>assertOpticalCornerProbe(rejected,{bounded:true,nested:true}),/Optical corner mismatch/);
 }
});
