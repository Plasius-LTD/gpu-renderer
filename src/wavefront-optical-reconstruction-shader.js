// Projected interior certification for nested optical volumes. No scene epsilon,
// coverage expansion, persistent state or change to the ray/hit record layout.
export const OPTICAL_RECONSTRUCTION_WGSL=`
fn optical_position_edge(point:vec3<f32>,a:vec3<f32>,b:vec3<f32>,axis:u32)->f32{
  let x=(axis+1u)%3u;let y=(x+1u)%3u;
  let u=vec2<f32>(a[x]-point[x],a[y]-point[y]);
  let v=vec2<f32>(b[x]-point[x],b[y]-point[y]);
  let edge=u.x*v.y-u.y*v.x;
  // Include subtraction from original translated coordinates, not merely the
  // determinant products. This is an arithmetic filter, never hit tolerance.
  let eu=vec2<f32>(abs(a[x])+abs(point[x]),abs(a[y])+abs(point[y]));
  let ev=vec2<f32>(abs(b[x])+abs(point[x]),abs(b[y])+abs(point[y]));
  let bound=optical_rounding_gamma(8.0)*(abs(u.x*v.y)+abs(u.y*v.x)+
    eu.x*abs(v.y)+eu.y*abs(v.x)+ev.x*abs(u.y)+ev.y*abs(u.x)+
    optical_rounding_gamma(2.0)*(eu.x*ev.y+eu.y*ev.x));
  if(bound>0.0&&abs(edge)>bound){return edge;}
  var direction=vec3<f32>(0);direction[axis]=1.0;
  var ray=RayRecord();ray.origin=vec4<f32>(point,1);ray.direction=vec4<f32>(direction,0);
  return optical_exact_edge(ray,a,b).x;
}
fn optical_projected_inside(triangle:TriangleRecord,point:vec3<f32>,axis:u32,orientation:f32)->bool{
  return optical_position_edge(point,triangle.v0.xyz,triangle.v1.xyz,axis)*orientation>0.0 &&
    optical_position_edge(point,triangle.v1.xyz,triangle.v2.xyz,axis)*orientation>0.0 &&
    optical_position_edge(point,triangle.v2.xyz,triangle.v0.xyz,axis)*orientation>0.0;
}
fn optical_triangle_projected_position(triangle:TriangleRecord,point:vec3<f32>)->vec4<f32>{
  let normal=cross(triangle.v1.xyz-triangle.v0.xyz,triangle.v2.xyz-triangle.v0.xyz);
  var axis=0u;if(abs(normal.y)>abs(normal.x)){axis=1u;}
  if(abs(normal.z)>abs(normal[axis])){axis=2u;}
  let orientation=sign(optical_position_edge(triangle.v0.xyz,triangle.v1.xyz,triangle.v2.xyz,axis));
  if(orientation==0.0){return vec4<f32>(point,0);}
  if(optical_projected_inside(triangle,point,axis,orientation)){return vec4<f32>(point,1);}
  let x=(axis+1u)%3u;let y=(x+1u)%3u;
  var best=point;var bestDistance=bitcast<f32>(0x7f800000u);var valid=0.0;
  // Exactly the eight adjacent lattice points, not an iterative geometric bias.
  // Keep the dominant normal coordinate; the existing normal-error bound covers
  // a single representable step in each of the other coordinates.
  for(var i=0u;i<9u;i++){
    let dx=i%3u;let dy=i/3u;if(dx==1u&&dy==1u){continue;}
    var candidate=point;
    if(dx!=1u){candidate[x]=optical_step_outward(point[x],dx==2u);}
    if(dy!=1u){candidate[y]=optical_step_outward(point[y],dy==2u);}
    if(!optical_projected_inside(triangle,candidate,axis,orientation)){continue;}
    let difference=candidate-point;let distance=dot(difference,difference);
    if(valid==0.0||distance<bestDistance){best=candidate;bestDistance=distance;valid=1.0;}
  }
  return vec4<f32>(best,valid);
}
`;
