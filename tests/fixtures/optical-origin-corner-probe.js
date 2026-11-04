// cdfecb0 physical canonical journal, empty parametric glass:
// pixel1535086/sample9, wall353199 -> missed bottom -> pedestal -> duplicate entry.
export const OPTICAL_ORIGIN_CORNER_PROBE_WGSL=`
fn optical_origin_corner_probe()->array<vec4<f32>,2>{
 let position=vec3<f32>(2.902547836303711,-0.6940839886665344,-0.08385929465293884);
 let normal=vec3<f32>(0.9569413065910339,1.2064722831883756e-10,0.2902815639972687);
 let direction=vec3<f32>(-0.7904754281044006,-0.41350266337394714,-0.45184510946273804);
 let error=0.000002004084763029823;
 let start=optical_offset_error(position,normal,direction,error);
 var bottom=TriangleRecord();bottom.v0=vec4<f32>(2,-0.6940840482711792,-1,1);
 bottom.v1=vec4<f32>(4,-0.6940840482711792,1,1);bottom.v2=vec4<f32>(2,-0.6940840482711792,1,1);
 bottom.materialKind=2u;bottom.mediumRefId=1u;bottom.material.z=1.0;bottom.materialExtension.z=1.0;
 var ray=RayRecord();ray.origin=vec4<f32>(start,1);ray.direction=vec4<f32>(direction,0);
 ray.mediumRefId=1u;ray.mediumStack=vec4<u32>(1,0,0,0);ray.mediumStackDepth=1u;
 let exit=intersect_triangle(ray,bottom,0u);
 return array<vec4<f32>,2>(vec4<f32>(start,exit.distance),
  vec4<f32>(f32(exit.hit),f32(exit.frontFace),dot(position-start,normal),error));
}`;
export function assertOpticalOriginCornerProbe(values,{nested}){
 if(!nested)return;
 if(values.length!==8||!Array.from(values).every(Number.isFinite)||values[1]!==Math.fround(-0.6940839886665344)||
  !(values[3]>0&&values[3]<2e-7)||values[4]!==1||values[5]!==0||values[6]<values[7]){
  throw Error('Optical origin corner mismatch '+JSON.stringify(Array.from(values)));
 }
}
