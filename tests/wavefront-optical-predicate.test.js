import test from 'node:test';
import assert from 'node:assert/strict';
import {OPTICAL_PREDICATE_WGSL} from '../src/wavefront-optical-predicate-shader.js';
import {OpticalWgslExec as Exec,OpticalWgslParser as Parser} from './fixtures/optical-wgsl-executor.js';

const prefix='struct RayRecord{origin:vec4<f32>,direction:vec4<f32>};'+OPTICAL_PREDICATE_WGSL;
function integer(value){
 const f=new Float32Array([value]),bits=new Uint32Array(f.buffer)[0],e=(bits>>>23)&255;
 assert.notEqual(e,255);
 const m=BigInt((bits&0x7fffff)|(e?0x800000:0));
 return (bits>>>31?-m:m)<<BigInt(Math.max(0,e-1)); // exact units of 2^-149
}
function leading(value){
 if(value===0n)return[0,-447];
 const negative=value<0n,m=negative?-value:value,shift=Math.max(0,m.toString(2).length-24);
 return[Number(m>>BigInt(shift))*(negative?-1:1),shift-447];
}
const run=(source,groups,count=1)=>new Exec(new Parser().parse(source)).dispatchWorkgroups('probe',count,groups);

test('retained paired-float residual is lost under permitted reassociation',()=>{
 // Minimal counterexample for 021d27c optical_wide_pair. Keep the rejected
 // implementation's failure mechanism, without retaining it in GPU transport.
 const source=`
 @group(0) @binding(0)var<storage,read>inputs:array<f32>;
 @group(0) @binding(1)var<storage,read_write>outputs:array<vec2<f32>>;
 @compute @workgroup_size(1)fn probe(){let head=inputs[0];let tail=inputs[1];
  let high=bitcast<f32>(bitcast<u32>(head+tail)&0xfffff000u);
  outputs[0]=vec2<f32>((head-high)+tail,(head+tail)-high);
 }`;
 const output=new Float32Array(2);run(source,{0:{0:new Float32Array([1,2**-25]),1:output}});
 assert.deepEqual(Array.from(output),[2**-25,0]);
});

test('numerical adapter preserves unsigned shifts, generic vectors and full-width multiplication',()=>{
 const source=prefix+`
 @group(0) @binding(0)var<storage,read>inputs:array<vec2<u32>>;
 @group(0) @binding(1)var<storage,read_write>outputs:array<vec4<u32>>;
 @compute @workgroup_size(1)fn probe(@builtin(global_invocation_id)id:vec3<u32>){
  let v=inputs[id.x];let p=optical_multiply_words(v.x,v.y);
  outputs[id.x]=vec4<u32>(p,v.x>>16u,(v>>vec2<u32>(16u)).y);
 }`;
 const cases=[[0,0],[1,0xffffffff],[0xffffff,0xffffff],[0xffffffff,0xffffffff],[0x80000001,0x80000003],[65535,65537]];
 const output=new Uint32Array(cases.length*4);
 run(source,{0:{0:new Uint32Array(cases.flat()),1:output}},cases.length);
 cases.forEach(([a,b],i)=>{
  const p=BigInt(a)*BigInt(b);
  assert.deepEqual(Array.from(output.slice(i*4,i*4+4)),[Number(p&0xffffffffn),Number(p>>32n),a>>>16,b>>>16]);
 });
});

test('signed dyadic accumulator matches BigInt across carries, cancellation and finite exponent extremes',()=>{
 const source=prefix+`
 @group(0) @binding(0)var<storage,read>inputs:array<vec4<f32>>;
 @group(0) @binding(1)var<storage,read_write>outputs:array<u32>;
 @compute @workgroup_size(1)fn probe(){var total:array<u32,27>;
  for(var n=0u;n<arrayLength(&inputs);n++){let v=inputs[n];optical_accumulate_product(&total,v.x,v.y,v.z,v.w!=0.0);}
  for(var n=0u;n<27u;n++){outputs[n]=total[n];}
 }`;
 const max=3.4028234663852886e38,min=2**-149;
 const cases=[[[1,1,1,0]],[[1,1,1,1]],[[1,1,1,0],[1,1,1,1]],
  [[max,max,max,0]],Array.from({length:18},()=>[max,max,max,0]),
  Array.from({length:18},()=>[max,max,max,1]),
  [[min,min,min,1]],[[max,max,max,0],[max,max,max,1],[min,min,min,0]],
  Array.from({length:18},(_,i)=>[Math.fround((i%2?-1:1)*1.234567*2**(i-8)),Math.fround(2.345678*2**(8-i)),Math.fround(.345678),i%3===0?1:0])];
 for(const terms of cases){
  const expected=BigInt.asUintN(864,terms.reduce((s,[a,b,c,n])=>s+integer(a)*integer(b)*integer(c)*(n?-1n:1n),0n));
  const output=new Uint32Array(27);run(source,{0:{0:new Float32Array(terms.flat()),1:output}});
  for(let i=0;i<27;i++)assert.equal(output[i],Number((expected>>BigInt(i*32))&0xffffffffn),'word '+i);
 }
});

test('original-ray edge sign and leading magnitude match an independent exact determinant',()=>{
 const source=prefix+`
 @group(0) @binding(0)var<storage,read>inputs:array<vec4<f32>>;
 @group(0) @binding(1)var<storage,read_write>outputs:array<vec2<f32>>;
 @compute @workgroup_size(1)fn probe(@builtin(global_invocation_id)id:vec3<u32>){let n=id.x*4u;
  outputs[id.x]=optical_exact_edge(RayRecord(inputs[n],inputs[n+1u]),inputs[n+2u].xyz,inputs[n+3u].xyz);
 }`;
 const cases=[];
 for(const exponent of [-120,-60,0,60,120])for(const sign of [-1,1]){
  const scale=2**exponent;
  cases.push([[.123,.234,.345].map(v=>v*scale),[.41,-.52,.63].map(v=>v*scale),[1.01,1.12,1.23].map(v=>v*scale),[sign*1.24,1.35,1.46].map(v=>v*scale)]);
 }
 cases.push([[0,0,0],[0,0,1],[1,1,0],[1,1,0]],[[0,0,0],[0,0,1],[1,0,0],[0,1,0]]);
 // Deterministic finite bit patterns cover widely separated exponents and
 // mantissas. Append the reverse of every edge to check exact antisymmetry.
 let state=0x6ab03129;
 const next=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};
 const value=()=>new Float32Array(new Uint32Array([(next()&0x807fffff)|((next()%255)<<23)]).buffer)[0];
 for(let i=0;i<128;i++)cases.push(Array.from({length:4},()=>Array.from({length:3},value)));
 cases.push(...cases.map(([o,d,a,b])=>[o,d,b,a]));
 const rounded=cases.map(c=>c.map(v=>v.map(Math.fround))),output=new Float32Array(cases.length*2);
 run(source,{0:{0:new Float32Array(rounded.flatMap(c=>c.flatMap(v=>[...v,0]))),1:output}},cases.length);
 rounded.forEach(([o,d,a,b],n)=>{
  const origin=o.map(integer),direction=d.map(integer),left=a.map((v,i)=>integer(v)-origin[i]),right=b.map((v,i)=>integer(v)-origin[i]);
  let determinant=0n;
  for(let i=0;i<3;i++){const j=(i+1)%3,k=(i+2)%3;determinant+=(left[j]*right[k]-left[k]*right[j])*direction[i];}
  assert.deepEqual(Array.from(output.slice(n*2,n*2+2)),leading(determinant),'case '+n);
 });
});

test('fallback contains no paired floating remainder susceptible to reassociation',()=>{
 assert.doesNotMatch(OPTICAL_PREDICATE_WGSL,/optical_wide_|\bfma\(/);
 assert.match(OPTICAL_PREDICATE_WGSL,/array<u32,27>/);
});
