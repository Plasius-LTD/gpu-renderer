// Development-only optical attribution. Reuse package geometry and transport;
// known radiance removes lighting variance, not optical interfaces.
export const OPTICAL_ISOLATION=Object.freeze({width:512,height:288,spp:256,depth:20,radiance:.75,meanTolerance:.02,rowTolerance:.05,
 region:Object.freeze({x0:.47,x1:.53,y0:.34,y1:.72}),
 camera:Object.freeze({position:Object.freeze([3.176982833805939,-.4139058066460065,.14375083974624536]),target:Object.freeze([2.85,-.6040840244293213,-.1]),up:Object.freeze([0,1,0]),fovYDegrees:52}),floorY:-1.3440840244293213});
export function opticalIsolationPlan(){return [
 {name:'furnace-filled',mode:'filled',pedestal:.75,furnace:true},
 {name:'furnace-empty',mode:'empty',pedestal:.75,furnace:true},
 {name:'furnace-index-one',mode:'filled',waterIor:1,pedestal:.75,furnace:true},
 {name:'pedestal-contrast',mode:'filled',pedestal:.35,furnace:false},
 ];}
export function opticalIsolationBudgets(){const c=OPTICAL_ISOLATION;return new Uint16Array(c.width*c.height).fill(c.spp);}
export function opticalIsolationDepth(search){
 const values=new URLSearchParams(search).getAll('opticalDepth');
 if(values.length>1||values.some(v=>!['20','32'].includes(v)))throw Error('Invalid optical diagnostic depth');
 return values.length?Number(values[0]):OPTICAL_ISOLATION.depth;
}
export function createOpticalIsolationScene(withRoomGlass,receipt,lane,{depth=OPTICAL_ISOLATION.depth}={}){
 const {scene}=receipt??{};
 if(![20,32].includes(depth)||!scene?.camera||!Number.isFinite(scene.floorY)||!scene.glassWater?.settings||!opticalIsolationPlan().some(c=>JSON.stringify(c)===JSON.stringify(lane)))throw Error('Invalid optical isolation control');
 const composed=withRoomGlass({scene:{meshes:[],camera:structuredClone(scene.camera)},evidence:{floorY:scene.floorY,roomBounds:{min:[-10,-10,-10],max:[10,10,10]},sceneTriangleCount:0}},
 {...scene.glassWater.settings,mode:lane.mode,...(lane.waterIor===undefined?{}:{waterIor:lane.waterIor})});
 composed.scene.camera=structuredClone(scene.camera); // Do not apply close-up twice.
 composed.scene.meshes[0]={...composed.scene.meshes[0],materialKind:'emissive',emission:[lane.pedestal,lane.pedestal,lane.pedestal,1]};
 composed.scene.probeDepth=depth;composed.scene.displayQuality=true;
 composed.scene.environmentLighting={horizonColor:[.75,.75,.75,1],zenithColor:[.75,.75,.75,1],sunColor:[0,0,0,1],intensity:1};
 return composed;
}
export function validateOpticalFurnace(frame,spp){
 const {width,height,image,actualSamples,validationErrors}=frame??{},c=OPTICAL_ISOLATION;
 if(!Number.isSafeInteger(width)||width<1||!Number.isSafeInteger(height)||height<1||!Number.isSafeInteger(spp)||spp<1||
  !(image instanceof Float32Array)||image.length!==width*height*4||actualSamples!==width*height*spp||validationErrors!==0)throw Error('Invalid optical furnace evidence');
 for(let i=0;i<image.length;i++)if(!Number.isFinite(image[i])||image[i]<0||(i%4===3&&image[i]!==1))throw Error('Invalid optical furnace pixel');
 const r=c.region,rows=[];let sum=0,count=0;
 for(let y=Math.floor(height*r.y0);y<Math.ceil(height*r.y1);y++){
  let row=0,n=0;
  for(let x=Math.floor(width*r.x0);x<Math.ceil(width*r.x1);x++){
   const o=(y*width+x)*4,v=.2126*image[o]+.7152*image[o+1]+.0722*image[o+2];row+=v;n++;
  }
  rows.push(row/n);sum+=row;count+=n;
 }
 const mean=sum/count,relativeError=Math.abs(mean/c.radiance-1),maxRowError=Math.max(...rows.map(v=>Math.abs(v/c.radiance-1)));
 if(relativeError>c.meanTolerance||maxRowError>c.rowTolerance)throw Error('Optical furnace mismatch '+JSON.stringify({mean,relativeError,maxRowError}));
 return {passed:true,mean,relativeError,maxRowError,region:r,rows,expected:c.radiance,meanTolerance:c.meanTolerance,rowTolerance:c.rowTolerance};
}
