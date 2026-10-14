// Exact binary32 ray and original parametric glass faces from the rejected
// 522b9db capture, pixel 2601331 / sample 76 / bounce 7. No private model data.
export const OPTICAL_ORDER_PROBE_WGSL=`
fn optical_order_probe(reverse:bool)->array<vec4<f32>,3>{
 var ray=RayRecord();ray.mediumRefId=1u;ray.mediumStack=vec4<u32>(1,0,0,0);ray.mediumStackDepth=1u;
 ray.origin=vec4<f32>(2.7950518131256104,-0.6095768213272095,-0.10153336822986603,1);
 ray.direction=vec4<f32>(0.25479671359062195,-0.7698379158973694,-0.5851736068725586,0);
 var exitFace=TriangleRecord();var entryFace=TriangleRecord();
 exitFace.v0=vec4<f32>(2.801706552505493,-0.5140840411186218,-0.11639340966939926,1);
 exitFace.v1=vec4<f32>(2.802882194519043,-0.6820840239524841,-0.11951685696840286,1);
 exitFace.v2=vec4<f32>(2.802882194519043,-0.5140840411186218,-0.11951685696840286,1);
 entryFace.v0=exitFace.v2;entryFace.v1=exitFace.v1;
 entryFace.v2=vec4<f32>(2.8042595386505127,-0.6820840239524841,-0.12255672365427017,1);
 exitFace.materialKind=2u;exitFace.mediumRefId=1u;exitFace.material.z=1.0;exitFace.materialExtension.z=1.0;
 entryFace.materialKind=2u;entryFace.mediumRefId=1u;entryFace.material.z=1.0;entryFace.materialExtension.z=1.0;
 let a=intersect_triangle(ray,exitFace,0u);let b=intersect_triangle(ray,entryFace,1u);
 optical_query_minimum=a.distance;
 let repeated=intersect_triangle(ray,exitFace,0u);let remaining=intersect_triangle(ray,entryFace,1u);
 optical_query_minimum=0.0;
 let faces=array<TriangleRecord,2>(exitFace,entryFace);
 var selections:array<vec2<f32>,2>;
 // Repeat the same traversal body using its own cursor. Different direct and
 // loop call sites may round differently; test event identity and the frozen
 // distance reference, not unsupported cross-call-site bit equality.
 for(var query=0u;query<2u;query++){
  var nearest=1.0;var front=2u;
  for(var i=0u;i<2u;i++){
   let triangle=faces[select(i,1u-i,reverse)];
   if(intersect_bounds(ray,min(triangle.v0.xyz,min(triangle.v1.xyz,triangle.v2.xyz)),max(triangle.v0.xyz,max(triangle.v1.xyz,triangle.v2.xyz)),nearest)){
    let hit=intersect_triangle(ray,triangle,i);
    if(hit.hit!=0u&&hit.distance<nearest){nearest=hit.distance;front=hit.frontFace;}
   }
  }
  selections[query]=vec2<f32>(f32(front),nearest);
  optical_query_minimum=nearest;
 }
 optical_query_minimum=0.0;
 return array<vec4<f32>,3>(vec4<f32>(f32(a.hit),f32(b.hit),a.distance,b.distance),
  vec4<f32>(f32(a.frontFace),f32(b.frontFace),f32(repeated.hit),f32(remaining.hit)),
  vec4<f32>(selections[0],selections[1]));
}`;
