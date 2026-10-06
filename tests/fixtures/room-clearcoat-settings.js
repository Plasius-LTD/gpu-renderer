// Explicit local authoring variants, never renderer name-based material inference.
export const ROOM_COAT_DEFAULTS=Object.freeze({enabled:false,weight:1,roughness:.18,
 seatingSha256:'438b0c98b8d08a1ac79d0b75af7bd445e2e71a4743a9d62d60350e299a43f1e4'});
export function roomCoatSettings({enabled=ROOM_COAT_DEFAULTS.enabled,weight=ROOM_COAT_DEFAULTS.weight,roughness=ROOM_COAT_DEFAULTS.roughness}={}){
 if(typeof enabled!=='boolean')throw Error('Wood coat enabled must be boolean');
 for(const [name,value] of Object.entries({weight,roughness}))if(!Number.isFinite(value)||value<0||value>1)throw Error(`Wood coat ${name} must be finite in [0,1]`);
 return {enabled,weight,roughness};
}
export function withRoomWoodCoat(source,receipt,selection){
 const settings=roomCoatSettings(selection),overrides=[];
 receipt.woodCoat={...settings,originalAssetsUnchanged:true,scope:'explicit-local-material-variant',overrides};
 if(!settings.enabled)return source;
 const coatMaterial=(material,identity)=>{
  overrides.push({identity,authored:{clearcoat:material.clearcoat??0,clearcoatRoughness:material.clearcoatRoughness??0},
   variant:{clearcoat:settings.weight,clearcoatRoughness:settings.roughness},texturesUnchanged:true});
  return {...material,clearcoat:settings.weight,clearcoatRoughness:settings.roughness};
 };
 // The original Eames admission checks its manifest, nine primitives and four
 // fixture environment meshes. Only chair/ottoman wood primitives 1 and 5 change.
 if(source.eames.scene.meshes.length!==13)throw Error('Eames wood variant identity mismatch');
 const meshes=source.eames.scene.meshes.map((mesh,index)=>{
  if(index!==5&&index!==9)return mesh;
  if(mesh.material?.name!=='Eames_Lounge_Chair_Ottoman_Wood_')throw Error('Eames wood material identity mismatch');
  return {...mesh,material:coatMaterial(mesh.material,{asset:'verified-original-eames',primitive:index-4,material:mesh.material.name}),
   clearcoat:settings.weight,clearcoatRoughness:settings.roughness};
 });
 const referenceModels=(source.referenceModels??[]).map((entry,index)=>{
  if(index!==0)return entry; // The second, astronaut reference is untouched.
  if(entry.asset.sha256!==ROOM_COAT_DEFAULTS.seatingSha256)throw Error('Seating wood variant asset identity mismatch');
  let found=0;
  const primitives=entry.model.primitives.map((primitive,i)=>{
   if(primitive.material.name!=='wood Brown')return primitive;
   found++;
   return {...primitive,material:coatMaterial(primitive.material,{assetSha256:entry.asset.sha256,primitive:i,material:'wood Brown'})};
  });
  if(found!==1)throw Error('Seating wood material identity mismatch');
  return {...entry,model:{...entry.model,primitives}};
 });
 return {...source,eames:{...source.eames,scene:{...source.eames.scene,meshes}},referenceModels};
}
