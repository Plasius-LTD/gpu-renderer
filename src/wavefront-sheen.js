// Charlie NDF with numerically integrated Smith masking. Store projected area,
// not divergent lambda, in the existing LUT alpha channel; blue stores its
// matching directional albedo. No integration is performed per frame.
const PI = Math.PI;
const alphaFor = roughness => Math.max(.001, Math.min(1, roughness) ** 2);

export function sheenProjectedArea(cosine, roughness, steps = 128) {
  const v = Math.max(0, Math.min(1, cosine)), sv = Math.sqrt(1-v*v), alpha = alphaFor(roughness);
  let area = 0;
  for (let i=0;i<steps;i++) {
    const h=(i+.5)/steps, a=v*h, b=sv*Math.sqrt(1-h*h);
    const arc=a>=b ? 2*PI*a : 2*(a*Math.acos(-a/b)+Math.sqrt(Math.max(0,b*b-a*a)));
    area += (2+1/alpha)*Math.pow(1-h*h,.5/alpha)/(2*PI)*arc;
  }
  return Math.max(v, area/steps);
}
export function charlieSheenBrdf(nDotV,nDotL,nDotH,roughness) {
  if(nDotV<=0||nDotL<=0)return 0;
  const alpha=alphaFor(roughness), av=sheenProjectedArea(nDotV,roughness), al=sheenProjectedArea(nDotL,roughness);
  const distribution=(2+1/alpha)*Math.max(0,1-nDotH*nDotH)**(.5/alpha)/(2*PI);
  return distribution/(4*(av*nDotL+al*nDotV-nDotV*nDotL));
}

export function integrateSheenDirectionalAlbedo(nDotV,roughness,cosineSteps=32,azimuthSteps=64) {
  const v=Math.max(.0001,Math.min(1,nDotV)), sv=Math.sqrt(1-v*v);
  const alpha=alphaFor(roughness), av=sheenProjectedArea(v,roughness);
  let sum=0;
  for(let y=0;y<cosineSteps;y++){
    const l=(y+.5)/cosineSteps,sl=Math.sqrt(1-l*l);
    const visibility=l/(4*(av*l+sheenProjectedArea(l,roughness)*v-v*l));
    for(let x=0;x<azimuthSteps;x++){
      const phi=2*PI*(x+.5)/azimuthSteps;
      const h=(v+l)/Math.sqrt(2+2*(v*l+sv*sl*Math.cos(phi)));
      sum+=(2+1/alpha)*Math.max(0,1-h*h)**(.5/alpha)*visibility;
    }
  }
  return sum/(cosineSteps*azimuthSteps);
}

export const SHEEN_WGSL = `
fn sheen_enabled() -> bool { return (config.transportExperimentFlags & 4096u) != 0u; }
fn sheen_lut(nDotV:f32,roughness:f32) -> vec2<f32> {
  return textureSampleLevel(brdfLutTexture,brdfLutSampler,vec2<f32>(nDotV,roughness),0.0).zw;
}
fn charlie_sheen(nDotV:f32,nDotL:f32,nDotH:f32,roughness:f32) -> f32 {
  if(nDotV<=0.0||nDotL<=0.0){return 0.0;}
  let alpha=max(0.001,roughness*roughness);
  let d=(2.0+1.0/alpha)*pow(max(0.0,1.0-nDotH*nDotH),0.5/alpha)/6.28318530718;
  let av=max(nDotV,sheen_lut(nDotV,roughness).y);
  let al=max(nDotL,sheen_lut(nDotL,roughness).y);
  return d/max(4.0*(av*nDotL+al*nDotV-nDotV*nDotL),0.0000001);
}
fn sheen_directional_albedo(nDotV:f32,roughness:f32) -> f32 {
  return clamp(sheen_lut(nDotV,roughness).x,0.0,1.0);
}
`;
