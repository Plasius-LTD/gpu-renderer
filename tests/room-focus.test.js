import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {roomFocusSettings} from './fixtures/room-demo-ui.js';

const defaults={room:{view:'entry',fovYDegrees:52},cloth:{distance:.85,elevation:50,target:[.5,.55,.65]},glass:{distance:.45,elevation:25}};
test('focus reuses existing room and close-up defaults without any camera form',()=>{
 for(const focus of ['entry','front','corner','cloth','glass']){
  const settings=roomFocusSettings(focus,defaults);
  assert.equal(settings.view,['cloth','glass'].includes(focus)?defaults.room.view:focus);
  assert.equal(settings.fovYDegrees,defaults.room.fovYDegrees);
  assert.equal(settings.cloth.enabled,focus==='cloth');
  assert.equal(settings.glass.closeup,focus==='glass');
  assert.equal(settings.cloth.distance,defaults.cloth.distance);
  assert.equal(settings.glass.distance,defaults.glass.distance);
  settings.cloth.target[0]=0;assert.equal(defaults.cloth.target[0],.5,'no mutation of source defaults');
 }
 const changed=roomFocusSettings('glass',{...defaults,room:{view:'corner',fovYDegrees:60},glass:{distance:.6,elevation:30}});
 assert.equal(changed.view,'corner');assert.equal(changed.fovYDegrees,60);assert.equal(changed.glass.distance,.6);
 for(const focus of ['missing','__proto__',null])assert.throws(()=>roomFocusSettings(focus,defaults),/Unknown room focus/);
});
test('only a brief Focus and navigation panel remains; numeric camera controls are removed, not hidden',()=>{
 const html=readFileSync(new URL('./fixtures/native-room-reference.html',import.meta.url),'utf8');
 const panel=html.match(/<section id="focus-panel"[\s\S]*?<\/section>/)?.[0];assert(panel);
 assert.match(panel,/<label for="focus-view">Focus<\/label>/);assert.match(panel,/How to navigate/);
 assert.equal([...panel.matchAll(/<select /g)].length,1);assert.doesNotMatch(panel,/<input /);
 assert.match(panel,/not live orbit/);
 for(const id of ['view','inspection-camera','fov','inspection-distance','inspection-elevation','inspection-target-x','inspection-target-y','inspection-target-z','camera-fine'])assert(!html.includes(`id="${id}"`),id);
 const js=readFileSync(new URL('./fixtures/native-room-reference.js',import.meta.url),'utf8');
 assert.match(js,/el\('focus-view'\).value=ROOM_DEFAULTS.view/);
 assert.match(js,/view:focusSettings\(\).view,fovYDegrees:focusSettings\(\).fovYDegrees/);
 assert.match(js,/\.\.\.focusSettings\(\).glass/);
 assert.match(js,/return focusSettings\(\).cloth/);
});
