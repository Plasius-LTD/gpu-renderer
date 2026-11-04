import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeWavefrontMesh} from '../src/wavefront-scene-normalizers.js';
import {createWavefrontGpuMeshSource,createWavefrontMeshAcceleration} from '../src/wavefront-mesh-sources.js';
import {packWavefrontTriangles} from '../src/wavefront-packers.js';
import {CORE_UV_TEXTURES,EXTENSION_UV_TEXTURES} from '../src/wavefront-uvs.js';
import {WAVEFRONT_COMPUTE_WGSL} from '../src/wavefront-shaders.js';
import {reflectGpuInterface} from '@plasius/gpu-shader/node';
const mesh={positions:[0,0,0,1,0,0,0,1,0],indices:[0,1,2],uvs:[0,0,1,0,0,1],uvs1:[0.25,0.5,0.75,0.5,0.25,0.75],occlusionTexture:{texCoord:1,width:1,height:1,data:new Uint8Array([255,255,255,255])}};
test('every existing core/extension slot has a distinct selector and assembled sampling use',()=>{
 const names=[...CORE_UV_TEXTURES,...EXTENSION_UV_TEXTURES];assert.equal(names.length,17);
 for(const [slot,name] of names.entries()){
  const m={...mesh,occlusionTexture:null,[name+'Texture']:mesh.occlusionTexture};
  assert.equal(normalizeWavefrontMesh(m).textureUvMask,1<<slot,name);
  assert.equal(normalizeWavefrontMesh(normalizeWavefrontMesh(m)).textureUvMask,1<<slot,name+' renormalization');
  assert(WAVEFRONT_COMPUTE_WGSL.includes(`material_uv(uv, secondaryUv, uvMask, ${slot}u)`),name);
 }
 assert.match(WAVEFRONT_COMPUTE_WGSL,/candidate\.uv,\s*candidate\.barycentric/);
 assert.match(WAVEFRONT_COMPUTE_WGSL,/preparedTriangle\.v0 = vec4<f32>\(vertex0.position.xyz, vertex0.uv.z\)/);
 assert.match(WAVEFRONT_COMPUTE_WGSL,/preparedTriangle\.n0 = vec4<f32>\(n0, vertex0.uv.w\)/);
});
test('UV1 and per-slot selector survive normalization and both geometry packing paths',()=>{
 const normalized=normalizeWavefrontMesh(mesh);assert.deepEqual(normalized.uvs1,mesh.uvs1);assert.equal(normalized.textureUvMask,8);
 const scene=createWavefrontMeshAcceleration([mesh]),packed=packWavefrontTriangles(scene.triangles),f=new Float32Array(packed.buffer);
 for(let i=0;i<3;i++){assert.equal(f[(32+i*16)/4+3],mesh.uvs1[i*2]);assert.equal(f[(80+i*16)/4+3],mesh.uvs1[i*2+1]);}
 assert.equal(f[336/4+3],8);
 const gpu=createWavefrontGpuMeshSource([mesh]),v=new Float32Array(gpu.vertices.buffer);
 for(let i=0;i<3;i++)assert.deepEqual([...v.slice(i*12+10,i*12+12)],mesh.uvs1.slice(i*2,i*2+2));
 assert.equal(new Float32Array(gpu.meshes.buffer)[224/4+3],8);
});
test('UV0-only inputs remain accepted; invalid UV1 selectors and buffers reject',()=>{
 assert.equal(normalizeWavefrontMesh({...mesh,uvs1:null,occlusionTexture:null}).textureUvMask,0);
 for(const change of [{uvs1:null},{uvs1:[0,0]},{uvs1:[NaN,0,0,0,0,0]},{occlusionTexture:{texCoord:2}},{occlusionTexture:{texCoord:-1}}])assert.throws(()=>normalizeWavefrontMesh({...mesh,...change}),/UV|texCoord/);
});
test('assembled dual-UV records retain reflected GPU allocation sizes and lane offsets',async()=>{
 const result=await reflectGpuInterface({interfaceId:'plasius.renderer.dual-uv',interfaceVersion:'1.0.0',modules:[{moduleId:'canonical',source:WAVEFRONT_COMPUTE_WGSL+'\n@compute @workgroup_size(1) fn uvLayoutProbe() {}'}],pipelines:[{kind:'compute',pipelineId:'uv-layout',layout:{bindGroups:[]},compute:{moduleId:'canonical',entryPoint:'uvLayoutProbe',constants:{}}}],modelFacingRecordNames:['TriangleRecord','MeshVertex','HitRecord'],modelFacingBindings:[],semantics:[]});
 const record=name=>result.records.find(r=>r.name===name);
 assert.equal(record('TriangleRecord').byteSize,576);assert.equal(record('MeshVertex').byteSize,48);assert.equal(record('HitRecord').byteSize,240);
 for(const [name,offset] of [['v0',32],['n0',80],['textureSettings',336]])assert.equal(record('TriangleRecord').members.find(m=>m.name===name).offset,offset);
});
