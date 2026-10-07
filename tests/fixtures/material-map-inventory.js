const check=(v,m)=>{if(!v)throw Error('Material map audit: '+m);};
const hash=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');

// Read only the source JSON inventory, not geometry/image decoding. The existing
// gpu-shared loader remains the sole model loader; compare its decoded result.
export async function auditMaterialMaps(bytes,model){
 check(bytes instanceof ArrayBuffer&&bytes.byteLength>=20,'GLB header missing');
 const view=new DataView(bytes);
 check(view.getUint32(0,true)===0x46546c67&&view.getUint32(4,true)===2&&view.getUint32(8,true)===bytes.byteLength,'invalid GLB');
 const length=view.getUint32(12,true);
 check(view.getUint32(16,true)===0x4e4f534a&&length<=bytes.byteLength-20,'invalid JSON chunk');
 const document=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,length)));
 check(Array.isArray(model?.primitives)&&model.primitives.length,'missing decoded primitives');
 const records=[],cache=new Map();
 for(const primitive of model.primitives){
  const material=primitive.material,matches=(document.materials??[]).filter(m=>m.name===material?.name);
  check(matches.length===1,'source material name must resolve uniquely');const source=matches[0];
  const slots=Object.assign({},source,source.pbrMetallicRoughness,...Object.values(source.extensions??{}));
  const record={name:material.name,color:material.color,roughness:material.roughness,metallic:material.metallic,sheenColor:material.sheenColor,sheenRoughness:material.sheenRoughness,maps:{}};
  for(const [slot,ref] of Object.entries(slots)){
   if(!slot.endsWith('Texture')||!Number.isInteger(ref?.index))continue;
   const texture=material[slot],transform=ref.extensions?.KHR_texture_transform??{},uv=transform.texCoord??ref.texCoord??0;
   check(texture&&texture.data?.length===texture.width*texture.height*4,slot+' missing or malformed');
   check((uv===0&&primitive.uvs?.length)||(uv===1&&primitive.uvs1?.length),slot+' UV missing');
   check(texture.texCoord===uv,slot+' UV changed');
   const expected={offset:transform.offset??[0,0],scale:transform.scale??[1,1],rotation:transform.rotation??0};
   check(JSON.stringify(texture.transform)===JSON.stringify(expected),slot+' transform changed');
   check(texture.scale===ref.scale&&texture.strength===ref.strength,slot+' strength changed');
   const descriptor=document.textures?.[ref.index],sampler=document.samplers?.[descriptor?.sampler]??{};
   check(descriptor&&document.images?.[descriptor.source],slot+' source missing');
   check((texture.wrapS??10497)===(sampler.wrapS??10497)&&(texture.wrapT??10497)===(sampler.wrapT??10497),slot+' wrap changed');
   if(!cache.has(texture.data))cache.set(texture.data,await hash(Uint8Array.from(texture.data)));
   record.maps[slot]={sourceImage:descriptor.source,width:texture.width,height:texture.height,texCoord:uv,transform:expected,
    scale:texture.scale??1,strength:texture.strength??1,wrapS:texture.wrapS??10497,wrapT:texture.wrapT??10497,sha256:cache.get(texture.data)};
  }
  records.push(record);
 }
 return records;
}
