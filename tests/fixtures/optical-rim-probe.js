// Original parametric reference rim; no private scene asset. Physical fbf9616
// pixel 2574458 / ordinal 93 admitted this outside ray as a glass entry.
export const OPTICAL_RIM_PROBE_WGSL=`
fn optical_rim_probe()->array<vec4<f32>,2>{
 var ray=RayRecord();
 ray.origin=vec4<f32>(3.176982879638672,-0.4139057993888855,0.1437508463859558,1);
 ray.direction=vec4<f32>(-0.8399121165275574,-0.2490779459476471,-0.48219066858291626,0);
 var rim=TriangleRecord();
 rim.v0=vec4<f32>(2.8392701148986816,-0.5140840411186218,-0.04605681076645851,1);
 rim.v1=vec4<f32>(2.840050458908081,-0.5140840411186218,-0.04997995123267174,1);
 rim.v2=vec4<f32>(2.8368003368377686,-0.5140840411186218,-0.050737783312797546,1);
 var farWall=TriangleRecord();
 farWall.v0=vec4<f32>(2.8139376640319824,-0.5140840411186218,-0.06393755227327347,1);
 farWall.v1=vec4<f32>(2.8116562366485596,-0.6820840239524841,-0.06637336313724518,1);
 farWall.v2=vec4<f32>(2.8116562366485596,-0.5140840411186218,-0.06637336313724518,1);
 let rimCandidate=intersect_triangle(ray,rim,0u);
 let farCandidate=intersect_triangle(ray,farWall,1u);
 let outside=optical_triangle_coordinates(ray,rim);
 // One representable z-direction step toward the interior, not a tolerance.
 ray.direction.z=-0.48219063878059387;
 let inside=optical_triangle_coordinates(ray,rim);
 return array<vec4<f32>,2>(vec4<f32>(outside.w,inside.w,inside.x,inside.y+inside.z),
   vec4<f32>(f32(rimCandidate.hit),f32(farCandidate.hit),f32(farCandidate.frontFace),farCandidate.distance));
}`;
export function assertOpticalRimProbe(values,{bounded,nested}){
 if(!nested)return;
 if(values.length!==8||!values.every(Number.isFinite)||values[0]>=0||
   Math.abs(values[1]-.40219635403124965)>2e-7||values[2]<=0||values[2]>=.0001||
   Math.abs(values[2]+values[3]-1)>2e-7||values[4]!==0||values[5]!==1||values[6]!==1||
   Math.abs(values[7]-.4340141)>2e-7){
  throw Error('Optical rim mismatch '+JSON.stringify({bounded,nested,values:Array.from(values)}));
 }
}
