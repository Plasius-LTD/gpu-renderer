import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWavefrontMaterialExtensions } from '../src/wavefront-materials.js';
import { normalizeWavefrontMesh } from '../src/wavefront-scene-normalizers.js';
import { resolveTransportExperiments } from '../src/wavefront-core.js';
import { charlieSheenBrdf, integrateSheenDirectionalAlbedo, sheenProjectedArea } from '../src/wavefront-sheen.js';
import { createBrdfLutResource } from '../src/wavefront-gpu-resources.js';
import { WAVEFRONT_COMPUTE_WGSL } from '../src/wavefront-shaders.js';
test('sheen roughness survives glTF flattened, nested and repeated normalization', () => {
  for (const input of [{sheenRoughness:.8},{material:{sheenRoughness:.8}},
    {extensions:{KHR_materials_sheen:{sheenRoughnessFactor:.8}}}]) {
    assert.equal(normalizeWavefrontMaterialExtensions(input).sheenRoughness,.8);
    const mesh=normalizeWavefrontMesh({...input,positions:[0,0,0,1,0,0,0,1,0],indices:[0,1,2]});
    assert.equal(normalizeWavefrontMesh(mesh).materialExtensions.sheenRoughness,.8);
  }
});
test('sheen is independently controllable and defaults off', () => {
  assert.equal(resolveTransportExperiments({}).effective.sheen,false);
  assert.equal(resolveTransportExperiments({featureFlags:{'renderer.materials.sheen.enabled':true}}).effective.sheen,true);
});
test('Charlie response is finite, reciprocal and bounded in directional energy', () => {
  for(const r of [0,.1,.3,.8,1])for(const v of [.0001,.004,.02,.1,.5,.98]){
    const energy=integrateSheenDirectionalAlbedo(v,r,96,192);
    assert(energy>=0&&energy<=1.005,JSON.stringify({r,v,energy}));
    assert(sheenProjectedArea(v,r)>=v);
    assert(Math.abs(charlieSheenBrdf(v,.35,.45,r)-charlieSheenBrdf(.35,v,.45,r))<1e-10);
  }
  assert.equal(charlieSheenBrdf(0,.5,.4,.8),0);
});
test('cloth LUT albedo agrees with denser integration and flag-off LUT remains unchanged', () => {
  for(const r of [.3,.5,.8,1])for(const v of [.02,.2,.5,.98]){
    assert(Math.abs(integrateSheenDirectionalAlbedo(v,r)-integrateSheenDirectionalAlbedo(v,r,96,192))<.005);
  }
  const uploads=[];
  const device={queue:{writeTexture:(_t,data)=>uploads.push(data)},createTexture:()=>({createView:()=>({})}),createSampler:()=>({})};
  const constants={texture:{TEXTURE_BINDING:1,COPY_DST:2}};
  createBrdfLutResource(device,constants,8,false);
  createBrdfLutResource(device,constants,8,true);
  createBrdfLutResource(device,constants,8,true);
  assert.equal(uploads[1],uploads[2],'lookup upload reused');
  const a=new DataView(uploads[0].buffer),b=new DataView(uploads[1].buffer);
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){
    const o=y*256+x*8;
    assert.equal(a.getUint32(o),b.getUint32(o),'GGX LUT lanes unchanged');
    assert.equal(a.getUint16(o+4,true),0);
    assert(b.getUint16(o+4,true)>=0);assert(b.getUint16(o+6,true)>0);
  }
  assert.match(WAVEFRONT_COMPUTE_WGSL,/textureMetadata.y \* sheenRoughnessTexel.a/);
  assert.match(WAVEFRONT_COMPUTE_WGSL,/srgb_to_linear_vec3\(sheenColorTexel.rgb\)/);
  assert.match(WAVEFRONT_COMPUTE_WGSL,/let weights = surface_bsdf_sampling_weights\(hit\)/);
});
