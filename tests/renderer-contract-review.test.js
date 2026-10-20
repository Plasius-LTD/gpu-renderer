import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewRendererContracts} from '../scripts/review-renderer-contracts.mjs';

test('review reproduces scale-dependent admission and partial-transmission defects on canonical WGSL',()=>{
 const report=reviewRendererContracts();
 // Characterization of rejected behavior, not renderer correctness acceptance.
 assert.deepEqual(report.defects.map(d=>[d.id,d.reproduced]),[['C1',true],['C2',true],['T1',true]]);
 const collisions=report.defects[0].cases;
 assert.equal(collisions[0].hit,true);assert.equal(collisions[1].hit,true);assert.equal(collisions[2].hit,false);
 assert(Math.abs(collisions[2].preciseDistance-.0001)<1e-10);
 assert.equal(collisions[2].preciseFirstBarycentric,.5);
 assert.equal(collisions[3].hit,false);assert.equal(collisions[3].preciseDistance,1);
 assert(report.defects[1].case.offsetOriginZ<-.0000005);
 assert(report.defects[1].case.nextHitDistance<0);
 const partial=report.defects[2].cases;
 assert.equal(partial[0].weight,partial[2].weight);
 assert(Math.abs(partial[2].weight-partial[2].expectedWeight)<1e-6);
 const {etaCancellation,totalInternalReflection,priorityTransition}=report.supported;
 assert(Math.abs(etaCancellation.product-etaCancellation.expectedProduct)<1e-6);
 assert.equal(totalInternalReflection.actual,totalInternalReflection.expected);
 assert.deepEqual([priorityTransition.hiddenCurrent,priorityTransition.afterGlassExit,priorityTransition.failure],[1,2,0]);
 assert(Math.abs(priorityTransition.eta-priorityTransition.expected[2])<1e-6);
});
