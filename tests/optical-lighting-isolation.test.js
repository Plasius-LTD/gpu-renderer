import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpticalIsolationScene, opticalIsolationPlan, opticalIsolationBudgets, validateOpticalFurnace,OPTICAL_ISOLATION} from './fixtures/optical-lighting-isolation.js';
import {createAdaptiveTilePlan} from '../src/wavefront-adaptive-tile-plan.js';
import {roomLightingRequest} from './fixtures/room-lighting-settings.js';

test('diagnostic budgets admit the canonical tile-plan contract and retain 256, not uint8 zero',()=>{
 const budgets=opticalIsolationBudgets();assert(budgets instanceof Uint16Array);assert.equal(budgets[0],256);
 const plan=createAdaptiveTilePlan({enabled:true,...OPTICAL_ISOLATION,budgets});
 assert.equal(plan.reduce((n,t)=>n+t.expectedPrimaryRays,0),OPTICAL_ISOLATION.width*OPTICAL_ISOLATION.height*256);
});

test('optical isolation uses supplied package geometry without a second transport',()=>{
 const receipt={scene:{floorY:-1.3,camera:{position:[3,-.4,.15],target:[2.85,-.6,-.1],fovYDegrees:52},glassWater:{settings:{mode:'filled',waterIor:1.333,closeup:true}}}};
 const calls=[],mesh={id:1,positions:[0,0,0],indices:[],normalScale:0};
 const compose=(input,settings)=>{calls.push({input,settings});return {scene:{...input.scene,meshes:[{...mesh,materialKind:'diffuse'}, {...mesh,id:2,materialKind:'dielectric'}, {...mesh,id:3,materialKind:'dielectric'}]},evidence:{...input.evidence,glassWater:{settings}}};};
 for(const lane of opticalIsolationPlan()){
  const c=createOpticalIsolationScene(compose,receipt,lane);
  assert.deepEqual(c.scene.camera,receipt.scene.camera);assert.equal(c.scene.probeDepth,20);
  assert.equal(c.scene.meshes[0].materialKind,'emissive');
  assert.equal(c.scene.meshes[0].emission[0],lane.pedestal);
  assert.equal(c.scene.meshes[1].materialKind,'dielectric');
  assert.deepEqual(c.scene.environmentLighting.sunColor,[0,0,0,1]);
  assert.equal(c.scene.environmentLighting.horizonColor[0],.75);
  assert.equal(c.scene.environmentLighting.zenithColor[0],.75);
 }
 assert.equal(calls.length,4);assert.equal(calls[2].settings.waterIor,1);
 assert.equal(receipt.scene.glassWater.settings.waterIor,1.333);
 assert.throws(()=>createOpticalIsolationScene(compose,{},opticalIsolationPlan()[0]));
});

test('furnace acceptance rejects biased bands, missing samples and nonfinite evidence',()=>{
 const width=64,height=36,image=new Float32Array(width*height*4);
 for(let i=0;i<image.length;i+=4)image.set([.75,.75,.75,1],i);
 const f={image,width,height,actualSamples:width*height*256,validationErrors:0};
 assert.equal(validateOpticalFurnace(f,256).passed,true);
 for(const value of [NaN,-1]){const bad=image.slice();bad[0]=value;assert.throws(()=>validateOpticalFurnace({...f,image:bad},256));}
 assert.throws(()=>validateOpticalFurnace({...f,actualSamples:f.actualSamples-1},256));
 const band=image.slice();for(let y=18;y<23;y++)for(let x=29;x<35;x++)band[(y*width+x)*4]=.1;
 assert.throws(()=>validateOpticalFurnace({...f,image:band},256),/furnace/);
});

test('room source isolation zeros only the selected source and retains daylight camera direction',()=>{
 const original=roomLightingRequest(),sky=roomLightingRequest({style:'sky-only'}),sun=roomLightingRequest({style:'sun-only'});
 assert.deepEqual(sky.options.sunColor,[0,0,0,1]);
 assert.deepEqual(sun.options.horizonColor,[0,0,0,1]);assert.deepEqual(sun.options.zenithColor,[0,0,0,1]);
 assert.deepEqual(sun.options.ambientColor,[0,0,0,1]);assert.deepEqual(sun.options.sunColor,original.options.sunColor);
 assert.deepEqual(sky.options.sunDirection,original.options.sunDirection);
 assert.deepEqual(sun.options.sunDirection,original.options.sunDirection);
});
