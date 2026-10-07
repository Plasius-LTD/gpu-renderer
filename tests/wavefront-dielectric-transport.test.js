import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveTransportExperiments} from '../src/wavefront-core.js';
import {createWavefrontPathTracingComputeConfig} from '../src/wavefront-config.js';
import {WAVEFRONT_COMPUTE_WGSL} from '../src/wavefront-shaders.js';
import {createMediumTextureResource,mediumTablesEqual} from '../src/wavefront-gpu-resources.js';
import {analyzeWgslSource} from '@plasius/gpu-shader/node';
import {dielectricProbeShader,DIELECTRIC_PROBE_TOLERANCES} from './fixtures/dielectric-transport-probe.js';
import {readFileSync} from 'node:fs';

test('dielectric fixes are independent, explicit default-off remote flags',()=>{
 for(const name of ['boundedDielectricBranching','nestedMediaRefraction']){
  assert.equal(resolveTransportExperiments().effective[name],false);
  for(const options of [{[`renderer.transport.${name}.enabled`]:true},{featureFlags:{renderer:{transport:{[name]:{enabled:true}}}}}]){
   const flags=resolveTransportExperiments(options);
   assert.equal(flags.effective[name],true);
   assert.equal(flags.bitmask,name==='boundedDielectricBranching'?16384:32768);
  }
 }
});
test('medium optical metadata is validated, inherited and independently updateable',()=>{
 const mesh={positions:[0,0,0,1,0,0,0,1,0],indices:[0,1,2],ior:1.5,mediumRefId:1,medium:{id:1,priority:2}};
 const config=createWavefrontPathTracingComputeConfig({meshes:[mesh]});
 assert.equal(config.mediums[1].ior,1.5);assert.equal(config.mediums[1].priority,2);
 assert.equal(mediumTablesEqual(config.mediums,config.mediums.map(m=>({...m,ior:1.333}))),false);
 assert.equal(mediumTablesEqual(config.mediums,config.mediums.map(m=>({...m,priority:3}))),false);
 for(const medium of [{ior:0},{ior:Infinity},{priority:-1},{priority:1.5},{priority:2049}]){
  assert.throws(()=>createWavefrontPathTracingComputeConfig({mediums:[{id:1,...medium}]}),/medium/);
 }
});
test('nested optical metadata adds only an opt-in texture row, never a larger ray',()=>{
 const sizes=[],device={createTexture:d=>{sizes.push(d.size);return{createView:()=>({})};},queue:{writeTexture(){}}};
 const constants={texture:{TEXTURE_BINDING:1,COPY_DST:2}};
 const media=[{id:0,ior:1},{id:1,ior:1.5,priority:2}];
 assert.equal(createMediumTextureResource(device,constants,media).height,2);
 const nested=createMediumTextureResource(device,constants,media,true);
 assert.equal(nested.height,3);assert.equal(nested.allocatedBytes,2*3*8);
 assert.deepEqual(sizes,[{width:2,height:2},{width:2,height:3}]);
 const records=analyzeWgslSource(WAVEFRONT_COMPUTE_WGSL,'dielectric').records;
 assert.equal(records.find(r=>r.name==='RayRecord').byteSize,96);
});
test('bounded dielectric mode compensates probability and prevents secondary emission',()=>{
 assert.match(WAVEFRONT_COMPUTE_WGSL,/splitDielectric = dielectric_event\(hit\) && !totalInternalReflection && !bounded_dielectric_enabled\(\)/);
 assert.match(WAVEFRONT_COMPUTE_WGSL,/continuationThroughput \/= scatter.pdf/);
 assert.match(WAVEFRONT_COMPUTE_WGSL,/fail_path_node\(ray\)/);
});
test('physical probe executes canonical dielectric sampling with frozen error tolerances',()=>{
 const analysis=analyzeWgslSource(dielectricProbeShader(),'optics');
 assert(analysis.bindings.some(e=>e.binding===32));
 assert.equal(DIELECTRIC_PROBE_TOLERANCES.samples,16384);
 assert.match(dielectricProbeShader(),/let scatter=scatter_dielectric\(ray,hit\)/);
});
test('nested traversal protects occupancy and sample identity without consuming bounces',()=>{
 assert.match(WAVEFRONT_COMPUTE_WGSL,/if \(medium_transition_invalid\(ray, hit\)\) \{ return ray.mediumStack; \}/);
 const nested=WAVEFRONT_COMPUTE_WGSL.split('fn intersect_nested_ray')[1].split('fn emission_power')[0];
 assert.match(nested,/crossing < 32u/);assert.match(nested,/hit.hitType = 5u/);
 assert.doesNotMatch(nested,/ray\.(bounce|sampleId|sourcePixelId|parentRayId)\s*=/);
 assert.match(nested,/medium_transmittance/);
});
test('room transport controls reset off and forward independent flag receipts and GPU preflight',()=>{
 const read=f=>readFileSync(new URL('./fixtures/'+f,import.meta.url),'utf8');
 const html=read('native-room-reference.html'),js=read('native-room-reference.js');
 for(const id of ['bounded-dielectric','nested-media']){
  assert(html.includes(`label for="${id}"`));assert(js.includes(`el('${id}').value='off'`));
 }
 assert.match(js,/receipt.transportFlags=/);assert.match(js,/runDielectricTransportProbe\(cancellation.signal\)/);
 assert.match(js,/createPairedProbeRunner[\s\S]*boundedDielectricBranching,nestedMediaRefraction/);
});
