import {ROUGH_DIELECTRIC_WGSL} from '../../src/wavefront-rough-dielectric-shader.js';
import {WAVEFRONT_COMPUTE_WGSL} from '../../src/wavefront-shaders.js';

export function functionSource(name){
 const start=WAVEFRONT_COMPUTE_WGSL.indexOf(`fn ${name}(`);
 if(start<0)throw Error(`Missing canonical function ${name}`);
 let end=WAVEFRONT_COMPUTE_WGSL.indexOf('{',start),depth=1;
 while(depth){end++;if(WAVEFRONT_COMPUTE_WGSL[end]==='{')depth++;if(WAVEFRONT_COMPUTE_WGSL[end]==='}')depth--;}
 return WAVEFRONT_COMPUTE_WGSL.slice(start,end+1);
}

// Numerical isolation only. Canonical BSDF/sampler bodies are unchanged; scene
// lookups become explicit inputs. The separate device probe uses the full shader.
export function roughDielectricNumericalHarness(){return `
const RAY_FLAG_DELTA_SAMPLE:u32=2u;
const SCATTER_LOBE_DIFFUSE:u32=1u; const SCATTER_LOBE_SPECULAR:u32=2u;
const SCATTER_LOBE_DELTA_REFLECTION:u32=4u; const SCATTER_LOBE_DELTA_TRANSMISSION:u32=5u;
struct RayRecord { direction:vec4<f32>, mediumRefId:u32, }
struct HitRecord { material:vec4<f32>, materialExtension:vec4<f32>, color:vec4<f32>, geometricNormal:vec4<f32>, }
struct ScatterResult { direction:vec4<f32>, pdf:f32, mediumRefId:u32, flags:u32, lobeKind:u32, }
@group(0) @binding(0) var<storage,read> inputs:array<vec4<f32>>;
@group(0) @binding(1) var<storage,read_write> outputs:array<vec4<f32>>;
fn dielectric_ratio(ray:RayRecord,hit:HitRecord)->f32{return inputs[0].x;}
fn optical_shading_normal(ray:RayRecord,hit:HitRecord)->vec3<f32>{return vec3<f32>(0,0,1);}
fn transmitted_medium_ref_id(ray:RayRecord,hit:HitRecord)->u32{return 2u;}
${['safe_normalize','build_basis_tangent','local_to_world','cosine_sample_hemisphere','refract_direction','interface_fresnel'].map(functionSource).join('\n')}
${ROUGH_DIELECTRIC_WGSL}
@compute @workgroup_size(1) fn numerical_probe(@builtin(global_invocation_id) id:vec3<u32>){
 var ray=RayRecord();ray.direction=vec4<f32>(normalize(inputs[1].xyz),0);ray.mediumRefId=1u;
 var hit=HitRecord();hit.material.x=inputs[0].y;hit.materialExtension.z=inputs[0].z;
 hit.color=vec4<f32>(inputs[2].xyz,1);hit.geometricNormal=vec4<f32>(0,0,1,0);
 let q=inputs[id.x+3u];
 let scatter=scatter_rough_dielectric_samples(ray,hit,q.x,q.y,q.zw);
 let estimate=rough_dielectric_throughput(ray,hit,scatter);
 outputs[id.x*3u]=vec4<f32>(estimate,scatter.pdf);
 outputs[id.x*3u+1u]=vec4<f32>(scatter.direction.xyz,f32(scatter.lobeKind));
 outputs[id.x*3u+2u]=vec4<f32>(rough_dielectric_evaluate(ray,hit,scatter.direction.xyz).w,f32(scatter.mediumRefId),f32(scatter.flags),0);
}
`;
}
