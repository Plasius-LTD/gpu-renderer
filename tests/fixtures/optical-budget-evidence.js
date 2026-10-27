import {MAX_OPTICAL_INTERFACES,MAX_PHYSICAL_PATH_EVENTS} from '../../src/wavefront-optical-interface-budget.js';
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
 const tail=probe?.opticalInterfaceBudgetProbe;
 if(!Number.isInteger(ordinary)||ordinary<1||ordinary>32||!Number.isInteger(interfaces)||interfaces<1||interfaces>MAX_OPTICAL_INTERFACES||capacity>MAX_PHYSICAL_PATH_EVENTS||
  actual?.enabled!==true||actual.maximumInterfaces!==interfaces||actual.maximumPathEvents!==capacity||frame.maximumPathEvents!==capacity||
  !Number.isSafeInteger(actual.maximumAdditionalBytes)||!Number.isSafeInteger(actual.additionalPathBytes)||actual.additionalPathBytes!==128*128*interfaces*64||actual.additionalPathBytes>actual.maximumAdditionalBytes||
  tail?.passed!==true||JSON.stringify(tail.settings)!==JSON.stringify(OPTICAL_TAIL_PROBE)||!Number.isFinite(tail.mean)||Math.abs(tail.mean-1)>OPTICAL_TAIL_PROBE.meanTolerance||
  !Number.isFinite(tail.escapedWeightError)||tail.escapedWeightError<0||tail.escapedWeightError>OPTICAL_TAIL_PROBE.escapedWeightTolerance||!Number.isInteger(tail.minimumEvents)||!Number.isInteger(tail.maximumEvents)||tail.minimumEvents<=OPTICAL_TAIL_PROBE.tirEvents||tail.minimumEvents>tail.maximumEvents||tail.maximumEvents>MAX_OPTICAL_INTERFACES||tail.ordinaryEvents!==0||!frame.tiles?.length)throw Error('Optical allowance policy/probe evidence failure');
 for(const tile of frame.tiles){const rays=tile.telemetry?.rayCounts,records=tile.sampleRounds*capacity;
  if(rays?.status!=='available'||rays.expectedRayCounts!==records||rays.capturedRayCounts!==records||rays.bounceHistogram?.length!==capacity||rays.observedPrimaryRays!==tile.expectedPrimaryRays)throw Error('Optical allowance telemetry evidence failure');
 }
 return {enabled:true,ordinary,interfaces,capacity,additionalPathBytes:actual.additionalPathBytes};
}
