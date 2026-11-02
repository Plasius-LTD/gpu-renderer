import {WAVEFRONT_COMPUTE_WGSL} from '../../src/wavefront-shaders.js';
import {createWavefrontPathTracingComputeConfig} from '../../src/wavefront-config.js';
import {createConfigPayload} from '../../src/wavefront-packers.js';
import {functionSource} from './rough-dielectric-numerical-harness.js';

// Smooth, azimuth-invariant normal-incidence diagnostic, never a runtime policy.
export const BSDF_VARIANCE_DIAGNOSTIC=Object.freeze({samples:512,meanTolerance:.0001,roughness:1});
function validProbability(value){if(value!==null&&(!Number.isFinite(value)||value<=0||value>=1))throw Error('Invalid diagnostic lobe probability');}
function body(name,code){const original=functionSource(name);return original.slice(0,original.indexOf('{')+1)+code+'}';}
export function bsdfVarianceShader({diffuseProbability=null}={}){
 validProbability(diffuseProbability);const {samples}=BSDF_VARIANCE_DIAGNOSTIC;
 let source=WAVEFRONT_COMPUTE_WGSL
  .replace(functionSource('sample_dimension_1d'),body('sample_dimension_1d','return varianceSelector;'))
  .replace(functionSource('sample_dimension_2d'),body('sample_dimension_2d','return vec2<f32>(0.5,varianceUv);'));
 if(diffuseProbability!==null)source=source.replace(functionSource('surface_bsdf_sampling_weights'),body('surface_bsdf_sampling_weights',`return vec3<f32>(${diffuseProbability},${1-diffuseProbability},0.0);`));
 return source+`
var<private> varianceSelector:f32;
var<private> varianceUv:f32;
fn variance_hit()->HitRecord{
 var hit=HitRecord();hit.shadingNormal=vec4<f32>(0,0,1,0);hit.geometricNormal=hit.shadingNormal;
 hit.material=vec4<f32>(${BSDF_VARIANCE_DIAGNOSTIC.roughness}.0,0,1,1.5);hit.materialExtension=vec4<f32>(1,1,0,0);
 hit.color=vec4<f32>(vec3<f32>(config.environmentHorizonColor.x),1);hit.specularColor=vec4<f32>(1);hit.occlusion=1;
 return hit;
}
@compute @workgroup_size(1) fn variance_conditional_probe(@builtin(global_invocation_id) globalId:vec3<u32>){
 let index=globalId.x;if(index>=${samples*2}u){return;}
 let hit=variance_hit();let weights=surface_bsdf_sampling_weights(hit);
 let specular=index>=${samples}u;let probability=select(weights.x,weights.y,specular);
 varianceSelector=select(weights.x*0.5,weights.x+weights.y*0.5,specular);
 varianceUv=(f32(index%${samples}u)+0.5)/${samples}.0;
 var ray=RayRecord();ray.direction=vec4<f32>(0,0,-1,0);ray.sampleId=index%${samples}u;
 let scatter=scatter_direction(ray,hit);let cosine=dot(vec3<f32>(0,0,1),scatter.direction.xyz);
 var estimate=0.0;if(scatter.pdf>0.0){estimate=evaluate_surface_bsdf(hit,vec3<f32>(0,0,1),scatter.direction.xyz).x*cosine/scatter.pdf;}
 accumulation[index*2u]=vec4<f32>(estimate,cosine,scatter.pdf,probability);
 accumulation[index*2u+1u]=vec4<f32>(f32(scatter.flags),f32(scatter.lobeKind),weights.x,weights.y);
}
@compute @workgroup_size(1) fn variance_integral_probe(@builtin(global_invocation_id) globalId:vec3<u32>){
 let index=globalId.x;if(index>=${samples}u){return;}
 let cosine=(f32(index)+0.5)/${samples}.0;
 let direction=vec3<f32>(sqrt(max(0.0,1.0-cosine*cosine)),0,cosine);
 let value=evaluate_surface_bsdf(variance_hit(),vec3<f32>(0,0,1),direction).x*cosine*6.28318530718;
 accumulation[${samples*4}u+index]=vec4<f32>(value,cosine,0,0);
}
`;
}
export function bsdfVarianceConfig({albedo=.75}={}){
 if(!Number.isFinite(albedo)||albedo<0||albedo>1)throw Error('Invalid diagnostic albedo');
 const config=createWavefrontPathTracingComputeConfig({width:1,height:1,samplesPerPixel:32,environmentLighting:{horizonColor:[albedo,0,0,1]}});
 return createConfigPayload(config,{x:0,y:0,width:1,height:1},0);
}
export function summarizeBsdfVariance(values,{albedo,diffuseProbability=null}){
 validProbability(diffuseProbability);bsdfVarianceConfig({albedo});
 const {samples,meanTolerance}=BSDF_VARIANCE_DIAGNOSTIC;
 if(!(values instanceof Float32Array)||values.length!==samples*5*4||!values.every(Number.isFinite))throw Error('Missing/nonfinite BSDF variance output');
 let mean=0,secondMoment=0,nullFraction=0,independentBsdfIntegral=0;
 const probabilities=[values[3],values[samples*8+3]];
 if(probabilities.some(p=>p<=0||p>=1)||Math.abs(probabilities[0]+probabilities[1]-1)>2e-7)throw Error('Invalid conditional probability evidence');
 for(let index=0;index<samples*2;index++){
  const offset=index*8,[estimate,cosine,pdf,probability]=values.subarray(offset,offset+4),weight=probability/samples;
  if(probability!==probabilities[index<samples?0:1]||values[offset+4]!==0||values[offset+5]!== (index<samples?1:2)||
   pdf<0||estimate<0||pdf===0&&estimate!==0||pdf>0&&(cosine<=0||cosine>1.000001))throw Error('Invalid BSDF/PDF/null evidence');
  mean+=weight*estimate;secondMoment+=weight*estimate*estimate;if(pdf===0)nullFraction+=weight;
 }
 for(let i=0;i<samples;i++){
  const value=values[(samples*4+i)*4];if(value<0)throw Error('Invalid independent BSDF integral');independentBsdfIntegral+=value/samples;
 }
 if(Math.abs(mean-independentBsdfIntegral)>meanTolerance)throw Error('Proposal mean disagrees with independent physical BSDF integral');
 return {albedo,diffuseProbability,weights:{diffuse:probabilities[0],ggx:probabilities[1]},mean,secondMoment,variance:Math.max(0,secondMoment-mean*mean),nullFraction,independentBsdfIntegral,
  settings:BSDF_VARIANCE_DIAGNOSTIC,scope:'CPU WGSL analytic isolation; not physical WebGPU, full-scene causality or performance'};
}
