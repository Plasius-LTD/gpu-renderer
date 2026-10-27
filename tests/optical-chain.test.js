import test from 'node:test';
import assert from 'node:assert/strict';
import {OPTICAL_CHAIN_WGSL} from '../src/wavefront-optical-chain-shader.js';
import {opticalPathProbeShader} from './fixtures/optical-path-sampling-probe.js';
import {OpticalWgslExec as Exec,OpticalWgslParser as Parser} from './fixtures/optical-wgsl-executor.js';
import {functionSource} from './fixtures/rough-dielectric-numerical-harness.js';
function trace(limit,kind=2){
 const source=opticalPathProbeShader('fixed-pattern')
  .replace('@group(0) @binding(5) var<uniform> config: FrameConfig;','var<private> config: FrameConfig;')
  .replace(functionSource('medium_optics'),'fn medium_optics(id:u32)->vec2<f32>{return select(vec2<f32>(1.5,2),vec2<f32>(1,0),id==0u);}')
  .replace(functionSource('medium_valid'),'fn medium_valid(id:u32)->bool{return id==1u;}')
  .replace(functionSource('medium_transmittance'),'fn medium_transmittance(id:u32,distance:f32)->vec3<f32>{return vec3<f32>(1);}')
  .replace(functionSource('intersect_nested_ray'),`fn intersect_nested_ray(ray:RayRecord)->NestedIntersection{var hit=HitRecord();
   hit.hitType=select(3u,2u,ray.mediumRefId==0u);hit.materialKind=select(${kind}u,0u,ray.mediumRefId==0u);hit.mediumRefId=select(1u,0u,ray.mediumRefId==0u);
   hit.frontFace=0u;hit.material=vec4<f32>(0,0,1,1.5);hit.materialExtension=vec4<f32>(0,1,${kind===0?0:1},0);hit.color=vec4<f32>(1);hit.specularColor=vec4<f32>(1);
   hit.geometricNormal=vec4<f32>(select(vec3<f32>(0,-sign(ray.direction.y),0),vec3<f32>(-sign(ray.direction.x),0,0),ray.bounce<40u),0);hit.shadingNormal=hit.geometricNormal;
   return NestedIntersection(ray,hit);}`)
  .replace(/fn sample_dimension_1d\([\s\S]*?\n}/,'fn sample_dimension_1d(pixelId:u32,sampleId:u32,bounce:u32,frameIndex:u32,dimension:u32)->f32{return 0.5;}')
  +OPTICAL_CHAIN_WGSL+`
 @compute @workgroup_size(1)fn chain_test(){config.transportExperimentFlags=180224u;config.samplesPerPixel=256u;
 var ray=RayRecord();ray.mediumRefId=1u;ray.mediumStack=vec4<u32>(1u,0,0,0);ray.mediumStackDepth=1u;
 ray.direction=vec4<f32>(.5,sqrt(.75),0,0);ray.throughput=vec4<f32>(vec3<f32>(1.0/2.25),1);
 let first=intersect_nested_ray(ray);let result=resolve_optical_chain(first.ray,first.hit,${limit}u);
 accumulation[0]=vec4<f32>(result.ray.throughput.x,f32(result.ray.bounce),f32(result.additionalSegments),f32(result.termination));}`;
 const a=new Float32Array(4);new Exec(new Parser().parse(source)).dispatchWorkgroups('chain_test',1,{0:{3:a}});return [...a];
}
test('bounded optical chain retains every physical ordinal but no deferred/queue allocation',()=>{
 assert.doesNotMatch(OPTICAL_CHAIN_WGSL,/pathNodes|activeQueue|nextQueue|link_path_child|record_path_direct/);
 const a=trace(64);assert(Math.abs(a[0]-1)<.0001);assert.deepEqual(a.slice(1),[41,41,0]);
 const b=trace(20);assert.deepEqual(b.slice(1),[20,20,7]);
 const c=trace(64,0);assert.deepEqual(c.slice(1),[0,0,0]);
});
