import { buildViewMatrix, buildProjectionMatrix } from '@plasius/gpu-camera';

const vector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
export function copyInspectionCamera(camera) {
  if (camera === null) return null;
  if (!camera || !vector(camera.position) || !vector(camera.target) ||
      !Number.isFinite(camera.fovYDegrees) || camera.fovYDegrees < 12 || camera.fovYDegrees > 90 ||
      !Number.isFinite(Math.hypot(...camera.position.map((v,i)=>v-camera.target[i]))) ||
      Math.hypot(...camera.position.map((v,i)=>v-camera.target[i])) < .03)
    throw new Error('Invalid inspection camera.');
  return { position:[...camera.position], target:[...camera.target], fovYDegrees:camera.fovYDegrees };
}

/** Build the family camera matrices once, then project world vertices in this frame. */
export function createInspectionProjection(camera, width, height) {
  const view=buildViewMatrix({transform:{position:camera.position,target:camera.target,up:[0,1,0]}});
  const projection=buildProjectionMatrix({projection:{kind:'perspective',fovY:camera.fovYDegrees,near:.01,far:1000}},width/height);
  return { project(point) {
    const x=view[0]*point[0]+view[4]*point[1]+view[8]*point[2]+view[12];
    const y=view[1]*point[0]+view[5]*point[1]+view[9]*point[2]+view[13];
    const z=view[2]*point[0]+view[6]*point[1]+view[10]*point[2]+view[14];
    const depth=-z, denominator=Math.max(.01,depth);
    const nx=projection[0]*x/denominator, ny=projection[5]*y/denominator;
    const screenY=(1-ny)*height/2;
    const inFront=depth>=.01&&depth<=1000;
    return {x:(nx+1)*width/2,y:screenY,groundY:screenY,depth,
      scale:projection[5]*height/(2*denominator),inFront,
      visible:inFront&&Math.abs(nx)<=1.2&&Math.abs(ny)<=1.2};
  }};
}
