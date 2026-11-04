// Qualification only. Production stable sampling must remain byte-identical.
import {fixedPatternWords,FIXED_PATTERN_WGSL} from '../../src/wavefront-fixed-pattern.js';
import {progressiveSampleWords} from '../../src/wavefront-progressive-sampling.js';
import {listWavefrontSampleDimensions,WAVEFRONT_SAMPLE_SEQUENCE_WGSL} from '../../src/wavefront-sampling-dimensions.js';
export const REFERENCE_TRANSPORT_MODE='frame-indexed-transport-v1';
export function referenceTransportWords(pixel,sample,bounce,dimension,seed){
 return dimension===1?fixedPatternWords(sample,bounce,dimension,pixel):progressiveSampleWords(pixel,sample,bounce,seed,dimension,'independent-random');
}
export function withReferenceTransportSampling(source,enabled=false){
 if(!enabled)return source;
 const target='mix_seed(pixelId,sampleId,bounce,0u,dimension)';
 if(source.split(FIXED_PATTERN_WGSL).length!==2||FIXED_PATTERN_WGSL.split(target).length!==2)throw Error('Missing/changed fixed reference sampling source');
 return source.replace(FIXED_PATTERN_WGSL,FIXED_PATTERN_WGSL.replace(target,'mix_seed(pixelId,sampleId,bounce,config.frameIndex,dimension)'));
}
export async function probeReferenceTransportSampling(signal){
 const adapter=await navigator.gpu.requestAdapter();if(!adapter||adapter.info.isFallbackAdapter)throw Error('Physical reference sampling adapter required');
 const device=await adapter.requestDevice(),buffers=[];
 const wait=async p=>{
  let timer,result;
  try{result=await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Reference sampling probe timeout')),30000);})]);}
  finally{clearTimeout(timer);}
  if(signal?.aborted)throw Error('Reference sampling probe cancelled');
  return result;
 };
 try{
  device.pushErrorScope('validation');
  const dimensions=listWavefrontSampleDimensions().map(d=>d.dimension),seeds=[0,7,19],pixels=[0,1,0xfedcba98],ordinals=[0,1,31,127,255],bounces=[0,1,19,235,2047];
  const cases=seeds.flatMap(seed=>pixels.flatMap(pixel=>ordinals.flatMap(sample=>bounces.flatMap(bounce=>dimensions.map(dimension=>({seed,pixel,sample,bounce,dimension}))))));
  const array=(name,values)=>`const ${name}=array<u32,${values.length}>(${values.map(v=>v+'u').join(',')});`;
  const helpers=WAVEFRONT_SAMPLE_SEQUENCE_WGSL.slice(0,WAVEFRONT_SAMPLE_SEQUENCE_WGSL.indexOf('fn random01'));
  const code=withReferenceTransportSampling(helpers+FIXED_PATTERN_WGSL+`
struct ReferenceConfig{frameIndex:u32,};var<private> config:ReferenceConfig;
${array('dimensions',dimensions)}${array('seeds',seeds)}${array('pixels',pixels)}${array('ordinals',ordinals)}${array('bounces',bounces)}
@group(0) @binding(0) var<storage,read_write> output:array<vec4<u32>>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x;if(i>=${cases.length}u){return;}
 let dimension=dimensions[i%${dimensions.length}u];var q=i/${dimensions.length}u;
 let bounce=bounces[q%5u];q=q/5u;let ordinal=ordinals[q%5u];q=q/5u;let pixel=pixels[q%3u];q=q/3u;
 config.frameIndex=seeds[q];
 let words=stable_pattern_words(pixel,ordinal,bounce,dimension);
 let a=sample_dimension_1d(pixel,ordinal,bounce,99u,dimension);
 let b=sample_dimension_2d(pixel,ordinal,bounce,99u,dimension,1u);
 output[i]=vec4<u32>(words,bitcast<u32>(a),bitcast<u32>(b.y));
}`,true);
  const module=device.createShaderModule({code}),info=await wait(module.getCompilationInfo());
  if(info.messages.some(m=>m.type==='error'))throw Error('Reference sampler WGSL: '+JSON.stringify(info.messages));
  const pipeline=await wait(device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}})),size=cases.length*16;
  const output=device.createBuffer({size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}),readback=device.createBuffer({size,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});buffers.push(output,readback);
  const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:output}}]});
  const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(cases.length/64));pass.end();encoder.copyBufferToBuffer(output,0,readback,0,size);device.queue.submit([encoder.finish()]);
  await wait(readback.mapAsync(GPUMapMode.READ));const actual=new Uint32Array(readback.getMappedRange());
  for(const [i,c]of cases.entries()){
   const words=referenceTransportWords(c.pixel,c.sample,c.bounce,c.dimension,c.seed),floats=new Uint32Array(Float32Array.from(words,w=>(w>>>8)/2**24).buffer),expected=[...words,...floats];
   if(expected.some((v,k)=>actual[i*4+k]!==v))throw Error('Reference transport CPU/GPU mismatch at '+i);
  }
  const block=cases.length/seeds.length;let cameraInvariantPairs=0,transportDistinctPairs=0;
  for(let i=0;i<block;i++){
   const a=(block+i)*4,b=(2*block+i)*4,same=actual[a]===actual[b]&&actual[a+1]===actual[b+1];
   if(cases[i].dimension===1){if(!same)throw Error('Reference camera changed across seeds');cameraInvariantPairs++;}
   else{if(same)throw Error('Reference transport seeds aliased');transportDistinctPairs++;}
  }
  readback.unmap();const error=await wait(device.popErrorScope());if(error)throw Error(error.message);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code));
  return {status:'passed',mode:REFERENCE_TRANSPORT_MODE,seeds,comparedWords:cases.length*4,dimensions,pixels,ordinals,bounces,
   cameraInvariant:true,transportSeedDifferentiated:true,cameraInvariantPairs,transportDistinctPairs,sourceSha256:Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('')};
 }finally{for(const b of buffers)b.destroy();device.destroy();}
}
