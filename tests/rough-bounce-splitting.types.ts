import {createWavefrontPathTracingComputeConfig,createWavefrontPathTracingComputeShaderSource} from '../src/index.js';
const config=createWavefrontPathTracingComputeConfig({
  featureFlags:{enabled:{'renderer.sampling.roughBounceSplitting.enabled':true,'renderer.sampling.stablePattern.enabled':true}},
  strictPhysicalLowSppLighting:true,roughBounceSplitting:{splitDepth:2,maximumAdditionalBytes:128*1024**2},
});
createWavefrontPathTracingComputeShaderSource({progressiveSampling:'stable-pattern',roughBounceSplitting:config.roughBounceSplitting});
