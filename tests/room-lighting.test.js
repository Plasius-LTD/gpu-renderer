import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ROOM_LIGHTING_DEFAULTS,roomLightingRequest,withRoomLighting} from './fixtures/room-lighting-settings.js';
test('original room daylight request remains exact and intensity is adjustable',()=>{
 assert.deepEqual(roomLightingRequest(),{style:'daylight',label:'Original daylight',options:{preset:'neutral-studio',sunDirection:[.18,.93,.24],sunColor:[2.4,2.25,2,1],intensity:1}});
 assert.equal(ROOM_LIGHTING_DEFAULTS.style,'daylight');
 for(const intensity of [.05,1,4])assert.equal(roomLightingRequest({intensity}).options.intensity,intensity);
});
test('cool evening changes colour without moving the light or changing materials',()=>{
 const warm=roomLightingRequest(),cool=roomLightingRequest({style:'cool-evening'});
 assert.deepEqual(cool.options.sunDirection,warm.options.sunDirection);
 for(const key of ['sunColor','horizonColor','zenithColor'])assert(cool.options[key][2]>cool.options[key][0],key);
 assert.equal(cool.options.preset,warm.options.preset);assert.equal(cool.options.intensity,warm.options.intensity);
 const changed=roomLightingRequest({style:'cool-evening'});changed.options.sunColor[0]=99;
 assert.notEqual(roomLightingRequest({style:'cool-evening'}).options.sunColor[0],99);
});
test('invalid lighting fails closed',()=>{
 for(const style of ['invalid','__proto__','toString',null,0])assert.throws(()=>roomLightingRequest({style}),/lighting style/);
 for(const intensity of [0,-1,4.01,Infinity,NaN,'1',null])assert.throws(()=>roomLightingRequest({intensity}),/intensity/);
});
test('cached assets get a fresh lighting factory snapshot and receipt every run',()=>{
 const calls=[],source={room:{identity:1},createWavefrontEnvironmentLightingOptions:options=>{calls.push(options);return {environmentLighting:{...options},lightingEnvironment:{...options}};}};
 const a={},b={},c={};
 const daylight=withRoomLighting(source,a,{}),cool=withRoomLighting(source,b,{style:'cool-evening',intensity:.8}),again=withRoomLighting(source,c,{});
 assert.equal(calls.length,3);assert.equal(cool.room,source.room);assert.equal(daylight.room,again.room);
 assert.equal(source.lightingOptions,undefined);assert.equal(b.lighting.style,'cool-evening');assert.equal(b.lighting.request.intensity,.8);
 assert.deepEqual(b.lighting.resolved,cool.lightingOptions.lightingEnvironment);
 assert.deepEqual(a,c);assert.deepEqual(daylight.lightingOptions,again.lightingOptions);
});
test('room controls include reset, cached lighting refresh and capture identity',()=>{
 const text=name=>readFileSync(new URL('./fixtures/'+name,import.meta.url),'utf8');
 const html=text('native-room-reference.html'),js=text('native-room-reference.js');
 for(const id of ['lighting-style','lighting-intensity'])assert(html.includes(`<label for="${id}">`));
 assert.match(js,/resetLighting\(\)/);assert.match(js,/withRoomLighting\(assets,receipt,lightingSelection\(\)\)/);
 assert.doesNotMatch(js,/return assets;/);assert.match(js,/lightingIdentity/);
 assert.match(html,/colour study/);assert.match(html,/white-light diagnostic/);
});
