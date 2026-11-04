// e2a0922 native 4K: original parametric glass, not private scene geometry.
export const OPTICAL_COPLANAR_PROBE_WGSL=`
fn optical_coplanar_probe()->array<vec4<f32>,4>{
 var first=TriangleRecord();first.meshId=1u;first.materialRefId=1u;first.mediumRefId=1u;first.materialKind=2u;
 first.v0=vec4<f32>(2.877500057220459,-0.6940840482711792,-0.05236860364675522,1);
 first.v1=vec4<f32>(2.87432599067688,-0.5140840411186218,-0.05067199841141701,1);
 first.v2=vec4<f32>(2.87432599067688,-0.6940840482711792,-0.05067199841141701,1);
 var other=first;other.triangleId=1u;
 other.v0=first.v0;other.v1=vec4<f32>(2.877500057220459,-0.5140840411186218,-0.05236860364675522,1);other.v2=first.v1;
 let point=vec3<f32>(2.874326229095459,-0.5140965580940247,-0.050672098994255066);
 let proof=optical_coplanar_neighbor_pair(first,other,2u);
 let accepted=optical_neighbor_contains(first,other,point,2u,proof);
 var folded=other;folded.v1.z=optical_step_outward(folded.v1.z,true);
 let crease=optical_coplanar_neighbor_pair(first,folded,2u);
 var wrong=other;wrong.mediumRefId=2u;let domain=optical_coplanar_neighbor_pair(first,wrong,2u);
 return array<vec4<f32>,4>(vec4<f32>(proof.w,select(0.0,1.0,accepted),crease.w,domain.w),
  vec4<f32>(point,0),first.v0,other.v1);
}`;
export function assertOpticalCoplanarProbe(values,{nested}){
 if(!nested)return;
 if(values.length!==16||!Array.from(values).every(Number.isFinite)||
  ![[0,1],[1,1],[2,0],[3,0]].every(([i,v])=>values[i]===v)){
  throw Error('Optical coplanar face mismatch '+JSON.stringify(Array.from(values)));
 }
}
