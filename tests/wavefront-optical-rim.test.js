import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {WAVEFRONT_COMPUTE_WGSL} from '../src/wavefront-shaders.js';
import {functionSource} from './fixtures/rough-dielectric-numerical-harness.js';
import {OPTICAL_RIM_PROBE_WGSL,assertOpticalRimProbe} from './fixtures/optical-rim-probe.js';
const require=createRequire(import.meta.resolve('@plasius/gpu-shader/node'));
const {WgslExec,WgslParser}=await import(pathToFileURL(require.resolve('wgsl_reflect/wgsl_reflect.module.js')));

test('independent double-precision geometry places the captured ray outside, not inside glass',()=>{
 const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const origin=[3.176982879638672,-.4139057993888855,.1437508463859558];
 const a=[2.8392701148986816,-.5140840411186218,-.04605681076645851];
 const b=[2.840050458908081,-.5140840411186218,-.04997995123267174];
 const c=[2.8368003368377686,-.5140840411186218,-.050737783312797546];
 for(const [z,inside] of [[-.48219066858291626,false],[-.48219063878059387,true]]){
  const direction=[-.8399121165275574,-.2490779459476471,z];
  const e=sub(b,a),f=sub(c,a),p=cross(direction,f),det=dot(e,p),s=sub(origin,a),q=cross(s,e);
  const w=1-(dot(s,p)+dot(direction,q))/det;
  assert.equal(w>0,inside);assert(Math.abs(w)>2e-7&&Math.abs(w)<.00001);
  assert(Math.abs(dot(f,q)/det-.40219635403124965)<1e-12);
 }
});

test('near-rim outside primary is rejected while its adjacent inside direction is retained',()=>{
 const base=WAVEFRONT_COMPUTE_WGSL.replace(functionSource('transport_experiment_enabled'),
  'fn transport_experiment_enabled(flag:u32)->bool{return (flag & 32768u)!=0u;}');
 for(const axis of ['xyz','yzx','zxy'])for(const reverse of [false,true])for(const contracted of [false,true]){
  const transform=['ray.origin','ray.direction','rim.v0','rim.v1','rim.v2','farWall.v0','farWall.v1','farWall.v2'].map(v=>`${v}=vec4<f32>(${v}.${axis},${v}.w);`).join('\n')+
   (reverse?'let swap=rim.v1;rim.v1=rim.v2;rim.v2=swap;rim.flags=0x40000000u;':'');
  const probe=OPTICAL_RIM_PROBE_WGSL.replace('let rimCandidate=',transform+'\n let rimCandidate=')
   .replace('ray.direction.z=-0.48219063878059387',`ray.direction.${'xyz'[axis.indexOf('z')]}=-0.48219063878059387`);
  const arithmetic=contracted?base.replace('(a.x * b.x - high) + (a.x * b.y + a.y * b.x) + a.y * b.y',
   'fma(a.x,b.x,-high) + fma(a.x,b.y,a.y*b.x) + a.y*b.y'):base;
  const code=arithmetic+probe+'\n @compute @workgroup_size(1) fn probe(){let p=optical_rim_probe();accumulation[0]=p[0];accumulation[1]=p[1];}';
  const out=new Float32Array(8);
  new WgslExec(new WgslParser().parse(code)).dispatchWorkgroups('probe',1,{0:{3:out}});
  assert.doesNotThrow(()=>assertOpticalRimProbe(out,{bounded:true,nested:true}),axis+' reverse='+reverse);
 }
});

test('rim device gate rejects false admission, lost neighbour and invalid barycentrics',()=>{
 const good=[-1,.40219635403124965,.000003,.999997,0,1,1,.4340141];
 assert.doesNotThrow(()=>assertOpticalRimProbe(good,{nested:true}));
 assert.doesNotThrow(()=>assertOpticalRimProbe([],{nested:false}));
 for(const [i,v] of [[0,.402],[1,-1],[2,-.001],[3,.9],[0,NaN],[4,1],[5,0],[6,0],[7,.402]]){
  const bad=good.slice();bad[i]=v;assert.throws(()=>assertOpticalRimProbe(bad,{nested:true}),/Optical rim mismatch/);
 }
});
