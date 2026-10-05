import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clothResponseSettings,clothResponseMetrics} from './fixtures/cloth-response-settings.js';
import {createClothResponseShader,CLOTH_RESPONSE_BINDINGS} from './fixtures/cloth-response-shader.js';
import {createWavefrontPathTracingComputeShaderSource} from '../src/wavefront-shaders.js';
import {analyzeWgslSource,reflectGpuInterface} from '@plasius/gpu-shader/node';

test('cloth diagnostic derives configurable raking light and rejects invalid inputs',()=>{
 const value=clothResponseSettings({elevation:10,intensity:3,yaw:90,samples:32});
 assert.ok(Math.abs(value.direction[0]-Math.cos(Math.PI/18))<1e-12);
 assert.ok(Math.abs(value.direction[1]-Math.sin(Math.PI/18))<1e-12);
 assert.equal(value.samples,32);assert.equal(value.intensity,3);
 for(const options of [{elevation:0},{elevation:91},{intensity:NaN},{intensity:0},{samples:257},{samples:1.5},{yaw:Infinity}])assert.throws(()=>clothResponseSettings(options));
});
test('diagnostic reuses complete canonical shader and only parameterizes copied camera ordinal',()=>{
 const shader=createClothResponseShader();
 assert.ok(shader.startsWith(createWavefrontPathTracingComputeShaderSource({progressiveSampling:'stable-pattern'})));
 assert.ok(shader.includes('fn cloth_ray(pixelIndex: u32, sampleId: u32)'));
 assert.ok(shader.includes('controlTriangle.textureSettings.x = 0.0;'));
 assert.ok(shader.includes('valid_surface_normal(candidate.geometricNormal, material.shadingNormal, view)'));
 assert.ok(shader.includes('evaluate_surface_bsdf(hit, view, clothLight.xyz)'));
});
test('cloth metrics exclude silhouettes and compare real map signal rather than image noise',()=>{
 const width=5,height=5,images=Array.from({length:4},()=>new Float32Array(width*height*4)),mask=new Uint32Array(width*height).fill(3);
 for(let i=0;i<25;i++)for(let k=0;k<4;k++)images[k][i*4]=k%2?1:1+(i%2)*.2;
 const result=clothResponseMetrics(images,mask,width,height,[3]);
 assert.equal(result.interiorPixels,9);assert.ok(result.centerMapRmse>0);assert.equal(result.sampledMapRmse,result.centerMapRmse);
 assert.equal(result.mapDetailRetentionRatio,1);
 mask[12]=0;assert.equal(clothResponseMetrics(images,mask,width,height,[3]).interiorPixels,4);
 assert.throws(()=>clothResponseMetrics(images,mask,width,height,[9]),/interior/);
 images[0][0]=NaN;assert.throws(()=>clothResponseMetrics(images,mask,width,height,[3]),/finite/);
});
test('assembled diagnostic reflects canonical records and resource bindings',async()=>{
 const source=createClothResponseShader(),bindings=analyzeWgslSource(source,'cloth').bindings;
 const manifest=await reflectGpuInterface({interfaceId:'plasius.renderer.cloth-response',interfaceVersion:'1.0.0',modules:[{moduleId:'cloth',source}],
  pipelines:[{kind:'compute',pipelineId:'cloth',layout:{bindGroups:[{group:0,entries:bindings.filter(b=>CLOTH_RESPONSE_BINDINGS.includes(b.binding)).map(b=>({...b,visibility:['compute']}))}]},compute:{moduleId:'cloth',entryPoint:'cloth_response',constants:{}}}],
  modelFacingRecordNames:['FrameConfig','HitRecord','TriangleRecord','RayRecord'],modelFacingBindings:[],semantics:[]});
 for(const [name,bytes] of [['FrameConfig',320],['HitRecord',240],['RayRecord',96]])assert.equal(manifest.records.find(r=>r.name===name).byteSize,bytes);
 assert.equal(manifest.entryPoints.length,1);
});
