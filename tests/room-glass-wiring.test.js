import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import * as ui from './fixtures/room-demo-ui.js';
import {MAX_ROUGH_SPLIT_PATH_DEPTH} from '../src/wavefront-rough-bounce-splitting.js';
import {opticalSelectionsFromSearch} from './fixtures/optical-selection.js';

test('actual room page initializes, forwards and resets canonical support clearance without GPU work',async()=>{
 const filename=fileURLToPath(new URL('./fixtures/native-room-reference.js',import.meta.url));
 // Exercise the actual page glue with inert DOM/import adapters, not a browser or GPU.
 const source=readFileSync(filename,'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'');
 const html=readFileSync(new URL('./fixtures/native-room-reference.html',import.meta.url),'utf8');
 const nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(([,id])=>[id,{
  id,value:'',hidden:true,dataset:{},listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},
  get valueAsNumber(){return Number(this.value);},checkValidity(){return true;},removeAttribute(){},
 }]));
 const document={getElementById:id=>nodes.get(id)};
 nodes.get('controls').querySelectorAll=()=>[...nodes.values()].filter(n=>html.includes(`<input id="${n.id}"`)||html.includes(`<select id="${n.id}"`));
 const defaults={mode:'off',fill:.55,x:2.85,z:-.1,radius:.055,height:.18,glassIor:1.5,waterIor:1.333,supportClearance:0,distance:.45,elevation:25};
 let forwarded;
 const depthLimits={minimum:1,maximum:20,default:6};let requestedDepth;
 const context=vm.createContext({document,...ui,ROOM_CAPTURE_DEPTH_LIMITS:depthLimits,MAX_ROUGH_SPLIT_PATH_DEPTH,opticalSelectionsFromSearch,location:{search:''},
  ROOM_LIGHTING_DEFAULTS:{style:'daylight',intensity:1,minimumIntensity:0,maximumIntensity:10},
  ROOM_COAT_DEFAULTS:{weight:1,roughness:.1},GLASS_WATER_DEFAULTS:defaults,
  ROOM_DEFAULTS:{centralReference:'seating',view:'entry',fovYDegrees:52,x:1,z:2,yaw:3},
  CLOTH_INSPECTION_DEFAULTS:{distance:1,elevation:30,target:[.5,.5,.5]},CLOTH_RESPONSE_DEFAULTS:{elevation:30,intensity:1},
  RADIAL_MAXIMUM_SPP:256,RADIAL_SAMPLING_DEFAULTS:{maximumSpp:32,areaPercent:[100]},
  radialSamplingTiers:()=>[32],roomReferenceSettings:(_resolution,sampler,_spp,maxDepth)=>{requestedDepth=maxDepth;return {sampler,maxDepth,width:1920,height:1080,maximumSpp:32};},
  glassWaterSettings:s=>{forwarded=s;throw Error('intentional stop before GPU work');},
 });
 new vm.Script(source,{filename}).runInContext(context);
 assert.equal(nodes.get('glass-support-clearance').value,0);
 for(const [field,key] of [['min','minimum'],['max','maximum'],['value','default']])assert.equal(Number(nodes.get('max-depth')[field]),depthLimits[key]);
 nodes.get('scene-preset').value='glass';nodes.get('scene-preset').listeners.change();
 nodes.get('glass-support-clearance').value='0.0001';nodes.get('glass-support-clearance').listeners.input();
 assert.equal(nodes.get('scene-preset').value,'custom');
 nodes.get('max-depth').value='20';
 await nodes.get('run').listeners.click();
 assert.equal(requestedDepth,20);
 assert.equal(forwarded.supportClearance,.0001);assert.equal(forwarded.mode,'filled');assert.equal(forwarded.closeup,true);
 assert.equal(nodes.get('status').textContent,'intentional stop before GPU work');
 nodes.get('reset').listeners.click();
 assert.equal(nodes.get('glass-support-clearance').value,0);
 assert.equal(nodes.get('glass-mode').value,'off');
 assert.equal(nodes.get('nested-media').value,'off');
 assert.equal(nodes.get('focus-view').value,'entry');
 assert.equal(Number(nodes.get('max-depth').value),depthLimits.default);
 // Reach both filename-clearance branches, then deliberately fail at an inert
 // provenance adapter. No real fetch, browser, shader or device is involved.
 context.glassWaterSettings=s=>s;context.AbortController=AbortController;context.AbortSignal=AbortSignal;
 context.navigator={userAgent:'unit-test',platform:'unit-test'};
 let requests=0;
 context.fetch=async()=>{requests++;throw Error('inert provenance failure');};
 document.createElement=()=>({});
 for(const clearance of [0,.0001]){
  nodes.get('scene-preset').value='glass';nodes.get('scene-preset').listeners.change();
  nodes.get('glass-support-clearance').value=String(clearance);
  await nodes.get('run').listeners.click();
  assert.equal(nodes.get('status').textContent,'Failed: inert provenance failure');
  assert.equal(nodes.get('run').disabled,false);assert.equal(nodes.get('glass-support-clearance').disabled,false);
 }
 assert.equal(requests,2);
 for(const splitDepth of [1,2]){
  nodes.get('splitting').value=String(splitDepth);nodes.get('sampler').value='stable-pattern';nodes.get('max-depth').value='20';
  await nodes.get('run').listeners.click();
  assert.match(nodes.get('status').textContent,/splitting.*8.*disable/i);
  assert.equal(requests,2,'reject before provenance/assets/GPU');assert.equal(nodes.get('max-depth').value,'20');
  assert.equal(nodes.get('splitting').value,String(splitDepth),'must not silently disable splitting');
 }
 nodes.get('max-depth').value=String(MAX_ROUGH_SPLIT_PATH_DEPTH);
 await nodes.get('run').listeners.click();assert.equal(requests,3,'existing split-depth range still admitted');
 nodes.get('splitting').value='0';context.location.search='?opticalJournal=1,0,0';
 await nodes.get('run').listeners.click();assert.match(nodes.get('status').textContent,/Invalid optical journal/);assert.equal(requests,3);
 context.location.search='?opticalJournal=.5,.5,0';nodes.get('sample-distribution').value='radial';
 await nodes.get('run').listeners.click();assert.match(nodes.get('status').textContent,/requires uniform bounded nested/);assert.equal(requests,3);
});
