import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fixedPatternWords,FIXED_PATTERN_WGSL} from '../src/wavefront-fixed-pattern.js';
import {createWavefrontPathTracingComputeShaderSource} from '../src/wavefront-shaders.js';
import {referenceTransportWords,withReferenceTransportSampling} from './fixtures/reference-transport-sampling.js';

test('stable production ignores frame index; explicit reference experiment decorrelates transport only',()=>{
 const source=createWavefrontPathTracingComputeShaderSource({progressiveSampling:'fixed-pattern'});
 assert.equal(withReferenceTransportSampling(source,false),source);
 const specialized=withReferenceTransportSampling(source,true);
 assert.equal(specialized.replace('mix_seed(pixelId,sampleId,bounce,config.frameIndex,dimension)','mix_seed(pixelId,sampleId,bounce,0u,dimension)'),source);
 assert.throws(()=>withReferenceTransportSampling('unexpected source',true));
 for(const pixel of [0,1,0xfedcba98])for(const sample of [0,31,255])for(const bounce of [0,19,235]){
  assert.deepEqual(referenceTransportWords(pixel,sample,bounce,1,7),referenceTransportWords(pixel,sample,bounce,1,19));
  for(const dimension of [2,3,7,31]){
   assert.deepEqual(referenceTransportWords(pixel,sample,bounce,dimension,0),fixedPatternWords(sample,bounce,dimension,pixel));
   assert.notDeepEqual(referenceTransportWords(pixel,sample,bounce,dimension,7),referenceTransportWords(pixel,sample,bounce,dimension,19));
  }
 }
 assert.equal(createHash('sha256').update(createWavefrontPathTracingComputeShaderSource()).digest('hex'),'1679475a3e08f26ea681c7bb0ea056c640a315936b91e9dbb8e23c86de23b733');
 assert.equal(FIXED_PATTERN_WGSL.includes('config.frameIndex'),false);
});
