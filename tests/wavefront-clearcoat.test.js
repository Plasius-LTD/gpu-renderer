import test from 'node:test';
import assert from 'node:assert/strict';
import {WAVEFRONT_COMPUTE_WGSL} from '../src/wavefront-shaders.js';
import {resolveTransportExperiments} from '../src/wavefront-core.js';
import {createMaterialTextureMetadata} from '../src/wavefront-texture-transforms.js';
import {validateWavefrontBsdfSample,estimateWavefrontDirectionalHemisphericalReflectance} from '../src/wavefront-reference.js';
import {analyzeWgslSource} from '@plasius/gpu-shader/node';
import {createWavefrontGpuMaterialSource} from '../src/wavefront-mesh-sources.js';
import {clearcoatProbeMeshes,clearcoatProbeShader,clearcoatExpectedNormals} from './fixtures/clearcoat-probe.js';

test('layered clearcoat has an independent explicit default-off snapshot flag',()=>{
 assert.equal(resolveTransportExperiments().effective.layeredClearcoat,false);
 assert.equal(resolveTransportExperiments({'renderer.materials.layeredClearcoat.enabled':true}).effective.layeredClearcoat,true);
 assert.equal(resolveTransportExperiments({featureFlags:{renderer:{materials:{layeredClearcoat:{enabled:true}}}}}).effective.layeredClearcoat,true);
});
test('physical probe inputs retain separate clearcoat UV1, transforms and scale through real packing',()=>{
 const source=createWavefrontGpuMaterialSource(clearcoatProbeMeshes());
 const stride=source.textureMetadata.width*4,table=source.textureMetadata.data;
 assert.equal(table[3],0);assert.equal(table[stride+3],1);assert.equal(table[stride*2+2],0);assert.equal(table[stride*3+2],.5);
 assert.equal(table[stride*4],1<<7);assert.equal(table[stride*5],1<<7);
 assert.equal(clearcoatExpectedNormals().length,6);
 assert.equal(analyzeWgslSource(clearcoatProbeShader(),'probe').records.find(r=>r.name==='HitRecord').byteSize,240);
});
test('aligned coated white diffuse surfaces retain bounded hemispherical energy',()=>{
 for(const roughness of [.3,.6,1])for(const nv of [.1,.5,1]){
  const energy=estimateWavefrontDirectionalHemisphericalReflectance({color:[1,1,1],roughness,clearcoat:1,
   clearcoatRoughness:roughness,layeredClearcoat:true},[Math.sqrt(1-nv*nv),nv,0],{sampleCount:8192});
  assert(energy.every(v=>Number.isFinite(v)&&v>=0&&v<=1.005),JSON.stringify({roughness,nv,energy}));
 }
});
test('coat normal occupies existing padding, not another per-ray allocation',()=>{
 const hit=analyzeWgslSource(WAVEFRONT_COMPUTE_WGSL,'coat').records.find(r=>r.name==='HitRecord');
 assert.equal(hit.byteSize,240);
 assert.equal(hit.members.find(m=>m.name==='clearcoatNormalXY')?.offset,40);
 assert.equal(hit.members.find(m=>m.name==='clearcoatNormalZ')?.offset,56);
 assert.equal(hit.members.find(m=>m.name==='position').offset,64);
});
test('coat normal metadata retains authored scale and absence without texture growth',()=>{
 const m=createMaterialTextureMetadata([{extensionTextures:{clearcoatNormal:{scale:.4}}}]);
 assert(Math.abs(m.data[2]-.4)<1e-6);assert.equal(m.data[3],1);
 assert.equal(createMaterialTextureMetadata([{}]).data[3],0);
 for(const scale of [NaN,Infinity,-1])assert.throws(()=>createMaterialTextureMetadata([{extensionTextures:{clearcoatNormal:{scale}}}]),/normal scale/);
});
test('corrected shader isolates channels and coat normal, evaluates and samples the same lobe',()=>{
 assert.match(WAVEFRONT_COMPUTE_WGSL,/clearcoatRoughnessTexel\.g/);
 assert.match(WAVEFRONT_COMPUTE_WGSL,/build_triangle_texture_tangent_basis\(triangle, authoredNormal, 7u\)/);
 assert.match(WAVEFRONT_COMPUTE_WGSL,/base \* \(1\.0 - coatFresnel\) \+ coatTerm/);
 assert.match(WAVEFRONT_COMPUTE_WGSL,/ggx_pdf\(surface_clearcoat_normal\(hit\)/);
 assert.match(WAVEFRONT_COMPUTE_WGSL,/SCATTER_LOBE_CLEARCOAT;[\s\S]+layered_clearcoat_active\(hit\)/);
});
test('normal-incidence layering attenuates the complete base including its specular term',()=>{
 const base={color:[.6,.2,.05],roughness:.5,metallic:0,clearcoatRoughness:.5};
 const a=validateWavefrontBsdfSample({hit:base}).bsdf;
 const b=validateWavefrontBsdfSample({hit:{...base,clearcoat:1,layeredClearcoat:true}}).bsdf;
 // GGX alpha=.25, D=1/(pi*alpha^2), G=1 at normal incidence.
 const coat=.04/(4*Math.PI*.0625);
 b.forEach((v,i)=>assert(Math.abs(v-(a[i]*.96+coat))<1e-8));
 const zero=validateWavefrontBsdfSample({hit:{...base,layeredClearcoat:true}});
 assert.deepEqual(zero,validateWavefrontBsdfSample({hit:base}));
});
test('independent coat normals change BSDF and PDF, never produce invalid values',()=>{
 const hit={color:[.4,.2,.1],clearcoat:1,roughness:.5,clearcoatRoughness:.3,layeredClearcoat:true};
 const a=validateWavefrontBsdfSample({hit}),b=validateWavefrontBsdfSample({hit:{...hit,clearcoatNormal:[.6,.8,0]}});
 assert.notDeepEqual(a.bsdf,b.bsdf);assert.notEqual(a.expectedPdf,b.expectedPdf);
 for(const nv of [.001,.1,.5,1]){
  const v=validateWavefrontBsdfSample({hit,viewDirection:[Math.sqrt(1-nv*nv),nv,0]});
  assert(v.bsdf.every(n=>Number.isFinite(n)&&n>=0));assert(v.expectedPdf>0);
 }
});
