import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {fixedPatternWords,FIXED_PATTERN_WGSL} from '../src/wavefront-fixed-pattern.js';
import {progressiveSampleWords} from '../src/wavefront-progressive-sampling.js';
import {listWavefrontSampleDimensions,WAVEFRONT_SAMPLE_SEQUENCE_WGSL} from '../src/wavefront-sampling-dimensions.js';

function probeAdapter({compilation,pipeline,fireTimeout=false}){
 const controller=new AbortController(),timers=[],cleared=[];
 let destroyed=0,pipelineCalls=0,code;
 const device={pushErrorScope:()=>{},destroy:()=>destroyed++,
  createShaderModule:descriptor=>{code=descriptor.code;return {getCompilationInfo:()=>compilation(controller)};},
  createComputePipelineAsync:()=>{pipelineCalls++;return pipeline(controller);},
 };
 const filename=fileURLToPath(new URL('./fixtures/reference-transport-sampling.js',import.meta.url));
 const source=readFileSync(filename,'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'');
 const context=vm.createContext({Error,fixedPatternWords,FIXED_PATTERN_WGSL,progressiveSampleWords,listWavefrontSampleDimensions,WAVEFRONT_SAMPLE_SEQUENCE_WGSL,
  navigator:{gpu:{requestAdapter:async()=>({info:{isFallbackAdapter:false},requestDevice:async()=>device})}},
  setTimeout:(callback,delay)=>{const timer={delay};timers.push(timer);if(fireTimeout)queueMicrotask(()=>{controller.abort();callback();});return timer;},
  clearTimeout:timer=>cleared.push(timer),
 });
 new vm.Script(source,{filename}).runInContext(context);
 return {run:()=>context.probeReferenceTransportSampling(controller.signal),timers,cleared,
  state:()=>({destroyed,pipelineCalls,code})};
}
function assertClean(adapter,waits){
 assert.equal(adapter.state().destroyed,1);assert.equal(adapter.timers.length,waits);
 assert(adapter.timers.every(timer=>timer.delay===30000));assert.deepEqual(adapter.cleared,adapter.timers);
 assert.equal(createHash('sha256').update(adapter.state().code).digest('hex'),'1629068773b22866d8a6cf60cb4b0b215c91e7ae5865fa65789335e4cb7168c8');
}
test('GPU failure remains the original error when cancellation arrives concurrently',async()=>{
 const original=Error('original GPU compilation failure');
 const adapter=probeAdapter({compilation:controller=>{controller.abort();return Promise.reject(original);}});
 await assert.rejects(adapter.run(),error=>error===original);
 assert.equal(adapter.state().pipelineCalls,0);assertClean(adapter,1);
});
test('timeout remains the root error when cancellation arrives concurrently',async()=>{
 const adapter=probeAdapter({compilation:()=>new Promise(()=>{}),fireTimeout:true});
 await assert.rejects(adapter.run(),/Reference sampling probe timeout/);
 assert.equal(adapter.state().pipelineCalls,0);assertClean(adapter,1);
});
test('cancellation after a successful operation stops before the next GPU stage',async()=>{
 const adapter=probeAdapter({compilation:async controller=>{controller.abort();return {messages:[]};}});
 await assert.rejects(adapter.run(),/Reference sampling probe cancelled/);
 assert.equal(adapter.state().pipelineCalls,0);assertClean(adapter,1);
});
test('successful operation advances and later failure still disposes every timer and device',async()=>{
 const original=Error('later pipeline failure');
 const adapter=probeAdapter({compilation:async()=>({messages:[]}),pipeline:async()=>{throw original;}});
 await assert.rejects(adapter.run(),error=>error===original);
 assert.equal(adapter.state().pipelineCalls,1);assertClean(adapter,2);
});
