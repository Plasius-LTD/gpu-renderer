import {withRoomGlass,GLASS_WATER_DEFAULTS} from '/lighting/demo/eames-environments/glass-water-reference.js';
import {encodeLinearImageChunks} from '/lighting/demo/eames-environments/linear-image-chunks.js';
import {createPairedProbeRunner} from './adaptive-paired-runner.js';
import {hashBytes} from './original-eames-scene.js';
import {OPTICAL_ISOLATION as c,createOpticalIsolationScene,opticalIsolationPlan,opticalIsolationBudgets,opticalIsolationDepth,validateOpticalFurnace} from './optical-lighting-isolation.js';
const el=id=>document.getElementById(id);
el('run').addEventListener('click',async()=>{
 el('run').disabled=true;const report={status:'running',scope:'optical-attribution-not-scene-or-performance-qualification',lanes:[],failures:[]};
 const marker=document.createElement('canvas');marker.width=1;marker.height=1;let runner;
 const save=async(name,dataUrl,result)=>{
  const response=await fetch('/__plasius-capture',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:`output/playwright/eames-environments/${report.provenance.captureId}/${name}.png`,dataUrl,result}),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('Optical evidence retention failed');return response.json();
 };
 try{
  const depth=opticalIsolationDepth(location.search);
  const response=await fetch('/__provenance');if(!response.ok)throw Error('Missing provenance');report.provenance=await response.json();
  const receipt={scene:{camera:c.camera,floorY:c.floorY,glassWater:{settings:{...GLASS_WATER_DEFAULTS,mode:'filled',closeup:true,supportClearance:.0001}}}};
  report.settings={...c,depth};report.input=receipt;
  for(const lane of opticalIsolationPlan()){
   el('status').textContent='Preparing '+lane.name;
   const composed=createOpticalIsolationScene(withRoomGlass,receipt,lane,{depth}),canvas=el('canvas');canvas.width=c.width;canvas.height=c.height;
   const budgets=opticalIsolationBudgets(),abort=new AbortController();
   runner=await createPairedProbeRunner(composed.scene,abort.signal,{sampler:'fixed-pattern',boundedDielectricBranching:true,nestedMediaRefraction:true,native:{width:c.width,height:c.height,maximumSpp:c.spp,canvas,budgets}});
   const frame=await runner.run('uniform',{sampler:'fixed-pattern',seed:7,diagnostics:true,onProgress:p=>{el('status').textContent=lane.name+` · ${p.completedTiles}/${p.totalTiles} tiles`;}});
   const image=frame.image;delete frame.image;
   const retained={lane,settings:report.settings,provenance:report.provenance,scene:composed.evidence,frame,adapter:runner.adapter,hdrSha256:await hashBytes(image.buffer),chunks:[]};
   for await(const chunk of encodeLinearImageChunks(image))retained.chunks.push(await save(lane.name+'-hdr-'+retained.chunks.length,marker.toDataURL(),{chunk,provenance:report.provenance}));
   const png=canvas.toDataURL();
   runner.destroy();runner=null;retained.cleanupPassed=true;
   try{if(lane.furnace)retained.furnace=validateOpticalFurnace({...frame,image},c.spp);}catch(error){retained.failure=error.message;}
   retained.artifact=await save(lane.name,png,retained);report.lanes.push(retained);
   el('preview').src=png;el('preview').hidden=false;
   // Count/device/retention failures abort; a retained image-gate failure may
   // continue attribution, but can never turn this batch into a pass.
   if(retained.failure)report.failures.push(lane.name+': '+retained.failure);
  }
  report.status=report.failures.length?'failed':'controls-complete-image-review-pending';
 }catch(error){report.status='failed';report.failures.push(error.message);if(error.captureFailure)report.captureFailure=error.captureFailure;}
 finally{
  try{runner?.destroy();}catch(error){report.status='failed';report.failures.push(error.message);}
  try{await save('summary',marker.toDataURL(),report);}catch(error){report.status='failed';report.failures.push(error.message);}
  el('status').textContent=report.status;el('result').textContent=JSON.stringify(report,null,2);el('run').disabled=false;
 }
});
