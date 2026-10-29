export const CLOTH_INSPECTION_DEFAULTS=Object.freeze({distance:.85,elevation:50,target:Object.freeze([.5,.55,.65])});
const check=(value,message)=>{if(!value)throw new Error('Cloth inspection: '+message);};
export function clothCloseupCamera(scene,evidence,{enabled=false,distance=CLOTH_INSPECTION_DEFAULTS.distance,elevation=CLOTH_INSPECTION_DEFAULTS.elevation,target=CLOTH_INSPECTION_DEFAULTS.target}={}){
 if(!enabled)return scene.camera;
 check(Number.isFinite(distance)&&distance>=.3&&distance<=3,'distance must be 0.3–3 m');
 check(Number.isFinite(elevation)&&elevation>=5&&elevation<=85,'elevation must be 5–85 degrees');
 check(Array.isArray(target)&&target.length===3&&target.every(v=>Number.isFinite(v)&&v>=0&&v<=1),'target must contain three normalized coordinates');
 const seating=evidence.referenceModels?.[0];check(seating,'seating model is required');
 const dimensions=seating.displayDimensions,p=seating.placement;
 check(dimensions?.length===3&&dimensions.every(v=>Number.isFinite(v)&&v>0)&&[p?.x,p?.z,p?.yaw,evidence.floorY].every(Number.isFinite),'invalid seating geometry');
 const yaw=p.yaw*Math.PI/180,pitch=elevation*Math.PI/180,c=Math.cos(yaw),s=Math.sin(yaw);
 const x=(target[0]-.5)*dimensions[0],z=(target[2]-.5)*dimensions[2];
 const center=[p.x+c*x+s*z,evidence.floorY+target[1]*dimensions[1],p.z-s*x+c*z];
 const position=[center[0]+s*Math.cos(pitch)*distance,center[1]+Math.sin(pitch)*distance,center[2]+c*Math.cos(pitch)*distance];
 const bounds=evidence.roomBounds;
 check(position.every((v,i)=>Number.isFinite(v)&&v>bounds?.min?.[i]&&v<bounds?.max?.[i]),'camera outside room');
 return {...scene.camera,position,target:center,up:[0,1,0]};
}
export function selectInspectionPlan(mode,radial,maximum){
 check(['uniform','radial'].includes(mode),'unknown sample distribution');
 check(Number.isInteger(maximum)&&maximum>=1&&maximum<=256,'invalid ceiling');
 if(mode==='radial')return radial;
 const pixels=radial.budgets.length;
 return {budgets:new Uint16Array(pixels).fill(maximum),bands:[{spp:maximum,pixels}],meanSpp:maximum,totalSamples:pixels*maximum};
}
export function validateInspectionFrame(frame,plan,settings,mode){
 check(['uniform','radial'].includes(mode)&&frame.mode===mode,'frame mode mismatch');
 check(['width','height','maximumSpp','sampler'].every(key=>frame[key]===settings[key]),'frame settings mismatch');
 check(frame.diagnostics===true&&frame.fused===false&&frame.validationErrors===0,'invalid diagnostic frame');
 check(frame.actualSamples===plan.totalSamples,'completed sample mismatch');
 const expected={};for(const band of plan.bands)expected[band.spp]=(expected[band.spp]??0)+band.pixels;
 check(Object.keys(frame.actualHistogram??{}).length===Object.keys(expected).length&&Object.entries(expected).every(([spp,count])=>frame.actualHistogram[spp]===count),'completed histogram mismatch');
 return true;
}
export function inspectionDisplayColor(mode,normal,albedo){
 check(['normal','albedo'].includes(mode),'unknown material view');
 if(mode==='normal')return albedo[3]>0&&Math.hypot(...normal.slice(0,3))>.5?[...normal.slice(0,3).map(v=>v*.5+.5),1]:[1,0,1,1];
 return [...albedo.slice(0,3).map(v=>v<=.0031308?12.92*v:1.055*Math.pow(v,1/2.4)-.055),1];
}
