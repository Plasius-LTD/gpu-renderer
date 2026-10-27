import test from 'node:test';
import assert from 'node:assert/strict';
import {opticalBudgetFromSearch} from './fixtures/optical-budget-settings.js';
import {OPTICAL_TAIL_PROBE as P,summarizeOpticalTail} from './fixtures/optical-tail-budget-probe.js';
import {opticalPathProbeShader} from './fixtures/optical-path-sampling-probe.js';
import {OpticalWgslExec as Exec,OpticalWgslParser as Parser} from './fixtures/optical-wgsl-executor.js';
import {functionSource} from './fixtures/rough-dielectric-numerical-harness.js';
import {validateOpticalBudgetEvidence} from './fixtures/optical-budget-evidence.js';
test('optical query allowance is explicit, bounded and rejects ambiguous evidence settings',()=>{
 assert.deepEqual(opticalBudgetFromSearch(''),{enabled:false,maximumInterfaces:64});
 assert.deepEqual(opticalBudgetFromSearch('?opticalInterfaces=64'),{enabled:true,maximumInterfaces:64});
 for(const v of ['0','65','1.5','-1','','01','NaN','64&opticalInterfaces=32'])assert.throws(()=>opticalBudgetFromSearch('?opticalInterfaces='+v),/Invalid/);
});
test('optical tail evidence rejects missing, non-finite, truncated, ordinary-budget or non-unit escapes',()=>{
 const a=new Float32Array(P.samples*4);for(let i=0;i<P.samples;i++)a.set([1,41,0,1],i*4);
 assert.equal(summarizeOpticalTail(a).passed,true);assert.throws(()=>summarizeOpticalTail([]),/length/);
 for(const [field,value] of [[0,NaN],[0,.5],[1,20],[1,65],[2,1],[3,2]]){const b=a.slice();b[field]=value;assert.throws(()=>summarizeOpticalTail(b),/mismatch/);}
});
test('canonical optical tail survives forty TIR events only with the separate allowance',()=>{
 for(const enabled of [false,true]){
  let source=opticalPathProbeShader('fixed-pattern')
   // This scalar numerical oracle uses one invocation. Physical preflight
   // executes the original 16,384-path module unchanged.
   .replace('@workgroup_size(64)fn optical_tail_budget_probe','@workgroup_size(1)fn optical_tail_budget_probe')
   .replace('@group(0) @binding(5) var<uniform> config: FrameConfig;','var<private> config: FrameConfig;')
   .replace(functionSource('medium_optics'),'fn medium_optics(id:u32)->vec2<f32>{return select(vec2<f32>(1.5,2),vec2<f32>(1,0),id==0u);}')
   .replace(functionSource('medium_valid'),'fn medium_valid(id:u32)->bool{return id==1u;}')
   .replace(/fn sample_dimension_1d\([\s\S]*?\n}/,'fn sample_dimension_1d(pixelId:u32,sampleId:u32,bounce:u32,frameIndex:u32,dimension:u32)->f32{return 0.5;}')
   .replace('var ray=RayRecord();ray.sourcePixelId=id.x/256u;',`config.maxDepth=${enabled?84:20}u;config.transportExperimentFlags=${enabled?180224:49152}u;config.cameraUp.w=20;config.cameraRight.w=64;var ray=RayRecord();ray.sourcePixelId=id.x/256u;`);
  const out=new Float32Array(4);new Exec(new Parser().parse(source)).dispatchWorkgroups('optical_tail_budget_probe',1,{0:{3:out}});
  assert.equal(out[3],enabled?1:2,`enabled=${enabled} output=${[...out]}`);assert.equal(out[1],enabled?41:19);assert.equal(out[2],0);assert(Math.abs(out[0]-(enabled?1:0))<.0001);
 }
});
test('retained allowance requires physical telemetry and measured canonical tail proof',()=>{
 const evidence={settings:{depth:20,opticalInterfaceBudget:{enabled:true,maximumInterfaces:64}},
  frame:{maximumPathEvents:84,opticalInterfaceBudget:{enabled:true,maximumInterfaces:64,maximumPathEvents:84,additionalPathBytes:67108864,maximumAdditionalBytes:134217728},
   tiles:[{sampleRounds:32,expectedPrimaryRays:524288,telemetry:{rayCounts:{status:'available',expectedRayCounts:2688,capturedRayCounts:2688,observedPrimaryRays:524288,bounceHistogram:Array(84).fill(0)}}}]},
  probe:{opticalInterfaceBudgetProbe:{passed:true,settings:P,mean:1,escapedWeightError:0,minimumEvents:41,maximumEvents:45,ordinaryEvents:0}}};
 assert.equal(validateOpticalBudgetEvidence(evidence).capacity,84);
 for(const mutate of [e=>delete e.probe,e=>e.frame.maximumPathEvents=20,e=>e.settings.depth=33,e=>e.frame.opticalInterfaceBudget.additionalPathBytes=1,e=>e.probe.opticalInterfaceBudgetProbe.mean=.5,e=>e.probe.opticalInterfaceBudgetProbe.maximumEvents=65,e=>e.frame.tiles=[],e=>e.frame.tiles[0].telemetry.rayCounts.capturedRayCounts=640,e=>e.frame.tiles[0].telemetry.rayCounts.bounceHistogram=[]]){
  const e=structuredClone(evidence);mutate(e);assert.throws(()=>validateOpticalBudgetEvidence(e),/evidence failure/);
 }
 assert.deepEqual(validateOpticalBudgetEvidence({frame:{}}),{enabled:false});
 assert.throws(()=>validateOpticalBudgetEvidence({frame:evidence.frame}),/Unexpected/);
});
