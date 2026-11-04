// Original parametric glass: captured inner-wall ray and binary32 outer seam.
// Frozen regression inputs, not private assets or image/performance evidence.
export const OPTICAL_EDGE_PROBE_WGSL=`
fn optical_edge_probe(stress:bool)->vec4<f32>{
 var ray=RayRecord();ray.mediumRefId=1u;ray.mediumStack=vec4<u32>(1,0,0,0);ray.mediumStackDepth=1u;
 var first=TriangleRecord();var second=TriangleRecord();
 ray.origin=vec4<f32>(2.8936612606048584,-0.5178312063217163,-0.06655824929475784,1);
 ray.direction=vec4<f32>(-0.7860987782478333,-0.1896992027759552,-0.5882711410522461,0);
 first.v0=vec4<f32>(2.8924050331115723,-0.5140840411186218,-0.071665920317173,1);
 first.v1=vec4<f32>(2.890460968017578,-0.6820840239524841,-0.06895316392183304,1);
 first.v2=vec4<f32>(2.890460968017578,-0.5140840411186218,-0.06895316392183304,1);
 second.v0=first.v2;second.v1=first.v1;
 second.v2=vec4<f32>(2.8883438110351562,-0.6820840239524841,-0.06637336313724518,1);
 if(stress){
  ray.origin=vec4<f32>(2.807569742202759,-0.6196607947349548,-0.13494722545146942,1);
  ray.direction=vec4<f32>(0.5050597190856934,-0.7641770243644714,-0.40118318796157837,0);
  first.v0=vec4<f32>(2.822499990463257,-0.6940840482711792,-0.14763139188289642,1);
  first.v1=vec4<f32>(2.825674057006836,-0.5140840411186218,-0.14932799339294434,1);
  first.v2=vec4<f32>(2.825674057006836,-0.6940840482711792,-0.14932799339294434,1);
  second.v0=first.v2;second.v1=first.v1;
  second.v2=vec4<f32>(2.8289523124694824,-0.5140840411186218,-0.15081337094306946,1);
 }
 first.materialKind=2u;first.mediumRefId=1u;first.material.z=1.0;first.materialExtension.z=1.0;
 second.materialKind=2u;second.mediumRefId=1u;second.material.z=1.0;second.materialExtension.z=1.0;
 let a=intersect_triangle(ray,first,0u);let b=intersect_triangle(ray,second,1u);
 var nearest=1000.0;
 let admitA=intersect_bounds(ray,min(first.v0.xyz,min(first.v1.xyz,first.v2.xyz)),max(first.v0.xyz,max(first.v1.xyz,first.v2.xyz)),nearest);
 let admitB=intersect_bounds(ray,min(second.v0.xyz,min(second.v1.xyz,second.v2.xyz)),max(second.v0.xyz,max(second.v1.xyz,second.v2.xyz)),nearest);
 let count=select(0u,a.hit,admitA)+select(0u,b.hit,admitB);
 if(a.hit!=0u&&admitA){nearest=min(nearest,a.distance);}
 if(b.hit!=0u&&admitB){nearest=min(nearest,b.distance);}
 return vec4<f32>(f32(count),nearest,f32(a.frontFace),f32(b.frontFace));
}`;
