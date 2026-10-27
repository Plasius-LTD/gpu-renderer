import {pathEventCapacity} from '../../src/wavefront-optical-interface-budget.js';
const MAX_JOURNALS=8;
export function validateOpticalSelections(values,{width,height,maximumSpp}){
 if(!Array.isArray(values)||values.length>MAX_JOURNALS||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||!Number.isSafeInteger(width*height)||width<1||height<1||
  !Number.isInteger(maximumSpp)||maximumSpp<1||maximumSpp>256||values.some(v=>!v||Object.keys(v).sort().join(',')!=='pixel,sample'||
   !Number.isInteger(v.pixel)||v.pixel<0||v.pixel>=width*height||!Number.isInteger(v.sample)||v.sample<0||v.sample>=maximumSpp)||
  new Set(values.map(v=>v.pixel+':'+v.sample)).size!==values.length)throw Error('Invalid optical journal selection');
 return values.map(v=>({...v}));
}
export function opticalSelectionsFromSearch(search,settings){
 const values=new URLSearchParams(search).getAll('opticalJournal');
 if(values.length===0)return [];
 if(values.length!==1||!values[0])throw Error('Invalid optical journal URL');
 const selections=values[0].split(';').map(value=>{
  const parts=value.split(',');if(parts.length!==3||parts.some(v=>v.trim()===''))throw Error('Invalid optical journal URL');
  const [u,v,sample]=parts.map(Number);
  if(![u,v,sample].every(Number.isFinite)||u<0||u>=1||v<0||v>=1)throw Error('Invalid optical journal UV');
  return {pixel:Math.floor(v*settings.height)*settings.width+Math.floor(u*settings.width),sample};
 });
 return validateOpticalSelections(selections,settings);
}
export async function selectedOpticalJournals(c,{config,tile,ranges,selections,diagnostics,fused,traceEvents=0,sampler},capture){
 const chosen=selections.filter(({pixel})=>{const x=pixel%config.width,y=Math.floor(pixel/config.width);
  return x>=tile.x&&x<tile.x+tile.width&&y>=tile.y&&y<tile.y+tile.height;});
 if(!chosen.length)return [];
 const results=[];
 try{
  capture??=(await import('./canonical-optical-replay.js')).captureCanonicalSelection;
  for(const selection of chosen){
   const result=await capture(c,{config,tile,ranges,selection});
   if(!result.records?.length||result.records.some(r=>r.pixel!==selection.pixel||r.sample!==selection.sample))throw Error('Missing selected optical sample');
   const nodes=result.surfaceNodes;
   if(!nodes?.length||nodes.length!==result.records.filter(r=>r.stage==='after-intersection').length||
    nodes.some((n,index)=>n.pixel!==selection.pixel||n.sample!==selection.sample||n.bounce!==index||n.bounce>=pathEventCapacity(config)||(n.flags&3)!==1||
     ![...n.directRadiance,...n.terminalRadiance].every(v=>Number.isFinite(v)&&v>=0))||!nodes.at(-1).terminalKind)throw Error('Missing selected optical surface records');
   if(traceEvents){const {captureOpticalChainTrace}=await import('./optical-chain-trace.js');
    result.tailTrace=await captureOpticalChainTrace(c,{config,tile,selection,sampler,maximumInterfaces:traceEvents,original:result});}
   results.push({...result,selection});
  }
 }finally{c.setMode(diagnostics,fused);}
 return results;
}
