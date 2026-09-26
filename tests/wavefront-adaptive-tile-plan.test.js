import test from "node:test";
import assert from "node:assert/strict";
import { createAdaptiveTilePlan } from "../src/wavefront-adaptive-tile-plan.js";

test("disabled tile planning does not inspect inputs",()=>assert.equal(createAdaptiveTilePlan({}),null));
test("native tiles cover each pixel once and skip only absent sample ranges",()=>{
  for(const [width,height,count] of [[1920,1080,135],[3840,2160,510],[131,129,4]]){
    const budgets=Uint8Array.from({length:width*height},(_,id)=>id%11===0?32:id%5===0?8:1);
    const plan=createAdaptiveTilePlan({enabled:true,width,height,budgets});
    assert.equal(plan.length,count);
    const seen=new Uint8Array(width*height);let total=0;
    for(const {tile,ranges,expectedPrimaryRays,histogram} of plan){
      let samples=0;
      for(const budget of Object.keys(histogram).map(Number)){
        const ordinals=ranges.flatMap(r=>budget>=r.sampleLimit?Array.from({length:r.sampleLimit-r.firstSample},(_,i)=>r.firstSample+i):[]);
        assert.equal(ordinals.length,budget);assert.equal(ordinals.at(-1),budget-1);
      }
      for(let y=0;y<tile.height;y++)for(let x=0;x<tile.width;x++){
        const id=(tile.y+y)*width+tile.x+x;seen[id]++;samples+=budgets[id];
      }
      assert.equal(samples,expectedPrimaryRays);total+=samples;
    }
    assert.ok(seen.every(n=>n===1));assert.equal(total,budgets.reduce((a,b)=>a+b,0));
  }
  const one=createAdaptiveTilePlan({enabled:true,width:128,height:128,budgets:new Uint8Array(16384).fill(1)});
  assert.deepEqual(one[0].ranges,[{firstSample:0,sampleLimit:1}]);
});
test("invalid native tile budgets fail before any GPU work",()=>{
  for(const patch of [{width:0},{height:NaN},{width:1.5},{budgets:[1]},{budgets:new Uint8Array(2)},{budgets:new Uint8Array(20)},{budgets:new Uint8Array(20).fill(33)}])
    assert.throws(()=>createAdaptiveTilePlan({enabled:true,width:5,height:4,budgets:new Uint8Array(20).fill(1),...patch}),RangeError);
});
