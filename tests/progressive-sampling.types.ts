import { createWavefrontPathTracingComputeConfig, type WavefrontRendererFeatureFlags } from "../src/index.js";
const snapshots: WavefrontRendererFeatureFlags[] = [
  { "renderer.materials.layeredClearcoat.enabled": true },
  { enabled: { "renderer.materials.layeredClearcoat.enabled": true } },
  { flags: { "renderer.materials.layeredClearcoat.enabled": false } },
  { renderer: { materials: { layeredClearcoat: { enabled: true } } } },
  { "renderer.sampling.owenSobol.enabled": true },
  { "renderer.sampling.fixedPattern.enabled": true },
  { "renderer.sampling.stablePattern.enabled": true },
  { renderer: { sampling: { stablePattern: { enabled: true } } } },
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
createWavefrontPathTracingComputeConfig({ "renderer.materials.layeredClearcoat.enabled": true });
