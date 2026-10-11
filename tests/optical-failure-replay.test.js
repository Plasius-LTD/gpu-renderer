import test from 'node:test';
import assert from 'node:assert/strict';
import {opticalReplayShader} from './fixtures/optical-failure-replay.js';
import {analyzeWgslSource} from '@plasius/gpu-shader/node';
test('failure-only optical replay preserves canonical sampling and bounded output',()=>{
 for(const enabled of [false,true]){
  const code=opticalReplayShader({root:12983,sampler:'stable-pattern',splitting:{enabled,splitDepth:2}});
  assert.match(code,/var ray=make_ray\(12983u\)/);assert.match(code,/step<64u/);
  assert.match(code,/trace_material_after\(ray,minimumDistance\)/);
  assert.match(code,/minimumDistance=next_optical_distance\(hit.distance\);continue;/);
  assert(analyzeWgslSource(code,'optical-replay').bindings.some(x=>x.binding===3));
 }
 assert.throws(()=>opticalReplayShader({root:-1}),/Invalid replay root/);
});
