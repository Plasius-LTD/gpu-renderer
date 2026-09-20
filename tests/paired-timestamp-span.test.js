import test from "node:test";
import assert from "node:assert/strict";
import { createTimestampSpanEncoder } from "./fixtures/paired-timestamp-span.js";

test("paired timing brackets actual compute passes and rejects incomplete spans",()=>{
  const descriptors=[], copies=[];
  const native={beginComputePass:value=>{descriptors.push(value);return "pass";},copyBufferToBuffer:(...args)=>copies.push(args),finish:()=>"commands"};
  const telemetry={decorateFirstPass:value=>({...value,begin:true}),decorateFinalPass:value=>({...value,end:true})};
  const encoder=createTimestampSpanEncoder(native,telemetry);
  assert.throws(()=>encoder.finish(),/incomplete/);
  assert.equal(encoder.beginComputePass({label:"real-compaction"}),"pass");
  encoder.copyBufferToBuffer(1,2,3,4,5);
  encoder.closeNextPass();assert.throws(()=>encoder.closeNextPass(),/closed/);
  encoder.beginComputePass({label:"real-output"});
  assert.deepEqual(descriptors,[{label:"real-compaction",begin:true},{label:"real-output",begin:true,end:true}]);
  assert.deepEqual(copies,[[1,2,3,4,5]]);assert.equal(encoder.finish(),"commands");
  assert.throws(()=>encoder.beginComputePass(),/closed/);
});
