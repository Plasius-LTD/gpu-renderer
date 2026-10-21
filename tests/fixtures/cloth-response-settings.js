const check=(v,m)=>{if(!v)throw Error('Cloth response: '+m);};
export const CLOTH_RESPONSE_DEFAULTS=Object.freeze({elevation:10,intensity:3,samples:32,yaw:0});
export function clothResponseSettings(input={}){
 const v={...CLOTH_RESPONSE_DEFAULTS,...input};
 check(Number.isFinite(v.elevation)&&v.elevation>=1&&v.elevation<=90,'light elevation must be 1–90 degrees');
 check(Number.isFinite(v.intensity)&&v.intensity>0&&v.intensity<=100,'light intensity must be >0 and <=100');
 check(Number.isInteger(v.samples)&&v.samples>=1&&v.samples<=256,'samples must be 1–256');
 check(Number.isFinite(v.yaw)&&Math.abs(v.yaw)<=180,'invalid seating orientation');
 const e=v.elevation*Math.PI/180,y=v.yaw*Math.PI/180;
 return {...v,direction:[Math.sin(y)*Math.cos(e),Math.sin(e),Math.cos(y)*Math.cos(e)]};
}
export function clothResponseMetrics(images,mask,width,height,meshIds){
 check(images.length===4&&mask.length===width*height&&images.every(a=>a.length===width*height*4),'invalid image dimensions');
 check(images.every(a=>a.every(v=>Number.isFinite(v)&&v>=0)),'nonfinite/negative radiance');
 const ids=new Set(meshIds),sum=[0,0],lap=[0,0];let pixels=0;
 for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
  const p=y*width+x,neighbours=[p-1,p+1,p-width,p+width];
  if(!ids.has(mask[p])||!neighbours.every(n=>mask[n]===mask[p]))continue;
  pixels++;
  for(let mode=0;mode<2;mode++)for(let channel=0;channel<3;channel++){
   const a=images[mode*2],b=images[mode*2+1],d=a[p*4+channel]-b[p*4+channel];sum[mode]+=d*d;
   const detail=4*d-neighbours.reduce((s,n)=>s+a[n*4+channel]-b[n*4+channel],0);lap[mode]+=detail*detail;
  }
 }
 check(pixels>0,'no eligible cloth interior pixels');
 const rms=sum.map(v=>Math.sqrt(v/(pixels*3))),detail=lap.map(v=>Math.sqrt(v/(pixels*3)));
 return {interiorPixels:pixels,centerMapRmse:rms[0],sampledMapRmse:rms[1],centerMapDetailRms:detail[0],sampledMapDetailRms:detail[1],
  mapDetailRetentionRatio:detail[0]>0?detail[1]/detail[0]:null,scope:'normal-on-minus-off signal, not error from photographic truth'};
}
