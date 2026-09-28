import {WAVEFRONT_COMPUTE_WGSL} from '/src/wavefront-shaders.js';
import {createWavefrontMeshAcceleration} from '/src/wavefront-mesh-sources.js';
import {packWavefrontTriangles} from '/src/wavefront-packers.js';
import {assertShaderModuleCompiles} from '/src/wavefront-runtime-support.js';
import {CONFIG_BUFFER_BYTES} from '/src/wavefront-core.js';

// Canonical assembled-WGSL correctness probe, not a performance benchmark.
export async function runSurfaceValidityProbe(signal) {
 const adapter=await navigator.gpu.requestAdapter();
 if(adapter?.info.isFallbackAdapter!==false)throw Error('Physical GPU required');
 const device=await adapter.requestDevice(),owned=[];
 const check=(v,m)=>{if(!v)throw Error('Surface validity: '+m);};
 const wait=async promise=>{let timer;try{const v=await Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Surface probe timeout')),30000))]);check(!signal.aborted,'cancelled');return v;}finally{clearTimeout(timer);}};
 const buffer=(data,usage)=>{const b=device.createBuffer({size:typeof data==='number'?data:data.byteLength,usage:usage|GPUBufferUsage.COPY_DST});owned.push(b);if(typeof data!=='number')device.queue.writeBuffer(b,0,data);return b;};
 try{
  device.pushErrorScope('validation');
  const meshes=Array.from({length:4},(_,i)=>({positions:[-1,-1,0,1,-1,0,0,1,0],indices:[0,1,2],uvs:i===3?[0,0,0,0,0,0]:i===2?[1,0,0,0,.5,1]:[0,0,1,0,.5,1],doubleSided:i===1,transmission:i===2?1:0,mediumRefId:i===2?7:0}));
  const records=createWavefrontMeshAcceleration(meshes).triangles.slice().sort((a,b)=>a.triangleId-b.triangleId);
  const triangles=buffer(packWavefrontTriangles(records).buffer,GPUBufferUsage.STORAGE),output=buffer(4*8*16,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC);
  const module=device.createShaderModule({code:WAVEFRONT_COMPUTE_WGSL+`
   @compute @workgroup_size(1) fn surfaceProbe(@builtin(global_invocation_id) id:vec3<u32>){
    let t=triangles[id.x];let base=id.x*8u;
    var ray=visibility_test_ray(vec3<f32>(0,0,1),vec3<f32>(0,0,-1));
    let front=intersect_triangle(ray,t,id.x);
    ray.origin=vec4<f32>(0,0,-1,1);ray.direction=vec4<f32>(0,0,1,0);
    let back=intersect_triangle(ray,t,id.x);
    ray.mediumStackDepth=1u;ray.mediumStack=vec4<u32>(7u,0u,0u,0u);
    let exit=intersect_triangle(ray,t,id.x);
    ray.mediumStack.x=8u;let wrong=intersect_triangle(ray,t,id.x);
    accumulation[base]=vec4<f32>(f32(front.hit),f32(back.hit),f32(exit.hit),f32(wrong.hit));
    let vertexNormal=normalize(vec3<f32>(0.6,0.2,1.0));let basis=build_triangle_tangent_basis(t,vertexNormal);
    accumulation[base+1u]=vec4<f32>(dot(vertexNormal,basis.tangent),dot(vertexNormal,basis.bitangent),dot(basis.tangent,basis.bitangent),dot(cross(basis.tangent,basis.bitangent),vertexNormal));
    accumulation[base+2u]=vec4<f32>(length(basis.tangent),length(basis.bitangent),0,0);
    let g=vec3<f32>(0,0,1);let v=normalize(vec3<f32>(0.8,0,0.6));let n=normalize(vec3<f32>(-0.99,0,0.08));
    let repaired=valid_surface_normal(g,n,v);let reflected=2.0*dot(repaired,v)*repaired-v;
    accumulation[base+3u]=vec4<f32>(dot(repaired,v),dot(repaired,g),dot(reflected,g),length(repaired));
    accumulation[base+4u]=vec4<f32>(valid_surface_normal(g,g,v),0);
    accumulation[base+5u]=vec4<f32>(back.geometricNormal,f32(back.frontFace));
    var grazingFailures=0u;
    for(var j=0u;j<128u;j++){
      let angle=f32(j)*0.049087385;let candidate=normalize(vec3<f32>(cos(angle),sin(angle),0.001));
      let view=normalize(vec3<f32>(1,0,0.001));let r=valid_surface_normal(g,candidate,view);
      if(dot(r,view)<=0.0||dot(r,g)<=0.0||dot(2.0*dot(r,view)*r-view,g)<-0.00001){grazingFailures++;}
    }
    accumulation[base+6u]=vec4<f32>(f32(grazingFailures),0,0,0);
    var hit=HitRecord();hit.color=vec4<f32>(0.7,0.7,0.7,1);hit.material=vec4<f32>(0.4,0,1,1.45);
    hit.materialExtension.y=1.0;hit.specularColor=vec4<f32>(1);hit.occlusion=1.0;
    hit.shadingNormal=vec4<f32>(n,0);let invalid=evaluate_surface_bsdf(hit,v,g);
    hit.shadingNormal=vec4<f32>(repaired,0);let corrected=evaluate_surface_bsdf(hit,v,g);
    accumulation[base+7u]=vec4<f32>(invalid.x,corrected.x,evaluate_surface_bsdf_pdf(hit,v,g),0);
   }`});
  await wait(assertShaderModuleCompiles(module,'canonical-surface-validity'));
  const pipeline=await wait(device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'surfaceProbe'}}));
  const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:3,resource:{buffer:output}},{binding:5,resource:{buffer:buffer(new Uint8Array(CONFIG_BUFFER_BYTES),GPUBufferUsage.UNIFORM)}},{binding:8,resource:{buffer:triangles}}]});
  const staging=buffer(output.size,GPUBufferUsage.MAP_READ),encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();
  pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(4);pass.end();encoder.copyBufferToBuffer(output,0,staging,0,output.size);device.queue.submit([encoder.finish()]);
  await wait(staging.mapAsync(GPUMapMode.READ));const values=new Float32Array(staging.getMappedRange().slice(0));staging.unmap();
  const error=await wait(device.popErrorScope());check(!error,error?.message);
  const cases=[];
  for(let i=0;i<4;i++){
   const v=[...values.slice(i*32,(i+1)*32)],expected=i===1?[1,1,1,1]:i===2?[1,0,1,0]:[1,0,0,0];
   check(v.slice(0,4).every((x,j)=>x===expected[j]),'sidedness or medium exit');
   check(v.slice(4,7).every(x=>Math.abs(x)<1e-5),'nonorthogonal tangent frame');
   check(Math.abs(v[7]-(i===2?-1:1))<1e-5,'mirrored UV handedness');
   check(Math.abs(v[8]-1)<1e-5&&Math.abs(v[9]-1)<1e-5,'nonunit frame');
   check(v[12]>0&&v[13]>0&&v[14]>=0&&Math.abs(v[15]-1)<1e-5,'invalid mapped normal');
   check(v[16]===0&&v[17]===0&&v[18]===1,'valid neutral normal changed');
   if(i===1)check(v[22]===-1&&v[23]===0,'two-sided normal not reversed');
   check(v[24]===0,'grazing normal failure');
   check(v[28]===0&&v[29]>0&&v[30]>0&&v.every(Number.isFinite),'BSDF/PDF repair failed');cases.push({index:i,values:v});
  }
  return {passed:true,cases,grazingDirections:128,scope:'assembled-WGSL-correctness-not-performance'};
 }finally{owned.forEach(r=>r.destroy());device.destroy();}
}
