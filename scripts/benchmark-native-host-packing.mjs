// CPU-only configuration workload. No model/GPU/frame-rate inference.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createWavefrontPathTracingComputeConfig} from '../src/wavefront-config.js';
import {createAdaptiveTilePlan} from '../src/wavefront-adaptive-tile-plan.js';
import {CONFIG_BUFFER_BYTES} from '../src/wavefront-core.js';
import {packNativeConfigBatch,createNativeBudgetState} from '../tests/fixtures/native-host-packing.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function benchmarkNativeHostPacking(lightingRoot){
 const source=execFileSync('git',['-C',lightingRoot,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),pins={};
 const load=async relative=>{const file=path.resolve(lightingRoot,relative),bytes=fs.readFileSync(file);if(!bytes.equals(execFileSync('git',['-C',lightingRoot,'show',`${source}:${relative}`])))throw Error('Uncommitted benchmark policy');pins[relative]=hash(bytes);return import(pathToFileURL(file).href);};
 const {createRadialSamplingPlan}=await load('demo/eames-environments/radial-sampling-plan.js');
 const {computeFixedSppTimingStatistics}=await load('scripts/eames-environments/timing-statistics.js');
 const resolutions=[];
 for(const [width,height]of [[1920,1080],[3840,2160]]){
  const plan=createRadialSamplingPlan(width,height,32),tiles=createAdaptiveTilePlan({enabled:true,...plan}),config=createWavefrontPathTracingComputeConfig({width,height,samplesPerPixel:32,maxDepth:20,strictPhysicalLowSppLighting:true,deferredPathResolve:true,
   'renderer.transport.boundedDielectricBranching.enabled':true,'renderer.transport.nestedMediaRefraction.enabled':true,'renderer.transport.opticalInterfaceBudget.enabled':true,opticalInterfaceBudget:{maximumInterfaces:2048}});
  const allocations={legacy:0,template:0},bytes={legacy:0,template:0},timings=[];
  const run=template=>{const started=performance.now();let checksum=0;
   for(const item of tiles){const samples=item.ranges.at(-1).sampleLimit,packed=packNativeConfigBatch(config,item.tile,7,samples,{templateConfigPacking:template},{sampleWeight:1});checksum+=packed[packed.length-1];}
   return {elapsedMs:performance.now()-started,checksum};};
  for(const item of tiles){const samples=item.ranges.at(-1).sampleLimit,a=packNativeConfigBatch(config,item.tile,7,samples),b=packNativeConfigBatch(config,item.tile,7,samples,{templateConfigPacking:true});
   if(!Buffer.from(a).equals(Buffer.from(b)))throw Error('Configuration bytes differ');
   allocations.legacy+=samples+1;allocations.template+=2;bytes.legacy+=a.byteLength+samples*CONFIG_BUFFER_BYTES;bytes.template+=b.byteLength+CONFIG_BUFFER_BYTES;
  }
  for(let i=0;i<3;i++)for(const template of [false,true])run(template);
  for(let round=0;round<20;round++)for(const template of round%2?[true,false]:[false,true])timings.push({round,template,...run(template)});
  const legacy=createNativeBudgetState(plan.budgets,32),lazy=createNativeBudgetState(plan.budgets,32,{lazyUniformBudget:true});
  legacy.get('radial');lazy.get('radial');
  resolutions.push({width,height,tiles:tiles.length,radialSamples:plan.totalSamples,meanSpp:plan.meanSpp,byteIdentical:true,knownBackingAllocations:allocations,knownTransientBackingBytes:bytes,
   radialBudgetHostBytes:{eager:legacy.memoryBytes(),lazy:lazy.memoryBytes(),avoided:legacy.memoryBytes()-lazy.memoryBytes()},timings,
   statistics:Object.fromEntries([false,true].map(template=>[template?'template':'legacy',computeFixedSppTimingStatistics(timings.filter(t=>t.template===template).map(t=>t.elapsedMs))]))});
 }
 const rendererSourceHashes=Object.fromEntries(['../src/wavefront-packers.js','../tests/fixtures/native-host-packing.js','./benchmark-native-host-packing.mjs'].map(relative=>[relative,hash(fs.readFileSync(new URL(relative,import.meta.url)))]));
 return {status:'CPU-workload-measured-not-frame-performance',lightingSource:source,sourcePins:pins,rendererSourceHashes,resolutions,scope:'Warmed native tile configuration workloads only; canonical representative config, no model rendering/GPU/FPS/physical VRAM claim.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await benchmarkNativeHostPacking(process.argv[2]),null,2));
