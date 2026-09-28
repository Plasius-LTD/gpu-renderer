import {WAVEFRONT_SHADER_LAYOUT_WGSL} from './wavefront-shader-layout.js';
import {WAVEFRONT_CAMERA_FRAME_CONFIG_WGSL,WAVEFRONT_CAMERA_RAY_RECORD_WGSL} from './wavefront-camera-shared-shader.js';
import {WAVEFRONT_COUNTERS_WGSL,WAVEFRONT_TERMINATION_METRICS_WGSL} from './wavefront-primary-shared-shader.js';
import {WAVEFRONT_SHADER_KERNELS_WGSL} from './wavefront-shader-kernels.js';

// Share the canonical record, not a second hand-maintained hit ABI.
const hitRecord=WAVEFRONT_SHADER_LAYOUT_WGSL.match(/struct HitRecord \{[\s\S]+?\n\};/)[0];
const toneMap=WAVEFRONT_SHADER_KERNELS_WGSL.slice(WAVEFRONT_SHADER_KERNELS_WGSL.indexOf('fn tone_map_radiance'),WAVEFRONT_SHADER_KERNELS_WGSL.indexOf('fn present_radiance'));
export const GUIDED_CAPTURE_WGSL=WAVEFRONT_CAMERA_FRAME_CONFIG_WGSL+WAVEFRONT_CAMERA_RAY_RECORD_WGSL+hitRecord+WAVEFRONT_TERMINATION_METRICS_WGSL+WAVEFRONT_COUNTERS_WGSL+`
@group(0) @binding(0) var<uniform> config: FrameConfig;
@group(0) @binding(1) var<storage,read> rays: array<RayRecord>;
@group(0) @binding(2) var<storage,read> guideHits: array<HitRecord>;
@group(0) @binding(3) var<storage,read_write> guideCounters: Counters;
@group(0) @binding(4) var normalDepthOutput: texture_storage_2d<rgba16float,write>;
@group(0) @binding(5) var albedoOutput: texture_storage_2d<rgba8unorm,write>;
@compute @workgroup_size(64)
fn capture_primary_guides(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= atomicLoad(&guideCounters.activeCount)) { return; }
  let ray=rays[id.x];
  if (ray.sampleId != 0u || ray.bounce != 0u) { return; }
  let hit=guideHits[id.x];
  let pixel=vec2<i32>(i32(hit.sourcePixelId % config.canvasWidth), i32(hit.sourcePixelId / config.canvasWidth));
  if (pixel.y >= i32(config.canvasHeight)) { return; }
  let cloth = any(hit.materialResponse.xyz > vec3<f32>(0.0));
  let eligible=hit.hitType == 0u && hit.materialKind == 0u && hit.material.x >= 0.5
    && hit.material.y < 0.05 && hit.material.z >= 0.999 && hit.materialExtension.z <= 0.001
    && (!cloth || hit.material.x >= 0.7) && hit.materialResponse.w == 0.0;
  var normalDepth=vec4<f32>(0.0);
  if (eligible) {
    // Fibre-scale normal variation must not reject every neighbouring cloth
    // sample. Macro geometry and depth still protect seams and silhouettes.
    let n=select(hit.shadingNormal.xyz, hit.geometricNormal.xyz, cloth);
    normalDepth=vec4<f32>(n * inverseSqrt(max(dot(n,n),0.000001)), log2(max(hit.distance,0.000001)));
  }
  textureStore(normalDepthOutput,pixel,normalDepth);
  textureStore(albedoOutput,pixel,vec4<f32>(clamp(hit.color.xyz,vec3<f32>(0.0),vec3<f32>(1.0)),select(0.0,select(1.0, 0.5, cloth),eligible)));
}
`;

export const GUIDED_FILTER_WGSL=toneMap+`
struct FilterConfig { width:u32, height:u32, step:u32, filtered:u32 };
@group(0) @binding(0) var<uniform> settings: FilterConfig;
@group(0) @binding(1) var filterInput: texture_2d<f32>;
@group(0) @binding(2) var rawInput: texture_2d<f32>;
@group(0) @binding(3) var normalDepth: texture_2d<f32>;
@group(0) @binding(4) var albedoGuide: texture_2d<f32>;
@group(0) @binding(5) var<storage,read> pixelWords: array<u32>;
@group(0) @binding(6) var filterOutput: texture_storage_2d<rgba16float,write>;
@group(0) @binding(7) var displayOutput: texture_storage_2d<rgba8unorm,write>;
fn completed_count(pixel:vec2<i32>) -> f32 {
  let word=pixelWords[u32(pixel.y)*settings.width+u32(pixel.x)];
  return f32((word >> 9u) & 511u);
}
fn valid_pixel(pixel:vec2<i32>) -> bool {
  let word=pixelWords[u32(pixel.y)*settings.width+u32(pixel.x)];
  let requested=word & 511u;
  return (word & 0x80000000u) == 0u && requested > 0u && requested <= 256u && ((word >> 9u) & 511u) == requested;
}
fn range_color(c:vec3<f32>) -> vec3<f32> { return c/(vec3<f32>(1.0)+c); }
fn cloth_modulation(albedo:vec4<f32>) -> vec3<f32> {
  // Alpha encodes protected=0, cloth=~0.5, ordinary diffuse=1. The floor
  // bounds dark-channel amplification; this is not a separated-lobe filter.
  return select(vec3<f32>(1.0),max(albedo.xyz,vec3<f32>(0.1)),albedo.w < 0.75);
}
fn kernel(offset:i32) -> f32 { return select(select(1.0,4.0,abs(offset)==1),6.0,offset==0); }
fn guided_value(pixel:vec2<i32>,filtered:vec4<f32>) -> vec4<f32> {
  let raw=textureLoad(rawInput,pixel,0);
  if (raw.w == 0.0 || !valid_pixel(pixel)) { return vec4<f32>(0.0); }
  if (settings.filtered == 0u || textureLoad(albedoGuide,pixel,0).w == 0.0) { return raw; }
  let blend=clamp(2.0/sqrt(max(completed_count(pixel),1.0)),0.25,1.0);
  return vec4<f32>(mix(raw.xyz,filtered.xyz,blend),raw.w);
}
@compute @workgroup_size(8,8)
fn filter_guided(@builtin(global_invocation_id) id:vec3<u32>) {
  if (id.x >= settings.width || id.y >= settings.height) { return; }
  let pixel=vec2<i32>(id.xy);
  let center=textureLoad(filterInput,pixel,0);
  let albedo=textureLoad(albedoGuide,pixel,0);
  if (!valid_pixel(pixel)) { textureStore(filterOutput,pixel,vec4<f32>(0.0)); return; }
  if (center.w == 0.0 || albedo.w == 0.0) {
    textureStore(filterOutput,pixel,center); return;
  }
  let geometry=textureLoad(normalDepth,pixel,0);
  let spp=max(completed_count(pixel),1.0);
  let sigma=0.15+0.45/sqrt(spp);
  let centerRange=range_color(center.xyz/cloth_modulation(albedo));
  var sum=vec3<f32>(0.0); var total=0.0;
  for (var y=-2i;y<=2i;y=y+1i) {
    for (var x=-2i;x<=2i;x=x+1i) {
      let offset=vec2<i32>(x,y)*i32(settings.step);
      let p=pixel+offset;
      if (any(p < vec2<i32>(0)) || any(p >= vec2<i32>(i32(settings.width),i32(settings.height)))) { continue; }
      let other=textureLoad(filterInput,p,0);
      let a=textureLoad(albedoGuide,p,0);
      let g=textureLoad(normalDepth,p,0);
      if (other.w == 0.0 || a.w == 0.0 || abs(a.w-albedo.w) > 0.1 || !valid_pixel(p)) { continue; }
      let normalDot=clamp(dot(geometry.xyz,g.xyz),0.0,1.0);
      let depthDelta=abs(geometry.w-g.w);
      let depthLimit=0.005+0.02*length(vec2<f32>(offset));
      let colorDelta=a.xyz-albedo.xyz;
      // Hard gates stop crossing known surface boundaries; soft gates retain texture detail.
      if (normalDot < 0.9 || depthDelta > depthLimit || any(abs(colorDelta)>vec3<f32>(0.15))) { continue; }
      let signal=other.xyz/cloth_modulation(a);
      let rangeDelta=range_color(signal)-centerRange;
      let weight=kernel(x)*kernel(y)*pow(normalDot,64.0)
        *exp(-dot(colorDelta,colorDelta)/0.01)
        *exp(-depthDelta/max(depthLimit,0.00001))
        /(1.0+dot(rangeDelta,rangeDelta)/(sigma*sigma));
      sum=sum+signal*weight; total=total+weight;
    }
  }
  var color=vec4<f32>(sum/max(total,0.00001)*cloth_modulation(albedo),center.w);
  if (settings.step == 4u) { color=guided_value(pixel,color); }
  textureStore(filterOutput,pixel,color);
}
@compute @workgroup_size(8,8)
fn resolve_guided(@builtin(global_invocation_id) id:vec3<u32>) {
  if (id.x >= settings.width || id.y >= settings.height) { return; }
  let pixel=vec2<i32>(id.xy);
  let raw=textureLoad(rawInput,pixel,0);
  if (raw.w == 0.0 || !valid_pixel(pixel)) {
    textureStore(displayOutput,pixel,vec4<f32>(1.0,0.0,1.0,0.0));return;
  }
  var color=raw;
  if (settings.filtered == 1u) { color=textureLoad(filterInput,pixel,0); }
  textureStore(displayOutput,pixel,vec4<f32>(tone_map_radiance(color.xyz),color.w));
}
`;
