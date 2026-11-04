// Original parametric glass, canonical 7002c0e 4K empty-glass failure:
// pixel 2747573/sample 14, rim 353396 -> missed inner-wall exit 353589.
export const OPTICAL_RIM_RECONSTRUCTION_PROBE_WGSL=`
fn optical_rim_reconstruction_probe()->array<vec4<f32>,4>{
 var ray=RayRecord();ray.origin=vec4<f32>(3.176982879638672,-0.4139057993888855,0.1437508463859558,1);
 ray.direction=vec4<f32>(-0.7575232982635498,-0.2696583867073059,-0.594510555267334,0);
 var rim=TriangleRecord();
 rim.v0=vec4<f32>(2.8993279933929443,-0.5140840411186218,-0.07567412406206131,1);
 rim.v1=vec4<f32>(2.895740509033203,-0.5140840411186218,-0.07744327932596207,1);
 rim.v2=vec4<f32>(2.894167184829712,-0.5140840411186218,-0.07450000196695328,1);
 var wall=TriangleRecord();wall.v0=rim.v1;
 wall.v1=vec4<f32>(2.894167184829712,-0.6820840239524841,-0.07450000196695328,1);wall.v2=rim.v2;
 rim.materialKind=2u;rim.mediumRefId=1u;rim.material.z=1.0;rim.materialExtension.z=1.0;
 wall.materialKind=2u;wall.mediumRefId=1u;wall.material.z=1.0;wall.materialExtension.z=1.0;
 let hit=intersect_triangle(ray,rim,0u);
 let point=optical_triangle_position(rim,hit.barycentric);
 let captured=optical_triangle_position(rim,vec3<f32>(0.00002435777787468396,0.8868099451065063,0.11316579580307007));
 let error=optical_triangle_error(rim,hit.barycentric,hit.geometricNormal);
 ray.mediumRefId=1u;ray.mediumStack=vec4<u32>(1,0,0,0);ray.mediumStackDepth=1u;
 ray.direction=vec4<f32>(-0.507306694984436,-0.764024019241333,-0.39863157272338867,0);
 ray.origin=vec4<f32>(optical_offset_error(point,hit.geometricNormal,ray.direction.xyz,error),1);
 let next=intersect_triangle(ray,wall,1u);
 ray.origin=vec4<f32>(captured,1);let frozenNext=intersect_triangle(ray,wall,1u);
 return array<vec4<f32>,4>(vec4<f32>(f32(hit.hit),f32(hit.frontFace),f32(next.hit),f32(next.frontFace)),
  vec4<f32>(point,error),vec4<f32>(captured,frozenNext.distance),
  vec4<f32>(next.distance,f32(frozenNext.hit),f32(frozenNext.frontFace),0));
}`;

export function assertOpticalRimReconstructionProbe(values,{nested}){
 if(!nested)return;
 if(values.length!==16||!Array.from(values).every(Number.isFinite)||
  ![[0,1],[1,1],[2,1],[3,0],[7,0],[13,1],[14,0]].every(([i,v])=>values[i]===v)||
  !(values[11]>0&&values[11]<2e-6&&values[12]>0&&values[12]<2e-6)){
  throw Error('Optical rim reconstruction mismatch '+JSON.stringify(Array.from(values)));
 }
}

export const OPTICAL_PROJECTED_INTERIOR_PROBE_WGSL=`
fn optical_projected_interior_probe()->array<vec4<f32>,4>{
 var rim=TriangleRecord();rim.v0=vec4<f32>(2.8993279933929443,-0.5140840411186218,-0.07567412406206131,1);
 rim.v1=vec4<f32>(2.895740509033203,-0.5140840411186218,-0.07744327932596207,1);
 rim.v2=vec4<f32>(2.894167184829712,-0.5140840411186218,-0.07450000196695328,1);
 let rounded=optical_triangle_position(rim,vec3<f32>(0.00000005960464477539063,0.699999988079071,0.2999999523162842));
 let corrected=optical_triangle_projected_position(rim,rounded);
 var wall=TriangleRecord();wall.v0=rim.v1;wall.v1=vec4<f32>(2.894167184829712,-0.6820840239524841,-0.07450000196695328,1);wall.v2=rim.v2;
 wall.materialKind=2u;wall.mediumRefId=1u;wall.material.z=1.0;wall.materialExtension.z=1.0;
 var ray=RayRecord();ray.origin=vec4<f32>(corrected.xyz,1);ray.direction=vec4<f32>(-0.507306694984436,-0.764024019241333,-0.39863157272338867,0);
 ray.mediumRefId=1u;ray.mediumStack=vec4<u32>(1,0,0,0);ray.mediumStackDepth=1u;
 let exit=intersect_triangle(ray,wall,0u);
 var thin=TriangleRecord();thin.v0=vec4<f32>(1,1,0,0);thin.v1=vec4<f32>(1.0000001192092896,1,0,0);thin.v2=vec4<f32>(1,1.0000001192092896,0,0);
 let unresolved=optical_triangle_projected_position(thin,vec3<f32>(1,1,0));
 return array<vec4<f32>,4>(vec4<f32>(corrected.w,f32(exit.hit),f32(exit.frontFace),exit.distance),
  corrected,vec4<f32>(rounded,unresolved.w),unresolved);
}`;

export function assertOpticalProjectedInteriorProbe(values,{nested}){
 if(!nested)return;
 if(values.length!==16||!Array.from(values).every(Number.isFinite)||
  ![[0,1],[1,1],[2,0],[7,1],[11,0],[15,0]].every(([i,v])=>values[i]===v)||
  !(values[3]>0&&values[3]<2e-6)){
  throw Error('Optical projected interior mismatch '+JSON.stringify(Array.from(values)));
 }
}
