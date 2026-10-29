import { WAVEFRONT_CAMERA_FRAME_CONFIG_WGSL } from "./wavefront-camera-shared-shader.js";
import { WAVEFRONT_SHADER_KERNELS_WGSL } from "./wavefront-shader-kernels.js";
import { assertShaderModuleCompiles, createComputePipeline } from "./wavefront-runtime-support.js";

const toneMap=WAVEFRONT_SHADER_KERNELS_WGSL.slice(WAVEFRONT_SHADER_KERNELS_WGSL.indexOf("fn tone_map_radiance"),WAVEFRONT_SHADER_KERNELS_WGSL.indexOf("fn present_radiance"));
export const ADAPTIVE_TILE_OUTPUT_WGSL=WAVEFRONT_CAMERA_FRAME_CONFIG_WGSL+toneMap+`
@group(0) @binding(0) var<storage,read> inputRadiance: array<vec4<f32>>;
@group(0) @binding(1) var linearOutput: texture_storage_2d<rgba16float,write>;
@group(0) @binding(2) var displayOutput: texture_storage_2d<rgba8unorm,write>;
@group(0) @binding(3) var<uniform> config: FrameConfig;
@group(0) @binding(4) var<storage,read> pixelWords: array<u32>;
@group(0) @binding(5) var<storage,read_write> gatheredWords: array<u32>;
@compute @workgroup_size(64)
fn write_tile_output(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= config.tilePixelCount || id.x >= arrayLength(&inputRadiance)) { return; }
  let pixel=vec2<u32>(config.tileX + id.x % config.tileWidth, config.tileY + id.x / config.tileWidth);
  if (pixel.x >= config.canvasWidth || pixel.y >= config.canvasHeight) { return; }
  let value=inputRadiance[id.x];
  textureStore(linearOutput,vec2<i32>(pixel),value);
  textureStore(displayOutput,vec2<i32>(pixel),vec4<f32>(tone_map_radiance(value.xyz),value.w));
}
@compute @workgroup_size(64)
fn gather_tile_counts(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= config.tilePixelCount || id.x >= arrayLength(&gatheredWords)) { return; }
  let pixel=vec2<u32>(config.tileX + id.x % config.tileWidth, config.tileY + id.x / config.tileWidth);
  let source=pixel.y * config.canvasWidth + pixel.x;
  gatheredWords[id.x]=0x80000000u;
  if (pixel.x < config.canvasWidth && pixel.y < config.canvasHeight && source < arrayLength(&pixelWords)) {
    gatheredWords[id.x]=pixelWords[source];
  }
}
`;

// Internal only. No pipelines, bindings or buffers when disabled.
export async function createAdaptiveTileOutputPipelines(device,shaderStage,{enabled=false}={}) {
  if(!enabled)return null;
  const module=device.createShaderModule({label:"adaptive-tile-output",code:ADAPTIVE_TILE_OUTPUT_WGSL});
  await assertShaderModuleCompiles(module,"adaptive-tile-output");
  const buffer=(binding,type,minBindingSize,dynamic=false)=>({binding,visibility:shaderStage.COMPUTE,buffer:{type,minBindingSize,...(dynamic?{hasDynamicOffset:true}:{})}});
  const texture=(binding,format)=>({binding,visibility:shaderStage.COMPUTE,storageTexture:{access:"write-only",format,viewDimension:"2d"}});
  const config=buffer(3,"uniform",320,true);
  const outputLayout=device.createBindGroupLayout({entries:[buffer(0,"read-only-storage",16),texture(1,"rgba16float"),texture(2,"rgba8unorm"),config]});
  const gatherLayout=device.createBindGroupLayout({entries:[config,buffer(4,"read-only-storage",4),buffer(5,"storage",4)]});
  const output=await createComputePipeline(device,module,device.createPipelineLayout({bindGroupLayouts:[outputLayout]}),"write_tile_output","adaptive-native-output");
  const gather=await createComputePipeline(device,module,device.createPipelineLayout({bindGroupLayouts:[gatherLayout]}),"gather_tile_counts","adaptive-count-gather");
  return Object.freeze({output,gather,outputLayout,gatherLayout});
}
