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
  // The valid bit selects the first candidate; no non-finite constant is needed.
  var best=point;var bestDistance=0.0;var valid=0.0;
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
fn optical_exact_coplanar(a:vec3<f32>,b:vec3<f32>,c:vec3<f32>,d:vec3<f32>)->bool{
  // det(b-a,c-a,d-a), expanded BEFORE subtraction. The 24 exact triple
  // products fit the existing 864-bit accumulator, including finite extrema.
  var sum:array<u32,27>;
  for(var i=0u;i<3u;i++){
    let j=(i+1u)%3u;let k=(i+2u)%3u;
    optical_accumulate_product(&sum,b[j],c[k],d[i],false);
    optical_accumulate_product(&sum,b[j],a[k],d[i],true);
    optical_accumulate_product(&sum,a[j],c[k],d[i],true);
    optical_accumulate_product(&sum,b[k],c[j],d[i],true);
    optical_accumulate_product(&sum,b[k],a[j],d[i],false);
    optical_accumulate_product(&sum,a[k],c[j],d[i],false);
    optical_accumulate_product(&sum,b[j],c[k],a[i],true);
    optical_accumulate_product(&sum,b[k],c[j],a[i],false);
  }
  for(var i=0u;i<27u;i++){if(sum[i]!=0u){return false;}}
  return true;
}
fn optical_triangle_vertex(triangle:TriangleRecord,index:u32)->vec3<f32>{
  if(index==0u){return triangle.v0.xyz;}if(index==1u){return triangle.v1.xyz;}return triangle.v2.xyz;
}
fn optical_coplanar_neighbor_pair(first:TriangleRecord,other:TriangleRecord,axis:u32)->vec4<f32>{
  if(first.mediumRefId==0u||first.meshId!=other.meshId||first.mediumRefId!=other.mediumRefId||
    first.materialRefId!=other.materialRefId||first.materialSlot!=other.materialSlot||
    first.materialKind!=other.materialKind||first.flags!=other.flags){return vec4<f32>(0);}
  let orientation=sign(optical_position_edge(first.v0.xyz,first.v1.xyz,first.v2.xyz,axis));
  if(orientation==0.0||sign(optical_position_edge(other.v0.xyz,other.v1.xyz,other.v2.xyz,axis))!=orientation){return vec4<f32>(0);}
  for(var i=0u;i<3u;i++){for(var j=0u;j<3u;j++){
    if(all(optical_triangle_vertex(first,i)==optical_triangle_vertex(other,(j+1u)%3u))&&
      all(optical_triangle_vertex(first,(i+1u)%3u)==optical_triangle_vertex(other,j))&&
      optical_exact_coplanar(first.v0.xyz,first.v1.xyz,first.v2.xyz,optical_triangle_vertex(other,(j+2u)%3u))){
      return vec4<f32>(f32(i),f32(j),orientation,1);
    }
  }}
  return vec4<f32>(0);
}
fn optical_neighbor_contains(first:TriangleRecord,other:TriangleRecord,point:vec3<f32>,axis:u32,proof:vec4<f32>)->bool{
  if(proof.w==0.0){return false;}
  if(optical_projected_inside(other,point,axis,proof.z)){return true;}
  let edge=u32(proof.y);let edgeStart=optical_triangle_vertex(other,edge);
  let edgeEnd=optical_triangle_vertex(other,(edge+1u)%3u);let opposite=optical_triangle_vertex(other,(edge+2u)%3u);
  // The open shared edge is internal to this exact continuous face. Endpoints
  // and other edges remain protected; no external coverage is expanded.
  return optical_position_edge(point,edgeStart,edgeEnd,axis)==0.0&&
    optical_position_edge(point,edgeEnd,opposite,axis)*proof.z>0.0&&
    optical_position_edge(point,opposite,edgeStart,axis)*proof.z>0.0;
}
fn optical_coplanar_neighbor_position(triangle:TriangleRecord,triangleIndex:u32,point:vec3<f32>)->vec4<f32>{
  if(config.bvhNodeCount==0u||config.triangleCount==0u){return vec4<f32>(point,0);}
  let normal=cross(triangle.v1.xyz-triangle.v0.xyz,triangle.v2.xyz-triangle.v0.xyz);
  var axis=0u;if(abs(normal.y)>abs(normal.x)){axis=1u;}if(abs(normal.z)>abs(normal[axis])){axis=2u;}
  let x=(axis+1u)%3u;let y=(x+1u)%3u;
  let low=vec2<f32>(optical_step_outward(point[x],false),optical_step_outward(point[y],false));
  let high=vec2<f32>(optical_step_outward(point[x],true),optical_step_outward(point[y],true));
  var stack:array<u32,64>;stack[0]=0u;var size=1u;var visited=0u;
  var best=point;var bestDistance=0.0;var valid=0.0;
  loop{
    if(size==0u){break;}
    if(visited>=config.bvhNodeCount){return vec4<f32>(point,0);}visited++;
    size--;let index=stack[size];if(index>=config.bvhNodeCount){return vec4<f32>(point,0);}
    let node=bvhNodes[index];
    if(node.boundsMax[x]<low.x||node.boundsMin[x]>high.x||node.boundsMax[y]<low.y||node.boundsMin[y]>high.y){continue;}
    if(node.triangleCount>0u){
      if(node.childOrFirst>=config.triangleCount||node.triangleCount>config.triangleCount-node.childOrFirst){return vec4<f32>(point,0);}
      for(var offset=0u;offset<node.triangleCount;offset++){
        let otherIndex=node.childOrFirst+offset;if(otherIndex==triangleIndex){continue;}
        let other=triangles[otherIndex];let proof=optical_coplanar_neighbor_pair(triangle,other,axis);
        if(proof.w==0.0){continue;}
        for(var i=0u;i<9u;i++){
          let dx=i%3u;let dy=i/3u;var candidate=point;
          if(dx!=1u){candidate[x]=optical_step_outward(point[x],dx==2u);}
          if(dy!=1u){candidate[y]=optical_step_outward(point[y],dy==2u);}
          if(!optical_neighbor_contains(triangle,other,candidate,axis,proof)){continue;}
          let delta=candidate-point;let distance=dot(delta,delta);
          if(valid==0.0||distance<bestDistance){best=candidate;bestDistance=distance;valid=1.0;}
        }
      }
    }else{
      if(size+2u>64u){return vec4<f32>(point,0);}
      stack[size]=node.childOrFirst;stack[size+1u]=node.rightChild;size+=2u;
    }
  }
  return vec4<f32>(best,valid);
}
`;
