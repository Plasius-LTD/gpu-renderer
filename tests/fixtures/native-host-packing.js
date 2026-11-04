import {createConfigPayload,createConfigPayloadBatch} from '../../src/wavefront-packers.js';
import {CONFIG_BUFFER_BYTES} from '../../src/wavefront-core.js';

export function nativeHostOptions(options={}){
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['templateConfigPacking','lazyUniformBudget'].includes(k))||
  Object.values(options).some(v=>typeof v!=='boolean'))throw Error('Invalid native host optimisation selectors');
 return Object.freeze({templateConfigPacking:options.templateConfigPacking??false,lazyUniformBudget:options.lazyUniformBudget??false});
}
export function createNativeBudgetState(budgets,maximum,options={}){
 const settings=nativeHostOptions(options);
 if(!(budgets instanceof Uint8Array||budgets instanceof Uint16Array)||!budgets.length||!Number.isSafeInteger(maximum)||maximum<1||maximum>256||budgets.some(v=>v<1||v>maximum))throw Error('Invalid native budget snapshot');
 const words=Uint32Array.from(budgets),inputBytes=budgets.byteLength;
 let uniform=settings.lazyUniformBudget?null:new Uint32Array(budgets.length).fill(maximum);
 return {
  memoryBytes:()=>inputBytes+words.byteLength+(uniform?.byteLength??0),
  get(mode,onAllocation=()=>{}){
   if(mode==='fixed')return null;
   if(mode==='radial')return words;
   if(mode!=='uniform')throw Error('Invalid native budget mode');
   if(!uniform){uniform=new Uint32Array(words.length).fill(maximum);onAllocation(uniform.byteLength);}
   return uniform;
  },
 };
}
export function packNativeConfigBatch(config,tile,seed,samples,options={},buildRange={},onAllocation){
 const settings=nativeHostOptions(options);
 if(settings.templateConfigPacking){
  const bytes=createConfigPayloadBatch(config,tile,seed,{...buildRange,sampleCount:samples});
  onAllocation?.(bytes.byteLength);onAllocation?.(CONFIG_BUFFER_BYTES);return bytes;
 }
 const bytes=new Uint8Array(samples*config.memory.configBufferStride);onAllocation?.(bytes.byteLength);
 for(let ordinal=0;ordinal<samples;ordinal++){
  const value=createConfigPayload(config,tile,seed,{...buildRange,sampleIndex:ordinal});onAllocation?.(value.byteLength);
  bytes.set(new Uint8Array(value),ordinal*config.memory.configBufferStride);
 }
 return bytes;
}
