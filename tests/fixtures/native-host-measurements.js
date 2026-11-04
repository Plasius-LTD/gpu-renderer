export function compareHostDiagnosticFrames(baseline,candidate){
 const check=(v,m)=>{if(!v)throw Error('Host comparison: '+m);};
 check(baseline?.image instanceof Float32Array&&candidate?.image instanceof Float32Array&&baseline.image.length===baseline.width*baseline.height*4&&candidate.image.length===baseline.image.length,'invalid image extent');
 for(const key of ['width','height','maximumSpp','sampler','seed','mode','maximumPathEvents','actualSamples','validationErrors'])check(baseline[key]===candidate[key],'changed '+key);
 check(baseline.diagnostics===true&&candidate.diagnostics===true&&baseline.fused===false&&candidate.fused===false&&baseline.validationErrors===0&&
  [baseline,candidate].every(f=>f.visibilityBefore==='visible'&&f.visibilityAfter==='visible'),'invalid diagnostic/visibility');
 check(JSON.stringify(baseline.actualHistogram)===JSON.stringify(candidate.actualHistogram)&&JSON.stringify(baseline.opticalInterfaceBudget)===JSON.stringify(candidate.opticalInterfaceBudget),'histogram/optical mismatch');
 check(baseline.tiles?.length>0&&baseline.tiles.length===candidate.tiles?.length,'tile mismatch');
 let primary=0,secondary=0,segments=0;
 for(let i=0;i<baseline.image.length;i++){check(Number.isFinite(baseline.image[i])&&baseline.image[i]>=0&&baseline.image[i]===candidate.image[i],'HDR mismatch at '+i);if(i%4===3)check(baseline.image[i]===1,'incomplete pixel');}
 for(let i=0;i<baseline.tiles.length;i++){
  const a=baseline.tiles[i],b=candidate.tiles[i],r=a.telemetry?.rayCounts,s=b.telemetry?.rayCounts;
  check(a.tileIndex===b.tileIndex&&JSON.stringify(a.tile)===JSON.stringify(b.tile)&&a.expectedPrimaryRays===b.expectedPrimaryRays,'tile identity mismatch');
  check(r?.status==='available'&&s?.status==='available','ray telemetry missing');
  for(const key of ['observedPrimaryRays','secondaryRays','totalPathSegments','additionalOpticalSegments','queuePathSegments','bounceHistogram'])check(JSON.stringify(r[key])===JSON.stringify(s[key]),'ray mismatch: '+key);
  primary+=r.observedPrimaryRays;secondary+=r.secondaryRays;segments+=r.totalPathSegments;
 }
 check(primary===baseline.actualSamples&&segments===primary+secondary,'incomplete aggregate');
 return {exactHdr:true,exactCompletedSamples:true,exactRays:true,primaryRays:primary,secondaryRays:secondary,totalPathSegments:segments};
}
