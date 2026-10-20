import {pathToFileURL} from 'node:url';
import {WAVEFRONT_COMPUTE_WGSL} from '../src/wavefront-shaders.js';
import {functionSource} from '../tests/fixtures/rough-dielectric-numerical-harness.js';
import {OpticalWgslExec,OpticalWgslParser} from '../tests/fixtures/optical-wgsl-executor.js';

// Review tool: executes the canonical WGSL, replacing resource lookups only.
// Its JSON distinguishes reproduced defects from supporting analytic checks.
// Software execution is not physical WGSL compilation or GPU qualification.
function execute(body,vectorCount){
 const source=WAVEFRONT_COMPUTE_WGSL
  .replace(functionSource('transport_experiment_enabled'),'fn transport_experiment_enabled(flag:u32)->bool{return (flag & 49152u)!=0u;}')
  .replace(functionSource('medium_valid'),'fn medium_valid(id:u32)->bool{return id>0u && id<3u;}')
  .replace(functionSource('medium_optics'),'fn medium_optics(id:u32)->vec2<f32>{if(id==1u){return vec2<f32>(1.5,2.0);}if(id==2u){return vec2<f32>(1.333,1.0);}return vec2<f32>(1.0,0.0);}')
  + '\n@compute @workgroup_size(1) fn review_probe(){'+body+'}';
 const output=new Float32Array(vectorCount*4);
 new OpticalWgslExec(new OpticalWgslParser().parse(source)).dispatchWorkgroups('review_probe',1,{0:{3:output}});
 return Array.from({length:vectorCount},(_,i)=>Array.from(output.slice(i*4,i*4+4)));
}

export function reviewRendererContracts(){
 const sizes=[1,.01,.0001];
 const collision=execute(`
  let sizes=array<f32,3>(1.0,0.01,0.0001);
  for(var i=0u;i<3u;i++){
   let size=sizes[i];var ray=RayRecord();
   ray.origin=vec4<f32>(size*0.25,size*0.25,size,0);ray.direction=vec4<f32>(0,0,-1,0);
   var triangle=TriangleRecord();triangle.v1=vec4<f32>(size,0,0,0);triangle.v2=vec4<f32>(0,size,0,0);
   let admitted=intersect_triangle(ray,triangle,0u);let precise=optical_triangle_coordinates(ray,triangle);
   accumulation[i]=vec4<f32>(f32(admitted.hit),admitted.distance,precise.w,precise.x);
  }
  var grazingRay=RayRecord();grazingRay.origin=vec4<f32>(-0.75,0.25,0.00000005,0);grazingRay.direction=vec4<f32>(1,0,-0.00000005,0);
  var unitTriangle=TriangleRecord();unitTriangle.v1=vec4<f32>(1,0,0,0);unitTriangle.v2=vec4<f32>(0,1,0,0);
  let grazingHit=intersect_triangle(grazingRay,unitTriangle,0u);let grazingPrecise=optical_triangle_coordinates(grazingRay,unitTriangle);
  accumulation[3]=vec4<f32>(f32(grazingHit.hit),grazingHit.distance,grazingPrecise.w,grazingPrecise.x);
  // A representable adjacent plane at z=-0.5 micrometres lies ahead of the
  // true surface point but behind the offset continuation origin.
  let nextOrigin=optical_offset(vec3<f32>(0),vec3<f32>(0,0,1),vec3<f32>(0,0,-1));
  var thinRay=RayRecord();thinRay.origin=vec4<f32>(nextOrigin,0);thinRay.direction=vec4<f32>(0,0,-1,0);
  var nextFace=TriangleRecord();nextFace.v0=vec4<f32>(-1,-1,-0.0000005,0);nextFace.v1=vec4<f32>(1,-1,-0.0000005,0);nextFace.v2=vec4<f32>(0,1,-0.0000005,0);
  let nextCoordinates=optical_triangle_coordinates(thinRay,nextFace);
  accumulation[4]=vec4<f32>(nextOrigin.z,nextCoordinates.w,0.0000005,optical_origin_epsilon(vec3<f32>(0)));
 }`,5);
 const collisionCases=collision.slice(0,4).map(([hit,distance,preciseDistance,preciseFirstBarycentric],i)=>({
  kind:i<3?'scaled':'grazing',size:sizes[i]??1,expectedHit:true,expectedDistance:sizes[i]??1,expectedBarycentric:[.5,.25,.25],
  hit:hit===1,distance,preciseDistance,preciseFirstBarycentric,
 }));

 const transmission=execute(`
  var ray=RayRecord();ray.direction=vec4<f32>(0,0,-1,0);
  var hit=HitRecord();hit.materialKind=2u;hit.mediumRefId=1u;hit.frontFace=1u;
  hit.material=vec4<f32>(0,0,1,1.5);hit.color=vec4<f32>(1);hit.geometricNormal=vec4<f32>(0,0,1,0);hit.shadingNormal=hit.geometricNormal;
  let factors=array<f32,3>(0.25,0.5,1.0);
  for(var i=0u;i<3u;i++){
   hit.materialExtension.z=factors[i];let weight=dielectric_transmission_weight(ray,hit);
   accumulation[i]=vec4<f32>(weight.x,dielectric_reflection_weight(ray,hit).x,dielectric_ratio(ray,hit),dielectric_reflection_probability(ray,hit));
  }`,3).map(([weight,reflection,eta,reflectionProbability],i)=>({
  factor:[.25,.5,1][i],weight,reflection,eta,reflectionProbability,
  // Normal-incidence air/glass: F=((1-1.5)/(1+1.5))^2=.04.
  expectedWeight:(1-.04)*[.25,.5,1][i]*(1/1.5)**2,
 }));

 const optics=execute(`
  var ray=RayRecord();ray.direction=vec4<f32>(0,0,-1,0);
  var hit=HitRecord();hit.materialKind=2u;hit.mediumRefId=1u;hit.frontFace=1u;hit.materialExtension.z=1.0;
  hit.material=vec4<f32>(0,0,1,1.5);hit.color=vec4<f32>(1);hit.geometricNormal=vec4<f32>(0,0,1,0);hit.shadingNormal=hit.geometricNormal;
  let enter=dielectric_transmission_weight(ray,hit).x;
  ray.mediumRefId=1u;ray.mediumStack=vec4<u32>(1,0,0,0);ray.mediumStackDepth=1u;hit.frontFace=0u;
  let leave=dielectric_transmission_weight(ray,hit).x;
  accumulation[0]=vec4<f32>(enter,leave,enter*leave,interface_fresnel(0.5,1.5));
  // Lower-priority water enters while glass remains current, then glass leaves.
  hit.frontFace=1u;hit.mediumRefId=2u;
  let hidden=transmitted_medium_ref_id(ray,hit);let updated=transitioned_medium_stack(ray,hit);
  ray.mediumStack=updated;ray.mediumStackDepth=2u;hit.frontFace=0u;hit.mediumRefId=1u;
  accumulation[1]=vec4<f32>(f32(hidden),f32(transmitted_medium_ref_id(ray,hit)),dielectric_ratio(ray,hit),f32(medium_transition_failure(ray,hit)));
 }`,2);

 return {
  scope:'software canonical-WGSL review; no physical/image qualification',
  defects:[
   {id:'C1',contract:'positive interior triangle hit survives uniform scaling and grazing incidence',
    reproduced:collisionCases.some(c=>!c.hit&&c.preciseDistance>0),cases:collisionCases},
   {id:'C2',contract:'continuation origin does not jump over a representable adjacent interface',
    reproduced:collision[4][0]<-.0000005&&collision[4][1]<0,
    case:{offsetOriginZ:collision[4][0],nextHitDistance:collision[4][1],expectedForwardDistance:collision[4][2],epsilon:collision[4][3]},
    scope:'feature-size admission/error-bound gap; not proof that this case caused room banding'},
   {id:'T1',contract:'smooth transmitted weight includes material transmission fraction',
    reproduced:transmission.some(c=>Math.abs(c.weight-c.expectedWeight)>1e-6),cases:transmission},
  ],
  supported:{
   etaCancellation:{enter:optics[0][0],leave:optics[0][1],product:optics[0][2],expectedProduct:.96**2},
   totalInternalReflection:{actual:optics[0][3],expected:1},
   priorityTransition:{hiddenCurrent:optics[1][0],afterGlassExit:optics[1][1],eta:optics[1][2],failure:optics[1][3],expected:[1,2,1.5/1.333,0]},
  },
 };
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 const result=reviewRendererContracts();
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 process.exitCode=result.defects.some(d=>d.reproduced)?2:0;
}
