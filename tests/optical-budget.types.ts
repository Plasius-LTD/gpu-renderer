import {createWavefrontPathTracingComputeConfig,estimateWavefrontPathTracingMemory,type WavefrontPathTracingComputeFrameStats} from '../src/index.js';
const options={maxDepth:20,'renderer.transport.opticalInterfaceBudget.enabled':true,
 'renderer.transport.boundedDielectricBranching.enabled':true,'renderer.transport.nestedMediaRefraction.enabled':true,
 strictPhysicalLowSppLighting:true,opticalInterfaceBudget:{maximumInterfaces:64,maximumAdditionalBytes:128*1024**2}};
const config=createWavefrontPathTracingComputeConfig(options);
const physical:number|undefined=config.maximumPathEvents;
estimateWavefrontPathTracingMemory(options);
declare const frame:WavefrontPathTracingComputeFrameStats;
const bytes:number|undefined=frame.opticalInterfaceBudget?.additionalPathBytes;
void physical;void bytes;
// @ts-expect-error limits are numeric, not string coercions
createWavefrontPathTracingComputeConfig({opticalInterfaceBudget:{maximumInterfaces:'64'}});
