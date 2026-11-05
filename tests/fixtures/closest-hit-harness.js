import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {WAVEFRONT_SHADER_LAYOUT_WGSL as layout} from '../../src/wavefront-shader-layout.js';
import {WAVEFRONT_SHADER_BVH_WGSL as bvh} from '../../src/wavefront-shader-bvh.js';
import {WAVEFRONT_INSTANCE_SHADER_WGSL as instance} from '../../src/wavefront-instance-shader.js';
import {packWavefrontTriangles,packWavefrontBvhNodes} from '../../src/wavefront-packers.js';
import {canonicalBvh,canonicalInstance} from './closest-hit-canonical.js';

const require=createRequire(import.meta.resolve('@plasius/gpu-shader/node'));
const engine=await import(pathToFileURL(require.resolve('wgsl_reflect/wgsl_reflect.module.js')));

// Reuse the shader package's interpreter; compensate only for its documented
// sub-struct assignment bug. The actual WGSL remains unchanged on physical GPUs.
class TraversalExec extends engine.WgslExec {
  calls=new Map();
  _evalCallValue(node,context){
    this.calls.set(node.name,(this.calls.get(node.name)??0)+1);
    return super._evalCallValue(node,context);
  }
  _assign(node,context){
    const evaluate=this.evalExpression;
    this.evalExpression=(expression,scope)=>{
      const data=evaluate.call(this,expression,scope);
      return expression===node.value&&data instanceof engine.TypedData&&data.typeInfo.isStruct&&
        (data.offset!==0||data.buffer.byteLength!==data.typeInfo.size)?data.clone():data;
    };
    try{return super._assign(node,context);}finally{this.evalExpression=evaluate;}
  }
}

export function wgslBlock(source,head){
  const begin=source.indexOf(head);
  if(begin<0)throw new Error(`Missing WGSL ${head}`);
  const open=source.indexOf('{',begin);let depth=1,end=open+1;
  while(depth&&end<source.length){if(source[end]==='{')depth++;if(source[end]==='}')depth--;end++;}
  return source.slice(begin,end)+(head.startsWith('struct ')?';':'');
}

export function traversalFixture(config,rays,{canonical=false}={}){
  const geometry=canonical?canonicalBvh:bvh.slice(bvh.indexOf('fn safe_inverse('));
  let instances='';
  if(config.instancing){
    instances=canonical?canonicalInstance:instance;
    instances=instances.replace('@group(0) @binding(47) var meshInstances: texture_2d<u32>;',
      '@group(0) @binding(5) var<storage,read> testInstances:array<MeshInstance>;');
    instances=instances.replace(wgslBlock(instances,'fn read_mesh_instance('),
      'fn read_mesh_instance(index:u32)->MeshInstance{return testInstances[index];}');
  }
  const shader=[...['RayRecord','SceneObject','TriangleRecord','BvhNode','Candidate'].map(n=>wgslBlock(layout,`struct ${n} {`)),
    wgslBlock(layout,'fn safe_normalize('),geometry,instances,`
struct TestConfig {bvhNodeCount:u32,triangleCount:u32};
var<private> config:TestConfig;
@group(0) @binding(1)var<storage,read>triangles:array<TriangleRecord>;
@group(0) @binding(2)var<storage,read>bvhNodes:array<BvhNode>;
@group(0) @binding(3)var<storage,read>testRays:array<vec4<f32>>;
@group(0) @binding(4)var<storage,read_write>testResults:array<Candidate>;
@compute @workgroup_size(1)fn probe(@builtin(global_invocation_id)id:vec3<u32>){
 config=TestConfig(${config.bvhNodeCount}u,${config.triangleCount}u);
 var ray=RayRecord();ray.origin=vec4<f32>(testRays[id.x*2u].xyz,1.0);
 ray.direction=vec4<f32>(testRays[id.x*2u+1u].xyz,0.0);
 testResults[id.x]=${config.instancing?'intersect_bvh(ray,testRays[id.x*2u].w)':
   `intersect_geometry_bvh(ray,testRays[id.x*2u].w,0u${geometry.includes('includeLimit: bool')?',false':''})`};
}`].join('\n');
  const ast=new engine.WgslParser().parse(shader),executor=new TraversalExec(ast);
  const stride=executor.reflection.getStructInfo('Candidate').size;
  const output=new Uint32Array(stride/4*rays.length);
  const bindings={1:new Uint8Array(packWavefrontTriangles(config.meshAcceleration.triangles).buffer),
    2:new Uint8Array(packWavefrontBvhNodes(config.meshAcceleration.nodes).buffer),
    3:new Float32Array(rays.flatMap(r=>[...r.origin,r.limit??1e10,...r.direction,0])),4:output};
  if(config.instancing)bindings[5]=new Uint8Array(config.instancing.buffer);
  return {shader,ast,executor,bindings,output,stride,run(){executor.dispatchWorkgroups('probe',rays.length,{0:bindings});return {output,calls:executor.calls};}};
}
