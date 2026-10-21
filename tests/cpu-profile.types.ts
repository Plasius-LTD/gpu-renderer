import { createWavefrontFrameLoop, type WavefrontPathTracingComputeRenderer, type WavefrontCpuProfile, renderWavefrontPathTracingComputeFrame } from "../src/index.js";
declare const renderer: WavefrontPathTracingComputeRenderer;
const result = await renderer.renderFrame({ cpuProfiling: { enabled: true, userTiming: true }, readOutputProbe: false });
const profile: WavefrontCpuProfile | undefined = result.cpuProfile;
const elapsed: number | undefined = profile?.stages.commandEncoding?.exclusiveMs;
const uploads: number | undefined = profile?.commands.uploadBytes;
await renderWavefrontPathTracingComputeFrame({ cpuProfiling: { enabled: true } });
// @ts-expect-error diagnostics cannot be enabled by a string
renderer.renderFrame({ cpuProfiling: { enabled: "true" } });
// @ts-expect-error stages use a closed vocabulary
profile?.stages.arbitraryName;
export { elapsed, uploads };
const loop = createWavefrontFrameLoop({enabled:true,renderFrame:renderer.renderFrame,
  getRenderOptions: ({previousResult}) => ({samplesPerPixel:previousResult?.samplesPerPixel ?? 32}),
  onFrameComplete: (frame, progress) => { const ratio:number|null = progress.budgetRatio; void ratio; void frame; }});
const unknownGpuProgress: null = loop.getProgress().gpuCompletionFraction;
await loop.stop();
await renderer.renderFrame({onProgress: p => { const tiles:number = p.completedTiles; void tiles; }});
// @ts-expect-error opt-in is a boolean
createWavefrontFrameLoop({renderFrame:renderer.renderFrame,enabled:"yes"});
// @ts-expect-error a submission-only synchronous callback is not completion
createWavefrontFrameLoop({renderFrame:renderer.renderOnce});
export { unknownGpuProgress };
