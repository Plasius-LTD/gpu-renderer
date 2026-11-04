import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {roomConvergencePlan} from './fixtures/room-convergence.js';

// Controller-only adapters: synthetic images/timings never become physical
// capture evidence. Real image/count/ray validation has its own regressions.
async function controller(failure){
 const file=new URL('./fixtures/native-room-host-performance.js',import.meta.url),source=fs.readFileSync(file,'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'');
 const html=fs.readFileSync(new URL('./fixtures/native-room-reference.html',import.meta.url),'utf8');
 const nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(([,id])=>[id,{id,value:'preserved',disabled:false,textContent:'',addEventListener(){},removeEventListener(){}}]));
 const selected=['resolution','focus-view','glass-support-clearance','run','reset','host-performance'].map(k=>nodes.get(k)),calls=[],retained=[];let created=0,destroyed=0,validated=0;
 const context=vm.createContext({AbortController,AbortSignal,URLSearchParams,Float32Array,location:{search:'?hostPerformanceResolution=1080p'},navigator:{userAgent:'unit-controller',platform:'portable'},
  document:{visibilityState:'visible',getElementById:id=>nodes.get(id),querySelectorAll:()=>selected,createElement:()=>({toDataURL:()=> 'data:image/png;base64,unit-marker'})},
  fetch:async(url,options)=>{if(url==='/__provenance')return {json:async()=>({captureId:'unit-controller-only',sources:{renderer:'a'.repeat(40)}})};retained.push(JSON.parse(options.body));return {ok:true,json:async()=>({})};},
  roomConvergencePlan,roomReferenceSettings:resolution=>({resolution,width:1920,height:1080,maximumSpp:32,maxDepth:20}),
  GLASS_WATER_DEFAULTS:{},composeRoomEamesScene:()=>({scene:{},evidence:{sceneTriangleCount:10,referenceModels:[{},{}]}}),withRoomGlass:c=>c,
  createRadialSamplingPlan:()=>({budgets:new Uint8Array(2),totalSamples:3}),
  createPairedProbeRunner:async(_scene,_signal,options)=>{
   created++;if(failure==='setup'&&created===2)throw Error('original unit setup failure');
   const optimized=options.native.hostOptimizations.templateConfigPacking;assert.equal(options.native.hostOptimizations.lazyUniformBudget,optimized);
   assert.equal(options.sampler,'fixed-pattern');assert.equal(options.opticalInterfaceBudget.maximumInterfaces,2048);assert.equal(options.native.width,1920);
   return {sceneSnapshot:{triangleCount:10,displayQuality:true},adapter:{isFallbackAdapter:false},
    memory:{rendererBufferBytes:1,adaptiveBufferBytes:2,telemetryBufferBytes:3,fixtureStagingBytes:4,textureInventory:[],cachedBudgetHostBytes:1920*1080*(optimized?5:9)},
    run:async(mode,settings)=>{calls.push({mode,settings});return {mode,width:1920,height:1080,diagnostics:settings.diagnostics,visibilityBefore:'visible',visibilityAfter:'visible',validationErrors:0,completedFrameMs:optimized?15:20,image:new Float32Array([1,1,1,1])};},destroy:()=>destroyed++};
  },
  validateRoomFrame:frame=>{assert.equal(frame.diagnostics,true);validated++;},
  compareHostDiagnosticFrames:()=>{if(failure==='identity')throw Error('unit HDR mismatch');return {exactHdr:true,exactRays:true};},
  hashBytes:async()=> 'a'.repeat(64),encodeLinearImageChunks:async function*(){yield {byteOffset:0,byteLength:16,sha256:'a'.repeat(64)};},
 });
 new vm.Script(source,{filename:file.pathname}).runInContext(context);
 const report=await context.runRoomHostPerformance({loadAssets:async()=>({}),clearCapture:()=>{},roomCompositionControls:()=>({}),resetRoomControls:()=>{nodes.get('glass-support-clearance').value='0';}});
 for(const node of selected){assert.equal(node.value,'preserved');assert.equal(node.disabled,false);}assert.equal(nodes.get('cancel').disabled,true);
 return {report,calls,retained,created,destroyed,validated};
}
test('actual host controller separates warm/timing/diagnostic frames, restores controls and retains exact comparison',async()=>{
 const r=await controller();assert.equal(r.report.status,'measured-provisional-baseline-not-release-qualified');assert.equal(r.report.completeness,'partial-single-resolution');assert.equal(r.report.timings.length,6);
 assert.equal(r.validated,2);assert.equal(r.destroyed,2);assert.equal(r.report.comparisons[0].exactHdr,true);
 assert.equal(r.calls.filter(c=>c.settings.diagnostics).length,2);assert(r.calls.every(c=>c.settings.profile===c.settings.diagnostics));
 assert(r.retained.some(item=>item.path.endsWith('host-performance-report.png')));assert.equal(r.report.cleanupPassed,true);
});
test('actual host controller preserves setup/identity errors and cleans both instances without accepting results',async()=>{
 for(const failure of ['setup','identity']){
  const r=await controller(failure);assert.equal(r.report.status,'failed');assert.match(r.report.failures.join(' '),failure==='setup'?/original unit setup failure/:/unit HDR mismatch/);
  assert.equal(r.destroyed,failure==='setup'?1:2);assert.equal(r.report.cleanupPassed,false);
 }
});
