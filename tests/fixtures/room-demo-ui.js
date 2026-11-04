// Local demo recipes only. Renderer policy and camera construction stay in the
// existing GPU packages; pass their defaults instead of duplicating them here.
export function createRoomDemoPresets({maximumSpp,limit,centralReference,view,supportClearance}){
 const room={models:'all','central-reference':centralReference,'focus-view':view,
  'glass-mode':'off','glass-support-clearance':supportClearance,'bounded-dielectric':'off','nested-media':'off','rough-dielectric':'off','optical-interface-budget':'off',
  sheen:'off',denoise:'off','material-inspection':'off',clearcoat:'off','wood-coat':'off'};
 const quality=(spp,distribution)=>({spp,'sample-distribution':distribution,sampler:'fixed-pattern',splitting:'0'});
 return {
  scene:{
   room:{label:'Room overview',description:'Original room composition. Raw output; material and optical experiments off.',values:room},
   cloth:{label:'Upholstery study',description:'Sofa close-up with cloth sheen and guided denoise. Compare raw and cleaned output after rendering.',values:{...room,'central-reference':'seating','focus-view':'cloth',sheen:'on',denoise:'guided'}},
   glass:{label:'Glass and water',description:'Filled tumbler close-up with bounded branching and nested refraction. Experimental; optical quality is not yet qualified.',values:{...room,'glass-mode':'filled','focus-view':'glass','bounded-dielectric':'on','nested-media':'on'}},
  },
  quality:{
   adaptive:{label:`Adaptive · ${maximumSpp} SPP ceiling`,description:'Higher sampling in the centre, lower toward the edges.',values:quality(maximumSpp,'radial')},
   reference:{label:`Uniform · ${maximumSpp} SPP`,description:'Same camera-sample count at every pixel. More costly than adaptive.',values:quality(maximumSpp,'uniform')},
   detail:{label:`Detail · ${limit} SPP ceiling`,description:'High-detail adaptive screenshot. Can take several minutes; not a real-time mode.',values:quality(limit,'radial')},
  },
 };
}

export function roomFocusSettings(focus,{room,cloth,glass}){
 if(!['entry','front','corner','cloth','glass'].includes(focus))throw Error('Unknown room focus');
 return {
  view:['cloth','glass'].includes(focus)?room.view:focus,
  fovYDegrees:room.fovYDegrees,
  cloth:{...cloth,target:[...cloth.target],enabled:focus==='cloth'},
  glass:{closeup:focus==='glass',distance:glass.distance,elevation:glass.elevation},
 };
}

export function installRoomDemoUi(document,presets,onChange){
 const el=id=>document.getElementById(id);
 for(const group of ['scene','quality']){
  for(const [key,preset] of Object.entries(presets[group]))el(`${group}-${key}`).textContent=preset.label;
  el(`${group}-preset`).addEventListener('change',()=>{
   const select=el(`${group}-preset`);if(select.disabled)return;
   const preset=presets[group][select.value];
   if(!Object.hasOwn(presets[group],select.value))throw Error('Unknown room demo preset');
   for(const [id,value] of Object.entries(preset.values))el(id).value=String(value);
   onChange();refresh();
  });
 }
 function refresh(){
  for(const group of ['scene','quality']){
   const match=Object.entries(presets[group]).find(([,p])=>Object.entries(p.values).every(([id,v])=>el(id).value===String(v)));
   el(`${group}-preset`).value=match?.[0]??'custom';
   el(`${group}-description`).textContent=match?.[1].description??'Custom settings. Review Focus and advanced settings before rendering.';
  }
 }
 refresh();return {refresh};
}

export function revealInvalidControl(control){
 for(let parent=control.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
 return control.reportValidity();
}

export function setRoomPreviewState(document,state){
 const el=id=>document.getElementById(id);
 const labels={ready:'No render yet',stale:'Previous render · settings changed',rendering:'Rendering · please keep this tab visible',complete:'Current capture · experimental',failed:'Capture did not complete'};
 el('preview-state').textContent=labels[state];
 el('scene-panel').dataset.state=state;
}

export function invalidateRoomCaptureUi(document){
 const el=id=>document.getElementById(id);
 el('response-comparison').hidden=true;el('response-view').onchange=null;
 for(const id of ['comparison','show-albedo','show-normal','download'])el(id).hidden=true;
 el('download').removeAttribute('href');el('result').textContent='';
 el('status').textContent='Settings changed. Render to update the room view.';
 // Preserve the previous image for framing context, but never its download or
 // diagnostic controls: these would imply it belongs to the edited settings.
 setRoomPreviewState(document,el('preview').hidden?'ready':'stale');
}
