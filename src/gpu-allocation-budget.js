// Accounts for requested WebGPU resource storage, not driver overhead or free VRAM.
const formats = Object.freeze({
  r8unorm:1, r8snorm:1, r8uint:1, r8sint:1,
  rg8unorm:2, rg8snorm:2, rg8uint:2, rg8sint:2, r16float:2, r16uint:2, r16sint:2,
  rgba8unorm:4, 'rgba8unorm-srgb':4, bgra8unorm:4, 'bgra8unorm-srgb':4,
  rgba8snorm:4, rgba8uint:4, rgba8sint:4, rg16float:4, rg16uint:4, rg16sint:4,
  r32float:4, r32uint:4, r32sint:4, rgb10a2unorm:4, rg11b10ufloat:4,
  rgba16float:8, rgba16uint:8, rgba16sint:8, rg32float:8, rg32uint:8, rg32sint:8,
  rgba32float:16, rgba32uint:16, rgba32sint:16,
});
function integer(value, name, minimum=1) {
  if(!Number.isSafeInteger(value)||value<minimum) throw new Error(`${name} must be a safe integer >= ${minimum}.`);
  return value;
}
function within(value,limit,name) {
  if(Number.isFinite(limit)&&value>limit) throw new Error(`GPU ${name} limit exceeded: requested ${value}, available ${limit}.`);
}
function textureBytes(descriptor,limits) {
  const size=descriptor.size;
  const array=Array.isArray(size)||ArrayBuffer.isView(size);
  const width=integer(array?size[0]:size?.width,'Texture width');
  const height=integer((array?size[1]:size?.height)??1,'Texture height');
  const layers=integer((array?size[2]:size?.depthOrArrayLayers)??1,'Texture depth/layers');
  const dimension=descriptor.dimension??'2d';
  if(!['1d','2d','3d'].includes(dimension)) throw new Error('Unsupported GPU texture dimension.');
  const limit=limits[dimension==='3d'?'maxTextureDimension3D':dimension==='1d'?'maxTextureDimension1D':'maxTextureDimension2D'];
  within(Math.max(width,height,dimension==='3d'?layers:1),limit,'texture dimension');
  if(dimension!=='3d') within(layers,limits.maxTextureArrayLayers,'texture layers');
  const bpp=formats[descriptor.format];
  if(!bpp) throw new Error(`GPU memory accounting does not support texture format ${descriptor.format}.`);
  const levels=integer(descriptor.mipLevelCount??1,'Mip count');
  const samples=integer(descriptor.sampleCount??1,'Sample count');
  if(levels>Math.floor(Math.log2(Math.max(width,height,dimension==='3d'?layers:1)))+1) throw new Error('Invalid texture mip count.');
  let bytes=0;
  for(let level=0;level<levels;level++) bytes+=Math.max(1,Math.floor(width/2**level))*Math.max(1,Math.floor(height/2**level))*
    (dimension==='3d'?Math.max(1,Math.floor(layers/2**level)):layers)*bpp*samples;
  return integer(bytes,'Texture allocation');
}

export function createGpuAllocationTracker(rawDevice,{budgetBytes,storageUsage=globalThis.GPUBufferUsage?.STORAGE??128}={}) {
  if(budgetBytes!==undefined) integer(budgetBytes,'GPU memory budget');
  const records=new Map();let allocatedBytes=0,peakAllocatedBytes=0;
  function allocate(kind,descriptor,bytes,create) {
    integer(bytes,'GPU allocation',0);
    const total=integer(allocatedBytes+bytes,'GPU allocation total',0);
    if(budgetBytes!==undefined&&total>budgetBytes) throw new Error(`GPU memory budget exceeded: ${total} requested bytes, budget ${budgetBytes}. Reduce quality or scene resources.`);
    const resource=create(descriptor),originalDestroy=resource.destroy.bind(resource);
    const release=()=>{if(!records.has(resource))return;originalDestroy();records.delete(resource);allocatedBytes-=bytes;};
    try{Object.defineProperty(resource,'destroy',{value:release,configurable:true});}
    catch(error){originalDestroy();throw error;}
    records.set(resource,{kind,label:descriptor.label??'',bytes,release});allocatedBytes=total;peakAllocatedBytes=Math.max(total,peakAllocatedBytes);
    return resource;
  }
  const destroy=()=>{for(const record of [...records.values()])record.release();};
  const methods={
    createBuffer(descriptor){
      const bytes=integer(descriptor.size,'Buffer size',0);
      within(bytes,rawDevice.limits?.maxBufferSize,'buffer size');
      if((descriptor.usage??0)&storageUsage) within(bytes,rawDevice.limits?.maxStorageBufferBindingSize,'storage binding size');
      return allocate('buffer',descriptor,bytes,d=>rawDevice.createBuffer(d));
    },
    createTexture(descriptor){return allocate('texture',descriptor,textureBytes(descriptor,rawDevice.limits??{}),d=>rawDevice.createTexture(d));},
    createQuerySet(descriptor){return allocate('query-set',descriptor,integer(descriptor.count,'Query count')*8,d=>rawDevice.createQuerySet(d));},
    destroy(){destroy();rawDevice.destroy();},
  };
  const device=new Proxy(rawDevice,{get(target,key){
    if(Object.hasOwn(methods,key))return methods[key];
    const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});
  return Object.freeze({device,destroy,snapshot:()=>Object.freeze({
    accounting:'requested-resource-bytes',budgetBytes:budgetBytes??null,allocatedBytes,peakAllocatedBytes,
    resources:Object.freeze([...records.values()].map(({kind,label,bytes})=>Object.freeze({kind,label,bytes}))),
  })});
}

/** Pop both scopes before awaiting either, so rejection cannot leave a scope open. */
export function openGpuAllocationErrorScopes(device) {
  if(typeof device.pushErrorScope!=='function'||typeof device.popErrorScope!=='function') return async()=>{};
  let count=0;
  try{device.pushErrorScope('out-of-memory');count++;device.pushErrorScope('validation');count++;}
  catch(error){while(count-->0)Promise.resolve(device.popErrorScope()).catch(()=>{});throw error;}
  return async()=>{
    const completions=[];
    while(count>0){count--;try{completions.push(Promise.resolve(device.popErrorScope()));}catch(error){completions.push(Promise.reject(error));}}
    if(!completions.length)return;
    let timer;
    try{
      const errors=await Promise.race([Promise.all(completions),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('GPU allocation validation timed out.')),10000);})]);
      const error=errors.find(Boolean);if(error)throw new Error(`GPU allocation failed: ${error.message??String(error)}`);
    }finally{clearTimeout(timer);}
  };
}
