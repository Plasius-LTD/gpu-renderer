import { reflectGpuInterface, generateGpuInterfaceArtifacts } from "@plasius/gpu-shader/node";
import { ADAPTIVE_METADATA_WGSL } from "../src/wavefront-adaptive-shader.js";

export async function reflectAdaptiveInterface() {
  const input = {
    interfaceId: "plasius.renderer.adaptive-metadata",
    interfaceVersion: "1.0.0",
    modules: [{ moduleId: "adaptive-metadata", source: ADAPTIVE_METADATA_WGSL }],
    pipelines: [{
      kind: "compute",
      pipelineId: "reset-adaptive-counts",
      layout: { bindGroups: [{ group: 0, entries: [{
        group: 0, binding: 0, visibility: ["compute"],
        resource: { kind: "buffer", addressSpace: "storage", access: "read_write",
          recordName: "AdaptivePixelStates", minimumBindingSize: 4 },
      }] }] },
      compute: { moduleId: "adaptive-metadata", entryPoint: "reset_adaptive_counts", constants: {} },
    }],
    modelFacingRecordNames: [
      "AdaptivePixelState", "AdaptiveFirstHitDistance", "AdaptiveNormalMaterialRisk",
      "AdaptiveWorklistEntry", "AdaptiveHistoryWord", "AdaptiveDispatchArguments",
    ],
    modelFacingBindings: [],
    semantics: [],
  };
  // The descriptor is an asserted interface, not a source of record offsets.
  // Reflection rejects any disagreement with the final assembled module.
  return reflectGpuInterface(input);
}

export async function generateAdaptiveByteConstants() {
  const manifest = await reflectAdaptiveInterface();
  const generated = generateGpuInterfaceArtifacts(manifest);
  return "// Generated from final adaptive WGSL by @plasius/gpu-shader; checked by tests.\n"
    + `// Source SHA-256: ${manifest.modules[0].sha256}\n`
    + generated.byteConstants.replaceAll(" as const", "");
}
