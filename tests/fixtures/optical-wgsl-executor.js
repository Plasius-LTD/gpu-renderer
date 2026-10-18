import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.resolve('@plasius/gpu-shader/node'));
const engine=await import(pathToFileURL(require.resolve('wgsl_reflect/wgsl_reflect.module.js')));

// Numerical-test adapter, never a GPU shader rewrite. The upstream executor
// stores generic vecN<u32> in Float32Array and uses JS arithmetic right shift
// for u32. Typed unsigned vector storage and explicit unsigned shift semantics fix
// those two interpreter defects. Litmus/oracle tests validate this adapter;
// physical preflight still compiles the original assembled source unchanged.
export const OpticalWgslParser=engine.WgslParser;
export class OpticalWgslExec extends engine.WgslExec {
 _makeCwiseData(values,type){
  if(type.format?.name==='u32')return new engine.VectorData(new Uint32Array(values),type);
  return super._makeCwiseData(values,type);
 }
 _callConstructorVec(node,context){
  const type=this.getTypeInfo(node.type);
  if(type.format?.name==='u32'){
   const values=(node.args??[]).flatMap(arg=>{
    const data=this.evalExpression(arg,context);
    return data instanceof engine.VectorData?Array.from(data.data):[data.value];
   });
   const size=Number(type.name.slice(-1));
   const result=values.length===0?new Uint32Array(size):values.length===1?new Uint32Array(size).fill(values[0]):new Uint32Array(values);
   return new engine.VectorData(result,type).getSubData(this,node.postfix,context);
  }
  return super._callConstructorVec(node,context);
 }
 _evalBinaryOpValue(node,context){
  if(node.operator==='>>'){
   const left=this.evalExpression(node.left,context),right=this.evalExpression(node.right,context);
   if(left instanceof engine.ScalarData&&left.typeInfo.name==='u32'){
    return new engine.ScalarData(left.value >>> (right.value&31),left.typeInfo);
   }
   if(left instanceof engine.VectorData&&left.data instanceof Uint32Array){
    return new engine.VectorData(Array.from(left.data,(v,i)=>v >>> ((right.data[i]??right.value)&31)),left.typeInfo);
   }
  }
  return super._evalBinaryOpValue(node,context);
 }
}
