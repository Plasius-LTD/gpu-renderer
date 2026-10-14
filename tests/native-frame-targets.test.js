import test from "node:test";
import assert from "node:assert/strict";
import { forEachNativeFrameTarget } from "./fixtures/native-frame-targets.js";

test("native resolutions request independent adapters before creating independent devices",async()=>{
  let requests=0;const adapters=[],seen=[];
  const gpu={async requestAdapter(options){
    assert.deepEqual(options,{powerPreference:"high-performance"});requests++;
    let consumed=false;const adapter={info:{isFallbackAdapter:false},async requestDevice(){
      if(consumed)throw new Error("adapter is consumed");consumed=true;return {destroy(){}};
    }};adapters.push(adapter);return adapter;
  }};
  await forEachNativeFrameTarget(gpu,{"1080p":{width:1920,height:1080},"4k":{width:3840,height:2160}},async(name,target,adapter)=>{
    seen.push([name,target.width]);const device=await adapter.requestDevice();device.destroy();
  });
  assert.equal(requests,2);assert.notEqual(adapters[0],adapters[1]);
  assert.deepEqual(seen,[["1080p",1920],["4k",3840]]);
});

test("cancel, adapter unavailability and failed lanes cannot continue into another device",async()=>{
  let requests=0,lanes=0;
  const gpu={async requestAdapter(){requests++;return {info:{isFallbackAdapter:false}};}};
  const targets={a:{},b:{}};
  await assert.rejects(forEachNativeFrameTarget(gpu,targets,async()=>{lanes++;},()=>true),/Stopped/);
  assert.equal(requests,0);
  await assert.rejects(forEachNativeFrameTarget(gpu,targets,async()=>{lanes++;throw new Error("lane failure");}),/lane failure/);
  assert.equal(requests,1);assert.equal(lanes,1);
  for(const value of [null,{info:{isFallbackAdapter:true}},{info:{}}]){
    await assert.rejects(forEachNativeFrameTarget({requestAdapter:async()=>value},targets,async()=>{}),/Physical/);
  }
  await assert.rejects(forEachNativeFrameTarget(undefined,targets,async()=>{}),/Physical/);
});
