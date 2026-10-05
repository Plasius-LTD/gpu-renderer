import {createWavefrontPathTracingComputeShaderSource} from '../../src/wavefront-shaders.js';
import {WAVEFRONT_MAKE_CAMERA_RAY_WGSL} from '../../src/wavefront-camera-shared-shader.js';
export const CLOTH_RESPONSE_BINDINGS=Object.freeze([3,5,8,9,...Array.from({length:8},(_,i)=>23+i),...Array.from({length:13},(_,i)=>33+i),46]);
export const CLOTH_RESPONSE_VECTORS=6;

export function createClothResponseShader(){
 const signature='fn make_ray(pixelIndex: u32) -> RayRecord',ordinal='  let sampleId = u32(config.projectionAndSampling.w);';
 if(WAVEFRONT_MAKE_CAMERA_RAY_WGSL.split(signature).length!==2||WAVEFRONT_MAKE_CAMERA_RAY_WGSL.split(ordinal).length!==2)throw Error('Canonical camera changed; requalify cloth diagnostic');
 const camera=WAVEFRONT_MAKE_CAMERA_RAY_WGSL.replace(signature,'fn cloth_ray(pixelIndex: u32, sampleId: u32) -> RayRecord').replace(ordinal,'');
 return createWavefrontPathTracingComputeShaderSource({progressiveSampling:'stable-pattern'})+'\n'+camera+`
@group(0) @binding(46) var<uniform> clothLight: vec4<f32>;
struct ClothSample { on:vec3<f32>, off:vec3<f32>, mesh:u32, tilt:f32, correction:f32 };
fn cloth_angle(a:vec3<f32>, b:vec3<f32>) -> f32 {
  // atan2 remains accurate near zero; acos(dot) magnifies roundoff there.
  return atan2(length(cross(a,b)),dot(a,b))*57.29577951308232;
}
fn cloth_sample(pixel:u32, ordinal:u32) -> ClothSample {
 let ray=cloth_ray(pixel,ordinal);let candidate=intersect_bvh(ray,1000000.0);
 if(candidate.hit==0u){return ClothSample(vec3<f32>(0),vec3<f32>(0),0u,0.0,0.0);}
 let triangle=triangles[candidate.triangleIndex];let view=-ray.direction.xyz;
 let material=sample_surface_material(triangle,candidate.uv,candidate.barycentric,candidate.geometricNormal,candidate.shadingNormal);
 var controlTriangle=triangle;controlTriangle.textureSettings.x = 0.0;
 let control=sample_surface_material(controlTriangle,candidate.uv,candidate.barycentric,candidate.geometricNormal,candidate.shadingNormal);
 let corrected=valid_surface_normal(candidate.geometricNormal, material.shadingNormal, view);
 let controlNormal=valid_surface_normal(candidate.geometricNormal,control.shadingNormal,view);
 var hit=HitRecord();hit.color=material.color;hit.material=material.material;
 hit.materialResponse=material.materialResponse;hit.materialExtension=material.materialExtension;
 hit.specularColor=material.specularColor;hit.occlusion=material.occlusion;
 hit.shadingNormal=vec4<f32>(corrected,0);
 let on=evaluate_surface_bsdf(hit, view, clothLight.xyz)*max(0.0,dot(corrected,clothLight.xyz))*clothLight.w;
 hit.shadingNormal=vec4<f32>(controlNormal,0);
 let off=evaluate_surface_bsdf(hit, view, clothLight.xyz)*max(0.0,dot(controlNormal,clothLight.xyz))*clothLight.w;
 return ClothSample(on,off,triangle.meshId,cloth_angle(material.shadingNormal,control.shadingNormal),cloth_angle(material.shadingNormal,corrected));
}
@compute @workgroup_size(64) fn cloth_response(@builtin(global_invocation_id) id:vec3<u32>){
 if(id.x>=config.tilePixelCount){return;}
 let center=cloth_sample(id.x,0u);var on=center.on;var off=center.off;
 var tilt=center.tilt;var correction=center.correction;var maximum=center.correction;
 var changed=select(0.0,1.0,center.correction>0.1);var sameMesh=true;var completed=1u;
 for(var ordinal=1u;ordinal<config.samplesPerPixel;ordinal++){
  let s=cloth_sample(id.x,ordinal);on+=s.on;off+=s.off;
  sameMesh=sameMesh&&s.mesh==center.mesh;tilt+=s.tilt;correction+=s.correction;
  maximum=max(maximum,s.correction);changed+=select(0.0,1.0,s.correction>0.1);
  completed++;
 }
 let base=id.x*${CLOTH_RESPONSE_VECTORS}u;let count=f32(completed);
 accumulation[base]=vec4<f32>(center.on,f32(center.mesh));
 accumulation[base+1u]=vec4<f32>(center.off,1);
 accumulation[base+2u]=vec4<f32>(on/count,select(0.0,f32(center.mesh),sameMesh));
 accumulation[base+3u]=vec4<f32>(off/count,1);
 accumulation[base+4u]=vec4<f32>(tilt/count,correction/count,maximum,changed);
 accumulation[base+5u]=vec4<f32>(count,f32(config.samplesPerPixel),0,0);
}`;
}
