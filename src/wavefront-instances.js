import { buildWavefrontBoundsBvh, createWavefrontMeshAcceleration } from './wavefront-mesh-sources.js';
import { emissionPower, MATERIAL_EMISSIVE } from './wavefront-core.js';

export const WAVEFRONT_INSTANCE_BYTES = 144;
const freeze = Object.freeze;
const uint = value => Number.isInteger(value) && value >= 0 && value < 0xffffffff;

function affineTransform(value) {
  if ((!Array.isArray(value) && !ArrayBuffer.isView(value)) || value.length !== 16 ||
      !Array.from(value).every(n => Number.isFinite(n) && Math.abs(n) <= 1e12) ||
      value[3] !== 0 || value[7] !== 0 || value[11] !== 0 || value[15] !== 1) {
    throw new Error('Instance transform must be a finite affine column-major matrix.');
  }
  // Round to the actual shader representation before inversion and bounds construction.
  const m = Array.from(value, Math.fround);
  const [a,b,c,,d,e,f,,g,h,i] = m;
  const determinant = a*(e*i-f*h)-d*(b*i-c*h)+g*(b*f-c*e);
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) {
    throw new Error('Instance transform must be invertible.');
  }
  const inv = [(e*i-f*h)/determinant,(c*h-b*i)/determinant,(b*f-c*e)/determinant,0,
    (f*g-d*i)/determinant,(a*i-c*g)/determinant,(c*d-a*f)/determinant,0,
    (d*h-e*g)/determinant,(b*g-a*h)/determinant,(a*e-b*d)/determinant,0,0,0,0,1];
  for (let r=0;r<3;r++) inv[12+r]=-(inv[r]*m[12]+inv[4+r]*m[13]+inv[8+r]*m[14]);
  if (!inv.every(n=>Number.isFinite(n) && Math.abs(n)<=1e12)) throw new Error('Instance inverse transform is out of range.');
  return {transform:freeze(m),inverse:freeze(inv.map(n=>n===0?0:n)),handedness:Math.sign(determinant)};
}

export function transformInstancePoint(m, p) {
  return [0,1,2].map(r=>m[r]*p[0]+m[4+r]*p[1]+m[8+r]*p[2]+m[12+r]);
}

function meshBounds(mesh) {
  const localMin=[Infinity,Infinity,Infinity],localMax=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<mesh.positions.length;i+=3) for(let a=0;a<3;a++) {
    localMin[a]=Math.min(localMin[a],Math.fround(mesh.positions[i+a]));localMax[a]=Math.max(localMax[a],Math.fround(mesh.positions[i+a]));
  }
  return {min:localMin,max:localMax};
}

function boundsOf(local, transform) {
  const localMin=local.min,localMax=local.max;
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let corner=0;corner<8;corner++) {
    const p=transformInstancePoint(transform,[0,1,2].map(a=>(corner&(1<<a))?localMax[a]:localMin[a]));
    for(let a=0;a<3;a++){min[a]=Math.min(min[a],p[a]);max[a]=Math.max(max[a],p[a]);}
  }
  if(![...min,...max].every(Number.isFinite)) throw new Error('Instance mesh has invalid bounds.');
  return freeze({min:freeze(min),max:freeze(max)});
}

export function prepareWavefrontInstances(meshes, instances) {
  if(!Array.isArray(instances)||instances.length===0) throw new Error('Instances must be a nonempty array.');
  const byId=new Map(),localBounds=new Map();
  for(const mesh of meshes) {
    if(!uint(mesh.id)||byId.has(mesh.id)) throw new Error('Instanced mesh IDs must be unique unsigned integers.');
    if(mesh.materialKind===MATERIAL_EMISSIVE||emissionPower(mesh.emission??[0,0,0,1])>0.0001) {
      throw new Error('Instanced emissive meshes require per-instance light sampling, which is not supported yet.');
    }
    byId.set(mesh.id,mesh);localBounds.set(mesh.id,meshBounds(mesh));
  }
  const ids=new Set(),used=new Set();
  const records=instances.map(instance=>{
    if(!instance||!uint(instance.id)||ids.has(instance.id)) throw new Error('Instance IDs must be unique unsigned integers.');
    const mesh=byId.get(instance.meshId);
    if(!mesh) throw new Error('Instance references an unknown mesh.');
    ids.add(instance.id);used.add(mesh.id);
    const affine=affineTransform(instance.transform);
    const bounds=boundsOf(localBounds.get(mesh.id),affine.transform);
    return freeze({...affine,id:instance.id,meshId:mesh.id,bounds,
      centroid:freeze(bounds.min.map((v,a)=>(v+bounds.max[a])/2))});
  });
  if(used.size!==meshes.length) throw new Error('Every instanced mesh must have at least one instance.');
  return freeze({records:freeze(records),geometryCount:meshes.length});
}

export function buildWavefrontInstances(meshes, plan, materialSource) {
  const tlas=buildWavefrontBoundsBvh(plan.records,1);
  // Outward padding covers f32 matrix multiplication and packed-bound rounding.
  const nodes=tlas.nodes.map(node=>{
    const pad=node.bounds.min.map((v,a)=>Math.max(1,Math.abs(v),Math.abs(node.bounds.max[a]))*1e-6);
    return freeze({...node,bounds:freeze({min:freeze(node.bounds.min.map((v,a)=>v-pad[a])),
      max:freeze(node.bounds.max.map((v,a)=>v+pad[a]))})});
  }),triangles=[],roots=new Map();
  for(const [meshIndex,mesh] of meshes.entries()) {
    const blas=createWavefrontMeshAcceleration([mesh],materialSource);
    const nodeOffset=nodes.length,triangleOffset=triangles.length;
    roots.set(mesh.id,nodeOffset);
    for(const node of blas.nodes) nodes.push(freeze({...node,
      firstTriangle:node.firstTriangle+(node.triangleCount>0?triangleOffset:nodeOffset),
      leftChild:node.leftChild+nodeOffset,rightChild:node.rightChild+nodeOffset}));
    for(const triangle of blas.triangles) triangles.push(freeze({...triangle,
      triangleId:triangle.triangleId+triangleOffset,materialSlot:meshIndex}));
  }
  const records=tlas.triangles.map(record=>freeze({...record,root:roots.get(record.meshId)}));
  const buffer=new ArrayBuffer(records.length*WAVEFRONT_INSTANCE_BYTES);
  const floats=new Float32Array(buffer),uints=new Uint32Array(buffer);
  records.forEach((record,index)=>{
    const offset=index*36;
    floats.set(record.transform,offset);floats.set(record.inverse,offset+16);
    uints[offset+32]=record.id;uints[offset+33]=record.root;floats[offset+34]=record.handedness;
  });
  return freeze({records:freeze(records),buffer,instanceCount:records.length,
    geometryCount:meshes.length,instanceBytes:buffer.byteLength,tlasNodeCount:tlas.nodes.length,
    blasNodeCount:nodes.length-tlas.nodes.length,
    acceleration:freeze({nodes:freeze(nodes),triangles:freeze(triangles)})});
}
