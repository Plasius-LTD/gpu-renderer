// Frozen original parametric glass, not private model data. Canonical journal
// 8b21f4f: pixel 3718874 / sample 80 / bounce 7; wall 353337, bottom 353167.
export const OPTICAL_CORNER_PROBE_WGSL=`
fn optical_corner_probe()->array<vec4<f32>,4>{
 var ray=RayRecord();ray.mediumRefId=1u;ray.mediumStack=vec4<u32>(1,0,0,0);ray.mediumStackDepth=1u;
 ray.origin=vec4<f32>(2.8498148918151855,-0.682085394859314,-0.14796166121959686,1);
 ray.direction=vec4<f32>(0.425986111164093,-0.7911314964294434,-0.4389154314994812,0);
 var wall=TriangleRecord();var bottom=TriangleRecord();
 wall.v0=vec4<f32>(2.8535971641540527,-0.6940840482711792,-0.15488223731517792,1);
 wall.v1=vec4<f32>(2.8571789264678955,-0.5140840411186218,-0.15452946722507477,1);
 wall.v2=vec4<f32>(2.8571789264678955,-0.6940840482711792,-0.15452946722507477,1);
 bottom.v0=vec4<f32>(2.8499999046325684,-0.6940840482711792,-0.10000000149011612,1);
 bottom.v1=wall.v0;bottom.v2=wall.v2;
 wall.materialKind=2u;wall.mediumRefId=1u;wall.material.z=1.0;wall.materialExtension.z=1.0;
 bottom.materialKind=2u;bottom.mediumRefId=1u;bottom.material.z=1.0;bottom.materialExtension.z=1.0;
 var reflected=vec3<f32>(0.3201242983341217,-0.7948969602584839,0.5154213309288025);
 let hit=intersect_triangle(ray,wall,0u);
 let position=optical_triangle_position(wall,hit.barycentric);
 ray.origin=vec4<f32>(optical_offset_error(position,hit.geometricNormal,reflected,optical_triangle_error(wall,hit.barycentric,hit.geometricNormal)),1);
 ray.direction=vec4<f32>(reflected,0);
 let bounds=intersect_bounds(ray,min(bottom.v0.xyz,min(bottom.v1.xyz,bottom.v2.xyz)),max(bottom.v0.xyz,max(bottom.v1.xyz,bottom.v2.xyz)),1.0);
 let exit=intersect_triangle(ray,bottom,1u);
 return array<vec4<f32>,4>(
  vec4<f32>(f32(hit.hit),f32(hit.frontFace),select(0.0,1.0,all(hit.barycentric>vec3<f32>(0))),f32(exit.hit)),
  vec4<f32>(position,bottom.v0.y),vec4<f32>(ray.origin.xyz,exit.distance),
  vec4<f32>(f32(exit.frontFace),select(0.0,1.0,bounds),0,0));
}`;

export function assertOpticalCornerProbe(values,{bounded,nested}){
 if(!nested)return;
 const valid=values.length===16&&values.every(Number.isFinite)&&
  [[0,1],[1,0],[2,1],[3,1],[12,0],[13,1]].every(([i,v])=>values[i]===v)&&
  values[5]>values[7]&&values[9]>values[7]&&values[11]>0&&values[11]<2e-7;
 if(!valid)throw Error('Optical corner mismatch '+JSON.stringify({bounded,nested,values:Array.from(values)}));
}
