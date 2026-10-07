import test from 'node:test';
import assert from 'node:assert/strict';
import {ROOM_COAT_DEFAULTS,roomCoatSettings,withRoomWoodCoat} from './fixtures/room-clearcoat-settings.js';

function source(){
 const wood={name:'Eames_Lounge_Chair_Ottoman_Wood_',clearcoat:0,clearcoatRoughness:0,normalTexture:{data:[1]},color:[.5,.2,.1]};
 return {eames:{scene:{meshes:Array.from({length:13},(_,i)=>({material:i===5||i===9?wood:{name:'other'},clearcoat:0,positions:[i]}))}},
  referenceModels:[{asset:{sha256:ROOM_COAT_DEFAULTS.seatingSha256},model:{primitives:[{material:{name:'cloth'}},{material:{name:'wood Brown',clearcoat:0,baseColorTexture:{data:[2]}}}]}}]};
}
test('wood varnish is explicit, defaults off, accepts finite adjustable values only',()=>{
 assert.equal(roomCoatSettings().enabled,false);
 for(const value of [-.1,1.1,NaN,Infinity,'0.5'])for(const key of ['weight','roughness'])assert.throws(()=>roomCoatSettings({[key]:value}));
 assert.throws(()=>roomCoatSettings({enabled:'on'}));
 assert.equal(roomCoatSettings({enabled:true,weight:.7,roughness:.4}).roughness,.4);
});
test('wood variant changes only explicit identities and preserves original assets and maps',()=>{
 const original=source(),snapshot=structuredClone(original),receipt={};
 assert.equal(withRoomWoodCoat(original,receipt,{}),original);
 const changed=withRoomWoodCoat(original,receipt,{enabled:true,weight:.8,roughness:.3});
 assert.deepEqual(original,snapshot);assert.equal(receipt.woodCoat.overrides.length,3);
 const a=changed.eames.scene.meshes,b=original.eames.scene.meshes;
 assert.equal(a[5].clearcoat,.8);assert.equal(a[9].clearcoatRoughness,.3);
 assert.equal(a[5].material.normalTexture,b[5].material.normalTexture);assert.equal(a[5].positions,b[5].positions);
 assert.equal(a[0],b[0]);assert.equal(changed.referenceModels[0].model.primitives[0],original.referenceModels[0].model.primitives[0]);
 assert.equal(changed.referenceModels[0].model.primitives[1].material.clearcoat,.8);
 assert.equal(withRoomWoodCoat(original,{},{}),original);
});
test('variant fails closed on asset/material identity changes and does not require optional sofa',()=>{
 const s=source();s.referenceModels[0].asset.sha256='unknown';assert.throws(()=>withRoomWoodCoat(s,{}, {enabled:true}),/identity/);
 const a=source();a.eames.scene.meshes[5].material={name:'unexpected'};assert.throws(()=>withRoomWoodCoat(a,{}, {enabled:true}),/identity/);
 const b=source();b.referenceModels=[];assert.equal(withRoomWoodCoat(b,{}, {enabled:true}).eames.scene.meshes[5].clearcoat,1);
});
