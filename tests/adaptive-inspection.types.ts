import {
  createAdaptiveWavefrontRenderer,
  type AdaptiveInspectionProgress,
} from "../src/adaptive.js";
async function inspect(canvas: HTMLCanvasElement) {
  const renderer = await createAdaptiveWavefrontRenderer({
    canvas,
    width: 3840,
    height: 2160,
    samplesPerPixel: 256,
    maxDepth: 20,
    "renderer.sampling.adaptivePerPixel.enabled": true,
  });
  const report = await renderer.renderAdaptiveFrame({
    budgets: new Uint16Array(3840 * 2160).fill(32),
    signal: new AbortController().signal,
    onProgress: (progress: AdaptiveInspectionProgress) => {
      const mean: number = progress.meanSpp;
      void mean;
    },
  });
  const actual: number = report.completedSamples;
  renderer.destroy();
  return actual;
}
void inspect;
// @ts-expect-error Adaptive use requires an explicit positive decision.
createAdaptiveWavefrontRenderer({ width: 128, height: 128 });
