import { type WavefrontPathTracingComputeRenderer, type WavefrontCpuProfile, renderWavefrontPathTracingComputeFrame } from "../src/index.js";
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
