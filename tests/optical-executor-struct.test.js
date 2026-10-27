import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {OpticalWgslExec as Exec,OpticalWgslParser as Parser} from './fixtures/optical-wgsl-executor.js';
test('WGSL numerical adapter copies the struct member value, not its larger backing allocation',async()=>{
 const source=`struct Small{v:vec4<f32>,}struct Big{prefix:vec4<f32>,a:Small,b:Small,}
 @group(0)@binding(0)var<storage,read_write>o:array<vec4<f32>>;
 @compute @workgroup_size(1)fn probe(){var big=Big(vec4<f32>(5),Small(vec4<f32>(3)),Small(vec4<f32>(9)));
 var small=Small();small=big.a;small.v.x=7;o[0]=vec4<f32>(small.v.x,big.a.v.x,big.b.v.x,big.prefix.x);}`;
 const require=createRequire(import.meta.resolve('@plasius/gpu-shader/node'));
 const {WgslExec,WgslParser}=await import(pathToFileURL(require.resolve('wgsl_reflect/wgsl_reflect.module.js')));
 assert.throws(()=>new WgslExec(new WgslParser().parse(source)).dispatchWorkgroups('probe',1,{0:{0:new Float32Array(4)}}),/typed array length/);
 const values=new Float32Array(4);new Exec(new Parser().parse(source)).dispatchWorkgroups('probe',1,{0:{0:values}});
 assert.deepEqual([...values],[7,3,9,5]);
});
