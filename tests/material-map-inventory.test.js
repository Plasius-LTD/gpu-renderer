import test from 'node:test';
import assert from 'node:assert/strict';
import {auditMaterialMaps} from './fixtures/material-map-inventory.js';
function fixture(){
 const document={materials:[{name:'cloth',normalTexture:{index:0,scale:.6,extensions:{KHR_texture_transform:{scale:[2,2]}}},occlusionTexture:{index:0,texCoord:1}}],textures:[{source:0}],images:[{}]};
 const json=new TextEncoder().encode(JSON.stringify(document)),bytes=new ArrayBuffer(json.length+20),view=new DataView(bytes);
 view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,bytes.byteLength,true);view.setUint32(12,json.length,true);view.setUint32(16,0x4e4f534a,true);new Uint8Array(bytes,20).set(json);
 const texture={width:1,height:1,data:Uint8Array.of(128,128,255,255),texCoord:0,transform:{offset:[0,0],scale:[2,2],rotation:0},scale:.6};
 const model={primitives:[{uvs:[0,0,1,0,0,1],uvs1:[0,0,1,0,0,1],material:{name:'cloth',normalTexture:texture,occlusionTexture:{...texture,texCoord:1,scale:undefined,transform:{offset:[0,0],scale:[1,1],rotation:0}}}}]};
 return {bytes,model};
}
test('source-map audit records real dimensions, UVs, transforms and decoded-byte hashes',async()=>{
 const {bytes,model}=fixture(),report=await auditMaterialMaps(bytes,model);
 assert.equal(report[0].maps.normalTexture.texCoord,0);assert.equal(report[0].maps.occlusionTexture.texCoord,1);
 assert.equal(report[0].maps.normalTexture.scale,.6);assert.match(report[0].maps.normalTexture.sha256,/^[a-f0-9]{64}$/);
 assert.deepEqual(report[0].maps.normalTexture.transform.scale,[2,2]);assert.equal(report[0].maps.normalTexture.width,1);
});
test('source-map audit fails closed on dropped maps, missing UV1 and modified transform',async()=>{
 for(const mutate of [m=>{m.material.occlusionTexture=null;},m=>{m.uvs1=null;},m=>{m.material.normalTexture.transform.scale=[1,1];}]){
  const {bytes,model}=fixture();mutate(model.primitives[0]);await assert.rejects(()=>auditMaterialMaps(bytes,model));
 }
 await assert.rejects(()=>auditMaterialMaps(new ArrayBuffer(20),{primitives:[]}));
});
