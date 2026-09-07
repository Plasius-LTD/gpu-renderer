import { reflectGpuInterface, generateGpuInterfaceArtifacts } from "@plasius/gpu-shader/node";
import { ADAPTIVE_RESOLVE_WGSL } from "../src/wavefront-adaptive-resolve-shader.js";

export async function reflectAdaptiveResolveInterface() {
  const entries = [
    [0, "storage", "read_write", "AdaptivePixels", 4],
    [1, "storage", "read", "AdaptiveSamples", 32],
    [2, "storage", "read_write", "AdaptiveRadiance", 16],
    [3, "storage", "read_write", "AdaptiveRadiance", 16],
    [4, "uniform", "read", "AdaptiveResolveConfig", 32],
  ].map(([binding, addressSpace, access, recordName, minimumBindingSize]) => ({
    group: 0, binding, visibility: ["compute"],
    resource: { kind: "buffer", addressSpace, access, recordName, minimumBindingSize },
  }));
  return reflectGpuInterface({
    interfaceId: "plasius.renderer.adaptive-resolve", interfaceVersion: "1.0.0",
    modules: [{ moduleId: "adaptive-resolve", source: ADAPTIVE_RESOLVE_WGSL }],
    pipelines: ["commit_adaptive_sample", "resolve_adaptive_radiance"].map((entryPoint) => ({
      kind: "compute", pipelineId: entryPoint,
      layout: { bindGroups: [{ group: 0, entries }] },
      compute: { moduleId: "adaptive-resolve", entryPoint, constants: {} },
    })),
    modelFacingRecordNames: ["AdaptiveCameraSample", "AdaptiveResolveConfig"],
    modelFacingBindings: [], semantics: [],
  });
}

export async function generateAdaptiveResolveConstants() {
  const manifest = await reflectAdaptiveResolveInterface();
  return "// Generated from final adaptive resolve WGSL by @plasius/gpu-shader; checked by tests.\n"
    + `// Source SHA-256: ${manifest.modules[0].sha256}\n`
    + generateGpuInterfaceArtifacts(manifest).byteConstants.replaceAll(" as const", "");
}
