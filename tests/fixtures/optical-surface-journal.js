import {WAVEFRONT_CAMERA_RAY_RECORD_WGSL} from '../../src/wavefront-camera-shared-shader.js';
import {PATH_NODE_STRUCT_WGSL} from '../../src/wavefront-path-tree-shader.js';
import {MAX_PHYSICAL_PATH_EVENTS} from '../../src/wavefront-optical-interface-budget.js';

export function canonicalSurfaceJournalShader({pixel,sample,maxDepth,tilePixels,streamed=false}){
 if(!Number.isSafeInteger(pixel)||pixel<0||pixel>0xffffffff||!Number.isInteger(sample)||sample<0||sample>255||
  !Number.isInteger(maxDepth)||maxDepth<1||maxDepth>MAX_PHYSICAL_PATH_EVENTS||!Number.isInteger(tilePixels)||tilePixels<1||tilePixels>16384)throw Error('Invalid surface journal selection');
 return `${WAVEFRONT_CAMERA_RAY_RECORD_WGSL}\n${PATH_NODE_STRUCT_WGSL}
 @group(0) @binding(0)var<storage,read_write>rays:array<RayRecord>;
 @group(0) @binding(1)var<storage,read_write>counters:array<u32>;
 @group(0) @binding(2)var<storage,read_write>nodes:array<PathNode>;
 @group(0) @binding(3)var<storage,read_write>output:array<PathNode>;
 @compute @workgroup_size(64)fn surface(@builtin(global_invocation_id)id:vec3<u32>){let slot=id.x;
  if(slot>=counters[0]||slot>=arrayLength(&rays)){return;}let ray=rays[slot];
  if(ray.sourcePixelId!=${pixel}u||ray.sampleId!=${sample}u||ray.bounce>=${maxDepth}u||ray.bounce>=arrayLength(&output)){return;}
  let node=select(${streamed?'(ray.flags>>24u)':'ray.bounce'}*${tilePixels}u+slot,ray.rayId,${streamed?'(ray.flags>>24u)':'ray.bounce'}==0u);
  if(node>=arrayLength(&nodes)){return;}output[ray.bounce]=nodes[node];
 }`;
}
export function decodeSurfaceJournal(bytes){
 if(bytes.byteLength%64||bytes.byteLength>MAX_PHYSICAL_PATH_EVENTS*64)throw Error('Invalid surface journal length');
 const u=new Uint32Array(bytes),f=new Float32Array(bytes),nodes=[];
 for(let o=0;o<u.length;o+=16){if(!u[o+3])continue;
  nodes.push({directRadiance:Array.from(f.slice(o,o+3)),terminalRadiance:Array.from(f.slice(o+4,o+7)),flags:u[o+3],terminalKind:u[o+7],pixel:u[o+12],sample:u[o+13],bounce:u[o+14]});
 }
 return nodes;
}
