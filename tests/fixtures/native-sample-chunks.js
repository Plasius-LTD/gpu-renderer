// Reuse the renderer's admitted submission-pass ceiling; this is capture
// coordination, not another quality/budget governor. Absolute ordinals persist.
export function nativeSampleChunks(samples,queueDepth,passLimit,enabled){
 if(![samples,queueDepth,passLimit].every(Number.isSafeInteger)||samples<1||samples>256||queueDepth<1||queueDepth>32||passLimit<1)throw Error('Invalid native submission bounds');
 const perSubmission=enabled?Math.max(1,Math.floor(passLimit/(queueDepth+2))):samples;
 const chunks=[];
 for(let firstSample=0;firstSample<samples;firstSample+=perSubmission)chunks.push({firstSample,sampleLimit:Math.min(samples,firstSample+perSubmission)});
 return chunks;
}
export function nativePhaseRanges(chunk,ranges){
 return ranges.flatMap((range,phaseIndex)=>{
  const firstSample=Math.max(range.firstSample,chunk.firstSample),sampleLimit=Math.min(range.sampleLimit,chunk.sampleLimit);
  return firstSample<sampleLimit?[{phaseIndex,initialize:firstSample===range.firstSample,firstSample,sampleLimit}]:[];
 });
}
