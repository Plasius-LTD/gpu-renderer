import {createTiles} from './wavefront-packers.js';
import {createSharedSampleRanges} from './wavefront-adaptive-shared.js';

// Work ownership only. gpu-performance supplies the admission/importance policy.
// Memory scales with tiles and tier endpoints, never screen pixels or total jobs.
export function createRefinementQueue(options={}) {
 if(options.enabled!==true)return null;
 const {width,height,maximumSamplesPerPixel=256}=options;
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>3840*2160
   ||!Number.isSafeInteger(maximumSamplesPerPixel)||maximumSamplesPerPixel<1||maximumSamplesPerPixel>256)throw new RangeError('Invalid refinement dimensions/ceiling.');
 const tiles=createTiles(width,height,128).map((tile,index)=>Object.freeze({...tile,index}));
 let ordered=tiles,epoch=0,serial=0,outstanding=null,failed=null,resetReason='initial',plan=null;
 let ranges=createSharedSampleRanges([1]),rangeIndex=0,tileIndex=0;
 const covered=new Set(),endpoints=new Set([1]);
 const snapshot=()=>Object.freeze({epoch,previewComplete:covered.size===tiles.length,completedCoverageTiles:covered.size,
   totalTiles:tiles.length,finished:rangeIndex>=ranges.length,outstanding:outstanding!==null,failed,resetReason});
 function update(value,focus=[.5,.5]) {
  if(outstanding)throw new Error('Cannot replace an outstanding refinement ticket.');
  if(!value||!['coverage','focus','stationary'].includes(value.phase)||!Number.isSafeInteger(value.maximumSamplesPerPixel)
    ||value.maximumSamplesPerPixel<1||value.maximumSamplesPerPixel>maximumSamplesPerPixel
    ||value.sequencePeriodSamplesPerPixel!==maximumSamplesPerPixel||typeof value.canRun!=='boolean'
    ||!Array.isArray(value.tiers)||!value.tiers.length||value.tiers.some(n=>!Number.isSafeInteger(n)||n<1||n>value.maximumSamplesPerPixel)
    ||!Array.isArray(focus)||focus.length!==2||focus.some(n=>!Number.isFinite(n)||n<0||n>1))throw new RangeError('Invalid refinement plan/focus.');
  plan=Object.freeze({...value,tiers:Object.freeze([...value.tiers])});
  for(const n of [...plan.tiers,plan.maximumSamplesPerPixel])endpoints.add(n);
  ranges=createSharedSampleRanges([...endpoints].filter(n=>n<=plan.maximumSamplesPerPixel));
  const distance=t=>Math.hypot(((t.x+t.width/2)/width-focus[0])*width/height,(t.y+t.height/2)/height-focus[1]);
  ordered=[...tiles].sort((a,b)=>distance(a)-distance(b)||a.index-b.index);
  rangeIndex=covered.size===tiles.length?1:0;tileIndex=0;
 }
 function checkTicket(ticket) {
  if(ticket?.epoch!==epoch)throw new Error('Stale refinement completion.');
  if(ticket!==outstanding||!ticket)throw new Error('Unknown refinement ticket.');
 }
 return Object.freeze({snapshot,update,
  next() {
   if(failed)throw new Error(`Refinement generation failed: ${failed}`);
   if(outstanding)throw new Error('A refinement ticket is outstanding.');
   if(!plan?.canRun)return null;
   while(rangeIndex<ranges.length) {
    if(tileIndex>=ordered.length){rangeIndex++;tileIndex=0;continue;}
    const tile=ordered[tileIndex++],range=ranges[rangeIndex];
    if(range.firstSample===0&&covered.has(tile.index))continue;
    outstanding=Object.freeze({epoch,serial:++serial,tile,range,phase:range.firstSample===0?'coverage':plan.phase});
    return outstanding;
   }
   return null;
  },
  complete(ticket) {checkTicket(ticket);if(ticket.range.firstSample===0)covered.add(ticket.tile.index);outstanding=null;},
  fail(ticket,reason) {checkTicket(ticket);failed=String(reason);outstanding=null;},
  reset(reason='explicit-reset') {
   epoch++;outstanding=null;failed=null;covered.clear();endpoints.clear();endpoints.add(1);
   resetReason=String(reason);rangeIndex=0;tileIndex=0;
   if(plan)update(plan);
  },
 });
}
