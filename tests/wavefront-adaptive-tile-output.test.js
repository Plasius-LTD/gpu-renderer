import test from "node:test";
import assert from "node:assert/strict";
import { reflectGpuInterface } from "@plasius/gpu-shader/node";
import { ADAPTIVE_TILE_OUTPUT_WGSL, createAdaptiveTileOutputPipelines } from "../src/wavefront-adaptive-tile-output.js";

test("assembled native output reflects canonical config and full-screen gather bindings",async()=>{
  const buffer=(binding,addressSpace,access,minimumBindingSize,recordName=null)=>({group:0,binding,visibility:["compute"],resource:{kind:"buffer",addressSpace,access,minimumBindingSize,recordName}});
  const texture=(binding,format)=>({group:0,binding,visibility:["compute"],resource:{kind:"storage-texture",access:"write-only",format,viewDimension:"2d"}});
  const config=buffer(3,"uniform","read",320,"FrameConfig");
  const manifest=await reflectGpuInterface({interfaceId:"plasius.renderer.adaptive-tile-output",interfaceVersion:"1.0.0",
    modules:[{moduleId:"output",source:ADAPTIVE_TILE_OUTPUT_WGSL}],
    pipelines:[["write_tile_output",[buffer(0,"storage","read",16),texture(1,"rgba16float"),texture(2,"rgba8unorm"),config]],
      ["gather_tile_counts",[config,buffer(4,"storage","read",4),buffer(5,"storage","read_write",4)]]].map(([entryPoint,entries])=>({kind:"compute",pipelineId:entryPoint,layout:{bindGroups:[{group:0,entries}]},compute:{moduleId:"output",entryPoint,constants:{}}})),
    modelFacingRecordNames:["FrameConfig"],modelFacingBindings:[],semantics:[]});
  assert.equal(manifest.records.find(r=>r.name==="FrameConfig").byteSize,320);
  assert.equal(manifest.entryPoints.length,2);
  assert.match(ADAPTIVE_TILE_OUTPUT_WGSL,/config.tileX \+ id.x % config.tileWidth/);
  assert.match(ADAPTIVE_TILE_OUTPUT_WGSL,/pixel.y \* config.canvasWidth \+ pixel.x/);
});

test("native output is opt-in, uses explicit dynamic config layouts and propagates compile failures",async()=>{
  assert.equal(await createAdaptiveTileOutputPipelines(null,null),null);
  const layouts=[],pipelines=[];
  const device={createShaderModule:()=>({getCompilationInfo:async()=>({messages:[]})}),createBindGroupLayout:d=>(layouts.push(d),d),
    createPipelineLayout:d=>d,createComputePipelineAsync:async d=>(pipelines.push(d),d)};
  const result=await createAdaptiveTileOutputPipelines(device,{COMPUTE:4},{enabled:true});
  assert.equal(pipelines.length,2);assert.ok(result.output&&result.gather);
  assert.deepEqual(layouts.map(d=>d.entries.map(e=>e.binding)),[[0,1,2,3],[3,4,5]]);
  assert.ok(layouts.every(d=>d.entries.find(e=>e.binding===3).buffer.hasDynamicOffset));
  await assert.rejects(createAdaptiveTileOutputPipelines({...device,createComputePipelineAsync(){throw new Error("compile failed");}},{COMPUTE:4},{enabled:true}),/compile failed/);
});
