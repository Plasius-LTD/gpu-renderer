// Air-entry-conditioned analytic wall chain: canonical BSDF/budget/roulette,
// not a second collision implementation or a full-room correctness reference.
import {DEFAULT_OPTICAL_INTERFACES,MAX_PHYSICAL_PATH_EVENTS} from '../../src/wavefront-optical-interface-budget.js';
export const OPTICAL_TAIL_PROBE=Object.freeze({samples:16384,tirEvents:40,meanTolerance:.001,escapedWeightTolerance:.0001});
export const OPTICAL_TAIL_PROBE_WGSL=`
@compute @workgroup_size(64)fn optical_tail_budget_probe(@builtin(global_invocation_id)id:vec3<u32>){
 if(id.x>=${OPTICAL_TAIL_PROBE.samples}u){return;}
 var ray=RayRecord();ray.sourcePixelId=id.x/256u;ray.sampleId=id.x%256u;
 ray.mediumRefId=1u;ray.mediumStack=vec4<u32>(1u,0,0,0);ray.mediumStackDepth=1u;
 ray.direction=vec4<f32>(0.5,sqrt(0.75),0,0);ray.throughput=vec4<f32>(vec3<f32>(1.0/2.25),1);
 var hit=HitRecord();hit.materialKind=2u;hit.mediumRefId=1u;hit.frontFace=0u;
 hit.material=vec4<f32>(0,0,1,1.5);hit.materialExtension=vec4<f32>(0,1,1,0);
 hit.color=vec4<f32>(1);hit.specularColor=vec4<f32>(1);
 var result=0.0;var events=0u;var status=0u;
 for(var step=0u;step<${MAX_PHYSICAL_PATH_EVENTS}u;step++){
  ray.bounce=step;
  if(!path_budget_state_valid(ray)){status=3u;break;}
  hit.geometricNormal=vec4<f32>(select(vec3<f32>(0,-sign(ray.direction.y),0),vec3<f32>(-sign(ray.direction.x),0,0),step<${OPTICAL_TAIL_PROBE.tirEvents}u),0);
  hit.shadingNormal=hit.geometricNormal;
  if(path_budget_exhausted(ray,hit)){status=2u;break;}
  let scatter=scatter_dielectric(ray,hit);let reflection=scatter.lobeKind==SCATTER_LOBE_DELTA_REFLECTION;
  let weight=select(dielectric_transmission_weight(ray,hit),dielectric_reflection_weight(ray,hit),reflection)/scatter.pdf;
  let survival=continuation_survival_probability(ray,hit,weight,vec3<f32>(0),!reflection);
  if(sample_dimension_1d(ray.sourcePixelId,ray.sampleId,step,config.frameIndex,SAMPLE_DIM_RUSSIAN_ROULETTE)>survival){status=4u;break;}
  ray.throughput=vec4<f32>(ray.throughput.xyz*weight/survival,scatter.pdf);
  ray.flags=continuation_budget_flags(ray,hit,scatter.flags);events=step+1u;
  if(!reflection){result=ray.throughput.x;status=1u;break;}
  ray.direction=scatter.direction;
 }
 accumulation[id.x]=vec4<f32>(result,f32(events),f32(ordinary_path_events(ray)),f32(status));
}`;
export function summarizeOpticalTail(values){
 const c=OPTICAL_TAIL_PROBE;if(values.length!==c.samples*4)throw Error('Optical tail probe length');
 let sum=0,minimumEvents=Infinity,maximumEvents=0,escapedWeightError=0;
 for(let i=0;i<values.length;i+=4){const [r,n,ordinary,status]=values.slice(i,i+4);
  if(![r,n,ordinary,status].every(Number.isFinite)||r<0||status!==1||ordinary!==0||!Number.isInteger(n)||n<=c.tirEvents||n>DEFAULT_OPTICAL_INTERFACES)throw Error('Optical tail budget/termination mismatch');
  sum+=r;minimumEvents=Math.min(minimumEvents,n);maximumEvents=Math.max(maximumEvents,n);escapedWeightError=Math.max(escapedWeightError,Math.abs(r-1));
 }
 const mean=sum/c.samples;
 if(Math.abs(mean-1)>c.meanTolerance||escapedWeightError>c.escapedWeightTolerance)throw Error('Optical tail energy mismatch');
 return {passed:true,mean,minimumEvents,maximumEvents,ordinaryEvents:0,escapedWeightError,settings:c,
  scope:'canonical 20-ordinary/64-optical analytic TIR chain; not BVH, room convergence or performance qualification'};
}
