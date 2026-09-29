import test from 'node:test';
import assert from 'node:assert/strict';
import { createMaterialTextureMetadata, createMaterialTextureResource, texturePaddingIndex } from '../src/wavefront-texture-transforms.js';
import { CORE_UV_TEXTURES, EXTENSION_UV_TEXTURES } from '../src/wavefront-uvs.js';
import { createWavefrontGpuMaterialSource } from '../src/wavefront-mesh-sources.js';
const names = [...CORE_UV_TEXTURES, ...EXTENSION_UV_TEXTURES];
const mesh = { positions: [0,0,0,1,0,0,0,1,0], indices: [0,1,2], uvs: [0,0,1,0,0,1] };
const texture = {width:2,height:2,data:new Uint8Array(16).fill(255),
  transform:{offset:[-3,3],scale:[7,2],rotation:Math.PI/2},wrapS:33648,wrapT:33071};
test('all slots retain independent UV transforms and native atlas resolution', () => {
  for (const [slot,name] of names.entries()) {
    const source = createWavefrontGpuMaterialSource([{...mesh,[name+'Texture']:texture}]);
    const table = source.textureMetadata, start=(1+slot*3)*4;
    assert.equal(table.data[0],1<<slot,name);
    const row=[...table.data.slice(start,start+8)];
    for (const [i,v] of [0,-2,-3,2,7,0,3,1].entries()) assert(Math.abs(row[i]-v)<1e-6,name);
    const atlas = slot<5 ? source[name+'Atlas'] : source.extensionAtlases[name];
    assert.equal(Math.round(atlas.resolveRect(texture)[2]*atlas.width),2);
    assert.equal(table.data.byteLength,table.width*table.height*16);
  }
});
test('identity metadata is neutral and invalid transforms cannot reach the GPU', () => {
  const empty=createMaterialTextureMetadata([]);
  assert.equal(empty.height,1);assert.equal(empty.data[0],0);
  for (const transform of [{scale:[NaN,1]},{offset:[0]},{rotation:Infinity}]) {
    assert.throws(()=>createWavefrontGpuMaterialSource([{...mesh,normalTexture:{...texture,transform}}]),/transform/);
  }
  assert.throws(()=>createWavefrontGpuMaterialSource([{...mesh,normalTexture:{...texture,wrapT:42}}]),/wrap/);
});
test('GPU metadata admission, upload size, ownership and disposal are explicit', () => {
  const table=createMaterialTextureMetadata([]), calls=[];
  const device={limits:{maxTextureDimension2D:128},createTexture:d=>{calls.push(d);return {createView:()=>({}),destroy:()=>calls.push('destroy')};},
    queue:{writeTexture:(...args)=>calls.push(args)}};
  const r=createMaterialTextureResource(device,{texture:{TEXTURE_BINDING:4,COPY_DST:2}},table);
  assert.equal(calls[0].format,'rgba32float');assert.equal(calls[1][2].bytesPerRow,table.width*16);
  assert.equal(r.allocatedBytes,table.data.byteLength);r.texture.destroy();assert.equal(calls.at(-1),'destroy');
  device.limits.maxTextureDimension2D=1;
  assert.throws(()=>createMaterialTextureResource(device,{texture:{}},table),/dimension/);
});
test('transformed atlas padding preserves repeat and mirrored/clamped boundaries',()=>{
  const t={transform:{scale:[7,7]}};
  assert.equal(texturePaddingIndex(-1,4,t,0),3);
  assert.equal(texturePaddingIndex(4,4,t,1),0);
  assert.equal(texturePaddingIndex(-1,4,{...t,wrapS:33648},0),0);
  assert.equal(texturePaddingIndex(4,4,{wrapT:33071},1),3);
  assert.equal(texturePaddingIndex(-1,4,null,0),0);
  assert.throws(()=>createWavefrontGpuMaterialSource([{...mesh,normalTexture:{...texture,transform:{scale:[1e100,1]}}}]),/range/);
});
test('failed upload destroys metadata texture',()=>{
  let destroyed=false;
  const d={createTexture:()=>({destroy:()=>destroyed=true}),queue:{writeTexture:()=>{throw Error('upload');}}};
  assert.throws(()=>createMaterialTextureResource(d,{texture:{}},createMaterialTextureMetadata([])),/upload/);
  assert(destroyed);
});
