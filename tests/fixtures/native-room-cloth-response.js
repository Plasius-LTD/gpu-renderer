import {createPairedProbeRunner} from './adaptive-paired-runner.js';
import {hashBytes} from './original-eames-scene.js';
import {clothCloseupCamera} from './cloth-inspection-settings.js';
import {clothResponseSettings} from './cloth-response-settings.js';
import {composeRoomEamesScene,roomReferenceSettings} from '/lighting/demo/eames-environments/room-eames.js';
import {encodeLinearImageChunks} from '/lighting/demo/eames-environments/linear-image-chunks.js';
const el=id=>document.getElementById(id),check=(v,m)=>{if(!v)throw Error(m);};
let busy=false;
export async function runRoomClothResponse({loadAssets,clearCapture,roomCompositionControls,closeupControls}){
 if(busy)return;busy=true;
 const abort=new AbortController(),stop=()=>abort.abort(),locked=[...document.querySelectorAll('#controls input,#controls select,#run,#reset,#benchmark,#cloth-response')];
 const report={schemaVersion:1,scope:'cloth-normal-response-diagnostic',status:'running',failures:[],timestamp:new Date().toISOString()};let runner;
 const marker=document.createElement('canvas');marker.width=32;marker.height=32;
 const save=async(name,payload,dataUrl=marker.toDataURL())=>{
  const response=await fetch('/__plasius-capture',{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(30000),body:JSON.stringify({
   path:`output/playwright/eames-environments/${report.provenance.captureId}/${name}.png`,dataUrl,result:payload})});
  check(response.ok,'Cannot retain cloth diagnostic');return response.json();
 };
 try{
  for(const control of locked)if(!control.checkValidity()){control.reportValidity();throw Error('Invalid diagnostic settings');}
  check(el('models').value==='all','Cloth diagnostic requires the supplied seating model');
  clearCapture();locked.forEach(c=>c.disabled=true);el('cancel').disabled=false;el('cancel').addEventListener('click',stop);
  const settings=roomReferenceSettings(el('resolution').value,'stable-pattern',el('spp').valueAsNumber);report.settings=settings;
  const response=await fetch('/__provenance',{signal:AbortSignal.timeout(10000)});check(response.ok,'Missing provenance');report.provenance=await response.json();
  el('status').textContent='Preparing canonical cloth response diagnostic';
  const source=await loadAssets(report,abort.signal),composed=composeRoomEamesScene({...source,...roomCompositionControls(source)});
  report.closeup=closeupControls();composed.scene.camera=clothCloseupCamera(composed.scene,composed.evidence,report.closeup);
  report.scene={...composed.evidence,camera:composed.scene.camera};
  const seating=composed.evidence.referenceModels[0];
  const start=composed.scene.meshes.length-composed.evidence.referenceModels.reduce((n,m)=>n+m.asset.primitives,0);
  const meshIds=composed.scene.meshes.slice(start,start+seating.asset.primitives).filter(m=>m.normalTexture&&m.sheenColor?.some(v=>v>0)).map(m=>m.id);
  check(meshIds.length>0,'No normal-mapped cloth material in seating model');
  report.light=clothResponseSettings({elevation:el('response-elevation').valueAsNumber,intensity:el('response-intensity').valueAsNumber,yaw:seating.placement.yaw,samples:settings.maximumSpp});
  report.sheen=el('sheen').value==='on';report.cameraSampler='stable-pattern';
  const canvas=el('canvas');canvas.width=settings.width;canvas.height=settings.height;
  runner=await createPairedProbeRunner(composed.scene,abort.signal,{sheen:report.sheen,sampler:'stable-pattern',native:{...settings,canvas,budgets:new Uint16Array(settings.width*settings.height).fill(settings.maximumSpp)}});
  report.adapter=runner.adapter;report.rendererSetupMemory=runner.memory;
  const {images,report:diagnostic}=await runner.inspectClothResponse({settings:report.light,meshIds,onProgress:p=>{el('status').textContent=`Cloth response · ${p.completedTiles}/${p.totalTiles} tiles · no indirect lighting or denoising`;}});
  report.diagnostic=diagnostic;runner.destroy();runner=null;report.cleanupPassed=true;
  const labels=['centre-on','centre-off','sampled-on','sampled-off'],pngs=[];report.views=[];
  const display=document.createElement('canvas');display.width=settings.width;display.height=settings.height;const context=display.getContext('2d');
  for(const [i,image] of images.entries()){
   check(!abort.signal.aborted,'Diagnostic cancelled');el('status').textContent=`Retaining cloth comparison · ${labels[i]}`;
   const pixels=new Uint8ClampedArray(image.length);
   // Exact current renderer tone-map expression; linear HDR is retained separately.
   for(let k=0;k<image.length;k++)pixels[k]=k%4===3?255:255*Math.pow(image[k]/(1+image[k]),1/2.2);
   context.putImageData(new ImageData(pixels,settings.width,settings.height),0,0);pngs.push(display.toDataURL());
   const name=`cloth-response-${settings.width}x${settings.height}-${settings.maximumSpp}spp-e${report.light.elevation}-${labels[i]}`;
   const view={label:labels[i],sha256:await hashBytes(image.buffer),uncompressedBytes:image.byteLength,chunks:[]};let n=0;
   for await(const chunk of encodeLinearImageChunks(image)){
    check(!abort.signal.aborted,'Diagnostic cancelled during retention');view.chunks.push(await save(name+'-hdr-'+n++,{provenance:report.provenance,chunk}));
   }
   view.png=await save(name,{provenance:report.provenance,settings,light:report.light,scope:diagnostic.scope},pngs[i]);report.views.push(view);
  }
  report.status='diagnosed-not-qualified';await save('cloth-response-report',report);
  const selector=el('response-view');selector.value='2';
  const show=()=>{const i=Number(selector.value);el('preview').src=pngs[i];el('preview').hidden=false;el('preview').alt=`Cloth diagnostic: ${labels[i]}, one unoccluded directional light, not full transport`;el('download').href=pngs[i];el('download').download=`cloth-${labels[i]}.png`;el('download').hidden=false;};
  selector.onchange=show;el('response-comparison').hidden=false;show();
 }catch(error){report.status='failed';report.failures.push(error.message);}
 finally{
  try{runner?.destroy();}catch(error){report.status='failed';report.failures.push(error.message);}
  if(report.status==='failed'&&report.provenance)try{await save('failed-cloth-response',report);}catch(error){report.failures.push(error.message);}
  abort.abort();locked.forEach(c=>c.disabled=false);el('cancel').disabled=true;el('cancel').removeEventListener('click',stop);busy=false;
  el('status').textContent=report.status==='failed'?`Failed: ${report.failures.join('; ')}`:'Cloth diagnostic retained · compare all four views · no shadows, indirect lighting or denoising';
  el('result').textContent=JSON.stringify(report,null,2);
 }
}
