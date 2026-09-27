import { createWavefrontPathTracingComputeConfig, type WavefrontRendererFeatureFlags } from "../src/index.js";
const snapshots: WavefrontRendererFeatureFlags[] = [
  { "renderer.sampling.owenSobol.enabled": true },
  { "renderer.sampling.fixedPattern.enabled": true },
  { renderer: { sampling: { fixedPattern: { enabled: true } } } },
  { enabled: { "renderer.sampling.independentRandom.enabled": true } },
  { flags: { "renderer.sampling.owenSobol.enabled": false } },
  { renderer: { sampling: { owenSobol: { enabled: true }, independentRandom: false } } },
];
for (const featureFlags of snapshots) {
  const config = createWavefrontPathTracingComputeConfig({ featureFlags });
  const active: boolean | undefined = config.transportExperiments.effective.owenSobol;
  void active;
}
createWavefrontPathTracingComputeConfig({ "renderer.sampling.owenSobol.enabled": true });
