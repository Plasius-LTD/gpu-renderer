import {MAX_OPTICAL_INTERFACES,MAX_PHYSICAL_PATH_EVENTS,DEFAULT_OPTICAL_INTERFACES} from '../../src/wavefront-optical-interface-budget.js';
import {OPTICAL_TAIL_PROBE} from './optical-tail-budget-probe.js';
// Shared read-only evidence contract. Older off receipts remain valid history;
// missing enabled policy/telemetry can never be treated as successful evidence.
export function validateOpticalBudgetEvidence({settings,frame,probe}){
 const requested=settings?.opticalInterfaceBudget;
 const actual=frame?.opticalInterfaceBudget;
 if(!requested?.enabled){
  if(actual?.enabled)throw Error('Unexpected optical allowance evidence');
  return {enabled:false};
 }
 const ordinary=settings.depth??settings.maxDepth,interfaces=requested.maximumInterfaces,capacity=ordinary+interfaces;
 const streamed=actual?.storageMode==='streamed-linear-chain';
 const queueCapacity=streamed?ordinary:capacity;
 const tail=probe?.opticalInterfaceBudgetProbe;
 if(!Number.isInteger(ordinary)||ordinary<1||ordinary>32||!Number.isInteger(interfaces)||interfaces<1||interfaces>MAX_OPTICAL_INTERFACES||capacity>MAX_PHYSICAL_PATH_EVENTS||
  actual?.enabled!==true||actual.maximumInterfaces!==interfaces||actual.maximumPathEvents!==capacity||frame.maximumPathEvents!==capacity||
  actual.storageMode!==undefined&&!streamed||!Number.isSafeInteger(actual.maximumAdditionalBytes)||actual.maximumAdditionalBytes<1||!Number.isSafeInteger(actual.additionalPathBytes)||actual.additionalPathBytes!==(streamed?0:128*128*interfaces*64)||actual.additionalPathBytes>actual.maximumAdditionalBytes||
  tail?.passed!==true||JSON.stringify(tail.settings)!==JSON.stringify(OPTICAL_TAIL_PROBE)||!Number.isFinite(tail.mean)||Math.abs(tail.mean-1)>OPTICAL_TAIL_PROBE.meanTolerance||
  !Number.isFinite(tail.escapedWeightError)||tail.escapedWeightError<0||tail.escapedWeightError>OPTICAL_TAIL_PROBE.escapedWeightTolerance||!Number.isInteger(tail.minimumEvents)||!Number.isInteger(tail.maximumEvents)||tail.minimumEvents<=OPTICAL_TAIL_PROBE.tirEvents||tail.minimumEvents>tail.maximumEvents||tail.maximumEvents>DEFAULT_OPTICAL_INTERFACES||tail.ordinaryEvents!==0||!frame.tiles?.length)throw Error('Optical allowance policy/probe evidence failure');
 for(const tile of frame.tiles){const rays=tile.telemetry?.rayCounts,records=tile.sampleRounds*queueCapacity;
  if(rays?.status!=='available'||rays.expectedRayCounts!==records||rays.capturedRayCounts!==records||rays.bounceHistogram?.length!==queueCapacity||rays.observedPrimaryRays!==tile.expectedPrimaryRays)throw Error('Optical allowance telemetry evidence failure');
  if(streamed&&(rays.histogramDomain!=='queue-iteration'||rays.expectedOpticalSegmentRecords!==tile.sampleRounds||rays.capturedOpticalSegmentRecords!==tile.sampleRounds||
   !Number.isSafeInteger(rays.additionalOpticalSegments)||rays.additionalOpticalSegments<0||rays.queuePathSegments!==rays.bounceHistogram.reduce((a,b)=>a+b,0)||
   rays.totalPathSegments!==rays.queuePathSegments+rays.additionalOpticalSegments||rays.secondaryRays!==rays.totalPathSegments-rays.observedPrimaryRays))throw Error('Optical streamed segment evidence failure');
 }
 return {enabled:true,ordinary,interfaces,capacity,additionalPathBytes:actual.additionalPathBytes,...(streamed?{storageMode:actual.storageMode,queueCapacity}:{})};
}
