import test from 'node:test';
import assert from 'node:assert/strict';
import {roomRefinementSettings} from './fixtures/room-refinement-settings.js';
test('refinement laboratory controls are independent, configurable and bounded',()=>{
 const defaults=roomRefinementSettings('');assert.equal(defaults.maximum,32);assert.equal(defaults.moving,8);assert.deepEqual(defaults.resolutions,['1080p','4k']);
 const c=roomRefinementSettings('?refinementTotal=256&refinementMoving=16&refinementFocus=off&refinementStationary=off&refinementPerformance=off&refinementBudgetMs=0&refinementResolution=4k');
 assert.equal(c.maximum,256);assert.equal(c.budget,0);assert.equal(c.focus,false);assert.equal(c.stationary,false);assert.equal(c.performance,false);assert.deepEqual(c.resolutions,['4k']);
 for(const q of ['refinementTotal=0','refinementTotal=257','refinementMoving=33','refinementBudgetMs=-1','refinementUnits=0','refinementFocus=maybe','refinementResolution=128p','refinementTotal=1&refinementTotal=2'])assert.throws(()=>roomRefinementSettings('?'+q));
});
