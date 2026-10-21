import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {opticalSelectionsFromSearch,validateOpticalSelections,selectedOpticalJournals} from './fixtures/optical-selection.js';

test('optical journal URL is explicit, bounded and validated before GPU work',()=>{
 const settings={width:1920,height:1080,maximumSpp:32};
 assert.deepEqual(opticalSelectionsFromSearch('',settings),[]);
 assert.deepEqual(opticalSelectionsFromSearch('?opticalJournal=0.5,0.55,3;0,0,31',settings),[{pixel:594*1920+960,sample:3},{pixel:0,sample:31}]);
 for(const query of ['?opticalJournal=','?opticalJournal=1,0,0','?opticalJournal=NaN,0,0','?opticalJournal=.5,.5,32','?opticalJournal=.5,.5,-1','?opticalJournal=.5,.5,1.5','?opticalJournal=0,0,0&opticalJournal=0,0,0','?opticalJournal=0,0,0;0,0,0',`?opticalJournal=${Array(9).fill('0,0,0').join(';')}`])assert.throws(()=>opticalSelectionsFromSearch(query,settings),/Invalid optical journal/);
 assert.throws(()=>validateOpticalSelections([{pixel:1920*1080,sample:0}],settings),/Invalid optical journal/);
});

test('selected journals use original tile samples only and restore modes on capture or error',async()=>{
 const calls=[],mode=[],result={records:[{pixel:3,sample:2,bounce:0}]};
 const c={setMode:(...v)=>mode.push(v)},tile={x:0,y:0,width:2,height:2},config={width:4,height:4,maxDepth:20},ranges=[{firstSample:0,sampleLimit:4}];
 const selections=[{pixel:3,sample:2},{pixel:1,sample:2}];
 const capture=async(_c,options)=>{calls.push(options);const identity={pixel:options.selection.pixel,sample:options.selection.sample,bounce:0};
  return {...result,records:[{...identity,stage:'after-intersection'}],surfaceNodes:[{...identity,flags:1,terminalKind:7,directRadiance:[0,0,0],terminalRadiance:[0,0,0]}]};};
 const selected=await selectedOpticalJournals(c,{config,tile,ranges,selections,diagnostics:true,fused:false},capture);
 assert.equal(selected.length,1);assert.deepEqual(calls[0].selection,selections[1]);assert.deepEqual(mode,[[true,false]]);
 await assert.rejects(selectedOpticalJournals(c,{config,tile,ranges,selections,diagnostics:true,fused:false},async()=>{throw Error('lost');}),/lost/);
 assert.deepEqual(mode.at(-1),[true,false]);
 await assert.rejects(selectedOpticalJournals(c,{config,tile,ranges,selections,diagnostics:true,fused:false},async()=>({records:[]})),/Missing selected optical sample/);
 for(const change of [r=>r.surfaceNodes=[],r=>r.surfaceNodes[0].pixel++,r=>r.surfaceNodes[0].flags=3,r=>r.surfaceNodes[0].terminalKind=0,r=>r.surfaceNodes[0].directRadiance[0]=NaN]){
  await assert.rejects(selectedOpticalJournals(c,{config,tile,ranges,selections,diagnostics:true,fused:false},async(_c,options)=>{const r=await capture(_c,options);change(r);return r;}),/Missing selected optical surface/);
 }
 const before=mode.length;assert.deepEqual(await selectedOpticalJournals(c,{config,tile,ranges,selections:[],diagnostics:true,fused:false},capture),[]);assert.equal(mode.length,before);
 const runner=readFileSync(new URL('./fixtures/native-adaptive-runner.js',import.meta.url),'utf8');
 assert.match(runner,/if\(selections.length\)/);assert.match(runner,/opticalJournals/);
});
