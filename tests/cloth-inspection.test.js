import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clothCloseupCamera,selectInspectionPlan,validateInspectionFrame,inspectionDisplayColor} from './fixtures/cloth-inspection-settings.js';

const scene={camera:{position:[1,2,3],target:[0,0,0],fovYDegrees:45,up:[0,1,0]}};
const evidence={floorY:0,roomBounds:{min:[-10,-10,-10],max:[10,10,10]},referenceModels:[{placement:{x:2,z:3,yaw:0},displayDimensions:[2,1,1]}]};
test('close-up preserves room camera off and derives configurable camera from placed proportions',()=>{
 assert.equal(clothCloseupCamera(scene,evidence,{enabled:false}),scene.camera);
 const camera=clothCloseupCamera(scene,evidence,{enabled:true,distance:1,elevation:30,target:[.5,.5,.5]});
 assert.deepEqual(camera.target,[2,.5,3]);assert.equal(camera.position[1],1);
 assert.ok(Math.abs(camera.position[2]-(3+Math.sqrt(.75)))<1e-12);
 const rotated=clothCloseupCamera(scene,{...evidence,referenceModels:[{...evidence.referenceModels[0],placement:{x:2,z:3,yaw:90}}]}, {enabled:true,distance:1,elevation:30,target:[1,.5,.5]});
 assert.deepEqual(rotated.target,[2,.5,2]);assert.ok(rotated.position[0]>2.8);
});
test('close-up rejects invalid/missing geometry and camera controls',()=>{
 for(const options of [{distance:NaN},{distance:.1},{elevation:90},{target:[.5,2,.5]},{target:[.5,.5]}])assert.throws(()=>clothCloseupCamera(scene,evidence,{enabled:true,...options}));
 assert.throws(()=>clothCloseupCamera(scene,{...evidence,referenceModels:[]},{enabled:true}),/seating/);
 assert.throws(()=>clothCloseupCamera(scene,{...evidence,roomBounds:{min:[0,0,0],max:[1,1,1]}},{enabled:true}),/outside/);
});
test('uniform budgets and completed-count validation reject any sampling mismatch',()=>{
 const radial={budgets:new Uint16Array([1,2,4,4]),bands:[{spp:1,pixels:1},{spp:2,pixels:1},{spp:4,pixels:2}],totalSamples:11};
 assert.equal(selectInspectionPlan('radial',radial,4),radial);
 const plan=selectInspectionPlan('uniform',radial,4);assert.deepEqual([...plan.budgets],[4,4,4,4]);assert.equal(plan.totalSamples,16);
 const settings={width:2,height:2,maximumSpp:4,sampler:'stable-pattern'};
 const frame={...settings,mode:'uniform',diagnostics:true,fused:false,validationErrors:0,actualSamples:16,actualHistogram:{4:4}};
 assert.equal(validateInspectionFrame(frame,plan,settings,'uniform'),true);
 for(const patch of [{actualSamples:15},{actualHistogram:{4:3,2:1}},{actualHistogram:{4:4,1:1}},{mode:'radial'},{validationErrors:1}])assert.throws(()=>validateInspectionFrame({...frame,...patch},plan,settings,'uniform'));
 assert.throws(()=>selectInspectionPlan('bad',radial,4));assert.throws(()=>selectInspectionPlan('uniform',radial,257));
});
test('inspection display uses sRGB colour and explicitly masks invalid normals',()=>{
 assert.deepEqual(inspectionDisplayColor('normal',[0,0,1,0],[1,1,1,.5]),[.5,.5,1,1]);
 assert.deepEqual(inspectionDisplayColor('normal',[0,0,0,0],[1,1,1,0]),[1,0,1,1]);
 const color=inspectionDisplayColor('albedo',[0,0,1,0],[.5,0,1,.5]);
 assert.ok(Math.abs(color[0]-.735356983)<1e-8);assert.equal(color[1],0);assert.ok(Math.abs(color[2]-1)<1e-15);
 assert.throws(()=>inspectionDisplayColor('lit',[],[]));
});
