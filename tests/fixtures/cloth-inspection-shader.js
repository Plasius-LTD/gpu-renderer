// Display already captured canonical first-hit guides. Never changes transport.
export const CLOTH_INSPECTION_WGSL=`
struct Inspection {width:u32,height:u32,mode:u32,padding:u32};
@group(0) @binding(0) var<uniform> inspection:Inspection;
@group(0) @binding(1) var normalGuide:texture_2d<f32>;
@group(0) @binding(2) var colorGuide:texture_2d<f32>;
@group(0) @binding(3) var inspectionOutput:texture_storage_2d<rgba8unorm,write>;
fn inspection_srgb(v:vec3<f32>)->vec3<f32>{
 return select(1.055*pow(max(v,vec3<f32>(0.0)),vec3<f32>(1.0/2.4))-.055,12.92*v,v<=vec3<f32>(.0031308));
}
@compute @workgroup_size(8,8)
fn display_material_guides(@builtin(global_invocation_id) id:vec3<u32>){
 if(id.x>=inspection.width||id.y>=inspection.height){return;}
 let p=vec2<i32>(id.xy);let albedo=textureLoad(colorGuide,p,0);let n=textureLoad(normalGuide,p,0).xyz;
 var color=inspection_srgb(albedo.xyz);
 if(inspection.mode==1u){color=select(vec3<f32>(1.0,0.0,1.0),n*.5+.5,albedo.w>0.0&&dot(n,n)>.25);}
 textureStore(inspectionOutput,p,vec4<f32>(color,1.0));
}`;
