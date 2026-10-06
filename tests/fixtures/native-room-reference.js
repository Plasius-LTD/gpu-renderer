import {createPairedProbeRunner} from "./adaptive-paired-runner.js";
import {loadOriginalEames,hashBytes} from "./original-eames-scene.js";
import {ROOM_DEFAULTS,composeRoomEamesScene,roomReferenceSettings,validateRoomFrame} from "/lighting/demo/eames-environments/room-eames.js";
import {createRadialSamplingPlan,radialSamplingTiers,RADIAL_SAMPLING_DEFAULTS,RADIAL_MAXIMUM_SPP} from "/lighting/demo/eames-environments/radial-sampling-plan.js";
import {encodeLinearImageChunks} from "/lighting/demo/eames-environments/linear-image-chunks.js";
import {compareDenoisedRadiance} from "/lighting/demo/eames-environments/guided-denoise-probe.js";
import {CLOTH_INSPECTION_DEFAULTS,clothCloseupCamera,selectInspectionPlan,validateInspectionFrame} from './cloth-inspection-settings.js';
import {CLOTH_RESPONSE_DEFAULTS} from './cloth-response-settings.js';
import {auditMaterialMaps} from './material-map-inventory.js';
import {ROOM_LIGHTING_DEFAULTS,withRoomLighting} from './room-lighting-settings.js';
import {ROOM_COAT_DEFAULTS,withRoomWoodCoat} from './room-clearcoat-settings.js';

const check=(v,m)=>{if(!v)throw new Error(m);};
const el=id=>document.getElementById(id),run=el("run"),reset=el("reset"),cancel=el("cancel"),status=el("status"),result=el("result"),preview=el("preview"),download=el("download"),canvas=el("canvas");
const controls=[...el("controls").querySelectorAll("input,select"),el("benchmark"),el('cloth-response')];
function lightingSelection(){return {style:el('lighting-style').value,intensity:el('lighting-intensity').valueAsNumber};}
function resetLighting(){el('lighting-style').value=ROOM_LIGHTING_DEFAULTS.style;el('lighting-intensity').value=ROOM_LIGHTING_DEFAULTS.intensity;}
el('lighting-intensity').min=String(ROOM_LIGHTING_DEFAULTS.minimumIntensity);el('lighting-intensity').max=String(ROOM_LIGHTING_DEFAULTS.maximumIntensity);
resetLighting();
function resetCoat(){el('clearcoat').value='off';el('wood-coat').value='off';el('coat-weight').value=ROOM_COAT_DEFAULTS.weight;el('coat-roughness').value=ROOM_COAT_DEFAULTS.roughness;}
function coatSelection(){return {enabled:el('wood-coat').value==='on',weight:el('coat-weight').valueAsNumber,roughness:el('coat-roughness').valueAsNumber};}
resetCoat();
el('central-reference').value=ROOM_DEFAULTS.centralReference;
el('spp').min='1';el('spp').max=String(RADIAL_MAXIMUM_SPP);el('spp').value=String(RADIAL_SAMPLING_DEFAULTS.maximumSpp);
function resetInspection(){el('inspection-camera').value='room';el('sample-distribution').value='radial';el('material-inspection').value='off';
 el('response-elevation').value=CLOTH_RESPONSE_DEFAULTS.elevation;el('response-intensity').value=CLOTH_RESPONSE_DEFAULTS.intensity;
 el('inspection-distance').value=CLOTH_INSPECTION_DEFAULTS.distance;el('inspection-elevation').value=CLOTH_INSPECTION_DEFAULTS.elevation;
 for(const [i,axis] of ['x','y','z'].entries())el('inspection-target-'+axis).value=CLOTH_INSPECTION_DEFAULTS.target[i];}
resetInspection();
function describeSampling(){
 if(!el('spp').checkValidity()){el('sampling-description').textContent=`Choose an integer ceiling from 1 to ${RADIAL_MAXIMUM_SPP}.`;return;}
 if(el('sample-distribution').value==='uniform'){el('sampling-description').textContent=`Uniform ${el('spp').value} camera samples at every pixel; no radial reductions.`;return;}
 const tiers=radialSamplingTiers(el('spp').valueAsNumber),shares=RADIAL_SAMPLING_DEFAULTS.areaPercent;
 el('sampling-description').textContent=`${tiers.join('/')} SPP rings (${(tiers.reduce((sum,n,i)=>sum+n*shares[i],0)/100).toFixed(2)} average); ${shares.join('/')}% of pixels. Integer sample counts round upwards, with a minimum of one.`;
}
describeSampling();
let cancellation,assets,comparison;
function showComparison(clean){if(!comparison)return;const image=clean?comparison.clean:comparison.raw;preview.src=image;download.href=image;download.download=comparison.stem+(clean?'-guided':'-raw')+'.png';el('comparison-label').textContent=clean?'Cleaned · same camera samples':'Raw · same camera samples';}
el('show-raw').addEventListener('click',()=>showComparison(false));el('show-clean').addEventListener('click',()=>showComparison(true));
for(const mode of ['albedo','normal'])el('show-'+mode).addEventListener('click',()=>{if(!comparison?.[mode])return;preview.src=comparison[mode];download.href=comparison[mode];download.download=comparison.stem+'-'+mode+'.png';el('comparison-label').textContent=mode==='albedo'?'Base colour · no lighting / tone mapping · single first sample':'Mapped world normals · magenta = unavailable · single first sample';});
function clearCapture(){describeSampling();comparison=null;el('response-comparison').hidden=true;el('response-view').onchange=null;el('comparison').hidden=true;el('show-albedo').hidden=true;el('show-normal').hidden=true;preview.hidden=true;preview.removeAttribute("src");download.hidden=true;download.removeAttribute("href");result.textContent="";status.textContent="Settings changed. Render to update the room view.";}
for(const control of controls){
 control.addEventListener("change",clearCapture);
 control.addEventListener("input",clearCapture);
}
reset.addEventListener("click",()=>{
 resetCoat();
 resetLighting();
 resetInspection();
 el('sheen').value='off';
 el('central-reference').value=ROOM_DEFAULTS.centralReference;
 el('fov').value=ROOM_DEFAULTS.fovYDegrees;el('models').value='all';
 el('spp').value=String(RADIAL_SAMPLING_DEFAULTS.maximumSpp);
 el("chair-x").value=ROOM_DEFAULTS.x;el("chair-z").value=ROOM_DEFAULTS.z;el("chair-yaw").value=ROOM_DEFAULTS.yaw;
 el("view").value=ROOM_DEFAULTS.view;el("resolution").value="1080p";el("sampler").value="fixed-pattern";el("splitting").value="0";el('denoise').value='off';clearCapture();
});
cancel.addEventListener("click",()=>cancellation?.abort());
export async function loadAssets(receipt,signal){
 const sourceKey=JSON.stringify([receipt.provenance.sources,receipt.provenance.assets]);
 if(assets){check(assets.sourceKey===sourceKey,'Server sources changed; reload this page before rendering');receipt.eamesSource=assets.eamesSource;receipt.referenceMaterialMaps=assets.referenceMaterialMaps;return withRoomLighting(assets,receipt,lightingSelection());}
 const [{loadGltfModel},{createProductStudioMeshes},{createWavefrontEnvironmentLightingOptions}]=await Promise.all([
  import("/shared/src/gltf-loader.js"),import("/shared/src/product-studio-runtime.js"),import("/lighting/src/index.js")]);
 const manifestResponse=await fetch('/__room-manifest.json',{signal:AbortSignal.any([signal,AbortSignal.timeout(10000)])});
 check(manifestResponse.ok,'Room manifest missing');const roomAsset=await manifestResponse.json();
 if(receipt.provenance.assets?.room)check(roomAsset.sha256===receipt.provenance.assets.room.sha256,'Room provenance mismatch');
 const response=await fetch("/__room-model.glb",{signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});
 check(response.ok,"Room asset missing");const bytes=await response.arrayBuffer();
 check(bytes.byteLength===roomAsset.bytes&&await hashBytes(bytes)===roomAsset.sha256,"Room checksum mismatch");
 const objectUrl=URL.createObjectURL(new Blob([bytes],{type:"model/gltf-binary"}));let room;
 try{room=await loadGltfModel(objectUrl);}finally{URL.revokeObjectURL(objectUrl);}
 check(!signal.aborted,"Loading cancelled");
 const extraResponse=await fetch('/__reference-models.json',{signal:AbortSignal.any([signal,AbortSignal.timeout(10000)])});
 check(extraResponse.ok,'Reference model manifest missing');const manifests=await extraResponse.json();
 check(Array.isArray(manifests)&&manifests.length<=2,'Invalid reference model list');
 check(JSON.stringify(manifests)===JSON.stringify(receipt.provenance.assets?.models??[]),'Reference model provenance mismatch');
 const referenceModels=[],referenceMaterialMaps=[];
 for(const [i,asset] of manifests.entries()){
  const response=await fetch(`/__reference-model-${i}.glb`,{signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});
  check(response.ok,'Reference model missing');const bytes=await response.arrayBuffer();
  check(bytes.byteLength===asset.bytes&&await hashBytes(bytes)===asset.sha256,'Reference model checksum mismatch');
  const url=URL.createObjectURL(new Blob([bytes],{type:'model/gltf-binary'}));let model;
  try{model=await loadGltfModel(url);}finally{URL.revokeObjectURL(url);}
  referenceMaterialMaps.push({assetSha256:asset.sha256,materials:await auditMaterialMaps(bytes,model)});
  check(!signal.aborted,'Loading cancelled');referenceModels.push({model,asset});
 }
 const eames=await loadOriginalEames(receipt,signal,{maxDepth:6});receipt.eamesSource=receipt.scene;
 el('room-name').textContent=roomAsset.name;document.title=`Eames inside ${roomAsset.name} · GPU reference`;
 el('model-names').textContent=referenceModels.length?`Available: Eames + ${referenceModels.map(m=>m.asset.name).join(' + ')}. Private assets; default material variants.`:'Available: Eames only; no additional local models supplied.';
 receipt.referenceMaterialMaps=referenceMaterialMaps;
 assets={room,roomAsset,eames,referenceModels,referenceMaterialMaps,sourceKey,createProductStudioMeshes,createWavefrontEnvironmentLightingOptions,eamesSource:receipt.eamesSource};return withRoomLighting(assets,receipt,lightingSelection());
}
export function roomCompositionControls(source){return {placement:{x:el('chair-x').valueAsNumber,z:el('chair-z').valueAsNumber,yaw:el('chair-yaw').valueAsNumber},view:el('view').value,fovYDegrees:el('fov').valueAsNumber,centralReference:el('central-reference').value,referenceModels:el('models').value==='all'?source.referenceModels:[]};}
function closeupControls(){return {enabled:el('inspection-camera').value==='cloth',distance:el('inspection-distance').valueAsNumber,elevation:el('inspection-elevation').valueAsNumber,target:['x','y','z'].map(axis=>el('inspection-target-'+axis).valueAsNumber)};}
run.addEventListener("click",async()=>{
 for(const control of controls)if(!control.checkValidity()){control.reportValidity();status.textContent="Invalid settings. Check the highlighted field.";return;}
 const settings=roomReferenceSettings(el("resolution").value,el("sampler").value,el('spp').valueAsNumber),view=el("view").value;
 const splitDepth=Number(el("splitting").value);
 const guidedDenoise=el('denoise').value==='guided';
 const sheen=el('sheen').value==='on';
 const layeredClearcoat=el('clearcoat').value==='on',woodCoat=coatSelection();
 if(woodCoat.enabled&&!layeredClearcoat){status.textContent='Enable the layered clearcoat renderer before adding the wood varnish variant.';return;}
 const distribution=el('sample-distribution').value,materialInspection=el('material-inspection').value==='on';
 const closeup=closeupControls();
 if(materialInspection&&!guidedDenoise){status.textContent='Select guided denoising to capture material inspection views.';return;}
 if(splitDepth&&settings.sampler!=="stable-pattern"){status.textContent="Select the stable sampler to test splitting.";return;}
 const placement={x:el("chair-x").valueAsNumber,z:el("chair-z").valueAsNumber,yaw:el("chair-yaw").valueAsNumber};
 clearCapture();run.disabled=true;reset.disabled=true;controls.forEach(c=>c.disabled=true);cancel.disabled=false;
 cancellation=new AbortController();let runner;
 const receipt={schemaVersion:1,scope:"room-eames-interior-reference",status:"running",settings,splitDepth,view,placement,timestamp:new Date().toISOString(),
  browser:{userAgent:navigator.userAgent,platform:navigator.platform},failures:[],qualification:"visual-reference-only-not-performance-or-convergence"};
 receipt.materialFlags={'renderer.materials.sheen.enabled':sheen,'renderer.materials.layeredClearcoat.enabled':layeredClearcoat};
 receipt.inspection={closeup,distribution,materialViews:materialInspection};
 const lightingIdentity=lightingSelection().style+(layeredClearcoat?'-layered-coat':'')+(woodCoat.enabled?`-varnish${woodCoat.weight}-rough${woodCoat.roughness}`:'');
 const stem=`room-eames-${settings.width}x${settings.height}-${settings.sampler}-${settings.maxDepth}-bounces${splitDepth?'-split'+splitDepth:''}${settings.maximumSpp!==RADIAL_SAMPLING_DEFAULTS.maximumSpp?'-spp'+settings.maximumSpp:''}${el('central-reference').value==='seating'&&el('models').value==='all'?'-seating-centre':''}${sheen?'-sheen':''}${closeup.enabled?'-closeup':''}${distribution==='uniform'?'-uniform':''}-${lightingIdentity}`,marker=document.createElement("canvas");marker.width=32;marker.height=32;
 const save=async(name,dataUrl,payload)=>{
  const response=await fetch("/__plasius-capture",{method:"POST",headers:{"content-type":"application/json"},signal:AbortSignal.timeout(30000),
   body:JSON.stringify({path:`output/playwright/eames-environments/${receipt.provenance.captureId}/${name}.png`,dataUrl,result:payload})});
  check(response.ok,"Capture retention failed");return response.json();
 };
 try{
  status.textContent="Loading original room and Eames assets";
  const response=await fetch("/__provenance",{signal:AbortSignal.timeout(10000)});check(response.ok,"Missing provenance");receipt.provenance=await response.json();
  if(guidedDenoise){status.textContent='Checking denoiser against analytic HDR/edge/noise probes';const {runGuidedDenoiseProbe}=await import('./guided-denoise-probe.js');receipt.denoiseProbe=await runGuidedDenoiseProbe(cancellation.signal);}
  if(materialInspection){const {runClothInspectionProbe}=await import('./cloth-inspection-probe.js');receipt.inspection.probe=await runClothInspectionProbe(cancellation.signal);}
  status.textContent='Checking UV0/UV1 texture sampling and CPU/GPU geometry parity';
  const {runDualUvProbe}=await import('./dual-uv-probe.js');receipt.uvProbe=await runDualUvProbe(cancellation.signal);
  status.textContent='Checking sidedness, medium exits and normal-map validity';
  const {runSurfaceValidityProbe}=await import('./surface-validity-probe.js');receipt.surfaceProbe=await runSurfaceValidityProbe(cancellation.signal);
  status.textContent='Checking transformed textures, sheen and mapped-normal cloth detail';
  const {runMaterialFidelityProbe}=await import('./material-fidelity-probe.js');receipt.materialProbe=await runMaterialFidelityProbe(cancellation.signal);
  const source=withRoomWoodCoat(await loadAssets(receipt,cancellation.signal),receipt,woodCoat),composed=composeRoomEamesScene({...source,...roomCompositionControls(source)});receipt.scene=composed.evidence;
  composed.scene.camera=clothCloseupCamera(composed.scene,composed.evidence,closeup);receipt.scene.camera={...composed.scene.camera};
  check(!cancellation.signal.aborted,"Capture cancelled");
  const plan=selectInspectionPlan(distribution,createRadialSamplingPlan(settings.width,settings.height,settings.maximumSpp),settings.maximumSpp);
  receipt.budgets={bands:plan.bands,meanSpp:plan.meanSpp,totalSamples:plan.totalSamples,sha256:await hashBytes(plan.budgets.buffer)};
  canvas.width=settings.width;canvas.height=settings.height;status.textContent="Preparing the composed room renderer";
  runner=await createPairedProbeRunner(composed.scene,cancellation.signal,{splitDepth,guidedDenoise,sheen,layeredClearcoat,sampler:settings.sampler,native:{width:settings.width,height:settings.height,maximumSpp:settings.maximumSpp,canvas,budgets:plan.budgets}});
  check(runner.sceneSnapshot.triangleCount===composed.evidence.sceneTriangleCount&&runner.sceneSnapshot.maxDepth===settings.maxDepth&&runner.sceneSnapshot.samplesPerPixel===settings.maximumSpp&&runner.sceneSnapshot.bvhNodeCount>0&&runner.sceneSnapshot.displayQuality===true,"Composed GPU scene admission failed");
  receipt.admission=runner.sceneSnapshot;receipt.adapter=runner.adapter;receipt.memory=runner.memory;
  const frame=await runner.run(distribution,{sampler:settings.sampler,seed:7,diagnostics:true,profile:true,onProgress:p=>{
   status.textContent=`Rendering room · ${p.completedTiles}/${p.totalTiles} tiles completed`;
  }});
  if(distribution==='radial')validateRoomFrame(frame,plan,settings);
  validateInspectionFrame(frame,plan,settings,distribution);let snapshot=canvas.toDataURL("image/png");const rawSnapshot=snapshot,image=frame.image;delete frame.image;receipt.frame=frame;
  if(guidedDenoise){
   status.textContent='Denoising and measuring the same completed frame';
   const post=runner.guidedPostprocess;
   receipt.guidedDenoise={flag:'renderer.denoise.guidedSpatial.enabled',enabled:true,memory:post.memory,timings:[],guideDispatches:runner.tiles,guideCost:'Included in tile render intervals, not isolated',rawPng:await save(stem+'-raw',rawSnapshot,{provenance:receipt.provenance,settings,splitDepth,raw:true})};
   await post.apply(false);await post.apply(true); // one warmup per presentation mode
   for(let round=0;round<5;round++)for(const filtered of round%2?[true,false]:[false,true])receipt.guidedDenoise.timings.push({round,...await post.apply(filtered)});
   await post.apply(true);snapshot=canvas.toDataURL('image/png');
   const filtered=await post.readTexture(post.denoiser.filteredView),rawTexture=await post.readTexture(post.rawView);
   receipt.guidedDenoise.comparison=compareDenoisedRadiance(rawTexture,filtered);
   receipt.guidedDenoise.rawTextureSha256=await hashBytes(rawTexture.buffer);
   receipt.guidedDenoise.filteredSha256=await hashBytes(filtered.buffer);
   receipt.guidedDenoise.filteredHdrChunks=[];let n=0;
   for await(const chunk of encodeLinearImageChunks(filtered))receipt.guidedDenoise.filteredHdrChunks.push(await save(`${stem}-guided-hdr-${n++}`,marker.toDataURL(),{provenance:receipt.provenance,chunk}));
   comparison={raw:rawSnapshot,clean:snapshot,stem};
   if(materialInspection){
    status.textContent='Retaining same-frame colour and mapped-normal inspection';
    receipt.inspection.additionalBufferBytes=16;receipt.inspection.additionalTextureBytes=0;
    receipt.inspection.scope='first-sample canonical denoiser guides; albedo RGBA8 linear, normals RGBA16 world-space; protected normals unavailable';
    receipt.inspection.views={};
    for(const mode of ['albedo','normal']){
     const data=await post.readTexture((mode==='albedo'?post.denoiser.albedoTexture:post.denoiser.normalTexture).createView());
     const sha256=await hashBytes(data.buffer);const chunks=[];let n=0;
     for await(const chunk of encodeLinearImageChunks(data))chunks.push(await save(`${stem}-${mode}-data-${n++}`,marker.toDataURL(),{provenance:receipt.provenance,chunk}));
     await post.inspect(mode);comparison[mode]=canvas.toDataURL('image/png');
     receipt.inspection.views[mode]={sha256,chunks,png:await save(stem+'-'+mode,comparison[mode],{provenance:receipt.provenance,inspection:receipt.inspection.scope,camera:receipt.scene.camera,mode})};
    }
    check(await hashBytes((await post.readTexture(post.rawView)).buffer)===receipt.guidedDenoise.rawTextureSha256,'Inspection changed raw HDR');
    check(await hashBytes((await post.readTexture(post.denoiser.filteredView)).buffer)===receipt.guidedDenoise.filteredSha256,'Inspection changed filtered HDR');
    receipt.inspection.radianceUnchanged=true;el('show-albedo').hidden=false;el('show-normal').hidden=false;
    await post.apply(true);
   }
  }
  receipt.linearImage={sha256:await hashBytes(image.buffer),format:"rgba-float32-little-endian",uncompressedBytes:image.byteLength,chunks:[]};
  status.textContent="Retaining native image and linear HDR evidence";let index=0;
  for await(const chunk of encodeLinearImageChunks(image)){
   check(!cancellation.signal.aborted,"Cancelled during retention");
   const artifact=await save(`${stem}-hdr-${index++}`,marker.toDataURL(),{provenance:receipt.provenance,chunk});
   receipt.linearImage.chunks.push({byteOffset:chunk.byteOffset,byteLength:chunk.byteLength,sha256:chunk.sha256,artifact});
  }
  runner.destroy();runner=null;receipt.cleanupPassed=true;receipt.status="captured-reference-not-qualified";
  await save(stem+(guidedDenoise?'-guided':''),snapshot,receipt);
  preview.alt=`${closeup.enabled?'Sofa cloth close-up':'Eames room view'} inside ${source.roomAsset.name}, ${settings.width} by ${settings.height}, ${distribution}, ${settings.sampler}`;preview.src=snapshot;preview.hidden=false;
  download.download=stem+".png";download.href=snapshot;download.hidden=false;
  if(guidedDenoise){el('comparison').hidden=false;showComparison(true);}
 }catch(error){
  receipt.status="failed";receipt.failures.push(error.message);
  if(receipt.provenance)try{await save("failed-room-reference",marker.toDataURL(),receipt);}catch(retentionError){receipt.failures.push(retentionError.message);}
 }finally{
  try{runner?.destroy();}catch(error){receipt.status="failed";receipt.failures.push(error.message);clearCapture();}
  cancellation.abort();run.disabled=false;reset.disabled=false;controls.forEach(c=>c.disabled=false);cancel.disabled=true;
  status.textContent=receipt.status==="failed"?`Failed: ${receipt.failures.join("; ")}`:`Captured room + Eames · ${settings.width} × ${settings.height} · ${settings.maximumSpp} SPP ceiling · ${receipt.frame.actualSamples.toLocaleString()} camera samples · ${guidedDenoise?'guided denoise comparison':'raw'} · not quality-qualified`;
  result.textContent=JSON.stringify({status:receipt.status,settings,splitDepth,scene:receipt.scene,admission:receipt.admission,actualSamples:receipt.frame?.actualSamples,
   inspection:receipt.inspection,materialFlags:receipt.materialFlags,materialProbe:receipt.materialProbe,guidedDenoise:receipt.guidedDenoise,denoiseProbe:receipt.denoiseProbe,uvProbe:receipt.uvProbe,surfaceProbe:receipt.surfaceProbe,linearSha256:receipt.linearImage?.sha256,cleanupPassed:receipt.cleanupPassed,provenance:receipt.provenance,failures:receipt.failures},null,2);
 }
});

el('benchmark').addEventListener('click',async()=>{
 const {runRoomSplittingBenchmark}=await import('./native-room-splitting.js');
 await runRoomSplittingBenchmark({loadAssets,clearCapture,roomCompositionControls});
});
el('cloth-response').addEventListener('click',async()=>{
 const {runRoomClothResponse}=await import('./native-room-cloth-response.js');
 await runRoomClothResponse({loadAssets,clearCapture,roomCompositionControls,closeupControls});
});
