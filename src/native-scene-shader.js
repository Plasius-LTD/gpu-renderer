// Raster lighting intentionally differs from the wavefront path tracer. It makes
// no claim of global illumination or ray tracing. All colours remain linear until
// presentation; the generated harbour materials use continuous world-space detail.
export const nativeSceneShader = /* wgsl */ `
struct Frame {
  eye: vec4f, right: vec4f, up: vec4f, forward: vec4f,
  settings: vec4f, sun: vec4f,
  lightRight: vec4f, lightUp: vec4f, lightForward: vec4f, lightOrigin: vec4f,
  viewport: vec4f, wakes: array<vec4f, 4>, info: vec4f,
};
@group(0) @binding(0) var<uniform> frame: Frame;
@group(1) @binding(0) var shadowMap: texture_depth_2d;
@group(1) @binding(1) var shadowSampler: sampler_comparison;
@group(3) @binding(0) var reflectionMap: texture_2d<f32>;
@group(3) @binding(1) var reflectionSampler: sampler;
@group(2) @binding(0) var baseColourMap: texture_2d<f32>;
@group(2) @binding(1) var normalMap: texture_2d<f32>;
@group(2) @binding(2) var ormMap: texture_2d<f32>;
@group(2) @binding(3) var materialSampler: sampler;
@group(2) @binding(4) var<uniform> materialParameters: vec4f;
struct Surface {
  @builtin(position) clip: vec4f,
  @location(0) world: vec3f, @location(1) normal: vec3f,
  @location(2) colour: vec3f, @location(3) material: vec3f, @location(4) uv: vec2f,
};
fn project(p: vec3f) -> vec4f {
  let d = p - frame.eye.xyz;
  let z = dot(d, frame.forward.xyz);
  return vec4f(dot(d, frame.right.xyz) / (frame.settings.x * frame.settings.y),
    dot(d, frame.up.xyz) / frame.settings.x, (z - 0.08) * 500.0 / 499.92, z);
}
fn lightProject(p: vec3f) -> vec4f {
  let d = p - frame.lightOrigin.xyz;
  return vec4f(dot(d, frame.lightRight.xyz) / 34.0,
    dot(d, frame.lightUp.xyz) / 34.0, dot(d, frame.lightForward.xyz) / 100.0, 1.0);
}
@vertex fn surfaceVertex(@location(0) p: vec3f, @location(1) n: vec3f,
  @location(2) c: vec3f, @location(3) m: vec3f, @location(4) uv: vec2f) -> Surface {
  return Surface(project(p), p, n, c, m, uv);
}
@vertex fn shadowVertex(@location(0) p: vec3f) -> @builtin(position) vec4f {
  return lightProject(p);
}
@vertex fn fullscreenVertex(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let positions = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  return vec4f(positions[i], 1, 1);
}
fn cameraRay(pixel: vec2f) -> vec3f {
  let uv = pixel / frame.viewport.xy * 2.0 - 1.0;
  return normalize(frame.forward.xyz + frame.right.xyz * uv.x * frame.settings.x * frame.settings.y
    - frame.up.xyz * uv.y * frame.settings.x);
}
fn display(c: vec3f) -> vec3f {
  let x = max(c * frame.settings.w, vec3f(0));
  let mapped = clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3f(0), vec3f(1));
  return pow(mapped, vec3f(1.0 / 2.2));
}
fn hash(p: vec3f) -> f32 { return fract(sin(dot(p, vec3f(127.1, 311.7, 74.7))) * 43758.5453); }
fn noise(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3f(1,0,0)), u.x),
    mix(hash(i + vec3f(0,1,0)), hash(i + vec3f(1,1,0)), u.x), u.y),
    mix(mix(hash(i + vec3f(0,0,1)), hash(i + vec3f(1,0,1)), u.x),
    mix(hash(i + vec3f(0,1,1)), hash(i + vec3f(1,1,1)), u.x), u.y), u.z);
}
fn sky(ray: vec3f) -> vec3f {
  let elevation = pow(clamp(ray.y * 0.7 + 0.16, 0.0, 1.0), 0.6);
  var c = mix(vec3f(0.42, 0.53, 0.61), vec3f(0.07, 0.19, 0.37), elevation);
  let sunAngle = dot(ray, frame.sun.xyz);
  c += vec3f(1.0, 0.73, 0.43) * pow(max(sunAngle, 0.0), 64.0) * 0.35;
  c += vec3f(4.0, 3.2, 2.1) * smoothstep(0.99965, 0.99985, sunAngle);
  let cloudPoint = ray / max(0.12, ray.y) * 2.1 + vec3f(0, 0, 8);
  let cloud = smoothstep(0.49, 0.77, noise(cloudPoint) * 0.65 + noise(cloudPoint * 2.1) * 0.35);
  c = mix(c, vec3f(0.85, 0.86, 0.82), cloud * smoothstep(0.03, 0.35, ray.y) * 0.65);
  return c;
}
@fragment fn skyFragment(@builtin(position) pixel: vec4f) -> @location(0) vec4f {
  return vec4f(display(sky(cameraRay(pixel.xy))), 1);
}
fn visibility(p: vec3f, n: vec3f) -> f32 {
  let q = lightProject(p + n * 0.035).xyz;
  let uv = vec2f(q.x * 0.5 + 0.5, 0.5 - q.y * 0.5);
  if (any(uv < vec2f(0.005)) || any(uv > vec2f(0.995)) || q.z < 0.0 || q.z > 1.0) { return 1.0; }
  var result = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      result += textureSampleCompareLevel(shadowMap, shadowSampler, uv + vec2f(f32(x), f32(y)) / 2048.0, q.z - 0.0006);
    }
  }
  return result / 9.0;
}
// Dielectric coating is evaluated independently from the coloured substrate.
// This returns the microfacet lobe without Fresnel, including the cosine term.
fn specularLobe(n: vec3f, v: vec3f, roughness: f32) -> f32 {
  let l = frame.sun.xyz; let h = normalize(l + v);
  let nl = max(dot(n,l),0.0); let nv = max(dot(n,v),0.001);
  let nh = max(dot(n,h),0.0);
  let a = max(0.035, roughness * roughness); let a2 = a * a;
  let d = a2 / max(0.00001, 3.14159265 * pow(nh * nh * (a2 - 1.0) + 1.0, 2.0));
  let k = pow(roughness + 1.0, 2.0) / 8.0;
  let g = (nl / (nl * (1.0-k) + k)) * (nv / (nv * (1.0-k) + k));
  return d * g / max(0.001, 4.0*nl*nv) * nl;
}
fn brdf(c: vec3f, n: vec3f, v: vec3f, roughness: f32, metal: f32) -> vec3f {
  let h = normalize(frame.sun.xyz + v);
  let nl = max(dot(n,frame.sun.xyz),0.0);
  let vh = max(dot(v,h),0.0);
  let f0 = mix(vec3f(0.04), c, metal);
  let f = f0 + (1.0-f0) * pow(1.0-vh, 5.0);
  return (1.0-f) * (1.0-metal) * c / 3.14159265 * nl + specularLobe(n,v,roughness) * f;
}
fn fog(c: vec3f, p: vec3f) -> vec3f {
  let amount = 1.0 - exp(-distance(frame.eye.xyz, p) * 0.0018);
  return mix(c, vec3f(0.32, 0.44, 0.55), amount);
}
fn surfaceRadiance(s: Surface, front: bool) -> vec3f {
  let facing = select(select(-1.0,1.0,front),select(1.0,-1.0,front),frame.info.y>0.5);
  let coatNormal = normalize(s.normal) * facing;
  var n = coatNormal;
  let v = normalize(frame.eye.xyz - s.world);
  // Derivatives and samples must be uniform across each fragment quad.
  let dx = dpdx(s.world); let dy = dpdy(s.world);
  let ux = dpdx(s.uv); let uy = dpdy(s.uv);
  let determinant = ux.x * uy.y - ux.y * uy.x;
  let tangent = dx * uy.y - dy * ux.y;
  let bitangent = dy * ux.x - dx * uy.x;
  let sampledNormal = textureSample(normalMap, materialSampler, s.uv).xyz * 2.0 - 1.0;
  var c = s.colour * textureSample(baseColourMap, materialSampler, s.uv).rgb;
  let orm = textureSample(ormMap, materialSampler, s.uv).rgb;
  let roughness = clamp(s.material.x * orm.g, 0.04, 1.0);
  let metalness = clamp(s.material.y * orm.b, 0.0, 1.0);
  let orthogonalTangent = tangent - n * dot(n,tangent);
  let orthogonalBitangent = bitangent - n * dot(n,bitangent);
  if (abs(determinant) > 0.00000001 && dot(orthogonalTangent,orthogonalTangent) > 0.00000001 && dot(orthogonalBitangent,orthogonalBitangent) > 0.00000001) {
    let t = normalize(orthogonalTangent) * sign(determinant);
    let b = normalize(orthogonalBitangent) * sign(determinant);
    n = normalize(t * sampledNormal.x * materialParameters.x + b * sampledNormal.y * materialParameters.x + n * max(0.001,sampledNormal.z));
  }
  if (materialParameters.y < 0.5 && s.material.z > 2.5) {
    let rock = smoothstep(0.45,0.68,noise(s.world*0.27));
    c = mix(c,vec3f(0.16,0.145,0.11),rock*0.7);
    c *= 0.75+0.45*noise(s.world*2.4);
    n = normalize(n+vec3f(noise(s.world*4.0)-0.5,0,noise(s.world*4.0+vec3f(13))-0.5)*0.28);
  } else if (materialParameters.y < 0.5 && s.material.z > 0.5 && s.material.z < 1.5) {
    let grain = noise(s.world * vec3f(18, 3, 1.6));
    c *= 0.82 + 0.30 * grain;
  } else if (materialParameters.y < 0.5 && s.material.z > 1.5) { c *= 0.88 + 0.18 * noise(s.world * 12.0); }
  let hemi = mix(vec3f(0.06,0.05,0.035), vec3f(0.16,0.22,0.29), n.y * 0.5 + 0.5);
  let direct = brdf(c, n, v, roughness, metalness) * vec3f(3.0, 2.65, 2.15) * visibility(s.world, n);
  let ambient = c * hemi * (1.0 - metalness * 0.7) * orm.r;
  let env = sky(reflect(-v,n)) * mix(vec3f(0.04), c, metalness) * (1.0-roughness) * orm.r * 0.30;
  let baseRadiance = direct + ambient + env;
  if (materialParameters.z <= 0.0) { return fog(baseRadiance,s.world); }
  // KHR_materials_clearcoat's simple Fresnel layering: varnish has its own
  // smooth normal and roughness. Its reflection never inherits the wood colour.
  let coatFresnel = 0.04 + 0.96 * pow(1.0-clamp(abs(dot(coatNormal,v)),0.0,1.0),5.0);
  let coatWeight = materialParameters.z * coatFresnel;
  let coatRoughness = clamp(materialParameters.w,0.04,1.0);
  let coatDirect = vec3f(3.0,2.65,2.15) * specularLobe(coatNormal,v,coatRoughness) * visibility(s.world,coatNormal);
  let coatEnvironment = sky(reflect(-v,coatNormal)) * (1.0-coatRoughness) * orm.r * 0.30;
  return fog(baseRadiance * (1.0-coatWeight) + (coatDirect+coatEnvironment) * coatWeight, s.world);
}
@fragment fn surfaceFragment(s: Surface, @builtin(front_facing) front: bool) -> @location(0) vec4f {
  return vec4f(display(surfaceRadiance(s,front)),1);
}
fn wave(p: vec2f) -> f32 {
  let t = frame.settings.z;
  return sin(dot(p,vec2f(0.35,0.23))-t*0.85)*0.13
    + sin(dot(p,vec2f(-0.61,0.42))+t*1.12)*0.065
    + sin(dot(p,vec2f(1.2,0.83))-t*1.4)*0.025
    + sin(dot(p,vec2f(3.1,-2.1))+t*1.8)*0.009;
}
struct WaterResult { @location(0) colour: vec4f, @builtin(frag_depth) depth: f32 };
@fragment fn waterFragment(@builtin(position) pixel: vec4f) -> WaterResult {
  let ray = cameraRay(pixel.xy);
  if (ray.y > -0.001) { discard; }
  var dist = (frame.viewport.z - frame.eye.y) / ray.y;
  var p = frame.eye.xyz + ray * dist;
  for (var i=0; i<3; i++) {
    dist = (frame.viewport.z + wave(p.xz) - frame.eye.y) / ray.y;
    p = frame.eye.xyz + ray * dist;
  }
  if (dist < 0.08 || dist > 499.0) { discard; }
  let eps = 0.03;
  let waveNormal = normalize(vec3f((wave(p.xz-vec2f(eps,0))-wave(p.xz+vec2f(eps,0)))/(2.0*eps),
    1.0, (wave(p.xz-vec2f(0,eps))-wave(p.xz+vec2f(0,eps)))/(2.0*eps)));
  let n = normalize(mix(waveNormal,vec3f(0,1,0),smoothstep(35.0,150.0,dist)));
  let v = -ray;
  let fresnel = 0.02 + 0.98 * pow(1.0-max(dot(n,v),0.0),5.0);
  let uv = clamp(pixel.xy / frame.viewport.xy + n.xz * 0.018, vec2f(0.002), vec2f(0.998));
  // Reflection target is HDR linear; tone mapping happens once after mixing.
  let reflected = textureSampleLevel(reflectionMap, reflectionSampler, uv, 0).rgb;
  let shadow = visibility(p, n);
  var c = mix(vec3f(0.008,0.05,0.065) * (0.5+0.5*shadow), reflected, fresnel);
  c += brdf(vec3f(0.01),n,v,0.14,0.0) * vec3f(2.5,2.15,1.7) * shadow;
  var foam = 0.0;
  for (var i=0u; i<4u; i++) {
    if (f32(i) >= frame.info.x) { break; }
    let w = frame.wakes[i]; let delta = p.xz - w.xy;
    let along = dot(delta, vec2f(sin(w.z), cos(w.z)));
    let across = abs(dot(delta,vec2f(cos(w.z),-sin(w.z))));
    let ribbon = exp(-pow((across - max(0.0,-along)*0.28 - 0.65)*4.0,2.0));
    foam += ribbon * (1.0-smoothstep(-1.0,0.5,along)) * exp(min(0.0,along)*0.25) * (0.4+0.6*noise(vec3f(p.x*5.0,p.z*5.0,frame.settings.z*0.5)));
  }
  c = mix(c,vec3f(0.48,0.61,0.62),clamp(foam*0.42,0.0,0.55));
  let clip = project(p);
  return WaterResult(vec4f(display(fog(c,p)),1),clip.z/clip.w);
}
// Keep reflection radiance linear, including sky. Reusing the lighting calculation
// rather than sampling a screenshot avoids double tone mapping on the water.
@fragment fn reflectionSky(@builtin(position) pixel: vec4f) -> @location(0) vec4f {
  return vec4f(sky(cameraRay(pixel.xy)),1);
}
@fragment fn reflectionSurface(s: Surface, @builtin(front_facing) front: bool) -> @location(0) vec4f {
  let radiance = surfaceRadiance(s,front);
  if (s.world.y < frame.viewport.z) { discard; }
  return vec4f(radiance,1);
}
`;
