import test from 'node:test';
import assert from 'node:assert/strict';
import {createWavefrontGpuMaterialSource,createWavefrontGpuMeshSource,createWavefrontMeshAcceleration} from '../src/wavefront-mesh-sources.js';
import {packWavefrontTriangles} from '../src/wavefront-packers.js';

const mesh={positions:[0,0,0,1,0,0,0,1,0],indices:[0,1,2],normals:[0,0,1,0,0,1,0,0,1]};
const texture={width:1,height:1,data:new Uint8Array([200,90,230,255])};
function scales(input){
 const material=createWavefrontGpuMaterialSource([input]);
 const triangle=createWavefrontMeshAcceleration([input],material).triangles[0];
 return [triangle.textureSettings[0],new Float32Array(packWavefrontTriangles([triangle]).buffer)[336/4],
  new Float32Array(material.buffer)[176/4],new Float32Array(createWavefrontGpuMeshSource([input],material).meshes.buffer)[224/4]];
}
test('absent normal maps preserve authored normals through every material packing path',()=>{
 for(const input of [mesh,{...mesh,normalTexture:null},{...mesh,material:{normalTexture:null}}]){
  assert.deepEqual(scales(input),[0,0,0,0]);
 }
});
test('real normal maps preserve default, authored and zero scales without recentering image bytes',()=>{
 for(const [options,expected] of [[{},1],[{scale:.75},.75],[{strength:.25},.25],[{scale:0},0],[{scale:0,strength:1},0]]){
  for(const nested of [false,true]){
   const normalTexture={...texture,...options};
   assert.deepEqual(scales({...mesh,...(nested?{material:{normalTexture}}:{normalTexture})}),Array(4).fill(expected));
  }
 }
 const source=createWavefrontGpuMaterialSource([{...mesh,normalTexture:texture}]);
 const rect=source.normalAtlas.resolveRect(texture),x=Math.round(rect[0]*source.normalAtlas.width),y=Math.round(rect[1]*source.normalAtlas.height);
 assert.deepEqual([...source.normalAtlas.data.slice((y*source.normalAtlas.width+x)*4,(y*source.normalAtlas.width+x)*4+4)],[200,90,230,255]);
});
