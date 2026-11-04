import {assertShaderModuleCompiles,createComputePipeline} from './wavefront-runtime-support.js';

export const REFINEMENT_CONFIG_BYTES=112;
export const REFINEMENT_STATUS_BYTES=16;
export const DEFAULT_REFINEMENT_ALLOCATION_CAP_BYTES=192*1024**2;

export function packRefinementConfig({width,height,maximumSamplesPerPixel,tiers,focus,focusImportanceActive=false,reset=false,epoch=0}) {
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>3840*2160
  ||!Number.isSafeInteger(maximumSamplesPerPixel)||maximumSamplesPerPixel<1||maximumSamplesPerPixel>256
  ||!Array.isArray(tiers)||!tiers.length||tiers.length>12||tiers[0]!==1||tiers.at(-1)!==maximumSamplesPerPixel
  ||tiers.some((n,i)=>!Number.isSafeInteger(n)||n<1||n>maximumSamplesPerPixel||(i>0&&n<=tiers[i-1]))
  ||!focus||!Array.isArray(focus.focusPointUv)||focus.focusPointUv.length!==2||focus.focusPointUv.some(n=>!Number.isFinite(n)||n<0||n>1)
  ||![focus.innerRadius,focus.outerRadius,focus.edgeImportance].every(Number.isFinite)||focus.innerRadius<0||focus.outerRadius<=focus.innerRadius||focus.edgeImportance<0||focus.edgeImportance>1
  ||typeof focusImportanceActive!=='boolean'||typeof reset!=='boolean'||!Number.isSafeInteger(epoch)||epoch<0||epoch>0xffffffff)throw new RangeError('Invalid refinement GPU configuration.');
 const data=new ArrayBuffer(REFINEMENT_CONFIG_BYTES),u=new Uint32Array(data),f=new Float32Array(data);
 u.set([width,height,maximumSamplesPerPixel,Number(reset)]);f.set([...focus.focusPointUv,focus.innerRadius,focus.outerRadius],4);
 f[8]=focus.edgeImportance;u.set([Number(focusImportanceActive),tiers.length,epoch,0],12);u.set(tiers,16);return data;
}

export const REFINEMENT_WGSL=`
struct RefinementConfig {
 dimensions: vec4<u32>, focus: vec4<f32>, quality: vec4<f32>, controls: vec4<u32>, tiers: array<vec4<u32>,3>,
};
struct RefinementTile { width:u32,height:u32,x:u32,y:u32,tileWidth:u32,tileHeight:u32,firstSample:u32,sampleLimit:u32, };
@group(0) @binding(0) var<uniform> refinement: RefinementConfig;
@group(0) @binding(1) var<storage,read_write> refinementPixels: array<u32>;
@group(0) @binding(2) var<storage,read> refinementSums: array<vec4<f32>>;
@group(0) @binding(3) var<storage,read_write> refinementResolved: array<vec4<f32>>;
@group(0) @binding(4) var<storage,read_write> refinementStatus: array<atomic<u32>>;
@group(0) @binding(5) var<storage,read> refinementControl: array<u32>;
@group(0) @binding(6) var<uniform> refinementTile: RefinementTile;
fn refinement_hash(value:u32)->u32 {
 var x=value; x=(x^(x>>16u))*0x7feb352du;x=(x^(x>>15u))*0x846ca68bu;return x^(x>>16u);
}
fn refinement_tier(index:u32)->u32 { return refinement.tiers[index/4u][index%4u]; }
@compute @workgroup_size(8,8)
fn refinement_targets(@builtin(global_invocation_id) id:vec3<u32>) {
 let width=refinement.dimensions.x;let height=refinement.dimensions.y;
 if(id.x>=width||id.y>=height){return;}
 let pixel=id.y*width+id.x;
 if(pixel>=arrayLength(&refinementPixels)){atomicOr(&refinementStatus[0],1u);return;}
 var word=refinementPixels[pixel];
 if(refinement.dimensions.w!=0u){word=0u;}
 let completed=(word>>9u)&511u;
 if(completed>256u||(word&0x80000000u)!=0u){atomicOr(&refinementStatus[0],2u);return;}
 var importance=1.0;
 if(refinement.controls.x!=0u){
  let uv=(vec2<f32>(id.xy)+vec2<f32>(0.5))/vec2<f32>(f32(width),f32(height));
  let r=length((uv-refinement.focus.xy)*vec2<f32>(f32(width)/f32(height),1.0));
  importance=mix(refinement.quality.x,1.0,1.0-smoothstep(refinement.focus.z,refinement.focus.w,r));
 }
 let continuous=1.0+importance*f32(refinement.dimensions.z-1u);
 var requested=refinement.dimensions.z;
 for(var i=1u;i<refinement.controls.y;i++){
  let low=refinement_tier(i-1u);let high=refinement_tier(i);
  if(continuous<=f32(high)){
   let probability=clamp((continuous-f32(low))/f32(high-low),0.0,1.0);
   let threshold=f32(refinement_hash(pixel^refinement_hash(refinement.controls.z))>>8u)*(1.0/16777216.0);
   requested=select(low,high,threshold<probability);break;
  }
 }
 // A focus/budget change can raise targets, never discard valid earned samples.
 refinementPixels[pixel]=(word&0xfffc0000u)|max(requested,completed)|(completed<<9u);
}
@compute @workgroup_size(1)
fn refinement_fold_failure(){atomicOr(&refinementStatus[0],refinementControl[1]);}
@compute @workgroup_size(64)
fn refinement_gather(@builtin(global_invocation_id) id:vec3<u32>) {
 if(id.x>=refinementTile.tileWidth*refinementTile.tileHeight){return;}
 let pixel=(refinementTile.y+id.x/refinementTile.tileWidth)*refinementTile.width+refinementTile.x+id.x%refinementTile.tileWidth;
 let word=refinementPixels[pixel];let completed=(word>>9u)&511u;let sum=refinementSums[pixel].xyz;
 let finite=all((bitcast<vec3<u32>>(sum)&vec3<u32>(0x7f800000u))<vec3<u32>(0x7f800000u))&&all(sum>=vec3<f32>(0.0));
 if(completed==0u||completed>256u||completed>(word&511u)||(word&0x80000000u)!=0u||!finite){
  refinementResolved[id.x]=vec4<f32>(0.0);atomicOr(&refinementStatus[0],128u);return;
 }
 refinementResolved[id.x]=vec4<f32>(sum/f32(completed),1.0);
}
`;

export async function createRefinementPipelines(device,shaderStage,{enabled=false}={}) {
 if(!enabled)return null;
 const module=device.createShaderModule({label:'wavefront-refinement',code:REFINEMENT_WGSL});
 await assertShaderModuleCompiles(module,'wavefront-refinement');
 const layout=device.createBindGroupLayout({entries:[
  {binding:0,visibility:shaderStage.COMPUTE,buffer:{type:'uniform',minBindingSize:REFINEMENT_CONFIG_BYTES}},
  ...[1,2,3,4,5].map(binding=>({binding,visibility:shaderStage.COMPUTE,buffer:{type:[2,5].includes(binding)?'read-only-storage':'storage',minBindingSize:[2,3,4,5].includes(binding)?16:4}})),
  {binding:6,visibility:shaderStage.COMPUTE,buffer:{type:'uniform',minBindingSize:32,hasDynamicOffset:true}},
 ]});
 const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[layout]}),result={layout};
 for(const [name,entry] of Object.entries({targets:'refinement_targets',gather:'refinement_gather',fold:'refinement_fold_failure'}))result[name]=await createComputePipeline(device,module,pipelineLayout,entry,entry);
 return Object.freeze(result);
}
