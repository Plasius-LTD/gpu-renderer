import test from 'node:test';
import assert from 'node:assert/strict';
import {validateWavefrontBsdfSample,computeWavefrontTerminalEnvironmentContributionReference} from '../src/wavefront-reference.js';
import {WAVEFRONT_COMPUTE_WGSL} from '../src/wavefront-shaders.js';
import {authoredColourProbeFrame,authoredColourProbeShader} from './fixtures/authored-colour-probe.js';
import {analyzeWgslSource} from '@plasius/gpu-shader/node';

const colours=[[0,0,0],[.001,.01,.03],[.883,.035,0],[1,1,1]];
const near=(a,b)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-10,JSON.stringify({actual:a,expected:b})));
test('authored black, dark and saturated diffuse colour follows Lambert, independently of ambient',()=>{
 for(const color of colours)for(const ambientColor of [[0,0,0],[.018,.022,.026],[1,.5,.2]]){
  const result=validateWavefrontBsdfSample({hit:{color,roughness:.8,specularWeight:0},ambientColor});
  near(result.bsdf,color.map(c=>c/Math.PI));near(result.continuationThroughput,color);
  assert.ok(!result.pdfMismatch);assert.equal(result.expectedPdf,1/Math.PI);
 }
});
test('normal-incidence dielectric and metal match closed-form GGX without ambient tint',()=>{
 for(const color of colours)for(const metallic of [0,1]){
  const hit={color,roughness:.8,metallic,specularWeight:1};
  const expected=color.map(c=>metallic?c/(4*Math.PI*.8**4):c*.96/Math.PI+.04/(4*Math.PI*.8**4));
  const a=validateWavefrontBsdfSample({hit,ambientColor:[0,0,0]}),b=validateWavefrontBsdfSample({hit,ambientColor:[1,1,1]});
  near(a.bsdf,expected);near(b.bsdf,expected);assert.deepEqual(a,b);
 }
});
test('black terminal material cannot acquire colour from a nonzero ambient source',()=>{
 const result=computeWavefrontTerminalEnvironmentContributionReference({ambientColor:[1,.5,.2]},
  {direction:[0,-1,0]},[1,1,1],{color:[0,0,0],specularWeight:0,roughness:.8});
 assert.ok(result.source.some(v=>v>0));assert.deepEqual(result.contribution,[0,0,0]);
});
test('assembled material and residual colour never inherit the illumination floor',()=>{
 assert.doesNotMatch(WAVEFRONT_COMPUTE_WGSL,/max\(hit\.color\.xyz, config\.ambientColor/);
 assert.match(WAVEFRONT_COMPUTE_WGSL,/max\(config\.ambientColor\.xyz, sunlitFloor/,'illumination source retained');
});
test('physical probe uses canonical frame packing at reflected ambient and flag offsets',()=>{
 const source=authoredColourProbeShader();assert.ok(source.startsWith(WAVEFRONT_COMPUTE_WGSL));
 const frame=analyzeWgslSource(source,'probe').records.find(r=>r.name==='FrameConfig');
 const offset=name=>frame.members.find(m=>m.name===name).offset;
 for(const sheen of [false,true]){
  const bytes=authoredColourProbeFrame(sheen,[1,.5,.2]),view=new DataView(bytes);
  assert.equal(bytes.byteLength,frame.byteSize);
  assert.deepEqual([...new Float32Array(bytes,offset('ambientColor'),4)],[...new Float32Array([1,.5,.2,1])]);
  assert.equal((view.getUint32(offset('transportExperimentFlags'),true)&4096)!==0,sheen);
 }
});
