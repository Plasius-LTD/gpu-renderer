import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {roomConvergencePlan,roomConvergenceSettingsFromSearch,runRoomConvergence,convergenceComparisons,assessReferenceConvergence} from './fixtures/room-convergence.js';

test('native convergence plan includes independent seeds and all reference budgets without adaptation',()=>{
 const plan=roomConvergencePlan();assert.equal(plan.length,12);
 assert.deepEqual(plan.map(l=>[l.resolution,l.spp,l.seed]),['1080p','4k'].flatMap(r=>[32,128,256].flatMap(s=>[7,19].map(seed=>[r,s,seed]))));
 for(const lane of plan){assert.equal(lane.expectedSamples,lane.width*lane.height*lane.spp);assert.equal(lane.controls['capture-seed'],String(lane.seed));assert.equal(lane.controls['sample-distribution'],'uniform');assert.equal(lane.controls['lighting-style'],'daylight');assert.equal(lane.controls['optical-interface-limit'],'2048');}
 assert.equal(roomConvergencePlan(roomConvergenceSettingsFromSearch('?convergenceResolution=1080p')).length,6);
 assert.equal(roomConvergencePlan(roomConvergenceSettingsFromSearch('?convergenceResolution=4k')).length,6);
 for(const q of ['?convergenceResolution=128','?convergenceResolution=','?convergenceResolution=4k&convergenceResolution=1080p'])assert.throws(()=>roomConvergenceSettingsFromSearch(q));
 assert.throws(()=>roomConvergencePlan({resolutions:['128x128']}));
});
test('native capture seed is configurable, validated and actually passed to the GPU runner',()=>{
 const js=fs.readFileSync(new URL('./fixtures/native-room-reference.js',import.meta.url),'utf8');
 const html=fs.readFileSync(new URL('./fixtures/native-room-reference.html',import.meta.url),'utf8');
 assert.match(html,/id="capture-seed"[^>]*max="4294967295"/);
 assert.match(js,/seed:el\('capture-seed'\)\.valueAsNumber/);
 assert.doesNotMatch(js,/runner\.run\(distribution,\{[^}]*seed:7/);
});
test('reference failure stays red, missing or nonfinite metrics cannot pass, no production claim',()=>{
 const pass={normalizedRmse:.02,relativeEnergyDrift:.001};
 assert.equal(assessReferenceConvergence([pass,pass,pass]).passed,true);
 assert.equal(assessReferenceConvergence([pass,{...pass,normalizedRmse:.030001},pass]).passed,false);
 assert.equal(assessReferenceConvergence([pass,pass,{...pass,relativeEnergyDrift:-.010001}]).passed,false);
 for(const value of [[pass,pass],[pass,pass,{...pass,normalizedRmse:NaN}],[pass,pass,{...pass,relativeEnergyDrift:undefined}]])assert.throws(()=>assessReferenceConvergence(value));
 const pairs=convergenceComparisons(roomConvergencePlan({resolutions:['1080p']}));assert.equal(pairs.length,5);
 assert.deepEqual(pairs.filter(p=>p.kind==='candidate').map(p=>[p.candidate.seed,p.reference.seed]),[[7,19],[19,7]]);
});

test('convergence automation retains failures, validates before side effects and stops on cancellation',async()=>{
 let configured=0,captured=0;
 await assert.rejects(runRoomConvergence({settings:{resolutions:['tiny']},configure:()=>configured++,capture:()=>captured++}));
 assert.equal(configured,0);assert.equal(captured,0);
 const report=await runRoomConvergence({settings:{resolutions:['1080p']},configure:()=>configured++,capture:()=>{captured++;return {status:'failed',failures:['preserved GPU failure'],provenance:{captureId:'red-control'}};}});
 assert.equal(report.status,'failed');assert.equal(captured,1);assert.equal(report.failedCaptureId,'red-control');assert.match(report.failures[0],/preserved GPU failure/);
 const controller=new AbortController();controller.abort();
 const cancelled=await runRoomConvergence({signal:controller.signal,configure:()=>assert.fail('configured after cancel'),capture:()=>assert.fail('captured after cancel')});
 assert.equal(cancelled.status,'failed');assert.match(cancelled.failures[0],/cancelled/);
});
