import test from 'node:test';
import assert from 'node:assert/strict';
import {createClothProbe,evaluateClothProbe} from './fixtures/cloth-denoise-probe.js';

test('cloth acceptance rejects the original no-op, blurred texture and guide exclusion',()=>{
 const p=createClothProbe(),g=new Float32Array(p.raw.length),n=new Float32Array(p.raw.length),truth=p.truth.slice();
 for(let id=0;id<128*128;id++){
  const y=Math.floor(id/128),x=id%128,o=id*4;
  g[o+3]=y<96?128/255:0;n[o+(x<64?2:0)]=1;
  if(y>=96&&x<2)truth.fill(0,o,o+4);
 }
 assert.equal(evaluateClothProbe(p,truth,g,n).passed,true);
 assert.throws(()=>evaluateClothProbe(p,p.raw,g,n),/Cloth probe failed/);
 const blurred=truth.slice();blurred[12*128*4]*=.99;
 assert.throws(()=>evaluateClothProbe(p,blurred,g,n),/Cloth probe failed/);
 assert.throws(()=>evaluateClothProbe(p,truth,new Float32Array(g.length),n),/Cloth probe failed/);
 assert.throws(()=>evaluateClothProbe(p,truth,g,new Float32Array(n.length)),/Cloth probe failed/);
 const invalid=truth.slice();invalid[0]=NaN;
 assert.throws(()=>evaluateClothProbe(p,invalid,g,n),/Nonfinite/);
});
